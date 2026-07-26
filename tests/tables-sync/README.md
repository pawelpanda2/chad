# tests/tables-sync

Regression suite for the Dashboard tables (Daily Tracker, Dates, Leads) <->
Google Sheets sync, plus the related folder-protection and history-status
surfaces. This is the "did I just break table data / Google Sheets sync /
system folders" check referenced by `ai-docs/begin_here/01_ai_start.md`.

## Running

```bash
pnpm test:tables-sync              # builds dba, then runs every suite
pnpm test:tables-sync:local        # same, with CHAD_ENVIRONMENT=local + GOOGLE_SHEETS_ALLOW_NON_PROD=true
pnpm test:tables-sync:qnap-test    # same, with CHAD_ENVIRONMENT=test (forwards --qnap-test)
```

Or directly:

```bash
node tests/tables-sync/run-all.mjs [--skip-build] [--qnap-test]
```

`run-all.mjs` always runs `pnpm --filter dba build` first (skip with
`--skip-build` for a fast local loop), then runs every `*.test.mjs` file
under this directory with Node's built-in test runner (`node --test`) — no
extra test-framework dependency needed.

## What's covered

- `daily/mapping-schema.test.mjs`, `dates/mapping-schema.test.mjs` — the
  Dashboard's own on-screen columns (hand-maintained fixtures under
  `fixtures/`) must exactly match `packages/dba`'s Google Sheets mapper
  (`DAILY_ENTRY_DOMAIN_COLUMNS`/`DATE_ENTRY_DOMAIN_COLUMNS`), via the
  mapper's own `assertUiColumnsMatchMapper`. Fails the moment a column key
  or label drifts between the two.
- `google-sheets/delete-physical.test.mjs` — deleting a synced row
  physically removes it (0 rows left), never just tombstones it.
- `google-sheets/worker-order.test.mjs` — create -> update -> delete
  converges correctly: no duplicate row on update, `CHAD_CREATED_AT` never
  changes, final state is empty after delete.
- `google-sheets/config-validator.test.mjs` — unit tests for
  `packages/dba/scripts/validate-google-sheets-config.mjs`'s pure
  validation function (required usernames, duplicate spreadsheetId
  detection, required sheet-name vars, no secret leakage).
- `history/status-shape.test.mjs` — `getGoogleSheetsSyncStatusForHistoryEntry`
  returns the right shape for "not configured" (pure, no DB) and "no sync
  yet" (DB-backed, skipped if unreachable).
- `folder-protection/system-folders.test.mjs` — `listReadOnlyFolders` /
  `assertNotSystemFolderWrite` correctly protect Daily Tracker/Dates/Leads
  folders from generic Folders-GUI writes.

## Database-backed tests

`google-sheets/delete-physical.test.mjs`, `google-sheets/worker-order.test.mjs`,
and half of `history/status-shape.test.mjs` exercise the real local outbox
through `packages/dba`'s own `enqueueGoogleSheetsSync`/`drainGoogleSheetsSyncOnce`,
paired with the in-memory `FakeGoogleSheetsClient` (Google's real API is
**never** called by this suite). They connect using `MONGODB_URI` from
`.env.local` (loaded via `helpers/env.mjs`, rewriting the
docker-compose-internal `mongodb` hostname to its host-published port), and
**skip (never fail)** when no local MongoDB is reachable — safe to run in a
sandbox with no `docker-compose.local.yml` stack up.

These tests deliberately force `DBA_PRIMARY_BACKEND=mongo`, **never**
Postgres, even though this repo's actual local stack runs
`DBA_PRIMARY_BACKEND=postgres` (see `docker-compose.local.yml`) — a live
dashboard container may already be polling that SAME shared
`cp_outbox_google_sheets_sync` Postgres table with its own real background
Google Sheets worker (`bootstrap.ts`'s `startGoogleSheetsSyncWorkerIfEnabled`).
Enqueuing a synthetic test job there risks that real worker racing to claim
it first and burning a real Google Sheets API call against a bogus test
`spreadsheetId` — flaky at best, wasted API quota at worst. Mongo's own
outbox collection has no live consumer once Postgres is primary (Mongo is
Beeper-CRM-only in that mode), so it's the safe, non-racy choice — and
still exercises the exact same `outbox.ts`/`worker.ts`/`mapper.ts` code
paths, since the outbox is backend-dispatched by design (Story 80).

Every DB-backed test only ever reads/writes rows scoped to synthetic
`tables-sync-test-*` repoGuids/recordKeys and cleans up its own outbox rows
afterward — **never** pawel_f's/kamil_s's/test3's real data.

## Adding a new check

- Pure logic (mapping, folder protection, config parsing) -> a plain
  `node:test` file importing from `packages/dba/dist` (see
  `helpers/assert-mapping.mjs`/`helpers/fake-sheets.mjs` for the existing
  import helpers).
- Anything that needs the real outbox -> gate it behind
  `helpers/env.mjs`'s `probePostgresReachable()` and skip (not fail) when
  unreachable, and always clean up any outbox rows you create.
