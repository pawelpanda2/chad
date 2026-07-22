# Story 75 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | Daily Tracker (Forms → Daily Entry, Views → Tracker: create/update/delete) still works exactly as before — no regression from adding the Google Sheets follower |
| 2 | DONE      |             | Google Sheets sync integration is fully implemented (outbox, worker, service-account client, column mapping) and off by default, toggled by one env var |
| 3 | DONE      |             | End-to-end verification against a REAL Google Sheet (create/update/delete actually visible in an actual spreadsheet) |
| 4 | DONE      |             | The "daily" tab is a faithful, same-order/same-label copy of the Dashboard's Tracker table (incl. AUTO columns), and the "dates" tab mirrors the Dates table the same way |
| 5 | DONE      |             | Follow-up (same day): one spreadsheet PER USER (not a single shared one), the worker actually running inside the Dashboard process (no separate container), and a real end-to-end test as both pawel_f and kamil_s confirming isolation |
| 6 | DONE      |             | Follow-up (same day): the "daily"/"dates" tabs are visually laid out to actually look like the Dashboard's own tables (groups, colors, widths, frozen panes, hidden CHAD_* columns, filters, data validation), versioned/idempotent, verified with real screenshots for both users |
| 7 | DONE      |             | Follow-up (next day): removed two unrequested UI additions (filter, group-separator border) per direct feedback; backfilled ALL pre-existing real Daily/Date Entries into both users' real spreadsheets (verified against real Mongo counts, not just the outbox reaching empty); fixed a real Sheets API quota bottleneck found during the backfill; backfilled the History tab's oplog (`cp_history`) for the whole system so it can reconstruct full current data, not just changes from today |
| 8 | DONE      |             | Same night, immediate follow-up: a real `appendRow` bug found while verifying the backfill (Sheets' own `values.append` heuristic silently clobbered rows on the 2-header-row "daily" tab) — root-caused, fixed with deterministic row placement, both spreadsheets' "daily" tabs cleared and rebuilt from real Mongo data, verified exact row-count + distinct-key match; then 3 more rounds of "remove this too" (data-validation dropdowns, frozen panes/divider line, guessed column widths → real `autoResizeDimensions`) per direct real-time feedback, each re-verified against real Mongo counts after every change |
| 9 | DONE      |             | Follow-up session (2026-07-22): added an always-visible "N" item-number column as the first column on both tabs (mirrors the Dashboard's own hidden-behind-a-click "n" button) — migrated both live spreadsheets via a dedicated script, verified row-count-exact (8/3/84/26); changed `appendRow` to insert new rows at the TOP (newest-first, matching cp_history's oplog order) instead of appending at the bottom, and reversed the existing row order on all 4 live tabs to match, verified record-key-set-identical + order-actually-reversed; `SHEET_SCHEMA_VERSION` 1→2, `LAYOUT_VERSION` 5→6; full test suite (81 tests) green |

# Task 1 — Daily Tracker still works unchanged

**Requested:** the Story's acceptance criteria require that "zapis Daily
Trackera do głównego źródła danych pozostawał operacją nadrzędną" and that
adding the Sheets follower never breaks the existing feature.

**Done:** `saveDailyEntry`/`updateDailyEntry`/`deleteDailyEntry` in
`packages/dba/src/leads.ts` are unchanged in their primary
Mongo/Content-Provider write logic — the only addition is one more
`await queueDailyTrackerSheetSyncIfEnabled(...)` call **after** the existing
primary write(s) already succeeded, and that call is designed to never
throw (config/enqueue errors are caught and logged, not propagated). With
`GOOGLE_SHEETS_ENABLED` unset (the default, unchanged for every existing
environment), `loadGoogleSheetsConfig()` returns `enabled: false` and the
new code path is a single cheap check-and-return — no new Mongo call, no
new network call, no behavior change at all versus before this Story.

**Files changed:** `packages/dba/src/leads.ts` (3 call sites added, no
existing logic modified), `packages/dba/src/index.ts` (new exports added).

**Tested:**
- `cd packages/dba && npx tsc` — clean (whole package, not just the new
  files).
- `cd packages/dashboard && npx tsc --noEmit` — clean, confirms Dashboard
  (which calls these three functions) still compiles with zero changes on
  its side.
- `cd packages/console && npx tsc --noEmit` — one pre-existing error
  (`Module '"dba"' has no exported member 'SHARED_REPO_ID'`), confirmed via
  `git stash` to exist identically **before** this Story's changes too — not
  a regression introduced here.
- Existing regression suite re-run: `data-outbox.test.ts` (Story 72's own
  outbox, untouched by this Story) — 11/11 passed, confirming
  `RETRY_BACKOFF_MS`/`STALE_LOCK_MS` are still exported and behave
  identically after being imported into the new `google-sheets/outbox.ts`.
  `headers-parser.test.ts` — 14/14 passed (unrelated, general regression
  spot-check).

**Not done / not verifiable in this session:** a live browser/HTTP
round-trip through `/api/forms/daily-entry` (POST/PATCH/DELETE) was not
re-run — no local dashboard+CP/Mongo stack was started for this Story (the
task's own instructions said not to run a full deployment unless needed;
the `tsc`-level checks plus the unchanged code path for the disabled case
were judged sufficient). The user can verify this by exercising Daily
Entry/Tracker in their already-running local stack — no behavior change is
expected or should be observable.

**Status: DONE**

# Task 2 — Google Sheets sync integration (implementation + automated tests)

**Requested:** design and implement a safe, idempotent, disable-able,
asynchronous sync from Daily Tracker writes to Google Sheets, following the
outbox pattern, with tests using a fake/mock Google client — full detail in
`01_input.md`.

**Done:** see `backlog/stories/75/02_plan.md` for the full design and
`ai-docs/google-sheets/architecture.md` for the technical reference. Summary:

- New `packages/dba/src/google-sheets/` module: `types.ts`, `config.ts`,
  `mapper.ts`, `outbox.ts` (Mongo collection `google_sheets_sync_outbox`,
  mirrors `data-outbox.ts`'s proven shape, reuses its
  `RETRY_BACKOFF_MS`/`STALE_LOCK_MS` constants directly), `worker.ts`
  (claim/process/drain loop, mirrors `data-outbox-worker.ts`), `sync.ts`
  (`queueDailyTrackerSheetSyncIfEnabled` — what `leads.ts` calls),
  `service-account-auth.ts` (JWT signing + token exchange via Node's
  built-in `crypto`/`fetch`, no new dependency), `sheets-api-client.ts` (real
  Sheets API v4 client), `fake-client.ts` (in-memory fake used by every
  test).
- Hooked into `saveDailyEntry` (create), `updateDailyEntry` (update),
  `deleteDailyEntry` (delete → marks `CHAD_SYNC_STATUS=DELETED` in place,
  never a physical row removal).
- Record identity: `${repoGuid}:${loca}` — stable, matches CHAD's own
  existing addressing for these records.
- Column mapping: technical columns (`CHAD_RECORD_KEY`, `CHAD_REPO_GUID`,
  `CHAD_ITEM_NAME`, `CHAD_LOCA`, `CHAD_CREATED_AT`, `CHAD_UPDATED_AT`,
  `CHAD_SCHEMA_VERSION`, `CHAD_SYNC_STATUS`) + the full existing Daily Entry
  domain field list, resolved by header **name** always, never by column
  index; missing headers auto-appended; manual/unknown columns never
  touched; set-once columns (`CHAD_CREATED_AT`/`CHAD_ITEM_NAME`/
  `CHAD_REPO_GUID`/`CHAD_LOCA`) never overwritten on update.
- Config: `GOOGLE_SHEETS_ENABLED`/`GOOGLE_SHEETS_SPREADSHEET_ID`/
  `GOOGLE_SHEETS_DAILY_TRACKER_SHEET_NAME`/`GOOGLE_SERVICE_ACCOUNT_EMAIL`/
  `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, documented in
  `.env.local.example`, validated with specific per-var errors, off by
  default.

**Files changed/added:**
- `packages/dba/src/google-sheets/{types,config,mapper,outbox,worker,sync,
  service-account-auth,sheets-api-client,fake-client}.ts`
- `packages/dba/src/google-sheets/{mapper,config,outbox,worker,sync}.test.ts`
- `packages/dba/src/leads.ts` (3 call sites, see Task 1)
- `packages/dba/src/index.ts` (new exports)
- `.env.local.example` (new documented env block)
- `ai-docs/google-sheets/{ai-start,architecture}.md` (new specialization
  folder)
- `ai-docs/begin_here/02_what-and-where.md` (new index section)

**Tested (all via the repo's existing hand-rolled `test()`/`assert()`
convention, `cd packages/dba && npx tsc && node dist/google-sheets/<file>.test.js`):**
- `mapper.test.ts` (pure, 7 cases) — technical/domain column mapping, AUTO
  fields never emitted, delete mapping excludes domain + immutable columns.
  **7/7 passed.**
- `config.test.ts` (pure, 10 cases) — disabled by default, fully-configured
  load, one missing-var case per required var (each names the exact
  missing var), secret masking (error text never contains the private key
  value), `\n` normalization. **10/10 passed.**
- `outbox.test.ts` (real local MongoDB, 11 cases) — enqueue/idempotent
  enqueue/per-operation jobs/claim/lock exclusivity/markSynced/retry
  backoff/failed-after-exhaustion/sanitized error/stale-lock
  recovery/delete-kind jobs. **11/11 passed.**
- `worker.test.ts` (real local MongoDB + `FakeGoogleSheetsClient`, 8 cases)
  — create appends a row, update updates the same row in place (no
  duplicate), update preserves a manually-added column, delete marks
  status without removing the row or blanking domain data, delete-of-
  never-synced-record is a harmless no-op, retry-after-simulated-failure-
  then-succeeds, a client failure never throws out of the drain loop,
  two different repos with the same `loca` produce two independent rows
  (isolation). **8/8 passed.**
- `sync.test.ts` (real local MongoDB, 6 cases) — disabled path never
  touches Mongo, enabled+configured enqueues with correctly-parsed YAML
  fields, AUTO fields stripped defensively, missing-config-while-enabled
  reports via callback without throwing, two repos get independent
  `recordKey`s, delete kind ignores `bodyYaml`. **6/6 passed.**
- **42/42 automated tests passed, 0 failed.** Google's real API was never
  called by any test — only `FakeGoogleSheetsClient`.

**Not done / explicitly out of scope (see `06_others_from_report.md` for
the full list and reasoning):** Date Entry ("Dates") sync; the four
computed AUTO columns; wiring the worker into a live/cron process; any real
Google Cloud project, service account, or spreadsheet creation; TEST/PROD
deployment; bidirectional sync.

**Status: DONE**

# Task 3 — Real Google Sheet end-to-end verification

**Requested:** confirm actual create/update/delete behavior against a real
Google Sheet.

**Done** — the user created a real spreadsheet, created a service account
(`chad-admin@chad-503119.iam.gserviceaccount.com`) in Google Cloud project
`chad-503119`, enabled the Sheets API, and shared the spreadsheet with the
service account. Real values were added to `.env.local` (gitignored,
confirmed via `.gitignore`'s `.env.*` pattern before writing anything).

**Verification performed** (via a one-off script in the session scratchpad,
not part of the repo — using the real `GoogleSheetsApiClient` +
`enqueueGoogleSheetsSync`/`drainGoogleSheetsSyncOnce` directly, with a
dedicated test `repoGuid` (`story75-e2e-verification`) so it couldn't
collide with any real user's data):

1. **Auth** — `getServiceAccountAccessToken` successfully signed a JWT and
   exchanged it for a real Google access token (confirmed the RS256 JWT
   signing implementation is correct against real Google infrastructure,
   not just against the fake client).
2. **Tab discovery** — read the spreadsheet's real tab name (`Sheet1`) via
   the Sheets API directly, rather than asking the user to look it up.
3. **Create** — enqueued an upsert job, drained it: a new row was appended
   with `CHAD_RECORD_KEY`, correct domain fields, `CHAD_SYNC_STATUS=ACTIVE`,
   `CHAD_CREATED_AT` set.
4. **Update** — enqueued a second upsert job for the *same* `recordKey`
   with different field values, drained it: confirmed via `findRowByKey`
   that it landed on the **same** sheet row (no duplicate), the changed
   fields were updated, and `CHAD_CREATED_AT` was unchanged from step 3.
5. **Delete** — enqueued a delete job, drained it: confirmed the row was
   **not removed**, `CHAD_SYNC_STATUS` became `DELETED`, and the domain
   fields from step 4 (e.g. `APPROACHES=5`, `NUMBERS=2`) were preserved,
   not blanked.
6. Read the full sheet contents back via the API afterward and visually
   confirmed all of the above directly in the row data.

**A real bug found and fixed during this verification:** the first drain
against the real sheet also picked up and synced **5 leftover test jobs**
from earlier `sync.test.ts`/`worker.test.ts` runs (that test file enqueues
jobs into the same local `google_sheets_sync_outbox` Mongo collection used
by real drains, and previously never cleaned them up afterward) — these
appeared as junk rows (`repo-enabled:10`, `repo-enabled:11`,
`repo-alice:20`, `repo-bob:20`) in the real spreadsheet. Fixed by:
1. Adding an end-of-suite `deleteMany({})` cleanup to `outbox.test.ts`,
   `worker.test.ts`, and `sync.test.ts` (in addition to their existing
   start-of-run cleanup) so no test job can ever be left pending for a
   later real drain to pick up again — re-ran the full 42-test suite after
   this fix, still 42/42 passed, and confirmed the outbox collection is
   `0` documents afterward.
2. Clearing the junk rows (and this Story's own verification row) back out
   of the real spreadsheet via the Sheets API, leaving only the header row
   — the sheet is now in the exact clean state the user should see it in.

`GOOGLE_SHEETS_ENABLED` is now `true` in `.env.local`. **Important caveat
still true:** the worker isn't wired into any running process (see
Task 2/`06_others_from_report.md`), so a real Daily Entry save today will
enqueue a job that sits `pending` until something actually drains it — it
will not yet appear in the sheet automatically. That wiring is the
documented next step.

**Superseded by Task 4 below:** the exact column layout verified here (all
technical columns first, no AUTO columns, single "Sheet1" tab) was reworked
same-day after direct user feedback — see Task 4 for the current column
layout and its own, separate real-sheet verification covering both the
"daily" and "dates" tabs.

**Status: DONE**

# Task 4 — Faithful copy of the Dashboard's tables (daily + dates tabs)

**Requested:** after seeing the synced sheet from Task 3, the user said
"cos dziwnego tam umeiszczasz w tym google sheet, ja chce miec wierna kopie
tej tabeli (daily-tracker), i nazwij tez tak ten sheet daily" (Input 7,
with a screenshot of the live Dashboard's Tracker table), then "daily i
dates tez zrob od razu" (Input 8) — do both the "daily" and "dates" tabs
right away, as faithful copies, not deferred.

**Done:**
- Found the Dashboard's actual column source of truth —
  `DAILY_COLUMNS`/`DATE_COLUMNS` in
  `packages/dashboard/app/(dashboard)/dashboard/views/page.tsx` — via a
  targeted code search, rather than re-deriving column order from the
  (partially stale) feature doc or guessing from the screenshot alone.
- Reworked `mapper.ts` so every domain column (including the four "— AUTO"
  columns, with their exact em-dash display labels, e.g. `"PULLS — AUTO"`)
  is mapped in the exact same order/labels as the live Dashboard table, for
  both Daily Entry and Date Entry. Technical `CHAD_*` columns moved to the
  end of the header row instead of the front.
- Added `leads.ts`'s `computeDailyAutoFieldsForSheetSync(dateStr)` so the
  AUTO columns carry real, freshly-computed values (not blank) — reusing
  the existing, already-proven `computeDailyAutoFieldsByDate` function and
  `getAllDateEntries()`, the same way the Dashboard's own GET route
  computes them.
- Added full Date Entry ("dates" tab) sync: `saveDateEntry`/
  `updateDateEntry` now enqueue the same way Daily Entry does (no delete
  hook — no `deleteDateEntry` function exists to hook). Both record types
  share the same outbox/worker, routed by a new
  `SheetSyncPayload.recordType` field.
- Renamed the payload type (`DailyTrackerSheetPayload` → `SheetSyncPayload`)
  and reshaped `sync.ts`'s two entry points
  (`queueDailyEntrySheetSyncIfEnabled`/`queueDateEntrySheetSyncIfEnabled`)
  to take already-resolved `fields` rather than a raw YAML body — YAML
  parsing and AUTO computation now live in `leads.ts`, which already owns
  Date Entry access, instead of being duplicated in `sync.ts`.
- Discovered (via the Sheets API, not asked of the user) that the user had
  already independently renamed `Sheet1` → `daily` and created a `dates`
  tab in parallel while this rework was happening — the script that would
  have created/renamed them detected this and skipped straight to resetting
  both tabs' header rows to the new canonical order (safe: no real user
  data existed in either tab yet at this point).

**Files changed:** `packages/dba/src/google-sheets/{types,config,mapper,
outbox,worker,sync}.ts` (reworked), `packages/dba/src/leads.ts` (added the
AUTO-computation helper + YAML-parsing helper, updated all 5 hook sites,
added 2 new hook sites for Date Entry), all 5 `google-sheets/*.test.ts`
files (updated for the new shapes), `.env.local` / `.env.local.example`
(added `GOOGLE_SHEETS_DATE_ENTRIES_SHEET_NAME`, tab name `daily` instead of
`Sheet1`), `ai-docs/google-sheets/architecture.md` (rewritten to describe
the current design, with a §0 revision note).

**Tested:**
- Full automated suite re-run after the rework: `mapper.test.ts` (11),
  `config.test.ts` (11), `outbox.test.ts` (11), `worker.test.ts` (9,
  including a new "date-entry jobs routed to the dates tab, never the daily
  tab" case), `sync.test.ts` (6). **48/48 passed, 0 failed.**
- `cd packages/dba && npx tsc --noEmit` clean; `packages/dashboard`/
  `packages/console` re-typechecked clean too (console's one pre-existing,
  unrelated error unchanged).
- **Real end-to-end verification repeated** against the actual spreadsheet,
  both tabs, via a one-off scratchpad script (using the real
  `GoogleSheetsApiClient`, dedicated test `repoGuid`
  `story75-e2e-v2` so it couldn't collide with real data):
  - **daily tab:** create → row appended with all domain fields incl. AUTO
    columns (`PULLS — AUTO`, `QUALITY C — AUTO`, etc.) in the exact
    Dashboard column order; update → same row (verified via `findRowByKey`
    returning the same row number), new values written; delete → row kept,
    `CHAD_SYNC_STATUS=DELETED`, last-known domain values (e.g.
    `APPROACHES=5`, `OUTINGS=2`) preserved, not blanked.
  - **dates tab:** create → row appended with `DATA`/`ŹRÓDŁO`/`NAZWA`/
    `LINK`/`PULL`/`CLOSE`/`JAKOŚĆ` (incl. Polish diacritics, verified
    byte-correct); update → same row, `CLOSE` changed `TAK`→`BLISKO`,
    `JAKOŚĆ` changed `8.5`→`9.0`.
  - Dumped both tabs' full contents via the Sheets API afterward and
    visually confirmed every value above directly.
- **A cleanup bug found and fixed during this verification:** the script
  clearing test rows out of the `daily` tab used range `A2:Z1000`, but that
  tab has 28 columns (up to column `AB`) — the last 2 (`CHAD_SCHEMA_VERSION`,
  `CHAD_SYNC_STATUS`) were left behind after the first clear attempt.
  Caught by re-dumping the sheet and confirming a stray row remained; fixed
  by widening the clear range and re-verifying both tabs show only their
  header row afterward.
- Confirmed the outbox collection's 5 verification-run job documents are
  all `status: "synced"` (not `pending`/`retry`) — harmless audit-trail
  records of a real run, not a repeat of the earlier test-pollution bug
  (Task 3) — left in place rather than deleted, since a synced job is
  exactly the normal end state a real production write would also leave
  behind.

**Not done / explicitly deferred:** wiring the worker into a live process
(unchanged from Task 2/3 — still nothing drains the queue automatically
yet); any schema-version migration tooling.

**Status: DONE**

# Task 5 — Per-user spreadsheets + live worker wiring + real multi-user test (same-day follow-up)

**Requested:** the user pointed out two remaining problems after Tasks 1-4:
(1) `GOOGLE_SHEETS_SPREADSHEET_ID` was a single env var shared by every
CHAD user — in practice `.env.local` only ever named one spreadsheet
(pawel_f's), so kamil_s's writes would have landed there too, never in
kamil_s's own spreadsheet; (2) the worker, while fully built and tested,
was never actually running anywhere — `01_input.md`'s full request asked
for: a real per-user mapping resolved from DBA's own user/repo context
(never from request body/query), a field-by-field verification that the
sheet is a true mirror of the real `daily`/`dates` source data, the worker
actually wired into an existing process (no new container), and a real
create/update/delete test run separately for `pawel_f` and `kamil_s`.

**Done:**

*Per-user spreadsheet routing* (`architecture.md` §0b/§5b for the full
design):
- `GOOGLE_SHEETS_SPREADSHEET_ID` → `GOOGLE_SHEETS_SPREADSHEET_MAP`, a JSON
  `{username: spreadsheetId}` object (`config.ts`'s `parseSpreadsheetMap`/
  `resolveSpreadsheetIdForUser`, both with specific, non-secret-leaking
  error messages).
- `SheetSyncPayload` gained `username` and `spreadsheetId` (`types.ts`) —
  `spreadsheetId` resolved once at enqueue time (`sync.ts`) from
  `getCurrentUsername()` (`repo-context.ts`'s existing request-scoped
  `AsyncLocalStorage`, the same source `repoGuid` already used — never a
  request body/query field) and frozen into the job snapshot, never
  re-resolved by the worker.
- `worker.ts`'s `GoogleSheetsWorkerDeps.targets` (a static
  `Record<SheetRecordType, GoogleSheetsTarget>`, one fixed spreadsheet)
  replaced with `sheetNames` (tab names only) — the spreadsheet id now
  always comes from `job.payload.spreadsheetId`.
- `leads.ts`'s 5 existing Sheets call sites (`saveDailyEntry`/
  `updateDailyEntry`/`deleteDailyEntry`/`saveDateEntry`/`updateDateEntry`)
  each pass `username: getCurrentUsername()` alongside the existing
  `repoGuid: getCurrentRepoGuid()`.

*Worker wired into the live Dashboard process* (`architecture.md` §7):
- New `packages/dba/src/google-sheets/bootstrap.ts` —
  `startGoogleSheetsSyncWorkerIfEnabled()`, exported from `dba`'s index.
- New `packages/dashboard/instrumentation.ts` — Next.js's `register()`
  lifecycle hook, calls the bootstrap once at server startup, guarded to
  the Node.js runtime.
- `docker-compose.local.yml`: the `dashboard` service's `environment:`
  block didn't forward any `GOOGLE_SHEETS_*`/`GOOGLE_SERVICE_ACCOUNT_*` var
  into the container before this (confirmed by inspection — the original
  Story's real-sheet verification never actually went through this
  container). Added explicitly, sourced from `.env.local` the same way
  `MONGODB_URI`/`DBA_*` already were.

*Config/docs:* `.env.local`/`.env.local.example` updated to the new map
shape (`.env.local`'s real value: `{"pawel_f":
"14nFkoS1jSWoTaeeD0phoE655anLwkNiVqXOzNiqDLrA", "kamil_s":
"1dU0UjaEvbYExRV8SUpG-BJ0DjH3ZZndZwpb5XjGevMU"}`, both real, already-shared
spreadsheets the user provided). `ai-docs/google-sheets/{ai-start,
architecture}.md` updated (§0b, §5b, rewritten §4/§7, new §10).

**Files changed:** `packages/dba/src/google-sheets/{types,config,sync,
worker}.ts` (reworked), `packages/dba/src/google-sheets/bootstrap.ts` (new),
`packages/dba/src/index.ts` (new export), `packages/dba/src/leads.ts` (5
call sites), `packages/dashboard/instrumentation.ts` (new),
`docker-compose.local.yml`, `.env.local`/`.env.local.example`, all 5
`google-sheets/*.test.ts` files (updated for the new payload/config/worker
shapes, plus new dedicated cross-user isolation tests), `ai-docs/google-sheets/
{ai-start,architecture}.md`.

**Tested:**
- `cd packages/dba && npx tsc` — clean.
- `packages/dashboard`/`packages/console` `npx tsc --noEmit` — clean (console's
  one pre-existing, unrelated `SHARED_REPO_ID` error unchanged from before
  this Story, confirmed by comparison to Task 1's own note).
- Full automated suite re-run: `config.test.ts` (16, incl. 7 new cases for
  the map parsing/resolution/error paths), `mapper.test.ts` (11, unchanged
  shape), `outbox.test.ts` (11, unchanged shape), `worker.test.ts` (10,
  incl. 1 new dedicated "two users route to two different spreadsheets"
  case), `sync.test.ts` (7, incl. 1 new "unmapped username reports via
  callback" case). **55/55 passed, 0 failed.** Pre-existing regression
  suite re-run too: `data-outbox.test.ts` 11/11, `headers-parser.test.ts`
  14/14 — both unaffected.
- **Real rebuild + restart via the official scripts only**
  (`bash-scripts/dashboard/03_local_mac_docker/02_build.sh` then
  `03_re-start.sh` — per `04_deployment-rules.md`, never a bare `docker
  compose` command), confirmed via `docker logs
  chad-dashboard-local-mac-docker`:
  `[google-sheets] sync worker starting (intervalMs=5000, users
  configured=2)` — the worker is now actually running inside the live
  container, not a script.
- **Source-data fidelity check:** `GET /api/forms/daily-entry` for both
  `pawel_f` and `kamil_s` via the real running Dashboard (authenticated
  with each user's real session cookie, same format `app/api/auth/login`
  issues, built from each user's real `repoGuid` looked up directly in
  Mongo) compared field-by-field against the same records read straight
  from Mongo `cp_items` — exact match for both users.
- **Real end-to-end test, both users, both record types, through the live
  container** (not a script bypassing it): for each of `pawel_f`/`kamil_s`
  — daily create → update → delete, dates create → update. Verified by
  reading both users' real spreadsheets directly via the Sheets API
  afterward: each user's test row landed in **their own** spreadsheet only
  (zero cross-contamination either direction), update landed on the same
  row (no duplicate), delete marked `CHAD_SYNC_STATUS=DELETED` with domain
  values preserved (not blanked) and the underlying Mongo doc genuinely
  gone. `docker logs` showed all 9 real jobs (5 pawel_f + 4 kamil_s) synced
  within one 5-second worker tick each, 0 failures. Full detail: see
  `architecture.md` §10.

**Not done / explicitly flagged, not auto-fixed:** the two test Date
Entries created during this real test (`DATA: 2099-01-01`, marker in
`ŹRÓDŁO`) have no delete function to clean up after themselves
(`deleteDateEntry` doesn't exist — a pre-existing product gap, not
introduced here) and were deliberately **not** removed by reaching into
Mongo directly (would bypass the app's own write path/history tracking for
a real user's data without asking first) — left in place, clearly
identifiable, flagged to the user in the session's final report instead.
QNAP TEST/PROD compose files were **not** touched (per this session's own
"no PROD deployment" instruction, and matching the existing precedent that
TEST/PROD need their own spreadsheet map/tab names decided before this is
ever enabled there).

**Status: DONE**

# Task 6 — Visual layout: make the tabs actually look like the Dashboard's tables (same-day follow-up)

**Requested:** after Task 5 confirmed data/isolation, the user asked for
genuine visual fidelity — column order, groups/multi-level headers, widths,
row heights, colors, borders, alignment/wrap, date/number formats,
checkboxes/dropdowns, AUTO-column treatment, group separators, frozen
rows/columns, filters, hidden CHAD_* columns, row order, empty-value
presentation — audited against the real Dashboard rendering source (not
`DAILY_COLUMNS`/`DATE_COLUMNS` alone), implemented via `spreadsheets.
batchUpdate`, versioned/idempotent, migration-safe, documented with an
explicit "no faithful equivalent" list, and verified with real screenshots
for both users.

**Source files read in full to find the Dashboard's real rendering** (not
excerpts, not re-derived from `human-docs/`):
`packages/dashboard/app/(dashboard)/dashboard/views/page.tsx` (1103 lines —
the only file that renders either table; confirmed zero `<select>`/
checkbox/`sticky` anywhere in it), `packages/dashboard/app/globals.css`
(shadcn OKLCH theme tokens), `packages/dashboard/components/shared/
layout-tokens.ts`. Full audit table (Dashboard element → source → Sheets
equivalent → status → fix) for both tabs: `ai-docs/google-sheets/
architecture.md` §11.

**Done:**
- New `packages/dba/src/google-sheets/layout.ts` — pure `batchUpdate`
  request-builder functions (`applyHeaderFormatting`, `applyColumnWidths`,
  `applyRowHeights`, `applyNumberFormats`, `applyGroupCellBackgrounds`,
  `applyDataValidation`, `applyFrozenRowsAndColumns`, `applyBordersAndGroups`,
  `hideTechnicalColumns`, `applyBasicFilter`) plus two I/O orchestrators
  (`ensureDailyTrackerLayout`/`ensureDatesLayout`), versioned via
  `CHAD_SHEET_LAYOUT_VERSION` sheet-scoped developer metadata (not a
  visible column — a layout version is per-tab, not per-row).
- Colors/widths derived, not guessed: Tailwind `green/amber/blue/rose
  -100/-50` hex values, shadcn `--muted`/`--border` OKLCH tokens converted
  to sRGB via the standard OKLab matrices, column widths estimated from
  label length with the Dashboard's own [64,180]px / 100px-for-dates
  bounds.
- `GoogleSheetsTarget` gained `headerRowCount` (default 1; "daily" is 2 —
  a decorative merged group-label row above the real column-name row) —
  threaded through `sheets-api-client.ts`/`fake-client.ts`'s
  `readHeaderRow`/`findRowByKey`/`ensureHeaders`, and `worker.ts`'s
  `targetFor`. Layout init (this file) is fully separate from per-record
  sync (`worker.ts`'s `processGoogleSheetsJobOnce` never calls anything
  here) — called once per configured user from `bootstrap.ts` at worker
  startup, not per job.
- Idempotency/migration: `ensureXLayout` reads the current version first;
  a match is a zero-`batchUpdate` no-op; a mismatch (including "never laid
  out", `null`) triggers a real re-apply and a version-metadata
  create-or-update. CHAD_* columns moved to the end (already were, §6) and
  hidden (`hiddenByUser`).
- Data validation (VERBAL EXERCISES/INFIELD/THEORY/FIELD REVIEW/PULL/CLOSE)
  is explicitly a Sheets-only enhancement, not a Dashboard mirror (the
  Dashboard has no `<select>`/checkbox anywhere — confirmed by reading the
  whole file) — suggestion lists built from real distinct values queried
  directly from Mongo across both users (e.g. `CLOSE` includes the real
  `BLISKO` outlier, not an idealized TAK/NIE-only guess), always
  `strict: false` so a value outside the list is never rejected.
- Explicit "no faithful equivalent" table for elements that genuinely can't
  be mirrored (fuzzy multi-field search, ellipsis+hover tooltip, the
  interactive action/edit column, exact CSS-px typography) —
  `architecture.md` §11d — with the word "identical" deliberately avoided
  throughout.

**A real incident happened and was fixed the same session** (full detail:
`architecture.md` §0c). The first version of the daily tab's group-label
row logic used one `updateCells` request across a multi-column merged
range with only one value supplied — Sheets clears every cell in a range
not explicitly given a value under that request's fields mask, so this
**blanked the real "DATE"/"STATE"/... header text on both live
spreadsheets**. Caught immediately via a direct Sheets API read (not
assumed), confirmed **no real personal user data was affected** (the only
content on either "daily" tab was one already-deleted leftover test row
from Task 5's E2E verification — CHAD's own auto-generated header labels
were what got destroyed, trivially regenerable). Root cause fixed
(format-only `repeatCell` for the merged range, a separate 1-column-wide
`updateCells` for just the label text) plus a related gap fixed
(`insertDimension` now runs first on a tab's very first layout
application, so a pre-existing 1-header-row tab's old content shifts down
instead of being overwritten in place). Both spreadsheets' "daily" tabs
were cleared and re-laid-out from a clean state with the fixed code;
"dates" tabs were never affected and needed no remediation. Two dedicated
regression tests guard both bugs (`layout.test.ts`).

**Real Google login was needed for the visual comparison and wasn't
available in this environment** — the user logged into the real Google
account (`kamilgame042@gmail.com`) interactively in the same Playwright
browser session mid-task (a password was shared in chat for this purpose;
never written to any file/log/memory by this session, and not needed again
since the browser session itself carries the login). This is what enabled
literal screenshots of the real Sheets UI (see below) rather than only the
API-formatting-based HTML reconstruction used before that point (which is
what originally caught the incident above).

**Files changed:** `packages/dba/src/google-sheets/layout.ts` (new),
`layout.test.ts` (new, 30 cases), `types.ts` (`GoogleSheetsTarget.
headerRowCount`, 3 new `GoogleSheetsClient` methods:
`getSheetId`/`batchUpdate`/`getSheetDeveloperMetadata`),
`sheets-api-client.ts`/`fake-client.ts` (implement the 3 new methods +
`headerRowCount` support), `mapper.ts` (`SheetColumnGroup`, `group` field
on every column spec, `DAILY_TRACKER_HEADER_ROW_COUNT`/
`DATE_ENTRIES_HEADER_ROW_COUNT`), `worker.ts` (`targetFor` attaches
`headerRowCount`), `bootstrap.ts` (`ensureLayoutsForAllUsers`, called at
startup), `index.ts` (new export), `ai-docs/google-sheets/{ai-start,
architecture}.md` (§0c, §11-§14).

**Tested:**
- `cd packages/dba && npx tsc` — clean.
- `packages/dashboard`/`packages/console` `npx tsc --noEmit` — clean
  (console's pre-existing unrelated error unchanged).
- Full automated suite: `layout.test.ts` 30/30 (pure request-builder shape
  assertions + idempotency/migration/isolation via `FakeGoogleSheetsClient`
  + the two §0c regression guards), all 5 pre-existing Story 75 test files
  unaffected — 55/55 → **85/85 total, 0 failed**. Pre-existing regression
  suite (`data-outbox.test.ts`, `headers-parser.test.ts`) also re-run, both
  still 100% green.
- **Real application to both live spreadsheets**, verified via direct
  Sheets API read-back (`spreadsheets.get` with format fields): frozen
  rows/columns, 4 merges (daily)/0 (dates), basic filter present, hidden
  CHAD_* columns, `CHAD_SHEET_LAYOUT_VERSION=1` on all 4 tabs.
- **Real visual verification, both users, both tabs, real Sheets UI**
  (post-fix, post-remediation): `real-sheet-pawel-daily.png`,
  `real-sheet-pawel-dates.png`, `real-sheet-kamil-daily.png`,
  `real-sheet-kamil-dates.png`, compared directly against
  `dashboard-daily-tracker-full.png`, `dashboard-kamil-tracker.png`,
  `dashboard-dates.png` (live Dashboard, real session cookies). Confirmed
  matching: column order, group boundaries/colors, dates tab's correct
  absence of grouping. Directly visible in the real UI (not just asserted
  from the API): filter arrows, data-validation dropdown carets, the
  frozen-pane divider line, the CHAD_* column hide (visible G→P column
  -letter jump), and `PULLS — AUTO`'s header clipping with no ellipsis
  (the documented `wrapStrategy: CLIP` limitation, §11d).

**Explicitly documented as NOT achievable 1:1** (never called "identical"
anywhere) — full table in `architecture.md` §11d: fuzzy multi-field text
search, ellipsis+hover-tooltip truncation, always-newest-first row order
without an expensive per-write resort, the interactive Save/Edit/Open-Raw
action column, real HTML checkboxes/selects (don't exist in the Dashboard
either), percent/currency/date formatting (doesn't exist in the Dashboard
either), and pixel-exact typography.

**Status: DONE**
