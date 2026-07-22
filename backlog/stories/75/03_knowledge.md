# Story 75 — Knowledge

Pointers needed to work on this Story's area, and why.

- `ai-docs/begin_here/01_ai_start.md`, `02_what-and-where.md`,
  `03_story-standard.md`, `05_endpoint-rules.md` — global reading-order,
  index, Story format, and the "may add a missing endpoint/dba method,
  never a fake Save" rule this Story's new `if (config.googleSheetsEnabled)`
  block follows.
- `human-docs/dashboard/forms/features/daily-tracker-dates.md` — the single
  authoritative description of the real Daily Tracker data flow, field list,
  identity rules (`loca` stable, `DATE` not unique, `itemName` sequential),
  and the AUTO-fields rule. Needed to design the sheet mapping without
  guessing column names from a screenshot.
- `human-docs/dba/provider-migration-audit.md` — confirms `saveDailyEntry`/
  `updateDailyEntry`/`getAllDailyEntries`/`getAllDateEntries`/
  `saveDateEntry`/`updateDateEntry` are the *only* 6 functions in the whole
  `dba` package already on the dual-backend `if(mongoEnabled)/
  if(contentProviderEnabled)` pattern the user's prompt's pseudocode
  describes, and that `data-outbox.ts`/`data-outbox-worker.ts`/
  `data-router.ts`/`data-sync-diagnostics.ts` exist, are fully built and
  tested, but are wired into **no** live business function yet — the direct
  precedent for this Story's own outbox+worker being complete but likewise
  not wired into a live process.
- `packages/dba/src/leads.ts` (lines ~900-1550) — the real
  `saveDailyEntry`/`updateDailyEntry`/`deleteDailyEntry`/`getAllDailyEntries`
  implementations and their Mongo/CP dual paths; the exact insertion point
  for the new Sheets follower call.
- `packages/dashboard/app/api/forms/daily-entry/route.ts` — confirms the
  Dashboard layer's contract with `dba` (raw YAML string in/out, AUTO-key
  stripping on PATCH) and that Dashboard never needs to change for this
  Story (it already only calls the three `dba` functions being extended).
- `packages/dba/src/data-outbox.ts`, `data-outbox-worker.ts`,
  `data-sync-diagnostics.ts`, `data-clock.ts` — the proven outbox shape
  (status enum, `RETRY_BACKOFF_MS`/`STALE_LOCK_MS` constants reused
  directly, `Clock` DI for deterministic tests, secret-free error logging
  convention) this Story's new `google-sheets/outbox.ts` mirrors without
  reusing the same types (see `02_plan.md` §2 for why not the same types).
- `packages/dba/src/data-providers/config.ts` — the existing
  `loadDataProvidersConfig()`/lazy-read/`validate*` convention this Story's
  new `google-sheets/config.ts` follows for its own, independent
  `GOOGLE_SHEETS_*` env vars.
- `packages/beeper-sync/sync-google-contacts.mjs` — the one existing Google
  API integration in the repo; read to confirm it's OAuth-desktop-flow (not
  reusable for an unattended server sync) and to match its no-SDK
  `fetch`-based style rather than adding the `googleapis` package.
- `.env.local.example` — env var documentation convention (block comment
  above each Story's own vars, referencing a doc file) followed for the new
  `GOOGLE_SHEETS_*`/`GOOGLE_SERVICE_ACCOUNT_*` vars.
- `packages/dba/src/data-outbox.test.ts`, `headers-parser.test.ts` — the
  only test convention in this package: no framework, hand-rolled
  `test()`/`assert()` runner, `cd packages/dba && npx tsc && node
  dist/<file>.test.js`, Mongo-touching tests point `MONGODB_URI` at the
  already-running local `chad-mongodb-local-mac-docker` container (confirmed
  up via `docker ps` at the start of this Story). Running from the host
  (not inside the Docker network) requires `directConnection=true` on the
  URI and `localhost` instead of the container's own hostname — the replica
  set (`rs0`) otherwise advertises its internal Docker hostname, which the
  host can't resolve.
- `packages/dashboard/app/(dashboard)/dashboard/views/page.tsx`'s
  `DAILY_COLUMNS`/`DATE_COLUMNS` arrays (lines ~82-113) — discovered
  **after** the first pass of this Story already shipped, when the user
  pointed out the synced sheet looked "something weird" and asked for a
  faithful copy (Input 7). This is the actual, authoritative source of
  column order/labels/grouping for both tables — more authoritative than
  `human-docs/dashboard/forms/features/daily-tracker-dates.md` §3, which is
  stale on `OUTINGS`'s position (says right after `ACTION TIME`; live code
  puts it last, under `RESULTS`). `mapper.ts`'s `DAILY_ENTRY_DOMAIN_COLUMNS`/
  `DATE_ENTRY_DOMAIN_COLUMNS` are now verbatim copies of these two arrays
  (key + display label, including the em-dash in `"PULLS — AUTO"`).
