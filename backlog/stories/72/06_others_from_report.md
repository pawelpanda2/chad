# Story 72 — Other notes, decisions, incidents, risks, follow-ups

## Documents read before touching code

`ai-docs/begin_here/01_ai_start.md`, `02_what-and-where.md`,
`03_story-standard.md`, `05_endpoint-rules.md` (all of `begin_here/`,
which moved out from under `documentation/` since Input 1 was written —
see `02_plan.md` §0). `documentation/dba/project-goal.md`,
`post-parent-item.md`. `ai-docs/deploy/2026-07-10_mongodb-replica-set-migration-plan.md`
(confirmed standalone Mongo, no transactions). Full C# audit trail of
`packages/net-content-provider` in `03_knowledge.md`.

## Contract found (short version — full detail in `03_knowledge.md`)

Body file is `body.txt`; Folder items have no body file at all (computed
children map instead). Only `id`/`type`/`name`/`address` are CP-required
config keys; everything else (including this Story's own `created`/
`modified`) is free-form and round-trips fine. Next-child numbering:
scan siblings, max+1, zero-padded 2-or-3-digit. Duplicate detection:
exact name match among direct children (find-or-create, no explicit
"duplicate" error). **Real, audited limitation found while implementing**
(not assumed in advance): CP's only wire-callable write methods always
mint a fresh GUID and drop custom config fields — same-GUID parity across
backends isn't achievable with the *current* CP API when CP is the
follower target of a write. Full writeup: `02_plan.md`'s "Correction"
section and `legacy-cp-provider.ts`'s class doc comment.

## Modules created

`packages/dba/src/`: `cp-model.ts`, `data-clock.ts`, `data-commands.ts`,
`data-router.ts`, `data-outbox.ts`, `data-outbox-worker.ts`,
`data-sync-diagnostics.ts`, `data-providers/{types,config,mongo-cp-provider,
legacy-cp-provider}.ts`, plus matching `*.test.ts` files for each
(`cp-model.test.ts`, `data-outbox.test.ts`, `data-router.test.ts`,
`data-sync-diagnostics.test.ts`, `data-providers/mongo-cp-provider.test.ts`).
`packages/console/src/migrateCpToMongo.ts` + `.test.ts`.
`documentation/dba/data-providers-config.md`.

## Testing — full results

**74/74 tests passing**, across 6 hand-rolled test files (this package's
existing convention — no vitest/jest configured; run via `npx tsc && node
dist/<file>.test.js`, see `03_knowledge.md`), 69 of them against the real
local `chad-mongodb-local-mac-docker` instance (dedicated test database
`chad_test_story72`, dropped at the end of the session):

- `cp-model.test.ts`: 24/24
- `data-sync-diagnostics.test.ts`: 11/11 (pure logic, no Mongo)
- `data-outbox.test.ts`: 11/11 (real Mongo)
- `data-router.test.ts`: 8/8 (fake providers + real outbox)
- `data-providers/mongo-cp-provider.test.ts`: 15/15 (real Mongo)
- `packages/console/src/migrateCpToMongo.test.ts`: 5/5 (fake CP tree + real Mongo)

Two real bugs were caught and fixed by actually running these against
real MongoDB (not just typechecking):
1. `MongoCpProvider`'s child-index counter originally combined `$max` and
   `$inc` on the same field in one `findOneAndUpdate` — MongoDB rejects
   that outright. Split into two atomic single-field steps.
2. The migrator's `configsEqual` comparison didn't strip `created` (only
   `modified`), so every re-run of an unchanged tree was misclassified as
   "imported" instead of "unchanged" — fixed to strip both.

`packages/dba` and `packages/console` both typecheck cleanly (`npx tsc
--noEmit`) apart from one **pre-existing, unrelated** error in
`packages/console/src/contentProviderClient.ts` (references a
`SHARED_REPO_ID` export that doesn't exist in `dba` — confirmed via `git
log`/`git status` to predate this Story entirely, from the initial
monorepo skeleton commit; not touched). No lint script is configured for
either package in this repo.

## Incident: the shared Content Provider container went down mid-Story

While verifying the migrator, a disposable test repo folder was created
under `packages/dashboard/cp-root/repos/` and `docker restart
chad-content-provider-api-local-mac-docker` was run so the container would
pick it up (CP only scans its repo search paths at startup). The restart
failed and left the container **stopped**:

```
Error: mkdir /host_mnt/Volumes/Dropbox: permission denied
```

Cause: `.env.local`'s `CP_REPOS_HOST_PATH_2=/Volumes/Dropbox/kamilgame042`
(a second repo mount added in Story 68 for the `chad_admin` login repo)
wasn't mounted on the host at that moment — `/Volumes/Dropbox` didn't
exist at all. This was reported to the user immediately, without
attempting further docker operations. The user remounted the volume and
confirmed; the container was restarted successfully and verified healthy.

On retry, the test repo *still* wasn't found by `GetItem` — turned out the
fixture had been created in the wrong location entirely:
`packages/dashboard/cp-root` is the compose file's **unused default**;
`.env.local` actually overrides `CP_REPOS_HOST_PATH` to
`/Users/pawelfluder/Dropbox` (the user's real Dropbox), which is what the
running container actually scans. Rather than restart this shared,
login-critical container a third time to place a throwaway fixture inside
the real Dropbox account, the decision was made to verify the migrator's
own traversal/report/idempotency logic against a fake in-process CP tree
instead (Task 6/7 in `05_tasks_and_checklist.md`) — real coverage of the
migrator's logic, zero further risk to the shared container. The
misplaced fixture folder was deleted; the test Mongo database was dropped;
the container was left running and healthy.

## A second, pre-existing dynamic worth naming plainly

Partway through this Story, `git status` showed that most of the exact
files just written (`cp-model.ts`, its test, `mongo-cp-provider.ts`, its
test, `data-router.test.ts`, `data-sync-diagnostics.test.ts`,
`data-outbox.test.ts`) were **already tracked and committed** (commits
`3de6763`/`e8f3d9d`, message "update"/"udpate"), with **zero diff** against
this session's own working copies. This matches a pattern already seen
earlier in this same working session (an unrelated commit landing
mid-operation during the Story 65 submodule migration): something in this
environment periodically runs a broad `git add -A && git commit` sweep
that captures whatever is currently sitting in the working tree,
independent of which task or session produced it. Practical consequence
for this Story: rather than re-commit already-captured content, only the
genuinely-still-untracked files (the migrator, its test, the config doc,
the tasks checklist) were staged and committed explicitly, with a
descriptive message, as `db97401`.

## Risks / unresolved problems

1. **Same-GUID parity with CP as follower is not achievable with the
   current CP wire API** (see above). If exact GUID parity across both
   backends is actually required before any real cutover, it needs a new
   CP-side write method (`packages/net-content-provider` change — a
   separate Story, per this one's explicit scope limits).
2. **Non-transactional primary-write + outbox-enqueue gap**, since
   standalone MongoDB has no multi-document transactions. Mitigated by
   `reconcileMissingOutboxJobs`, but that function isn't wired into any
   scheduled job yet — see follow-ups below.
3. **Two atomic-but-separate steps for child-index reservation** (seed,
   then `$inc`) means a crash between them could very rarely leave the
   counter seeded but not yet incremented for a brand-new parent; the next
   call will simply increment from the seed correctly, so this self-heals
   — no data corruption, just worth naming since it's a real (if narrow)
   window.
4. **`items failed: 18` in every real migration run of `pawel_f`'s repo,
   not yet individually diagnosed.** Some are known/harmless (the leftover
   `98` test loca, already repaired and labeled
   `broken-test-artifact-please-ignore`); the rest are real transient CP
   "fetch failed"/timeout errors under the `02/16` branch. Not investigated
   item-by-item — worth a dedicated pass if that branch's data is actually
   needed.
5. **`duplicate ids: 46` still appears in the migration report after the
   45-item id-dedup fix.** Not yet confirmed whether this is a genuinely
   new/different set of duplicates in branches that failed to fully
   traverse in earlier runs (plausible, given the persistent `itemsFailed`
   above), or a reporting artifact. Needs its own investigation before
   assuming it's the same already-fixed set.
6. **No automated test for `MongoCpProvider.resolveStaleAddressConflict`.**
   Implemented and proven correct via a real migration re-run (`items
   conflicting: 0` after adding it — see the follow-up round below), but
   `mongo-cp-provider.test.ts` has no dedicated case for it yet.

## What was deliberately NOT implemented (in scope of Input 1, consciously deferred)

- Rewiring any existing `dba` business function (`leads.ts`,
  `report-entries.ts`, `statuses-dashboard.ts`, etc.) onto
  `DbaDataRouter`. This Story delivers the router/provider layer itself;
  migrating each existing call site is a separate, per-function change
  (each needs its own compatibility check per `05_endpoint-rules.md` §5)
  — a natural next Story.
- Wiring `runOutboxWorker`/`drainOutboxOnce` into an actual long-running
  process or deploy slot (§27 — deploy-config changes are out of this
  Story's scope). The worker module itself is complete and independently
  testable/invocable.
- A scheduled/cron call to `reconcileMissingOutboxJobs`.
- Delete/Move support (§19 — CP's own `DeleteWorker` is a confirmed empty
  stub; no semantics were specified to implement against).
- A live end-to-end migrator run against a real, running Content Provider
  repo (see the incident above and Task 7 in the checklist) — the exact
  command to do this safely (dry-run never writes) is documented in
  `documentation/dba/data-providers-config.md`.
- Closing the same-GUID-parity gap by adding a new CP-side write method.

## Follow-up round: root cause of "Daily Tracker empty", PutItemConfig, real migration

A later session in this same Story reported Daily Tracker showing "0 of 0"
with an apparently-stuck loading state.

**Root cause, confirmed via curl (no browser-automation tool is available
in this environment) and direct CP `/invoke` calls, not assumed:**
`pawel_f`'s `views/daily` and `views/dates` folders exist in Content
Provider but their body was **literally `{}`** — genuinely zero Daily/Date
Entry records, confirmed both via the CP wire API directly and via the
filesystem (`find` on the QNAP-mounted repo path showed only `config.yaml`
under those two folders, no numbered children). This predates this
Story's work entirely — the existing 83/24-row CSV import documented in
`daily-tracker-dates.md` was done for `kamil_s`, never `pawel_f`. Confirmed
this was **not** a data-flow bug: `/api/views` itself returned
`{"success":true,"dateEntries":[],"dailyEntries":[]}` cleanly, no error, no
hang — "0 of 0" was the correct result for the data that actually existed.
User's decision (via `AskUserQuestion`): leave it empty, move on.

**`PutItemConfig` implemented and closes the previously-documented
same-GUID-parity gap.** Added `IItemWorker.PutItemConfig(repo, loca,
configJson)` to the real Content Provider (writes the full config dict
as-is via `ConfigWorker.PutConfig`, preserving the supplied `id` and every
custom field — separate `repo`/`loca` string params and a JSON-serialized
config string, since tuple and `Dictionary` parameters aren't invocable
over the reflection-based `/invoke` protocol). `LegacyContentProviderAdapter.
putItem` now does `Put` (ensure body/directory) + `PutItemConfig` (fix
identity) as a two-step write. Verified live against the real running
Content Provider: `GetItem` afterward returns the exact `id`/custom fields
AND the body together. New real-CP tests: `legacy-cp-provider.test.ts`
(4/4, run against the actual running container on a disposable loca).
Also found and fixed, live: `GetItem` on a genuinely-nonexistent item
returns an empty response body (CP's own "not found" signal), which
`client.ts`'s shared error handling treated as a hard error for every
non-`Put` method — fixed locally in the adapter (translated to `null`),
not in the shared `client.ts`.

**Architecture simplified per explicit direction, mid-round.** The first
pass wired Daily/Date Entry onto `DbaDataRouter` (follower outbox,
primary/follower resolution). The user asked for something much simpler:
each `dba` function split into two private implementations
(`xMongo`/`xContentProvider`), with the public function running
`if (config.mongoEnabled) ... if (config.contentProviderEnabled) ...`
independently — no router, no outbox, no provider-selection abstraction
for this pass. `getAllDateEntries`/`getAllDailyEntries`/`saveDateEntry`/
`saveDailyEntry`/`updateDailyEntry`/`updateDateEntry` in `leads.ts` were
rewritten to this exact shape. `DbaDataRouter`/`data-outbox`/the provider
abstraction remain in the codebase (untouched, still tested) for later —
this round simply doesn't route through them for these six functions.
Config default changed (in `docker-compose.local.yml` and
`.env.local.example`): `DBA_CONTENT_PROVIDER_ENABLED` now defaults to
`false` locally (Content Provider is **not removed** — its full code and
data are untouched — just not the active read/write path right now).

**Real migration run for `pawel_f`'s actual repo** (`21d11bdc-f1f4-44d1-b61a-3fa6b039c641`,
into the dashboard's real `beeper` Mongo database, not a test DB): 376
items scanned. One migration-robustness bug found and fixed along the way:
a single unreadable item used to abort the *entire* tree walk (CP computes
a Folder's children map synchronously as part of reading the *parent*, so
one corrupted child broke `GetItem` on its parent too) — `walk()` now
catches per-node errors and continues, counting them as `itemsFailed`
instead of crashing.

**Real, pre-existing data-quality issue found by the migrator: duplicate
`config.id`s.** The dry-run's duplicate-id detection (added to
`migrateCpToMongo.ts`'s report) found dozens of genuinely different items —
different addresses, different names, different real content — sharing
the same `config.id`. Not a couple of accidents: 25 groups, 44-45 items,
including whole scaffold subtrees (`actions`/`dates`/`hidden`/`cache`)
duplicated wholesale across the top-level `00`/`01`/`03`/`06`/`07`
branches, all carrying the same GUIDs — consistent with content having
been duplicated via Finder/Dropbox rather than the app itself, which
copies `config.yaml` byte-for-byte including its `id` field. Shown to the
user in full (all 25 groups) before touching anything, given the scope was
far larger than initially assumed; user approved fixing all of them.

**Fix applied** via a new one-off script,
`packages/console/src/fixDuplicateIds.ts` (matches this repo's existing
one-off-script convention — see `daily-tracker-dates.md`'s `import-csv.mjs`
precedent; not a permanent part of the codebase): for each duplicate id,
the *first* occurrence encountered keeps its id unchanged; every other
occurrence gets a fresh `randomUUID()`, written back to the real
`config.yaml` on disk via the new `PutItemConfig` (config-only, no body
touched, no other field changed). Modes `--dry-run`/`--apply`, same
convention as the migrator. 45 items fixed on the real `pawel_f` repo.
**Full old->new id mapping saved** to
`backlog/stories/72/duplicate-id-fix-mapping.json` (audit trail — which
address got which new id, for anyone who later needs to trace a changed
GUID back to what it used to be). The migrator was re-run with `--apply`
afterward so Mongo reflects the corrected, de-duplicated data.

**Incident during this round, corrected:** a disposable test loca (`98`)
created earlier for `PutItemConfig` testing got stuck in a locked state
("Device or resource busy" — `/Volumes/Dropbox/kamilgame042` is a QNAP
network volume mounted on this Mac, not a local Dropbox app; the lock is
SMB/network-share behavior, not Dropbox desktop sync, per the user's
correction) with a corrupted `config.yaml` (missing `name`) that blocked
migration of `pawel_f`'s *entire* repo, since it broke reading the repo
root. Fixed in place (rewrote the config to be valid, clearly labeled
`broken-test-artifact-please-ignore`) rather than force-deleting — no real
data was touched. Separately, the `chad-local` Docker stack (containers,
not volumes) disappeared from `docker ps -a` outside of any action taken
here; the named data volumes were confirmed fully intact
(`chad-mongodb-local-mac-docker-db` etc. all present) and the stack was
brought back up via the official `03_restart.sh` script, which reattaches
to existing volumes — no data was lost. The user separately flagged
concern about deletions/mount changes mid-session; confirmed and shown
directly: `docker-compose.local.yml`'s diff is purely additive (new env
vars only), Content Provider's C# code has only the additive
`PutItemConfig` commit (0 deletions), and no real CP data under `pawel_f`'s
repo was removed (only the one disposable test folder was ever touched).

## Follow-up round: `views/dates` duplicate-folder incident (`07/05`)

A later re-run of `--apply` (after the 45-item duplicate-GUID fix above) hit
a fresh `E11000 duplicate key error` at `config.address:
"21d11bdc-f1f4-44d1-b61a-3fa6b039c641/07/05"`. Before treating it as a
critical conflict, the user asked for the same discipline applied
throughout this Story: read the Mongo doc, read the physical Content
Provider item, derive the real address from the physical folder path, and
compare `address`/`id`/`name`/`type`/`body` before concluding anything.

**Diagnosis, in two layers:**

1. **The E11000 itself was pure staleness, already self-resolved.**
   `07/05`'s own `config.yaml` (`id: b2c5d94d...`, `address: .../07/05`) was
   internally correct — its stored address exactly matched its own physical
   folder. Not a `config.address` corruption. The real cause: `07/05` had
   itself been one of the 45 items renamed in the duplicate-GUID fix above
   (old id `695ac662...` → new id `b2c5d94d...`), and the *old*-id Mongo
   document was left orphaned at that address from before the rename. A
   `resolveStaleAddressConflict` repair step (`mongo-cp-provider.ts`,
   already present from the earlier round) detects exactly this — a Mongo
   doc at the same address under a *different* `_id` — deletes the stale
   doc, and retries. Re-running `--apply` afterward: `conflicting: 0`.

2. **A second, distinct, genuine data-integrity issue underneath that:**
   `views` (loca `07`) had **two** direct children both named `"dates"` —
   `07/02` (real: 2 Date Entries with actual `DATA`/`ŹRÓDŁO`/... content,
   2026-07-10 and 2026-07-12) and `07/05` (an empty `Folder` shell, `Body:
   {}`, zero children, confirmed both via CP's wire API and directly on
   disk — the physical folder held only its own `config.yaml`, nothing
   else). Both configs were internally self-consistent (address matched
   physical location on both sides) — this was never a corrupted-address
   case, it was two really-existing sibling folders sharing a name.

   Confirmed live and reproducibly that this **crashes Content Provider's
   own name resolution**: both `GetByNames(repo, "views", "dates")` and
   `GetByNames2(repo, "07", "dates")` threw `System.InvalidOperationException:
   Sequence contains more than one matching element` from
   `ReadAddressWorker.GetAdrTupleByName`'s `.Single()`-style lookup (same
   underlying method, both wire entry points). Mongo's parallel
   `getByNames2` (`mongo-cp-provider.ts`) did **not** crash, but resolved
   non-deterministically: `children.find(c => c.config.name === name)` on
   an *unsorted* query result just returns whichever doc happens to be
   first in Mongo's natural storage order. It happened to return `07/02`
   (the real one) today, which is why `/api/views` looked correct — but
   that was luck, not a guarantee; a re-migration or index rebuild could
   have flipped it to the empty `07/05` with no code change at all.

   **Origin traced via this round's own `duplicate-id-fix-mapping.json`:**
   `07/05`'s *old* id appears there, grouped under `name: "dates"` together
   with `07/02` and a third, unrelated-branch `03/06` — i.e. before this
   Story's GUID-dedup fix, `07/05` **shared a GUID** with another `"dates"`
   folder. Strong evidence `07/05` is a leftover artifact of the same
   Finder/Dropbox-level subtree-duplication event that produced the other
   44 duplicate-GUID items, not an independently created folder. The
   GUID-collision half got fixed by the earlier round's rename; the *name*
   collision (two siblings both called `"dates"` under the same real
   parent) was never addressed, since that fix only reassigned GUIDs.

**Pre-fix verification (read-only, before touching anything):** confirmed
`07/05`'s physical folder contained only `config.yaml` (no `body.txt`, no
numbered children, on disk and via the container's mounted view);
confirmed no other Mongo document referenced `07/05`'s current id
(`b2c5d94d...`) or its pre-rename old id (`695ac662...`) anywhere, in any
field, in the `items` collection; confirmed no `data_sync_outbox`
collection exists yet (the outbox worker isn't wired into a scheduled job
— see Risk #2 above — so no queued job could reference this address
either); confirmed `07/02` is the only other `"dates"` child under `views`.

**Fix applied, in order:**
1. Backed up `07/05`'s physical folder (`config.yaml`) and its Mongo
   document to `backlog/stories/72/backup-07-05_20260718_200154/` (both
   files preserved verbatim, timestamped).
2. Deleted the Mongo document at `config.address ==
   "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/07/05"` directly via
   `deleteOne` (not through CP's `DeleteWorker.Delete()`, which is a
   confirmed empty stub — see `documentation/dashboard/forms/features/
   daily-tracker-dates.md`).
3. Deleted the physical folder itself
   (`/Volumes/Dropbox/kamilgame042/repos/21d11bdc-f1f4-44d1-b61a-3fa6b039c641/07/05`,
   the real host path behind the container's `/data/repos2` mount). First
   `rmdir` attempt failed with "Directory not empty" immediately after
   removing `config.yaml` — a transient SMB staleness window on this QNAP
   network volume (same class of behavior already noted earlier in this
   Story re: `/Volumes/Dropbox/kamilgame042` lock behavior); a retry
   moments later succeeded cleanly with no further changes needed.

**Post-fix verification, all confirmed:**
- `GetByNames("views","dates")` and `GetByNames2(loca="07","dates")` both
  now return `07/02` cleanly, no exception.
- `views`' own children map (`GetItem` on loca `07`) now lists exactly one
  `"dates"` entry (`"02": "dates"`), alongside `actions`/`reports`/`daily`.
- `/api/views` still returns the same 2 real Date Entries
  (2026-07-10, 2026-07-12) unchanged.
- Mongo has no document at `config.address ==
  ".../07/05"` anymore.
- No other document anywhere in `items` references either of `07/05`'s two
  historical ids.

**Defensive fix added (in addition to the cleanup, not instead of it, per
explicit direction — sorting deterministically would only hide future
corruption of the same kind):** `MongoCpProvider.getByNames2`
(`packages/dba/src/data-providers/mongo-cp-provider.ts`) previously used
`children.find(...)`, silently returning the first of several same-named
matches. Changed to `children.filter(...)`; if more than one match is
found under the same parent, it now throws a new `DuplicateChildNameError`
naming the parent address, the child name, and every matching address —
mirroring CP's own `.Single()` crash instead of masking the corruption.
New test: `mongo-cp-provider.test.ts`, `"getByNames2 throws
DuplicateChildNameError when two siblings share a name (Story 72, 07/05
incident)"`. Full suite re-run against the dedicated `chad_test_story72`
database: 18/18 in `mongo-cp-provider.test.ts`, 8/8 in
`data-router.test.ts`, 24/24 in `cp-model.test.ts` — all still passing;
test database dropped afterward as usual.

**Files changed this round:**
`packages/dba/src/data-providers/mongo-cp-provider.ts`,
`packages/dba/src/data-providers/mongo-cp-provider.test.ts`. Plus the data
changes themselves (one Mongo document deleted, one physical folder
deleted, both backed up first to `backlog/stories/72/backup-07-05_20260718_200154/`).

## Commits

- (pre-existing, by the background commit sweep described above) `e8f3d9d`,
  `3de6763` — the core provider/router/outbox layer and most of its tests.
- `db97401` — migrator CLI + test, config documentation, tasks checklist
  (this session's own explicit commit).
- Not yet committed: this round's `DuplicateChildNameError` fix + test
  (`mongo-cp-provider.ts`/`mongo-cp-provider.test.ts`) — left for the user
  to review and trigger explicitly, same convention as above.

None of these were pushed to `origin` — left for the user to trigger
explicitly, consistent with how pushes were handled earlier in this same
session (Story 65).
