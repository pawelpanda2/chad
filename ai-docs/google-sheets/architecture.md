# Google Sheets sync — architecture (Story 75)

Full technical reference. See `ai-start.md` for the one-line summary and
`backlog/stories/75/02_plan.md`/`06_others_from_report.md` for the reasoning
behind each decision below, including the 2026-07-21 revisions described in
§0, §0b, §0c, §0d, and §0e.

## 0. Revision note (2026-07-21, same day as the original build)

The first pass of this Story (see `02_plan.md`) deliberately **excluded**
the four computed "— AUTO" columns and **deferred** Date Entry ("Dates")
sync to a follow-up Story, and put CHAD's own technical bookkeeping columns
**first** in the sheet. After seeing the actual synced sheet, the user asked
for a genuinely **faithful copy** of the Dashboard's own Tracker/Dates
tables (AUTO columns included, exact same column order/labels, technical
columns out of the way) and asked for Date Entry sync to be built in the
same session, not deferred. This doc describes the **current, revised**
design — the exclusions/deferrals described in `02_plan.md` §7 no longer
apply to AUTO columns or Date Entry; see `06_others_from_report.md` for the
full revision history.

## 0b. Revision note (2026-07-21, same-day follow-up — per-user spreadsheet + live worker wiring)

After §0 shipped, the user pointed out two remaining gaps, both fixed in
this follow-up pass:

1. **One spreadsheet per user, not one global spreadsheet.** The original
   design (§4 below, pre-revision) had a single `GOOGLE_SHEETS_SPREADSHEET_ID`
   env var — every CHAD user's writes landed in whichever one spreadsheet
   that var named (in practice: pawel_f's spreadsheet was catching kamil_s's
   writes too, since `.env.local` only ever named one id). Every CHAD user
   owns their own personal Google Sheet, so this was wrong by construction,
   not just a config oversight. Replaced with
   `GOOGLE_SHEETS_SPREADSHEET_MAP` (`packages/dba/src/google-sheets/config.ts`),
   a JSON `{username: spreadsheetId}` map, resolved via the acting user's
   own `username` — sourced from `getCurrentUsername()`
   (`packages/dba/src/repo-context.ts`), the same request-scoped
   `AsyncLocalStorage` context `leads.ts` already used for `repoGuid`,
   populated by the API route from the session cookie, **never** from
   request body/query. See §4/§5b below.
2. **The worker is now actually running.** Previously `worker.ts` was fully
   built/tested but not called from anywhere (§7's original text) — enqueued
   jobs sat `pending` forever outside a one-off manual script. It now starts
   automatically inside the already-running Dashboard Next.js process via
   `packages/dashboard/instrumentation.ts`'s `register()` hook, calling
   `dba`'s new `google-sheets/bootstrap.ts`. No separate worker
   container. See §7 (rewritten).

Both changes were verified against the two real spreadsheets — see §10
(new).

## 0c. Revision note (2026-07-21, same-day follow-up — visual layout + a real incident/fix)

A third same-day follow-up: the user pointed out that matching data/headers
wasn't enough — the "daily"/"dates" tabs needed to actually *look like* the
Dashboard's own `views/daily`/`views/dates` tables (column groups, colors,
widths, frozen panes, hidden technical columns, ...), not a raw export. New
`packages/dba/src/google-sheets/layout.ts` (§3, §11) adds this via
`spreadsheets.batchUpdate`, applied once per user at worker startup
(`bootstrap.ts`), versioned via `CHAD_SHEET_LAYOUT_VERSION` sheet-scoped
developer metadata, deliberately separate from the per-record sync path.

**A real incident happened during this work and was fixed the same
session** (full detail: §11's own note, `05_tasks_and_checklist.md` Task 6):
implementing the daily tab's 2-row header (a decorative merged group-label
row above the real column-name row `ensureHeaders` already owned) required
introducing `GoogleSheetsTarget.headerRowCount`. The first version of
`applyHeaderFormatting` used a single `updateCells` request across a
multi-column merged range with only one `CellData` in `rows[].values[]` —
Google's API clears every cell in a range not explicitly given a value
under that request's fields mask, so this **blanked the real column-name
header text** ("DATE", "STATE", ...) on **both live spreadsheets**
(confirmed via a direct Sheets API read immediately after, not assumed).
No real personal user data was affected — verified first, before any
remediation, that the only content on either "daily" tab at the time was
one already-deleted leftover test row from the prior session's E2E
verification; the destroyed content was CHAD's own auto-generated header
labels, trivially regenerable, never something a user typed. Root cause
fixed in `applyHeaderFormatting` (format the whole merged range with a
value-free `repeatCell`, write the group-name text separately into a
1-column-wide `updateCells` targeting only the merge's anchor cell — see
§11's own note for the full request-shape explanation) plus a related gap
(a fresh `insertDimension` now runs first on a tab's *very first* layout
application, so a pre-existing 1-header-row tab's old content shifts down
instead of being overwritten in place). Both live spreadsheets' "daily"
tabs were then cleared and re-laid-out from a clean state with the fixed
code; "dates" tabs were never affected (single header row, no merge/value
-writing logic involved) and needed no remediation. Two new regression
tests guard both bugs directly (`layout.test.ts` — see §11/§13).

## 0d. Revision note (2026-07-22, next-day follow-up — removed two unrequested UI additions, fixed a real missing-data gap)

Direct user feedback, acted on immediately:

1. **Basic Filter (per-column sort/filter dropdown arrows) and the
   group-separator border were never asked for and were removed.**
   `applyBasicFilter` → `clearBasicFilter` (`LAYOUT_VERSION` 2);
   `applyBordersAndGroups` → `resetGroupSeparators` (`LAYOUT_VERSION` 3) —
   both emit an explicit reset/clear request rather than just no longer
   adding the thing, since an already-applied filter/border needs an
   active undo, not just "stop re-adding it." Every "closest equivalent
   for the Dashboard's filter/sort" and "group separator" reference
   elsewhere in this doc (§11b, §11d, §14) describes a decision that **no
   longer reflects the current layout** — kept only as history of what was
   tried and explicitly rejected, not as current behavior. Current
   behavior: plain grid, no filter UI, no extra borders beyond the
   standard thin grid line everywhere.
2. **Pre-existing real data was never backfilled into either spreadsheet.**
   The live sync hooks in `leads.ts` only ever fire for a write made
   *after* they existed — nothing backfilled a user's entries that already
   existed in Mongo before this integration went live. New
   `backfillGoogleSheetsSyncForCurrentUser()` (`leads.ts`) reads every
   existing Daily/Date Entry for the current user and enqueues it through
   the exact same field-parsing/AUTO-computation/enqueue path a real save
   uses — not a separate, divergent code path.
3. **A real Google Sheets API quota wall (60 read requests/minute/user,
   the default free-tier limit) turned the backfill into a slow
   retry/backoff grind.** Root cause: a single sync job made up to 4
   separate header-row reads (`ensureHeaders`, `findRowByKey`,
   `updateRow`/`appendRow` each called `readHeaderRow` independently).
   Fixed with a short-TTL (4s) in-memory header cache in
   `sheets-api-client.ts` (collapses to ~1 real read per job) plus explicit
   pacing between jobs during a drain (`GoogleSheetsWorkerDeps.
   minDelayBetweenJobsMs`, set to 1200ms in `bootstrap.ts` only — 0/off for
   every test, so the test suite's speed is unaffected).
4. **A real operational mistake happened during this fix and is recorded
   here rather than hidden:** the backfill was enqueued into the same
   local Mongo the automated test suite also uses, then this session ran
   `outbox.test.ts`/`worker.test.ts`/`sync.test.ts` (which each do
   `deleteMany({})` on `google_sheets_sync_outbox` as their own start/end
   cleanup, see the header comments those files already carry) — wiping
   out most of the still-pending real backfill jobs before they had a
   chance to drain. Caught by verifying actual Sheets row counts against
   real Mongo counts (§10 already established this as the standard for
   this Story — asserted counts, not spot checks) rather than trusting the
   outbox reaching empty. Fixed by re-running the backfill and not running
   any test file against the same Mongo instance until it fully drained.
   **Lesson recorded for future sessions:** never run this package's test
   suite while a real backfill/drain is in flight against the same Mongo
   the tests point at.
5. **The History tab's oplog (`cp_history`, Story 74) also couldn't
   reconstruct full historical data** — `history-worker` deliberately never
   backfills at startup (its own header comment), so only 13 records
   existed, all from the day this Story's work began; 759 of 765 total
   `cp_items` documents across the whole system (not just Google-Sheets
   -relevant ones) had zero history. New
   `packages/history-worker/backfill.mjs` (one-time, idempotent — skips any
   item that already has real or previously-backfilled history) inserts
   one synthetic `insert`-shaped record per such item, using the exact same
   `diffConfig`/`diffBody` functions the live consumer uses, `beforeUnknown:
   true` (matching the live consumer's own convention for "no known prior
   state"), and an explicit `backfilled: true` + `backfillNote` marker so
   it's never mistaken for a genuinely observed event. `changedAt` uses the
   item's own real `config.created` timestamp. Run once against the real
   local Mongo (762 inserted, 3 skipped — already had real history).
6. **A second real incident, found while verifying the backfill (item 2)
   actually landed correctly** — real Sheets row counts were checked
   against real Mongo counts (not just "the outbox reached empty") and
   didn't match: the "daily" tab (both users) collapsed to a single row no
   matter how many jobs synced, while "dates" (both users) was exactly
   correct. Root cause: `appendRow`'s real implementation used the Sheets
   API's `values.append` + `insertDataOption=INSERT_ROWS`, which relies on
   Google's own "detect the table, insert after its last row" heuristic —
   that heuristic gets confused when the anchor cell (`A1`) is blank, which
   it is on the "daily" tab specifically (the group-label row's "none"
   -group cell over the DATE column has no text, only formatting) and
   isn't on "dates" (single header row, `A1` = the literal text "DATA").
   Confused, it inserted every new row in essentially the same place near
   the top instead of after the real last row, so each append silently
   clobbered the previous one instead of adding to the sheet. Fixed by
   removing the ambiguity entirely: `appendRow` now computes the exact
   target row itself (counting existing non-empty `CHAD_RECORD_KEY`
   values, which are always populated and gap-free) and writes with a
   plain, unambiguous `values.update` instead of `values.append`. "dates"
   tabs were never affected (confirmed correct both times, 3/3 and 26/26
   against real Mongo counts) and needed no remediation; "daily" tabs on
   both spreadsheets were cleared (data rows only, headers/formatting
   untouched) and the backfill re-run with the fixed code — see §10 for
   the final verified counts.
7. **A leftover-debris cleanup**, found while double-checking distinct
   `CHAD_RECORD_KEY` counts after item 6's fix: an earlier remediation
   attempt's clear range hadn't been wide enough (columns beyond AD were
   never touched), leaving orphaned data in unlabeled columns past the
   real 28-column layout. Cleared (columns 28+, all rows) — zero risk to
   the real, correctly-keyed data in columns A-AB. Final state, verified:
   8/8, 3/3, 84/84, 26/26 rows for pawel_f/kamil_s × daily/dates, every
   row with a distinct `CHAD_RECORD_KEY`, zero rows missing a key,
   matching real Mongo counts exactly.

## 0e. Revision note (2026-07-22, same night, immediate follow-up — removed every remaining "extra" the user didn't ask for)

Direct, repeated feedback, acted on immediately each time: `LAYOUT_VERSION`
4 removed the non-strict TAK/NIE-style data-validation dropdowns
(`clearDataValidation`, replacing `applyDataValidation`) and the frozen
header row/column (`resetFrozenRowsAndColumns`, replacing
`applyFrozenRowsAndColumns` — its divider line was the second thing flagged
as an unwanted extra, on top of the group-separator border §0d already
removed). Neither was ever a Dashboard mirror to begin with (§11d already
said so) — both were Sheets-native "nice to have" additions this Story
invented, and the user didn't want either.

`LAYOUT_VERSION` 5 replaced the guessed pixel-width heuristic
(`estimateColumnWidthPx`/`applyColumnWidths`) with a real
`autoResizeDimensions` request (`autoResizeColumns`) — the same action as
double-clicking a column border in the Sheets UI, sizing every column to
its actual current content instead of an estimate from label length. Per
the user's explicit ask ("szerokość komórek niech się wyrównuje co do
długości zawartości").

**Current state (`LAYOUT_VERSION` 5, both tabs, both users) is now
deliberately minimal**: column groups + colors (the one thing actually
asked for from the start), auto-fit widths, left-aligned/clipped text, the
2-row merged group header (daily only), hidden `CHAD_*` columns. No filter,
no data-validation dropdowns, no frozen panes, no group-separator border —
every one of those was tried, none were requested, all were removed. §11's
audit table, §11d's limitations table, and §14's checklist describe the
`LAYOUT_VERSION` 1 state at the time they were written and are **not**
current for the filter/separator/validation/frozen-pane rows specifically
— superseded by this note; not rewritten line-by-line given how much
changed same-night. Re-verified after each version bump: real row counts
still exactly matched Mongo (8/3/84/26) after every single change in this
note, confirmed via the same real-count method §10 established, not
assumed.

```
Dashboard (unchanged — zero new imports/knowledge of Sheets)
  → saveDailyEntry / updateDailyEntry / deleteDailyEntry     [packages/dba/src/leads.ts]
  → saveDateEntry / updateDateEntry                          [packages/dba/src/leads.ts]
      1. primary write: Mongo (if config.mongoEnabled) and/or
         Content Provider (if config.contentProviderEnabled) — unchanged,
         this Story added nothing here.
      2. (Daily Entry only) computeDailyAutoFieldsForSheetSync(DATE) —
         fetches current Date Entry data and computes the same "— AUTO"
         values the Dashboard's own GET route computes, fresh at write time
         — never persisted to CHAD's own storage, only sent to the sheet.
      3. if (loadGoogleSheetsConfig().enabled):
           spreadsheetId = resolveSpreadsheetIdForUser(config, getCurrentUsername())
           queueDailyEntrySheetSyncIfEnabled(...)   [google-sheets/sync.ts]
           queueDateEntrySheetSyncIfEnabled(...)    [google-sheets/sync.ts]
             → enqueueGoogleSheetsSync(...)          [google-sheets/outbox.ts]
                 → Mongo collection `google_sheets_sync_outbox`
                   (job.payload.spreadsheetId already resolved — see §5b)
  ⋯ (async, inside the Dashboard process, out of the request path — §7) ⋯
  processGoogleSheetsJobOnce / drainGoogleSheetsSyncOnce  [google-sheets/worker.ts]
    → target = { spreadsheetId: job.payload.spreadsheetId,
                 sheetName: sheetNames[job.payload.recordType] }
      (sheetNames is static per-record-type config — "daily"/"dates" —
      shared across every user's own spreadsheet; spreadsheetId comes from
      the job, not from any static worker config — §5b)
    → GoogleSheetsClient.ensureHeaders/findRowByKey/updateRow/appendRow
        → GoogleSheetsApiClient (real, Sheets API v4 REST)  [sheets-api-client.ts]
           or FakeGoogleSheetsClient (tests only)            [fake-client.ts]
```

The enqueue call (step 3) never throws into any of the five `leads.ts`
functions above — a Sheets/config problem, including an unmapped username,
is logged and swallowed, never turns a successful CHAD write into a failed
response.

## 0f. Revision note (2026-07-22, follow-up session — always-visible "N" column, newest-first row order)

Two real gaps found and fixed, both against the two already-live
spreadsheets, both with real read-verify-write-verify migrations (never
"the API call returned 200" alone):

**1. Missing "N" (item number) column.** The Dashboard's own Tracker/Dates
tables have an "n" toggle button (`views/page.tsx`) that reveals
`entry.itemName` — the Content Provider item's own zero-padded sequence
number (`generateEntryName` in `leads.ts`), used to correlate a table row
with the underlying `cp_item`. It was already synced to Sheets, but only
as a hidden technical column (`CHAD_ITEM_NAME`, last of the 8 `TECHNICAL_COLUMNS`)
— never visible by default, unlike the Dashboard's own (clickable) column.
Fixed by adding `ITEM_NUMBER_COLUMN` (`mapper.ts`, key `"N"`, label `"N"`,
`group: "none"`) as the literal first entry of both
`DAILY_ENTRY_DOMAIN_COLUMNS` and `DATE_ENTRY_DOMAIN_COLUMNS` — always
visible, always first, sourced from `payload.itemName` (a special case in
`mapToSheetRow`, not a real `payload.fields` key). `CHAD_ITEM_NAME` itself
was deliberately left untouched (still hidden, still written, same value
duplicated) rather than removed — removing it would have required
coordinating a column-count change with whatever old worker code might
still be running mid-deploy; leaving it is harmless, low-risk redundancy.
`SHEET_SCHEMA_VERSION` bumped 1 → 2, `LAYOUT_VERSION` bumped 5 → 6 (picks
up the widened "none" group-run formatting). The physical column insert
on the two already-live spreadsheets was done via a dedicated one-off
script (`insertDimension` column A, then copying each row's own existing
`CHAD_ITEM_NAME` value into the new column A — no Mongo access needed,
the sheet's own already-correct hidden column was the source of truth),
verified row-count-exact on all 4 tabs (8/3/84/26, matching every prior
real count in this Story) before and after.

**2. New rows appended at the bottom, oldest-first — wrong direction.**
User feedback: new entries must appear at the TOP, newest-first, inserted
by physically pushing existing rows down — "to ma być idealna
synchronizacja w jedną stronę od danych z oplog z bazy mongo cp_items do
google sheet" (this must be a perfect one-way sync from the cp_items
oplog data to Google Sheets). `sheets-api-client.ts`'s `appendRow`
rewritten: instead of computing the next empty row at the bottom
(`findNextEmptyDataRow`, now removed) and `values.update`-ing there, it
now always issues `insertDimension` at the fixed first-data-row position
(`inheritFromBefore: false`, so the new row inherits body-row formatting
from the row after it, not header formatting from above) before writing
the new row's values there — every existing row shifts down by one,
unconditionally, on every single append. Added a `sheetIdCache` (no TTL —
a sheetId never changes for a tab's lifetime, unlike the header cache) so
this doesn't reintroduce the Sheets API quota problem §0d already fixed
once (`appendRow` now needs `getSheetId` on every call, not just headers).
`FakeGoogleSheetsClient.appendRow` changed from `rows.push` to
`rows.unshift` to match. The two already-live spreadsheets' existing data
(oldest-first, from the original backfill) was reversed in place via a
second one-off script: full read of the data range (`UNFORMATTED_VALUE`,
avoids any display-format round-trip surprise), reverse the in-memory
array, write back to the same range with `RAW` input (same shape, no
insert/delete needed since it's a pure reorder) — verified row count,
identical `CHAD_RECORD_KEY` multiset, and that the order was actually
flipped, on all 4 tabs, before declaring it done.

Both fixes covered by new/updated automated tests
(`mapper.test.ts`: `ITEM_NUMBER_COLUMN` value-sourcing + column-position
assertions; `layout.test.ts`: `groupRuns`/`applyHeaderFormatting` indices
shifted for the new leading column; `worker.test.ts`: a dedicated
insert-at-top ordering test) — full suite re-run and green (12+24+16+11+11+7
= 81 tests) before this note was written.

## 0g. Revision note (2026-07-22, Story 76 follow-up — production-only sync guard, independent of GOOGLE_SHEETS_ENABLED)

Google Sheets is a **production report** — the user's own explicit
instruction: it must never reflect local Mongo, test Mongo, developer
data, migration data, test data, or temporary data, and the safeguard
must not rest solely on `GOOGLE_SHEETS_ENABLED` (a single flag that could
be left on by mistake in some future non-prod context, or on QNAP TEST —
which, per Story 76's own finding, shares the exact same physical
`chad-mongodb` container/data as PROD today, so "is this real data" alone
doesn't distinguish TEST activity from PROD activity).

New module: `packages/dba/src/google-sheets/production-guard.ts`,
`checkGoogleSheetsProductionGuard()` — two independent conditions, both
required, checked against **actual runtime state**, not a single trusted
flag:

1. `CHAD_ENVIRONMENT` must be exactly `"prod"` — a new env var, wired only
   into `docker-compose.qnap.prod.yml` (never `.test.yml`, never
   `docker-compose.local.yml`, which sets `CHAD_ENVIRONMENT=local`
   unconditionally — even for a `DBA_MONGO_MODE=qnap` local session
   pointed at QNAP's real Mongo, see the 2026-07-22 login-incident note in
   `01_config.sh`). The sync worker is meant to run in exactly one place —
   the real deployed PROD container — never a developer machine, never
   TEST, regardless of which Mongo either happens to be pointed at.
2. The resolved `MONGODB_URI`'s host must be on a known-production
   allowlist (`chad-mongodb`, QNAP's Tailscale IP `100.117.139.83`) — the
   check that survives a `CHAD_ENVIRONMENT` misconfiguration (e.g. a
   copy-pasted compose file setting `CHAD_ENVIRONMENT=prod` but still
   pointed at a local/test Mongo). Extracted via `extractMongoHost()`
   (regex on the URI, no Mongo I/O).

Wired into **both** ends of the sync path, not just the worker:

- `sync.ts`'s `queueSheetSyncIfEnabled()` — a job must never even be
  **written into the outbox** from a non-production run, checked right
  after the existing `config.enabled` check, before resolving a
  spreadsheet id. Logs via `console.warn` and returns (same
  never-throw-into-the-caller contract as every other failure mode here).
- `bootstrap.ts`'s `startGoogleSheetsSyncWorkerIfEnabled()` — the worker
  itself refuses to start (`return null`, logged) unless the guard passes,
  independent of and in addition to the existing `GOOGLE_SHEETS_ENABLED`
  check.

`docker-compose.qnap.prod.yml` previously had **no** `GOOGLE_SHEETS_*` env
vars wired in at all (Sheets sync was never actually deployment-ready for
QNAP before this note) — added now, all defaulting to disabled/empty via
`${VAR:-...}` interpolation from `.env.qnap` (documented in
`.env.qnap.example`'s own new section), consistent with
`docker-compose.local.yml`'s existing pattern. `docker-compose.qnap.test.yml`
deliberately gets `CHAD_ENVIRONMENT=test` and **no** `GOOGLE_SHEETS_*` vars
at all — not just "guarded at runtime", structurally absent.

Tests: `production-guard.test.ts` (9 tests, pure — env-var manipulation,
no I/O) covers every combination of the two conditions directly;
`sync.test.ts` gained two integration tests proving the guard is actually
wired into the real enqueue path (blocked with fully-valid Sheets config
but `CHAD_ENVIRONMENT` wrong; blocked with `CHAD_ENVIRONMENT=prod` but a
non-production `MONGODB_URI` host) — full google-sheets suite: 92 tests,
all green.

## 2. Why a parallel outbox, not `data-outbox.ts`

`data-outbox.ts`/`data-outbox-worker.ts` (Story 72) already implement a
generic durable-outbox pattern for **CP-compatible** follower backends
(Mongo ↔ Content Provider), keyed on replaying a `DataWriteCommand` against
a `CpCompatibleDataProvider`. Google Sheets has no `address`/`type`/`id`
concept for a spreadsheet row, so it doesn't fit that interface — forcing it
in would mean fabricating meaningless `CpItem` fields. Instead,
`packages/dba/src/google-sheets/outbox.ts` copies the exact same *shape*
(status enum, `attempts`/`nextAttemptAt`/`lockedAt`/`lockedBy`/`lastError`,
claim/markSynced/markRetry/recoverStaleLocks) and literally re-imports
`RETRY_BACKOFF_MS`/`STALE_LOCK_MS` from `data-outbox.ts` rather than
redefining them, but uses its own job payload
(`SheetSyncPayload` — a complete field snapshot, not a CP command).

Each outbox job's `_id` is a fresh `operationId` (UUID) — not a slot per
record — so every job is independently idempotent and several queued jobs
for the same record apply in order without any risk of an in-flight job
clobbering a newer one (see plan §2 for the rejected alternative design and
why). The **same** outbox collection and worker serve both record types —
`SheetSyncPayload.recordType` (`"daily-entry"` | `"date-entry"`) is what the
worker uses to route to the right tab/mapper (§3, §6).

## 3. Modules (`packages/dba/src/google-sheets/`)

| File | Responsibility |
|---|---|
| `types.ts` | `GoogleSheetsClient` interface, job/payload/row types, `SheetRecordType`. |
| `config.ts` | `loadGoogleSheetsConfig()` — env vars, validation, `\n` un-escaping. |
| `mapper.ts` | Pure fields → sheet row mapping for **both** record types; column lists (verbatim copies of the Dashboard's own column arrays); schema version. |
| `outbox.ts` | Mongo-backed durable job queue (`google_sheets_sync_outbox`), shared by both record types. |
| `worker.ts` | Claims/processes jobs against a `GoogleSheetsClient`, routing by `recordType` for the tab name and by `job.payload.spreadsheetId` for the spreadsheet (§5b); started by `bootstrap.ts` (see §7). |
| `sync.ts` | `queueDailyEntrySheetSyncIfEnabled()` / `queueDateEntrySheetSyncIfEnabled()` — what `leads.ts` actually calls; resolves `spreadsheetId` per user before enqueueing (§5b). |
| `bootstrap.ts` | `startGoogleSheetsSyncWorkerIfEnabled()` — builds the real client from config and starts `runGoogleSheetsSyncWorker`; called once from `packages/dashboard/instrumentation.ts` (§7); also calls `layout.ts`'s two `ensureXLayout` functions once per configured user at startup. |
| `layout.ts` | Visual layout/formatting (Story 75 visual-layout follow-up, 2026-07-21, revised 2026-07-22 — see §0d) — `ensureDailyTrackerLayout`/`ensureDatesLayout` plus their pure `batchUpdate`-request-building helpers (`applyHeaderFormatting`, `applyColumnWidths`, `applyRowHeights`, `applyNumberFormats`, `applyGroupCellBackgrounds`, `applyDataValidation`, `applyFrozenRowsAndColumns`, `resetGroupSeparators`, `hideTechnicalColumns`, `clearBasicFilter`). `LAYOUT_VERSION` 3 — no filter UI, no group-separator border (both removed per explicit user feedback, §0d). Deliberately separate from the per-record sync path — see §11. |
| `service-account-auth.ts` | Signs a JWT (Node `crypto`, no dependency) and exchanges it for an access token; caches per service-account email until near-expiry. |
| `sheets-api-client.ts` | Real `GoogleSheetsClient` — plain `fetch` calls to Sheets API v4. Short-TTL header cache (§0d) cuts reads-per-job ~4x. `appendRow` computes its target row explicitly and writes via `values.update`, never the Sheets API's own `values.append` "detect the table" heuristic (§0d item 6 — that heuristic silently clobbered rows on the 2-header-row "daily" tab). |
| `fake-client.ts` | In-memory `GoogleSheetsClient` — every test uses this; Google's API is never called by any automated test. |

## 4. Config — env vars

Read lazily via `loadGoogleSheetsConfig()`, independent of
`data-providers/config.ts` (that's specifically the Mongo/Content-Provider
layer). See `.env.local.example` for the documented block.

| Var | Required when enabled | Notes |
|---|---|---|
| `GOOGLE_SHEETS_ENABLED` | — | `false`/unset = fully disabled, default. |
| `GOOGLE_SHEETS_SPREADSHEET_MAP` | yes | JSON object, `{"username": "spreadsheetId", ...}` — one entry per CHAD user (§0b/§5b). **Not** a single shared spreadsheet. |
| `GOOGLE_SHEETS_DAILY_TRACKER_SHEET_NAME` | yes | Daily Entry tab name (e.g. `daily`) — shared across every user's own spreadsheet (each user's spreadsheet has its own tab of this name). **No default** — every environment must name its own tab explicitly (see §6). |
| `GOOGLE_SHEETS_DATE_ENTRIES_SHEET_NAME` | yes | Date Entry tab name (e.g. `dates`). Same rules as above. |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | yes | The service account's `...@...iam.gserviceaccount.com` address — this exact address must be given "Editor" access to **every** spreadsheet listed in `GOOGLE_SHEETS_SPREADSHEET_MAP` (Share → paste the email, once per spreadsheet). |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | yes | The service account JSON key's `private_key` field. Literal `\n` sequences are un-escaped to real newlines automatically. |

If `GOOGLE_SHEETS_ENABLED=true` and any of the other five is missing/empty,
`loadGoogleSheetsConfig()` throws immediately, naming the exact missing var
— never a generic "not configured", and never the secret value itself.
`GOOGLE_SHEETS_SPREADSHEET_MAP` is additionally parsed/validated by
`parseSpreadsheetMap()` — malformed JSON, a non-object, or an empty-string
value for any username all throw a specific error naming the problem.

Google Cloud setup performed for real during this Story (2026-07-21,
project `chad-503119`, service account `chad-admin@chad-503119.iam.gserviceaccount.com`,
owner account `kamilgame042@gmail.com`):
1. Google Cloud project created, **Google Sheets API** enabled.
2. Service account created, JSON key downloaded (credentials given directly
   to the AI in chat and stored only in the gitignored `.env.local` —
   confirmed against `.gitignore`'s `.env.*` pattern before writing
   anything; never written to any committed file).
3. **Each** user's own target spreadsheet shared with that service
   account's email (Editor access) — the service account has no Drive
   access and cannot discover or create spreadsheets on its own, only
   read/write ones already shared with it (scope:
   `https://www.googleapis.com/auth/spreadsheets` only). Currently
   configured (local, `.env.local`, gitignored): `pawel_f` and `kamil_s`,
   each with their own real spreadsheet (see §0b/§10).

## 5. Record identity

`recordKey = "${repoGuid}:${loca}"` for both record types — `loca` is each
item's own stable address (assigned once at creation, the same value
`updateDailyEntry`/`deleteDailyEntry`/`updateDateEntry` already require
callers to address by — never re-derived from `DATE`/`DATA`, which the
Daily Tracker doc confirms is not guaranteed unique). `loca` inherently
differs between the two record types (Daily Entry items live under
`views/daily`, Date Entry items under `views/dates` — different physical
path prefixes), so `recordKey` never collides across record types even
though both share one outbox/worker. This is the sheet's `CHAD_RECORD_KEY`
column and is how the worker finds "which row is this" for an update or
delete-mark, regardless of column order or manual edits elsewhere in the
row.

## 5b. Per-user spreadsheet routing (§0b)

Every CHAD user has their own personal spreadsheet — there is no shared
"CHAD" spreadsheet. Resolution happens in two steps, both inside `dba`,
never influenced by anything a request body/query could control:

1. **At enqueue time** (`sync.ts`'s `queueSheetSyncIfEnabled`): the caller
   (`leads.ts`) passes `username`, always sourced from
   `getCurrentUsername()` (`repo-context.ts`) — the same request-scoped
   context (`AsyncLocalStorage`, populated by the API route from the
   session cookie via `getCurrentUserFromCookies()`) that `repoGuid` already
   came from. `resolveSpreadsheetIdForUser(config, username)` looks it up in
   `GOOGLE_SHEETS_SPREADSHEET_MAP` and throws (reported via the existing
   non-throwing `onEnqueueError` callback, same as any other config
   problem) if that username isn't mapped — **never** falls back to another
   user's spreadsheet or a default. The resolved `spreadsheetId` is baked
   into `SheetSyncPayload` as a frozen field, alongside `username` (kept for
   observability/audit — log lines and the `google_sheets_sync_outbox`
   documents themselves show which user each job belongs to).
2. **At drain time** (`worker.ts`): the target sheet is
   `{ spreadsheetId: job.payload.spreadsheetId, sheetName:
   deps.sheetNames[job.payload.recordType] }` — the spreadsheet id always
   comes from the job's own frozen snapshot, never from a static
   `GoogleSheetsWorkerDeps` field re-resolved at drain time. This means a
   later change to `GOOGLE_SHEETS_SPREADSHEET_MAP` (e.g. a user's spreadsheet
   moves) only affects jobs enqueued *after* the change — an already-queued
   job still converges to the spreadsheet it was written against, consistent
   with every other field on the payload being an immutable snapshot (§2).

Isolation is structural, not just conventional: `FakeGoogleSheetsClient`
(and the real one) key their in-memory/remote state by
`${spreadsheetId}::${sheetName}`, so two jobs with different
`spreadsheetId`s can never collide even if every other field (recordType,
recordKey shape, tab name) were identical. Verified for real against both
production spreadsheets — see §10.

## 6. Sheet layout — faithful mirror of the Dashboard's own tables

Column order and **labels** (including the em-dash in `"PULLS — AUTO"` etc.)
are copied **verbatim** from the Dashboard's own source of truth —
`DAILY_COLUMNS`/`DATE_COLUMNS` in
`packages/dashboard/app/(dashboard)/dashboard/views/page.tsx` — not
re-derived from `human-docs/dashboard/forms/features/daily-tracker-dates.md`
§3, which is stale on one point (it lists `OUTINGS` right after `ACTION
TIME`; the live UI puts it last, under the `RESULTS` group — the live code
wins, see `mapper.ts`'s doc comment).

First-time (empty tab) header init, **domain columns first, technical
columns last** (revised from the original plan, which put technical columns
first — moved so the sheet reads as a faithful copy of the Dashboard table
when scanning left to right):

**"daily" tab** (`mapper.ts`'s `DAILY_ENTRY_DOMAIN_COLUMNS`, `DAILY_TRACKER_SHEET_HEADERS`):
`DATE, STATE, TRAINING TIME, VERBAL EXERCISES, INFIELD, THEORY, FIELD
REVIEW, ACTION TIME, APPROACHES, LONG INTERACTIONS, NUMBERS, PULLS — AUTO,
FIRST MESSAGES, RESPONSES, DATES SET UP, DATES, CLOSES — AUTO, QUALITY D/P
— AUTO, QUALITY C — AUTO, OUTINGS` then `CHAD_RECORD_KEY, CHAD_REPO_GUID,
CHAD_ITEM_NAME, CHAD_LOCA, CHAD_CREATED_AT, CHAD_UPDATED_AT,
CHAD_SCHEMA_VERSION, CHAD_SYNC_STATUS`.

**"dates" tab** (`mapper.ts`'s `DATE_ENTRY_DOMAIN_COLUMNS`, `DATE_ENTRIES_SHEET_HEADERS`):
`DATA, ŹRÓDŁO, NAZWA, LINK, PULL, CLOSE, JAKOŚĆ` then the same 8 technical
columns.

**AUTO columns are included** (revised — the original plan excluded them):
`leads.ts`'s `computeDailyAutoFieldsForSheetSync(dateStr)` fetches current
Date Entry data and calls the same `computeDailyAutoFieldsByDate` the
Dashboard's own GET route uses, fresh at every Daily Entry write — these
values are **never persisted** to CHAD's own Mongo/Content-Provider
storage, only computed on demand for the sheet snapshot, exactly mirroring
what a user looking at the live Tracker page would see for that date at
that moment.

**Sensitivity note:** every domain column is personal dating-activity data
(training/approach/numbers/dates metrics) the user already tracks in this
feature — no new category of sensitive data is introduced by this sync, but
it is a full mirror of that data into a second system (Google's), which the
user should keep in mind when deciding who else has access to the target
spreadsheet.

Every read/write after the initial header seed resolves columns **by
name**, never by position:
- A required column missing from an existing header row is appended at the
  end, never inserted/reordered.
- Manual/unknown columns a human added are never read or written by CHAD.
- Row lookup for update/delete is always by the `CHAD_RECORD_KEY` column's
  current value, never by row number/index.
- `CHAD_CREATED_AT`, `CHAD_ITEM_NAME`, `CHAD_REPO_GUID`, `CHAD_LOCA`
  (`mapper.ts`'s `IMMUTABLE_ON_UPDATE_COLUMNS`) are only ever written when a
  row is first appended — an update never touches them again, even though
  the mapper always computes them (the worker strips them back out before
  calling `updateRow` on an existing row).
- Delete marks `CHAD_SYNC_STATUS = "DELETED"` and bumps
  `CHAD_UPDATED_AT`/`CHAD_SCHEMA_VERSION` in place — the row is never
  physically removed. Only Daily Entry has a real delete today
  (`deleteDailyEntry`, Mongo-only); Date Entry has no delete function to
  hook. If the record's row somehow doesn't exist yet, the delete job is a
  no-op (nothing to mark), not an error.
- Multi-environment isolation: neither sheet-name var has a default —
  local/TEST/PROD must each name their own tabs (or use entirely separate
  spreadsheets) in their own env file.
- Schema version drift: `CHAD_SCHEMA_VERSION` (`mapper.ts`'s
  `SHEET_SCHEMA_VERSION`, currently `"1"`) is written per-row. A future
  breaking change to the column set would show up as an old value on
  existing rows — no automatic migration is implemented (deliberately kept
  simple; see `06_others_from_report.md`).

## 7. Running the worker (§0b — now actually wired in)

Runs inside the **Dashboard Next.js process itself** — no separate worker
container/process. `packages/dashboard/instrumentation.ts` exports
`register()`, a Next.js lifecycle hook that runs exactly once when the
server process starts (both `next dev` and the standalone `next start` this
repo's Docker image runs), guarded to the Node.js runtime
(`NEXT_RUNTIME === "nodejs"`):

```ts
// packages/dashboard/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startGoogleSheetsSyncWorkerIfEnabled } = await import("dba");
    startGoogleSheetsSyncWorkerIfEnabled();
  }
}
```

`dba`'s `google-sheets/bootstrap.ts` (`startGoogleSheetsSyncWorkerIfEnabled`)
loads config, no-ops (logs why, never throws) if disabled/misconfigured —
a Sheets problem can never crash Dashboard startup — otherwise builds a real
`GoogleSheetsApiClient` and calls `runGoogleSheetsSyncWorker` with a static
`sheetNames` map (`{"daily-entry": dailyTrackerSheetName, "date-entry":
dateEntriesSheetName}` — tab names only; the spreadsheet id is per-job, see
§5b) on a 5-second interval (`worker.ts`'s existing default). Idempotent
against being called twice in the same process. Every tick's `console.log`/
`console.error` lines are visible via `docker logs chad-dashboard-*` (or the
`02_local_mac_tmux` process's own stdout) — this Story's own real-sheet
verification (§10) confirmed the exact log line shape:

```
[google-sheets] sync worker starting (intervalMs=5000, users configured=2)
[google-sheets-worker] synced recordKey=<repoGuid>:<loca> username=<username> recordType=daily-entry kind=upsert sheet="daily" attempt=1
```

**Docker/env wiring required for this to actually reach the container**:
`docker-compose.local.yml`'s `dashboard` service didn't forward any
`GOOGLE_SHEETS_*`/`GOOGLE_SERVICE_ACCOUNT_*` var into the container at all
before this revision (the original Story's real-sheet verification used a
one-off scratchpad script talking to Mongo/Sheets directly, never the
running container) — now explicitly listed in that file's `environment:`
block, sourced from `.env.local` via `--env-file` the same way
`MONGODB_URI`/`DBA_*` already were. **TEST/PROD compose files were
deliberately left untouched**, same precedent as the sheet-name vars
themselves (§4) — enabling this there needs its own per-environment
`GOOGLE_SHEETS_SPREADSHEET_MAP`/tab names decided first, out of scope here
(no deployment happened, per this session's own instructions).

`processGoogleSheetsJobOnce`/`drainGoogleSheetsSyncOnce` remain directly
importable/invocable on their own (e.g. for a future cron/manual drain), and
`runGoogleSheetsSyncWorker(deps, intervalMs)` still just returns a stop
function — `bootstrap.ts` is the one new piece that decides *when* and
*where* to call them for the real deployed app.

## 8. Errors & observability

Every enqueue failure and every worker-side sync failure is logged with:
operation kind (`upsert`/`delete`), `recordKey`, `recordType`, target sheet
name, attempt number, and a sanitized error message (`Error.message`
only — never a raw object, stack with request internals, or any secret
value). Distinguished failure categories surfaced via the underlying error
message text: missing config (`loadGoogleSheetsConfig` throw, names the
exact var), no access to the spreadsheet / wrong id / wrong tab name / rate
limit / network/timeout (all surfaced as the Sheets API's own HTTP-status +
body text via `GoogleSheetsApiClient`'s error wrapping), and
header/column-not-found (`findRowByKey`/`updateRow`'s own explicit errors
when a required header is missing from a sheet at write time).

No Dev Panel/Errors UI integration was added — out of scope; Dashboard's
own request-handling code (routes, pages) still has no Sheets-specific code
path at all (see §1) — `instrumentation.ts` (§7) is a one-line, one-time
startup hook, not a request code path, and is Dashboard's only file that
even references this integration.

## 9. Explicitly out of scope (this Story)

Revised from the original plan (`02_plan.md` §7) after user feedback — AUTO
columns, Date Entry sync, per-user spreadsheets, live worker wiring
(Dashboard process), and visual layout/formatting are now **in** scope (§6,
§0b/§5b, §7, §0c/§11). Still out of scope: TEST/PROD deployment or config
(§4, §7), bidirectional sync (Sheets → CHAD), a `deleteDateEntry` function
(pre-existing product gap, independent of this Story — see §10's note on
the two residual test rows), any schema-version (`CHAD_SCHEMA_VERSION`,
data shape) migration tooling, and every individual "no faithful Sheets
equivalent" item listed in §11's own limitations table (e.g. real
checkboxes, fuzzy cross-field search, ellipsis-truncation-with-hover).

## 10. Real end-to-end verification (§0b, 2026-07-21 follow-up)

Performed against the **real, running Dashboard container**
(`chad-dashboard-local-mac-docker`, rebuilt/restarted via the official
`bash-scripts/dashboard/03_local_mac_docker/02_build.sh`/`03_re-start.sh`)
and the two real users' own real spreadsheets — not a mock, not a one-off
script talking to Mongo/Sheets directly (unlike the original Story 75
verification). Requests were made as each real user by constructing the
exact same session cookie `app/api/auth/login/route.ts` issues
(`${repoGuid}:${timestamp}`) using each user's real `repoGuid` (looked up
directly from the local Mongo `cp_items` collection's root-folder documents,
named `chad_<username>` — same convention `repo-context.ts`'s own header
comment documents) — this exercises the exact same
`getCurrentUserFromCookies` → `resolveCurrentUser` (validated against the
real `chad_admin` user list) → `runWithRepoContext` path a real browser
session would.

**Source-data fidelity check (before any new writes):** `GET
/api/forms/daily-entry` for both users, compared field-by-field against the
same records read directly from Mongo `cp_items` — exact match, confirming
the Dashboard's own read path (which the sheet mapper's input already flows
through) has no hidden transformation.

**Per-user create/update/delete, both record types, both users** (marker
values `story75_e2e_<timestamp>` for unambiguous identification):

| User | Daily create | Daily update | Daily delete | Dates create | Dates update |
|---|---|---|---|---|---|
| pawel_f | ✅ row appended, `daily` tab, pawel_f's own spreadsheet | ✅ same row (`APPROACHES` 3→7, `NUMBERS` 1→2), no duplicate | ✅ `CHAD_SYNC_STATUS=DELETED`, `APPROACHES`/`NUMBERS` preserved not blanked, Mongo doc actually gone | ✅ row appended, `dates` tab | ✅ same row (`NAZWA`/`CLOSE`/`JAKOŚĆ` all changed), no duplicate |
| kamil_s | ✅ (same checks) | ✅ (same checks) | ✅ (same checks) | ✅ (same checks) | ✅ (same checks) |

**Isolation, verified by reading both real spreadsheets directly via the
Sheets API afterward:** pawel_f's spreadsheet
(`14nFkoS1jSWoTaeeD0phoE655anLwkNiVqXOzNiqDLrA`) contains only pawel_f's
test row in each tab; kamil_s's spreadsheet
(`1dU0UjaEvbYExRV8SUpG-BJ0DjH3ZZndZwpb5XjGevMU`) contains only kamil_s's —
zero cross-contamination in either direction, and `CHAD_RECORD_KEY`/
`CHAD_REPO_GUID` on every row correctly embed that user's own `repoGuid`.
Confirmed the worker actually ran unattended inside the live container
(`docker logs`), draining all 9 real jobs (5 for pawel_f, 4 for kamil_s)
within one 5-second tick each, 0 failures.

**AUTO columns were blank on the test row** — expected, not a bug: the test
script created the Daily Entry before the matching Date Entry existed for
that date, and `computeDailyAutoFieldsForSheetSync` computes AUTO values
from Date Entry data present *at daily-write time* (§6) — this is the
documented "fresh at write time" behavior working correctly, not a mapping
gap. AUTO-column correctness itself (as opposed to the per-user
routing/wiring this follow-up pass changed) was already verified in the
original Story 75 pass.

**One real residual side effect, left as-is deliberately, not auto-cleaned:**
Date Entry has no delete function (§6/§9, pre-existing product gap, not
introduced by this Story) — the two test Date Entries (`DATA: 2099-01-01`,
marker in `ŹRÓDŁO`) remain as real rows in both pawel_f's and kamil_s's
actual Mongo `cp_items` and their real "dates" sheet tabs. Deliberately
**not** removed by reaching into Mongo directly (would bypass the app's own
data path/history tracking for a real user's data) — flagged to the user
instead so they can decide (manual removal, or wait for a future
`deleteDateEntry` feature). Both are trivially identifiable by the
far-future date and marker text; both daily-entry test rows were fully and
really deleted (`deleteDailyEntry` does a real Mongo delete, confirmed
gone).

## 11. Dashboard-element -> Sheets-equivalent audit (§0c)

**Source files actually read to determine the Dashboard's real rendering**
(not re-derived from `human-docs/`, which §6 already found stale on one
point) — full file contents read, not excerpts:

- `packages/dashboard/app/(dashboard)/dashboard/views/page.tsx` (1103
  lines, read in full) — the ONLY file that renders `views/daily`/
  `views/dates`. Both tables are inline JSX in one client component; there
  is no separate table/grid library, no `<select>`/`<input type=checkbox>`
  anywhere in it (confirmed by reading the whole file, not grep — every
  editable cell is a plain text `<input>`), no CSS `sticky` positioning
  anywhere (confirmed by `grep sticky` — zero matches), and no numeric
  right-alignment anywhere (`text-left`/default alignment only, even for
  APPROACHES/NUMBERS/STATE/JAKOŚĆ).
- `packages/dashboard/app/globals.css` — the shadcn theme's `:root` OKLCH
  tokens (`--muted`, `--border`, ...), converted to sRGB hex via the
  standard OKLab matrices (not guessed) — see the color table below.
- `packages/dashboard/components/shared/layout-tokens.ts` — confirmed the
  one relevant token (`TABLE_ACTION_COLUMN_WIDTH_CLASS = "w-[72px]"`, the
  Save-icon column) has no Sheets equivalent at all (§ table below).

### 11a. Column groups, colors, order — verbatim source

`DAILY_COLUMNS`/`DATE_COLUMNS`, `GROUP_HEADER_CLASS`, `CELL_CLASS` at
`views/page.tsx:82-129`. Colors resolved:

| Token | Dashboard class | Computed color | Sheets use |
|---|---|---|---|
| `--muted` (OKLCH 0.97/0/0) | `bg-muted` | `#F5F5F5` | "none"-group header background |
| `--border` (OKLCH 0.922/0/0) | `border` | `#E5E5E5` | every cell's thin grid border |
| Tailwind `green-100`/`green-50` | `bg-green-100` / `bg-green-50/60` | `#DCFCE7` / `#F6FEF8`* | TRAINING header / body tint |
| Tailwind `amber-100`/`amber-50` | `bg-amber-100` / `bg-amber-50/60` | `#FEF3C7` / `#FFFDF3`* | ACTION header / body tint |
| Tailwind `blue-100`/`blue-50` | `bg-blue-100` / `bg-blue-50/60` | `#DBEAFE` / `#F5FAFF`* | TEXTING header / body tint |
| Tailwind `rose-100`/`rose-50` | `bg-rose-100` / `bg-rose-50/60` | `#FFE4E6` / `#FFF7F7`* | RESULTS header / body tint |

\* Body tints are the Dashboard's own `*-50` color at ~60% opacity **over
white**, flattened to an opaque RGB (Sheets fills are opaque, not
alpha-blended) — e.g. TRAINING body = `blend(#F0FDF4, white, 0.6)` =
`#F6FEF8`. Intentionally subtle in both places — not a bug, matches the
Dashboard's own barely-there tint.

### 11b. Full comparison — "daily" tab

| Dashboard element | Source | Sheets equivalent | Status | Fix applied |
|---|---|---|---|---|
| Column order (DATE..OUTINGS) | `DAILY_COLUMNS`, `page.tsx:92-113` | Same order, `mapper.ts`'s `DAILY_ENTRY_DOMAIN_COLUMNS` | ✅ mapped | verbatim copy (existing, §6) |
| Group row (TRAINING/ACTION/TEXTING/RESULTS, merged) | `page.tsx:896-935` (`isTracker &&` group `<tr>`) | Merged row 1, same 4 labels, same order | ✅ mapped | `layout.ts` `applyHeaderFormatting` + `insertDimension` migration |
| Group header colors | `GROUP_HEADER_CLASS` | `GROUP_HEADER_BG` (11a table) | ✅ mapped | exact hex, derived not guessed |
| Group body cell tint | `CELL_CLASS` | `GROUP_BODY_BG` (11a table) | ✅ mapped, subtlety preserved | `applyGroupCellBackgrounds` |
| Group separators (visual read of a boundary) | implicit (color-block adjacency only, no distinct border) | none — tried an explicit stronger border (`LAYOUT_VERSION` 1), user explicitly rejected it as an unwanted extra ("dziwna kreska oddzielająca"), removed (`LAYOUT_VERSION` 3, §0d) | ✅ correctly matches (plain grid, same as Dashboard's own color-block-only boundary) | `resetGroupSeparators` |
| Column header text | `col.label`, written by `ensureHeaders` (unchanged, pre-existing) | same text, same order | ✅ mapped | pre-existing, untouched by this follow-up |
| Header bold/left-align/no-wrap | `font-semibold ... text-left ... whitespace-nowrap` | `textFormat.bold`, `horizontalAlignment: LEFT`, `wrapStrategy: CLIP` | ✅ mapped | `applyHeaderFormatting` |
| AUTO columns (4x) | `PULLS AUTO` etc., computed server-side, `leads.ts`'s `computeDailyAutoFieldsForSheetSync` | same 4 columns, same em-dash labels | ✅ mapped (§6, pre-existing) | — |
| AUTO column distinct styling | none — Dashboard styles AUTO cells identically to their group, no special color/border | none added — would be inventing a Dashboard element that doesn't exist | ✅ correctly NOT mapped | intentional — see §11d |
| DATE column width (min 100px) | `min-w-[100px]` override, `page.tsx:1061,1073` | 100px column width | ✅ mapped | `estimateColumnWidthPx`'s explicit override |
| Other column widths | browser auto-size to label length, capped `max-w-[180px]` | estimated from label length, same [64,180] bounds | ⚠️ closest equivalent — Sheets px ≠ CSS px 1:1, font differs | `estimateColumnWidthPx` |
| Row height | implicit (`p-1.5`/`p-1` padding + `text-xs` line-height, browser-computed) | explicit 24-26px | ⚠️ closest equivalent | `applyRowHeights` |
| Numeric alignment | **left**, same as text — verified, Dashboard never right-aligns anything | `horizontalAlignment: LEFT` forced on every body cell | ✅ mapped (overrides Sheets' own default right-align) | `applyNumberFormats` |
| Overflow handling | `truncate` (ellipsis) + `title=` tooltip on hover | `wrapStrategy: CLIP` (hard clip, no ellipsis) | ⚠️ closest equivalent — see §11d | `applyNumberFormats` |
| Empty value presentation | empty string, no placeholder | empty cell, no placeholder | ✅ identical (no formatting needed) | — |
| Sticky/frozen header while scrolling | **none** — no CSS `sticky` anywhere (confirmed) | frozen header rows (2) + column A | ⚠️ Sheets-native addition, not a mirror — see §11d | `applyFrozenRowsAndColumns` |
| Row order | client-side sort, default **newest-first** (`sortDir: "desc"` on mount), re-sortable by clicking DATE | physical row order = append order (oldest-first in practice) | ⚠️ real, unresolved gap — see §11d | none — a Basic Filter was tried as a manual-resort aid but explicitly rejected by the user (§0d) and removed; no automatic per-write resort either (see §11d for why) |
| Text-filter box (fuzzy, all fields) | `Input`, `page.tsx:822-830`, matches any field | none — Sheets' own Ctrl/Cmd+F find is always available natively, not something this Story needs to add | ✅ no gap to fix (native Sheets feature, always present) | — |
| Click-DATE-to-sort | `toggleSort`, `page.tsx:294-301` | none added — Sheets' own "Data > Sort sheet" is always available natively via its menu | ✅ no gap to fix (native Sheets feature, always present) | — |
| Checkboxes / dropdowns | **none** — every cell is a plain text `<input>`, confirmed by reading the whole file | non-strict `ONE_OF_LIST` data validation on 4 TAK/NIE columns | ⚠️ Sheets-native enhancement, NOT a Dashboard mirror — see §11d | `applyDataValidation`, real-data-derived, `strict:false` |
| Row Save/Edit/Open-Raw/action column, "n" item-name toggle | `page.tsx:773-820,896-1043` | **no equivalent at all** | ❌ not mappable | interactive Dashboard-only UI, not a static layout concept |
| `TABLE_ACTION_COLUMN_WIDTH_CLASS` (72px action col) | `layout-tokens.ts:45` | n/a (no action column concept in Sheets) | ❌ not mappable | — |
| CHAD_* technical columns | n/a — not a Dashboard concept at all | present, moved last, **hidden** | ✅ (Sheets-only, correctly hidden) | `hideTechnicalColumns` |

### 11c. Full comparison — "dates" tab

Same method as 11b; only entries that differ from daily are listed —
everything else (empty-value presentation, filter/sort UX gap, numeric
left-alignment, checkboxes/dropdowns absence, no sticky header in the
Dashboard, action column) is identical in kind to 11b's rows.

| Dashboard element | Source | Sheets equivalent | Status | Fix applied |
|---|---|---|---|---|
| Column order (DATA..JAKOŚĆ) | `DATE_COLUMNS`, `page.tsx:82-90` | `DATE_ENTRY_DOMAIN_COLUMNS` | ✅ mapped (§6, pre-existing) | — |
| Group row | **none** — `isTracker &&` guard means Dates never renders one | none added | ✅ correctly NOT mapped | `layout.ts` never calls the group-row logic for `headerRowCount === 1` |
| Header row count | 1 | 1 (`DATE_ENTRIES_HEADER_ROW_COUNT`) | ✅ mapped | no `insertDimension` migration needed (never had 2 rows) |
| DATA column width | `min-w-[100px]` | 100px | ✅ mapped | same override as DATE |
| NAZWA/ŹRÓDŁO/LINK width (free text, can be long — real data has URLs) | auto, `max-w-[180px]` cap | estimated, capped at 180px | ⚠️ closest equivalent | `estimateColumnWidthPx` |
| PULL/CLOSE "status" columns | plain text `<input>`, real values seen: `PULL` = `TRUE`/`FALSE`/`TAK`/`NIE` (mixed conventions), `CLOSE` = `TAK`/`NIE`/`BLISKO` | non-strict suggestion list per column, **includes the real `BLISKO` outlier**, not an idealized binary | ⚠️ Sheets-native enhancement | `applyDataValidation`, values from a real Mongo query across both users, not guessed |
| Frozen header/column | none in Dashboard | frozen row 1 + column A | ⚠️ Sheets-native addition | `applyFrozenRowsAndColumns` |

### 11d. Elements with no faithful 1:1 equivalent — explicit, per the task's own requirement never to claim "identical"

| Dashboard element | Google Sheets limitation | Closest equivalent implemented |
|---|---|---|
| Fuzzy text search across every field | Sheets has no single fuzzy multi-field search box — only its native Ctrl/Cmd+F find (always available, not something to add) or per-column filtering | Sheets' own native Ctrl/Cmd+F (a per-column Basic Filter was tried and explicitly rejected by the user, §0d — removed) |
| Ellipsis truncation (`text-overflow: ellipsis`) + native hover tooltip showing the full value | Sheets has no ellipsis truncation formatting option; `wrapStrategy: CLIP` hard-clips with no visual "more text" indicator, and the native hover preview shows the cell's raw content anyway (a form of built-in tooltip, just not opt-in styled the same way) | `wrapStrategy: CLIP` |
| Sticky header while scrolling | **Not actually a Dashboard feature to mirror** — the Dashboard itself never freezes its header (no CSS `sticky`, confirmed). Sheets' frozen panes is added anyway as a standard, expected spreadsheet feature, not a fidelity claim | `applyFrozenRowsAndColumns` |
| Default newest-first row order, reversible per click | Sheets has no persistent "always show newest on top" view mode short of physically re-sorting rows on every write — rejected as it conflicts with "never reset the whole tab on every save" and risks losing manual edits mid-sort | none — Sheets' own native "Data > Sort sheet" menu is always available manually; no automatic per-write resort |
| Row Save/Edit/"Open Raw"/action column | Purely interactive UI state (React state, in-browser edit mode) — there is no static "layout" concept for this at all | none — correctly not attempted |
| Real `<input type="checkbox">`/`<select>` | **Does not exist in the Dashboard either** (confirmed, see 11a's source-reading note) — there is nothing to mirror | non-strict data-validation suggestion lists added as a Sheets-native quality-of-life enhancement, clearly documented as NOT a Dashboard mirror |
| Percent/currency/localized number formatting | **Does not exist in the Dashboard either** — every value is a raw string, no `Number.toLocaleString`/`Intl.NumberFormat` anywhere in `views/page.tsx` | none added (would be inventing formatting the source of truth doesn't have) |
| Exact `font-family`/`text-xs` (12px) pixel-for-pixel typography | Sheets renders in its own UI chrome (fixed Arial-family stack, point sizes not CSS px) — cannot force an exact web font/px size to match a browser's rendering | `fontSize: 9` (empirically close to 12px CSS at typical zoom, documented as an approximation, not a claim of exactness) |

**Why row order was NOT made "always newest-first" via automatic
re-sorting:** considered and rejected. `SetBasicFilter`'s own `sortSpecs`
(or a raw `SortRangeRequest`) would need to run on every single write to
stay current, directly violating "nie resetuj całej zakładki przy każdym
zapisie" — and repeatedly re-sorting a growing range on every job is
exactly the kind of expensive, risky, unbounded-growth operation this
Story's own constraints (§ layout versioning) were designed to avoid. A
one-time sort at layout-init time would also go stale the moment the next
row is appended, so it wouldn't actually solve the stated problem either.
Documented as an accepted, real limitation rather than papered over.

## 12. Real visual verification (§0c)

Required per this session's own instructions: run the local Dashboard,
screenshot `views/daily`/`views/dates` for real, screenshot the
corresponding Sheets tabs, compare side-by-side, fix, re-screenshot.
Performed exactly that, in two passes:

**Pass 1 (before real Google login was available):** navigating Playwright
directly to either spreadsheet URL redirected to `accounts.google.com`
sign-in — no Google session existed in the browser yet. As a stand-in,
each spreadsheet's complete current formatting state was fetched directly
from the Sheets API (`spreadsheets.get` with explicit `fields=` for
`userEnteredFormat`/`columnMetadata`/`rowMetadata`/`merges`/`basicFilter`)
and rendered into a local HTML reconstruction, screenshotted the same way.
**This comparison is what caught the real header-clobbering incident
(§0c)** — the reconstruction showed group labels sitting where the real
column headers should have been, which is what triggered the
investigation, root-cause fix, and remediation described there.

**Pass 2 (real login provided mid-session):** the user logged into the
real Google account interactively in the same Playwright browser (a
password was shared in chat for this purpose — never written to any file,
log, or memory by this session, and not needed again since the browser
session itself now carries the login). With that, **literal screenshots of
the real Google Sheets UI** were taken for all four tabs and compared
directly against the live Dashboard:

- `real-sheet-pawel-daily.png` / `real-sheet-pawel-dates.png` (spreadsheet
  `14nFkoS1jSWoTaeeD0phoE655anLwkNiVqXOzNiqDLrA`, titled `chad_pawel_f` in
  the Sheets UI itself)
- `real-sheet-kamil-daily.png` / `real-sheet-kamil-dates.png` (spreadsheet
  `1dU0UjaEvbYExRV8SUpG-BJ0DjH3ZZndZwpb5XjGevMU`, titled `chad_kamil_s`)
- Compared against `dashboard-daily-tracker-full.png` (pawel_f, all 5
  groups), `dashboard-kamil-tracker.png` (kamil_s), `dashboard-dates.png`
  (pawel_f dates) — all taken via a real authenticated session cookie
  (`page.context().addCookies(...)`, not page-JS `document.cookie`, which
  silently fails to override an `HttpOnly` cookie name) built from each
  user's real `repoGuid` looked up in Mongo, same format
  `app/api/auth/login/route.ts` issues.

**Confirmed by direct visual comparison, both users, both tabs, real
Sheets UI vs. live Dashboard:**

- Column order and group boundaries (TRAINING/ACTION/TEXTING/RESULTS)
  match exactly, including the em-dash "— AUTO" labels.
- Group header colors match (green/amber/blue/rose header row, matching
  relative saturation).
- The "dates" tab correctly shows no group row/coloring on either side.
- Directly visible in the real Sheets UI (not just asserted from the API
  response): data-validation dropdown carets on VERBAL EXERCISES/INFIELD/
  THEORY/FIELD REVIEW/PULL/CLOSE (`applyDataValidation`), the frozen-pane
  divider line after column A and after the header row(s)
  (`applyFrozenRowsAndColumns`), and the CHAD_* columns genuinely absent
  from view between the last domain column and column P
  (`hideTechnicalColumns` — 8 columns correctly hidden, confirmed by the
  visible column-letter jump G→P on the dates tab). These screenshots were
  taken under `LAYOUT_VERSION` 1, which also had per-column filter
  dropdown arrows visible on every header cell — removed the next day per
  direct user feedback (§0d, `LAYOUT_VERSION` 2/3); the screenshots
  predate that removal and should not be read as showing current behavior
  for the filter/group-separator specifically.
- `PULLS — AUTO`'s header text visibly clips at the column's right edge
  with no ellipsis, exactly the documented `wrapStrategy: CLIP` behavior
  (§11d) — a real, visible confirmation of that specific limitation, not
  just a claim.

## 13. Layout tests (`layout.test.ts`)

No real Mongo/Google API needed at all (unlike outbox/worker/sync tests) —
the request-builder functions are pure, and the two orchestrators only
touch `FakeGoogleSheetsClient`'s in-memory state. 30 cases:

- `groupRuns`/`estimateColumnWidthPx` — pure column-grouping/width math.
- `applyHeaderFormatting` — group-row merge/label shape (daily), absence of
  any group-row request at all (dates), correct background colors, correct
  1-column-wide value-writing regression guard (the §0c bug).
- `applyColumnWidths`/`applyRowHeights`/`applyNumberFormats`/
  `applyGroupCellBackgrounds`/`applyFrozenRowsAndColumns`/
  `resetGroupSeparators`/`hideTechnicalColumns`/`clearBasicFilter` — one
  or two shape assertions each (counts, ranges, bounds, left-only borders,
  the filter/separator explicitly clearing rather than setting, §0d).
- `applyDataValidation` — correct columns, `strict:false` always, the real
  `BLISKO` outlier included, defensive skip of an unknown key.
- `ensureDailyTrackerLayout`/`ensureDatesLayout` — first-application
  applies and stamps the version; idempotent re-run sends zero requests;
  version-mismatch triggers a real re-apply via `updateDeveloperMetadata`
  (not `createDeveloperMetadata`); per-spreadsheet isolation (laying out
  user A never touches user B's metadata).
- Two dedicated regression tests for the §0c incident: every
  value-writing request is exactly 1 column wide, and a version-bump
  re-apply never re-inserts a row (only the very first-ever application
  does).

**42/42 → 55/55 → 85/85**: running total of this Story's own automated
suite across all three same-day follow-ups (Task 2 baseline 42, Task 4
rework 48, §0b follow-up 55, §0c follow-up +30 = 85), 0 failures at every
stage, Google's real API never called by any test.

## 14. Visual checklist (per-item status, both users)

| Item | daily | dates |
|---|---|---|
| Column order | ✅ | ✅ |
| Groups / multi-level headers | ✅ (2-row, merged) | n/a (Dashboard has none here — correctly absent) |
| Column widths | ⚠️ closest equivalent (§11d) | ⚠️ closest equivalent |
| Row heights | ⚠️ closest equivalent | ⚠️ closest equivalent |
| Background/text colors | ✅ | ✅ (plain, matches) |
| Bold/borders | ✅ | ✅ |
| Alignment / wrap | ✅ (LEFT, CLIP) | ✅ |
| Date/number/percent formats | ✅ (none exist to mirror — correctly none added) | ✅ |
| Checkboxes/dropdowns | ⚠️ Sheets-only enhancement, not a Dashboard mirror (§11d) | ⚠️ same |
| AUTO columns | ✅ present, unstyled (matches Dashboard) | n/a |
| Group separators | ✅ correctly absent (removed per user feedback, §0d) | n/a |
| Frozen rows/columns | ⚠️ Sheets-only addition (§11d) | ⚠️ same |
| Filters | ✅ correctly absent (removed per user feedback, §0d — Sheets' own native Ctrl/Cmd+F and "Data > Sort" remain available, just not a CHAD-added UI element) | ⚠️ same |
| Hidden CHAD_* columns | ✅ | ✅ |
| Row order | ⚠️ real, documented limitation (§11d) | ⚠️ same |
| Empty-value presentation | ✅ identical | ✅ identical |
| Real historical data backfilled (not just new writes) | ✅ (§0d — `backfillGoogleSheetsSyncForCurrentUser`, verified against real Mongo counts) | ✅ |
| Verified for `pawel_f` | ✅ (§10, §12) | ✅ |
| Verified for `kamil_s` | ✅ (§10, §12) | ✅ |
