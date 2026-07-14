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
  Unchanged by Story 53 — still read-only list + preview.
- dba layer: see `documentation/dba/features/report-entries.md`.

## Two-stage form (Story 53)

**Stage 1 — metadata panel** (rounded frame, shown first, before any
editor): top row has Date (`<input type="date">`), Report kind (Select:
Daygame `dg` / Nightgame `ng` / Organized party `op` / Other `other`), and
"Rest of the name" (free text, e.g. `galeria mokotów`); a second row below
has the read-only "Generated name" field immediately next to the
**Create** button (moved there per user feedback, so the name and the
action that commits it read together). Generated name recomputes live from
the three inputs above as `{YY-MM-DD}_{kind}_{suffix}` (e.g.
`26-05-06_dg_galeria mokotów`) via `generateReportName` in `forms/page.tsx`
(a separate function from the unrelated Actions form's
`generateActionTitle` — different kind union, different feature).

Clicking Create calls `POST /api/forms/reports` with
`{ content: "", itemName: <generated name> }` (no `loca`). On success:
- the metadata panel's date/kind/suffix inputs become `disabled`,
- the Generated name field switches from the live memo to the
  server-confirmed name (`reportItemName` state) — **this name is now the
  report's permanent identity**: there is no re-generate/rename path, and
  the date/kind/suffix inputs never become editable again for this report.
  Changing any of them requires creating a new report (Back to the Forms
  menu resets all report state via `resetReportsForm`).
- Stage 2 appears below the (now-locked) metadata panel.

**Stage 2 — editor**: the existing shared `TextEditorWithToolbar` component
(unchanged), stacked below the metadata panel inside the same
`EditorPageShell` column — two independent rounded frames (the metadata
panel uses the same `rounded-xl border bg-card shadow-sm` classes as
`DashboardPageShell`'s frame; `TextEditorWithToolbar` already renders its
own identical frame). Only the report's body content is editable here; its
own Save button calls `handleReportSave`, which always updates the
already-known `loca` (never `PostParentItem` again).

## Zmienione pliki

- `packages/dashboard/app/(dashboard)/dashboard/forms/page.tsx` — `"reports"`
  in `FormType`; state `reportDate`/`reportKind`/`reportSuffix`/
  `reportContent`/`reportLoca`/`reportItemName`/`reportSaving`/`reportSaved`/
  `reportError`; `generateReportName` helper; `handleReportCreate` (new) +
  `handleReportSave` (now update-only); two-stage render branch.
- `packages/dashboard/app/(dashboard)/dashboard/views/page.tsx` — `"reports"`
  in `ViewType`, a menu button, a `reports`/`reportsError`/
  `selectedReportLoca` state, and a render branch: a simple list (styled
  like the existing LEADS list) + the shared `PreviewContent` renderer
  (read-only) to show a selected report's body. Unchanged in Story 53.
- `packages/dashboard/app/api/forms/reports/route.ts` — `POST`; gained an
  `itemName` field (required when `loca` is absent).
- `packages/dashboard/app/api/views/reports/route.ts` — `GET`. Unchanged in
  Story 53.
- `packages/dba/src/report-entries.ts` (renamed from `actions-reports.ts`
  in Story 53), `packages/dba/src/index.ts` — `createReportEntry` now takes
  a caller-supplied `requestedName` instead of generating a sequential one,
  plus `nextAvailableName` collision handling (see dba doc).

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

- Reports view is **read-only** (open + display via `PreviewContent`) —
  no in-view editing, matching the read-only nature of the existing
  Tracker/Dates views.
- No delete (Content Provider limitation, see dba doc).
- Once a report is created, its date/kind/suffix/generated name cannot be
  changed — by design (Story 53 requirement). To use a different
  date/kind/suffix, the user creates a new report.
- The two reports that existed before Story 53 (`"01"`, `"02"`) keep their
  old sequential names — no backfill to the new naming scheme was
  attempted (see `documentation/stories/53/04_todos.md`).

## Dalsze etapy

None planned. A future "edit existing report from the Views page" would
call the already-implemented `updateReportEntry` via a small addition to
`/api/forms/reports` (already supports `loca`-based updates) — no dba
changes needed.

## Testing

See `documentation/stories/53/05_report.md` for exactly what was run and
verified for the Story 53 rebuild (data-layer `/invoke` checks vs.
browser click-through, and what wasn't verified).
