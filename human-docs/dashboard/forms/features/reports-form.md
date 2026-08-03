# Reports — Form and View

## Cel

Lets the user create a named report (date + kind + free-text suffix,
combined into a generated, locked identity) and write its free-text body
in an editor (Forms), and lets the user browse/open previously saved
reports (Views). One new entry in each of the two existing menus — no new
dashboard nav, no new form/view system.

## Zakres

- Forms: "Reports" button in the existing Forms menu
  (`app/(dashboard)/dashboard/forms/page.tsx`), reusing the existing
  `?form=` query-param routing that Add Lead/Actions/Daily/Date Entry
  already use — not a separate route. Two-stage flow (see below), rebuilt
  in Story 53 — the original version (single editor, no metadata step,
  purely sequential item names) is superseded.
- Views: "REPORTS" button in the existing Views menu
  (`app/(dashboard)/dashboard/views/page.tsx`), reusing the existing
  `?view=` query-param routing that TRACKER/DATES/LEADS already use.
  Read-only list + preview through Story 55; **Story 56 made a selected
  report editable** (Preview **and** Editor tabs, Save) — see below.
- dba layer: see `documentation/dba/features/report-entries.md`.

## Three-frame form (2026-08-03 restyle; was two-stage Create in Story 53–56)

Three separate rounded frames (same Save / amber-fields pattern as Add Lead /
Add Action — see `ai-docs/gui-standards/forms-and-views.md`):

1. **Save frame** — `Save` (was Create) + `Full View` →
   `/dashboard/views?view=reports` + readonly generated name (**no**
   “Generated name” label), one line (`flex-nowrap` / `w-fit`).
2. **Fields frame** — amber table: Date, Report kind, Rest of the name.
   Locked after first successful Save (server-confirmed `itemName` / `loca`).
3. **Record frame** — voice dictation (`VoiceRecordingPanel`) + report body
   (`TextEditorWithToolbar` with `showSave={false}`; body Save is the top
   Save button). Editor is always visible (not gated on create).

First Save POSTs `{ content, itemName }` (create). Later Saves POST
`{ content, loca }` (update). Move from the voice panel uses the same
create-or-update path.

Generated name still recomputes live before first Save as
`{YY-MM-DD}_{kind}_{suffix}` via `generateReportName`.

*History:* Story 53 introduced two-stage Create→editor; Story 55/56
reordered Create + Generated name rows and added the standalone voice
panel. 2026-08-03 replaced Create with Save and split metadata into the
three-frame layout above without changing the create-then-update API.

## Navigation (Story 56)

The Reports form's header row (and every other `DashboardPageShell`/
`EditorPageShell` page's) now renders the shared `NavGroup`
(`components/shared/nav-group.tsx`: `[Prev] [Back] [Forw]`) instead of a
standalone `BackButton` — see `documentation/dashboard/common/features/
responsive-layout-standard.md`'s "Shared navigation" section for the full
standard. In Reports specifically: `handleFormBack` (the pre-existing
"go back to the Forms menu" handler) is now wired as `NavGroup`'s `upLevel`
(the middle "Back" button) instead of being called by a plain
`BackButton`; behavior is unchanged, only the surrounding control and its
position changed.

## Zmienione pliki

- `packages/dashboard/app/(dashboard)/dashboard/forms/page.tsx` — `"reports"`
  in `FormType`; state `reportDate`/`reportKind`/`reportSuffix`/
  `reportContent`/`reportLoca`/`reportItemName`/`reportSaving`/`reportSaved`/
  `reportError`; `generateReportName` helper; `handleReportCreate` (new) +
  `handleReportSave` (now update-only); two-stage render branch.
- `packages/dashboard/app/(dashboard)/dashboard/views/page.tsx` — `"reports"`
  in `ViewType`, a menu button, a `reports`/`reportsError`/
  `selectedReportLoca` state, and a render branch: a simple list (styled
  like the existing LEADS list); a selected report renders the shared
  `TextEditorWithToolbar` (Story 56 — previously a read-only
  `PreviewContent`), with its own `editedReportContent`/`reportSaving`/
  `reportSaved` state and a save handler that POSTs to the same
  `/api/forms/reports` route (loca-based update) Forms already uses — no
  new route, no duplicated save logic.
- `packages/dba/src/report-entries.ts` (Story 56) — `getAllReportEntries`'s
  `if (itemResult?.Body)` truthiness check replaced with an explicit
  presence check (`!== undefined && !== null`), so a genuinely empty
  report body survives as `""` instead of collapsing into `undefined`
  (see dba doc and Story 56's report for the full bug analysis).
- `packages/dashboard/app/api/forms/reports/route.ts` — `POST`; gained an
  `itemName` field (required when `loca` is absent).
- `packages/dashboard/app/api/views/reports/route.ts` — `GET`. Unchanged in
  Story 53.
- `packages/dba/src/report-entries.ts` (renamed from `actions-reports.ts`
  in Story 53), `packages/dba/src/index.ts` — `createReportEntry` now takes
  a caller-supplied `requestedName` instead of generating a sequential one,
  plus `nextAvailableName` collision handling (see dba doc).
- **Story 55 additions:** `components/shared/voice-record-button.tsx`,
  `hooks/use-speech-to-text.ts`, `lib/speech/types.ts`,
  `lib/speech/web-speech-engine.ts` (see `voice-recording.md`);
  `components/shared/back-button.tsx` (see
  `responsive-layout-standard.md`'s "Back button" section) — the Reports
  form's own icon-only Back button now uses this shared component instead
  of ad-hoc markup.

## Route/API

**`POST /api/forms/reports`** — body
`{ content: string, loca?: string, itemName?: string }`.
- No `loca` (Create step): creates a new report (`createReportEntry`,
  `itemName` required). Response includes the new `loca` and the
  actually-used `itemName` (may differ from the request on a same-name
  collision — see dba doc) — the client must remember `loca` and send it
  back on every subsequent Save.
- `loca` present (editor Save): updates the existing report
  (`updateReportEntry`); `itemName` is ignored.

**`GET /api/views/reports`** — returns
`{ success, reports: [{ itemName, loca, body }], error? }`. Unchanged.

## Przepływ danych

Forms: metadata panel (client) → Create → `fetch("/api/forms/reports")` (no
`loca`, with `itemName`) → `runWithRepoContext(user, () => createReportEntry(...))`
→ dba → Content Provider → `reportLoca`/`reportItemName` set, editor
revealed → editor Save → `fetch("/api/forms/reports")` (with `loca`) →
`updateReportEntry` → dba → Content Provider.

Views: page load → `fetch("/api/views/reports")` (in parallel with the
existing `/api/views` and `/api/leads-dashboard` calls) →
`runWithRepoContext(user, () => getAllReportEntries())` → dba → Content
Provider. All bodies are fetched up front (same approach as
dates/daily), so opening a report is purely client-side (no second
network call). Unchanged by Story 53.

## Zależność od Content Providera

All calls (`GetByNames2`, `GetItem`, `PostParentItem`, `Put`) are made
exclusively from `packages/dba/src/report-entries.ts` — the dashboard
API routes and pages never call the Content Provider directly, and the
client components never import `dba` (server-only, per
`documentation/dba/import-dba.md`).

## Cache/invalidation

None. `GET /api/views/reports` is called on every page load and on the
existing Refresh button (shared with Tracker/Dates/Leads).

## Edge cases

- Folder not found (fresh repo): `/api/views/reports` returns
  `success:false` with an explicit `reportsError`, rendered via the
  existing `ErrorBox` component — never silently shown as "no reports".
  Kept as a separate error state from the Tracker/Dates/Leads fetch, so a
  Reports-only failure doesn't block the rest of the Views page.
- Genuinely empty folder: shown as "No reports yet. Use Forms to add
  one." — visually distinct from the error state.
- Repeated Save clicks in the editor: safe — Create already happened once;
  every editor Save updates the already-known `loca` via `Put`, never
  `PostParentItem` again.
- Two reports with the same generated name (same date/kind/suffix,
  created twice): `createReportEntry`'s `nextAvailableName` appends `b`,
  `c`, ... — without this, `PostParentItem`'s find-or-create semantics
  would silently resolve to the same existing item.

## Ograniczenia

- Views/Reports is editable as of Story 56 (Preview + Editor + Save,
  same update endpoint Forms uses) — this is now a deliberate exception
  to the otherwise read-only nature of Tracker/Dates views, not an
  oversight.
- No delete (Content Provider limitation, see dba doc).
- Once a report is created, its date/kind/suffix/generated name cannot be
  changed — by design (Story 53 requirement). To use a different
  date/kind/suffix, the user creates a new report.
- The two reports that existed before Story 53 (`"01"`, `"02"`) keep their
  old sequential names — no backfill to the new naming scheme was
  attempted (see `backlog/stories/53/04_todos.md`).

## Dalsze etapy

None planned — the "edit existing report from Views" idea from earlier
Stories was implemented in Story 56.

## Testing

See `backlog/stories/53/05_tasks_and_checklist.md` for the Story 53 rebuild's
verification, and `backlog/stories/56/05_tasks_and_checklist.md` for Story 56's
(metadata row reorg, recording panel + Move, the empty-body bug fix and
Views/Reports editability, navigation).
