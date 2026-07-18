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

## Commits

- (pre-existing, by the background commit sweep described above) `e8f3d9d`,
  `3de6763` — the core provider/router/outbox layer and most of its tests.
- `db97401` — migrator CLI + test, config documentation, tasks checklist
  (this session's own explicit commit).

None of these were pushed to `origin` — left for the user to trigger
explicitly, consistent with how pushes were handled earlier in this same
session (Story 65).
