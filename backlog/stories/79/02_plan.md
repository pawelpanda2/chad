# Story 79 — Plan

Backfilled retroactively (see `01_input.md`'s own note) — this records the
approach actually taken, not a plan presented for approval beforehand.

## Approach

1. **Targeted audit first.** Read `mongo-cp-provider.ts`, `data-commands.ts`,
   `data-router.ts`, `repo-context.ts`, `cp-history.ts`,
   `packages/history-worker/`, `leads.ts`'s Daily/Date Entry
   create/update/delete paths, and Story 74/78's own docs/checklists.
   Confirmed the **only three call sites that ever write to `cp_items`**
   are `MongoCpProvider`'s private `putItem`/`createChild` and public
   `deleteItem` — every business function (`leads.ts`'s Daily/Date Entry
   save/update/delete, the folder-chain helpers) already funnels through
   those three, via `mongo.executeWrite(command)` or `mongo.deleteItem(address)`.
   This is what made a single `executeCpMutationWithHistory` choke point
   tractable without touching call sites individually.
2. **Build the transactional core first, test it directly, then wire it
   in** — `packages/dba/src/cp-history/{hash,diff,mutate}.ts`, unit-tested
   with zero Mongo dependency (`hash.test.ts`, `diff.test.ts`), then
   integration-tested against the real local `rs0` (`mutate.test.ts`)
   *before* touching `MongoCpProvider` at all.
3. **Rewire `MongoCpProvider`** (`putItem`/`createChild`/`deleteItem`) to
   call `executeCpMutationWithHistory` instead of raw
   `updateOne`/`insertOne`/`deleteOne`. `leads.ts`, `data-router.ts`, and
   every API route needed **zero changes** — they already went through
   these three methods.
4. **Rewrite `cp-history.ts`'s read side** for the new schema (`version`,
   `mutationId`, `repoGuid` as a real indexed field instead of an
   address-regex, hashes, `itemName`), dropping `cp_history_state`/
   `cp_history_last_state` from the read path entirely.
5. **Retire `packages/history-worker`** — neutered to a safe no-op stub
   (never deleted the package wholesale, so a stray reference fails loudly
   instead of silently double-writing an incompatible schema into
   `cp_history`), removed from both `docker-compose.local.yml` and
   `docker-compose.qnap.shared.yml`, its own tests deleted (superseded by
   `mutate.test.ts`, which needs no child-process/shadow-state machinery
   at all since there's no separate process anymore).
6. **Migration + integrity as separate, explicit scripts**
   (`packages/dba/scripts/`), never invoked automatically — a legacy item
   without `_historyVersion` blocks live mutation with
   `CpItemNotMigratedError` until deliberately migrated per-repoGuid.
7. **GUI rewrite** (Input 2) — table replacing the accordion/pagination
   list, separate details route, done after the backend was already
   tested and working, reusing Statuses'/Views' own `<table>` markup
   conventions (`border bg-muted/10` wrapper, `border p-1 bg-muted`
   headers) rather than introducing a new table component.
8. **Local verification before any deploy** — unit + integration suites
   run against the real local `rs0` (`chad-mongodb-local-mac-docker`,
   already replica-set-enabled since Story 74) before considering QNAP
   TEST.

## Explicit non-goals / deferred (see `06_others_from_report.md` for the full list)

- No PROD deployment or PROD data changes.
- No rebuild of `data_sync_outbox`/`google_sheets_sync_outbox` — both left
  exactly as they were; their pre-existing non-atomicity relative to the
  primary write is documented, not fixed (out of scope per Input 1).
- No `requestId` plumbing into every existing API route (the mechanism
  supports it; wiring every route's HTTP layer to generate/forward one is
  not done for every endpoint).
