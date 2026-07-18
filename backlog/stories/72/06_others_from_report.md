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

## Commits

- (pre-existing, by the background commit sweep described above) `e8f3d9d`,
  `3de6763` — the core provider/router/outbox layer and most of its tests.
- `db97401` — migrator CLI + test, config documentation, tasks checklist
  (this session's own explicit commit).

None of these were pushed to `origin` — left for the user to trigger
explicitly, consistent with how pushes were handled earlier in this same
session (Story 65).
