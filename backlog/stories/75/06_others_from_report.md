# Story 75 — Others (decisions, limitations, follow-ups)

## Architectural decisions

- **Variant B (outbox), not Variant A (inline sync)** — chosen per the
  user's own stated preference given the repo already has a proven
  worker/outbox/retry pattern (`data-outbox.ts`/`data-outbox-worker.ts`,
  Story 72). See `02_plan.md` §2 for the full reasoning.
- **A parallel outbox, not a reuse of `data-outbox.ts`'s types** — Google
  Sheets isn't a `CpCompatibleDataProvider` (no address/type/id concept for
  a spreadsheet row); the new outbox copies the proven shape and reuses its
  backoff constants, but has its own job payload. See `02_plan.md` §2.
- **One outbox job per write (fresh `operationId`), not one job slot per
  record** — considered and rejected a "collapse rapid edits into one
  job, reset to pending" design because it has a real race: a slow in-flight
  write for an old snapshot could get marked `synced` after a newer snapshot
  had already reset/replaced it, silently leaving the sheet stale with no
  retry ever triggered. Per-operation jobs, each a complete independently-
  idempotent snapshot, applied in claim order, avoid that entirely. See
  `02_plan.md` §2.
- **`recordKey = "${repoGuid}:${loca}"`**, not `itemName` (sequential, not
  globally stable) or `DATE` (documented as not-guaranteed-unique). `loca`
  is CHAD's own existing stable identity for this record. See `02_plan.md` §5.
- **No `googleapis`/`google-auth-library` dependency** — service-account JWT
  signing uses Node's built-in `crypto.createSign`, and all Sheets API calls
  use plain `fetch`, matching `packages/dba`'s existing lean dependency list
  and the repo's one existing Google integration's own no-SDK style
  (`packages/beeper-sync/sync-google-contacts.mjs`). See `02_plan.md` §3.
- **`CHAD_CREATED_AT`/`CHAD_ITEM_NAME`/`CHAD_REPO_GUID`/`CHAD_LOCA` are
  set-once, never touched by an update** — enforced in `worker.ts` by
  stripping them out of the values sent to `updateRow` for an already-
  existing row, relying on `updateRow`'s "only touch the columns present in
  `values`" contract. This also meant `updateDailyEntry`/`deleteDailyEntry`
  don't need to know/track the record's original creation time or item
  name at all — simpler than threading that through every call site.
- **Delete marks a status column, never removes the row** — matches the
  existing Content-Provider convention elsewhere in this feature (no real
  CP delete exists; Daily Entry items are overwritten in place, not
  removed) and avoids row-index-shift hazards other rows would otherwise be
  exposed to.
- **`GOOGLE_SHEETS_DAILY_TRACKER_SHEET_NAME` has no default value** — the
  simplest possible guard against two environments accidentally sharing one
  tab: every environment's own env file must name its own tab explicitly.
  `.env.qnap.example` was deliberately left untouched, matching Story 72's
  own precedent (its `DBA_*` vars were only ever added to
  `.env.local.example`, never `.env.qnap.example`) — TEST/PROD would need
  their own tab names configured before ever enabling this there, which is
  out of scope for this Story regardless (no deployment happened).

## Known limitations (deliberate, not oversights)

- No automatic schema-version migration if the column set ever changes
  shape in the future — `CHAD_SCHEMA_VERSION` is written per-row precisely
  so a future migration Story has something to detect drift against, but
  no migration logic exists yet (would be "ciężka infrastruktura" the task
  explicitly said to avoid building speculatively).
- The worker (`runGoogleSheetsSyncWorker`/`drainGoogleSheetsSyncOnce`) is
  not wired into any long-running process — deliberate parity with
  `data-outbox-worker.ts`'s own unwired state since Story 72. Until some
  process calls it on an interval (or manually), enqueued jobs sit in
  `pending` in Mongo without being drained. This is safe (nothing is lost)
  but means the sheet won't actually update until that wiring exists.
- `deleteDailyEntry`'s Content-Provider-only-backend case (no Mongo) throws
  before any Sheets logic runs at all, same as before this Story — no
  change in behavior for that path.

## Follow-up proposals (not implemented, real future work)

1. **Wire `drainGoogleSheetsSyncOnce` into an actual running process** —
   options: a small standalone Node script run via cron/systemd/pm2 next to
   the dashboard container, or (if `history-worker`'s own process ever
   grows a generic "background jobs" role) piggyback there. Needs a
   deploy-time decision, out of this Story's scope.
2. **Date Entry ("Dates") sync** — structurally identical to this Story's
   Daily Entry work (`saveDateEntry`/`updateDateEntry` are already on the
   same dual-backend pattern per `human-docs/dba/provider-migration-audit.md`);
   a natural next Story once Daily Entry sync is confirmed working against
   a real sheet.
3. **Real end-to-end verification** — see Task 3 in
   `05_tasks_and_checklist.md`; blocked on the user's own Google Cloud
   project/service-account/spreadsheet.
4. **A schema-migration step for `CHAD_SCHEMA_VERSION` drift** — if/when the
   column set ever needs to change shape, decide then whether to migrate
   existing rows or just document the version bump.
5. **Syncing the four "— AUTO" computed columns** — would need either
   storing them (a bigger change to how Daily Entry works today) or having
   the sync job fetch the relevant Date Entries at sync time (extra
   complexity); deferred until there's an actual need to see them in the
   sheet.
6. **A real `deleteDateEntry` function** — pre-existing gap independent of
   this Story (Date Entry has never had a delete path, sheet or no sheet).
   Surfaced concretely by Task 5's real test, which left two harmless but
   permanent test rows (`DATA: 2099-01-01`) in both pawel_f's and kamil_s's
   real Mongo/Sheets data with no clean way to remove them via the app.

## Revision, same day (2026-07-21) — faithful-copy rework + Date Entry sync added

After the first pass above was built, tested, and verified against the
user's real spreadsheet, the user looked at the actual synced sheet and
gave direct feedback (Input 7/8 in `01_input.md`) that reversed two of the
scope decisions made in `02_plan.md`:

1. **AUTO columns are now included** — the original plan (`02_plan.md` §7)
   deliberately excluded `PULLS AUTO`/`CLOSES AUTO`/`QUALITY DP AUTO`/
   `QUALITY C AUTO` because they're not persisted anywhere in CHAD's own
   storage. The user wanted "a faithful copy" of the actual Tracker table,
   which does show these columns (computed live). Fixed by adding
   `computeDailyAutoFieldsForSheetSync(dateStr)` to `leads.ts` — fetches
   current Date Entry data and calls the existing, already-proven
   `computeDailyAutoFieldsByDate` (same function the Dashboard's own GET
   route uses) fresh at every Daily Entry write, merging the result into
   the fields sent to the sheet. Still never persisted to CHAD's own
   storage — only computed for the sheet snapshot.
2. **Date Entry ("Dates") sync is now in scope** — the original plan
   deferred this as "a natural next Story". The user asked for it "od razu"
   (right away, Input 8). Implemented identically to Daily Entry
   (`saveDateEntry`/`updateDateEntry` hooked the same way; no delete
   function exists for Date Entry, so no delete hook there), sharing the
   same outbox/worker, routed by a new `SheetSyncPayload.recordType` field
   (`"daily-entry"` | `"date-entry"`) to the right tab/mapper.
3. **Column order/labels are now a verbatim copy of the live Dashboard
   code**, not the (partially stale) feature doc — see `03_knowledge.md`'s
   new entry on `DAILY_COLUMNS`/`DATE_COLUMNS`. Technical `CHAD_*` columns
   moved from the front of the sheet to the end, so the visible domain
   columns read identically to the Dashboard table when scanning left to
   right.
4. **A significant rework followed**, touching `types.ts` (renamed
   `DailyTrackerSheetPayload` → `SheetSyncPayload`, added `recordType`),
   `mapper.ts` (full rewrite: per-column `{key, label}` specs, two domain
   column sets, technical columns moved to the end), `config.ts` (added
   `GOOGLE_SHEETS_DATE_ENTRIES_SHEET_NAME`), `worker.ts` (routes by
   `recordType` to one of two `GoogleSheetsTarget`s), `sync.ts` (two
   exported functions, `fields` passed in already-resolved rather than a
   raw YAML body — YAML parsing and AUTO computation moved into `leads.ts`,
   which already owns Date Entry access), and `leads.ts` (5 hook sites now:
   `saveDailyEntry`/`updateDailyEntry`/`deleteDailyEntry`/`saveDateEntry`/
   `updateDateEntry`). All 5 test files updated to match; full suite grew
   from 42 to 48 automated tests, still 0 failures, still 0 real Google API
   calls from any test.
5. **Real verification repeated** against the actual spreadsheet after the
   rework: renamed/created tabs (found the user had already renamed
   `Sheet1` → `daily` and created a `dates` tab themselves in parallel),
   reset both tabs' header rows to the new canonical order, then ran the
   same create/update/delete round trip as the first verification for
   **both** Daily Entry and Date Entry, confirmed correct via the API, then
   cleared the test rows back out (a range-size bug in the cleanup script
   — clearing only `A2:Z1000` instead of covering all the `daily` tab's 28
   columns — left 2 stray technical-column values behind on the first
   attempt; caught by re-dumping the sheet and fixed with a wider clear
   range before moving on).

`.env.local`/`.env.local.example` updated with the new
`GOOGLE_SHEETS_DATE_ENTRIES_SHEET_NAME` var and the tab renamed from
`Sheet1` to `daily` in config; `ai-docs/google-sheets/architecture.md`
rewritten to describe the current (not original) design, with a §0 revision
note explaining what changed and why.

## Revision, same day (2026-07-21) — per-user spreadsheets + live worker wiring (Task 5)

A second same-day follow-up, after the §"Revision" above already shipped
and was verified. The user reviewed the result and found two problems this
session fixed (full detail: `05_tasks_and_checklist.md` Task 5,
`architecture.md` §0b/§5b/§7/§10):

1. **`GOOGLE_SHEETS_SPREADSHEET_ID` was a single spreadsheet shared by every
   CHAD user** — `.env.local` only ever named one (pawel_f's), so kamil_s's
   Daily/Date Entry writes would have silently landed in pawel_f's
   spreadsheet the moment the worker ever ran. Fixed with
   `GOOGLE_SHEETS_SPREADSHEET_MAP` (username → spreadsheetId), resolved
   from `getCurrentUsername()` (the same request-scoped context `repoGuid`
   already came from — never request body/query) at enqueue time and
   frozen into the job payload.
2. **The worker was fully built/tested but never actually running** —
   confirmed by finding zero references to `runGoogleSheetsSyncWorker`/
   `drainGoogleSheetsSyncOnce` anywhere outside test files before this
   session. Fixed by adding `google-sheets/bootstrap.ts` and
   `packages/dashboard/instrumentation.ts` (Next.js's server-startup
   lifecycle hook) — the worker now runs as a background interval loop
   inside the already-running Dashboard process, no new container. This
   also surfaced that `docker-compose.local.yml` never forwarded any
   `GOOGLE_SHEETS_*`/`GOOGLE_SERVICE_ACCOUNT_*` var into the dashboard
   container at all — added explicitly.

Both were verified for real: rebuilt/restarted the local Dashboard
container via the official `02_build.sh`/`03_re-start.sh` scripts (per
`04_deployment-rules.md` — never a bare `docker compose` command), then ran
a real create/update/delete (daily) and create/update (dates) test as both
`pawel_f` and `kamil_s` through the live container (session cookies built
from each user's real `repoGuid`, looked up directly in Mongo), and read
both real spreadsheets back via the Sheets API afterward to confirm
per-user isolation and correct values. One residual, deliberately
unresolved side effect: the two test Date Entries created during this real
test have no delete function to remove them (pre-existing gap, not
introduced here) — left in place rather than bypassed via a direct Mongo
delete, flagged to the user instead.

## Revision, same day (2026-07-21) — visual layout + a real incident (Task 6)

A third same-day follow-up. The user asked for genuine visual fidelity
between the "daily"/"dates" tabs and the Dashboard's own `views/daily`/
`views/dates` tables — column groups, colors, widths, frozen panes, hidden
technical columns, filters, data validation — not just matching data under
matching headers. Full design/implementation: `05_tasks_and_checklist.md`
Task 6, `ai-docs/google-sheets/architecture.md` §0c/§11-§14.

**A real incident happened during this work, was caught the same session
via the visual comparison itself, and was fixed before the session ended:**
the first version of the daily tab's 2-row-header logic used a Sheets API
`updateCells` request across a multi-column merged range with only one
`CellData` supplied — Google's API clears every cell in a range not
explicitly given a value under that request's fields mask, which blanked
the real "DATE"/"STATE"/... column-header text on **both live
spreadsheets**. Caught by comparing an HTML reconstruction (built from the
real Sheets API's own formatting response, used because no interactive
Google login was available yet at that point) against the Dashboard —
the reconstruction visibly showed group labels where real headers should
have been. Confirmed via a direct API read (not assumed) that **no real
personal user data was affected** — the only content on either "daily" tab
was one already-deleted leftover test row from the prior (Task 5) E2E
verification; what got destroyed was CHAD's own auto-generated header
labels, trivially regenerable, never something a user typed. Fixed at the
root (format-only `repeatCell` for the merged range, a separate
1-column-wide `updateCells` for just the anchor cell's label text) plus a
related migration gap (a fresh tab's very first layout application now
physically inserts a row before writing the group-label row, so a
pre-existing 1-header-row tab's old content shifts down instead of being
overwritten in place). Both spreadsheets' "daily" tabs were cleared and
re-laid-out from a clean state with the fixed code; "dates" tabs were
never touched by either bug and needed no remediation. Two dedicated
regression tests (`layout.test.ts`) guard against both ever recurring.

**A real Google login was needed for genuine visual verification and
wasn't available in this environment by default** — Playwright had no
Google session, and the two real spreadsheet URLs redirected to
`accounts.google.com` sign-in. The user logged into the real account
(`kamilgame042@gmail.com`) interactively in the same Playwright browser
mid-session (a password was shared in chat for this purpose only — this
session never wrote it to any file, log, or memory, and never needed it
again once the browser session itself carried the login). This is what
enabled real, literal screenshots of the Sheets UI for the final
verification, superseding the earlier API-reconstruction approach (which
had already done its job by catching the incident above).

## `04_todos.md` status

Empty at the end of this Story — every item noticed along the way was
either fixed inline (nothing needed this) or promoted to the proposals list
above; nothing was left dangling.
