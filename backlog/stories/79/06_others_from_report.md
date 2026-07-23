# Story 79 — Other notes

## Decisions worth recording

- **`itemName` added to `cp_history` (not in Input 1's original schema).**
  Input 2 (the GUI rewrite) required an "Item" column showing the CP
  item's natural name, not its address. The only other place `config.name`
  would be available is `afterSnapshot`, which isn't present on every
  event (diff-only updates in between snapshot cadence). Storing
  `itemName` directly on every event avoids either a read-time join against
  `cp_items`/nearest-snapshot (slower, more complex) or guessing. This is
  a field addition to the one already-approved `cp_history` collection,
  not a new collection — stays within Input 1's "only cp_items + cp_history"
  constraint.
- **`resolveStaleAddressConflict`** (a pre-existing Story 72 migration-repair
  helper, unrelated to normal CRUD) now also goes through the transactional
  delete path for already-migrated documents, but falls back to a raw
  delete for still-unmigrated orphans. Documented in code; a legitimate,
  narrow exception to "everything goes through
  executeCpMutationWithHistory" for a data-repair tool that predates this
  Story and isn't part of the Daily/Dates CRUD surface.
- **`data_sync_outbox`/`google_sheets_sync_outbox` untouched**, per Input
  1's explicit instruction. Their existing non-atomicity relative to the
  primary write (the outbox enqueue happens after the primary write
  succeeds, not inside the same transaction) is a pre-existing Story 72/75
  characteristic — Story 79 did not make it worse and did not fix it
  either; `data-router.ts`'s own comments already documented this
  (`onFollowerEnqueueError` logs but never fails the primary request).

## Known limitations / deferred (not silently dropped)

- No QNAP TEST deployment, no real `test3` E2E run, no seed-from-scratch
  against real data — see `05_tasks_and_checklist.md` tasks 17–19.
- `requestId` is not yet generated/forwarded by any live API route — see
  task 20.
- A second real fixture user for cross-user isolation was not
  (re-)verified for this Story specifically — `cp-history.ts`'s isolation
  is unit/integration-tested (`cp-history.test.ts`) with two synthetic
  repoGuids, matching Story 78's own level of coverage, but not re-run
  against `test3` + a second real QNAP TEST user.
- `pnpm --filter dashboard build` (a full Next.js production build, not
  just `tsc --noEmit`) was not run in this session — only the faster
  typecheck. A full build should be run before any real deploy attempt.

## Follow-up proposals

- Wire `requestId` generation into at least the Daily/Date Entry API
  routes (`packages/dashboard/app/api/forms/{daily-entry,date-entry}/route.ts`)
  as the highest-value next step for request-level correlation.
- Once deployed to QNAP TEST: run `migrate-legacy-cp-items-to-history.mjs
  --repoGuid=<test3's guid> --apply` for `test3` specifically (their
  existing Story 78-era `cp_items` predate `_historyVersion`), then
  `pnpm test:cp-history:integrity -- --repoGuid=<test3's guid>` before
  relying on History for that repo.
- Consider whether `pawel_f`/`kamil_s`'s real data should ever be migrated
  — that decision was explicitly left to the user (out of scope here,
  "Nie modyfikuj danych innych użytkowników").
