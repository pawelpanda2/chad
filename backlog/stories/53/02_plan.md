# Story 53 — Plan

## Context

Story 53 has two implementation parts:
1. The owner manually renamed the Content Provider's top-level `actions`
   folder to `views` (confirmed live against the local Content Provider,
   repo `21d11bdc-f1f4-44d1-b61a-3fa6b039c641`, port 12024 — root now has
   `views/{daily,dates,actions,reports}`, not `actions/*`). All code/docs
   that still say `actions/dates`, `actions/daily`, `actions/reports` must
   be updated to `views/*`, no leftover mixed model.
2. The Reports form must become a two-stage flow: a rounded metadata panel
   (date / kind / suffix / live-generated name / Create) first, then — only
   after a successful Content Provider create — a second panel with the
   existing shared editor, with the metadata now **permanently locked**
   (see "Generated name is an identity" below).

**Scope discipline (per explicit user feedback):** only touch what this
migration/rewrite requires. Any unused helper, stale comment, or tempting
refactor spotted along the way is **not** analyzed at length and **not**
fixed in passing — it gets one line in `04_todos.md` and nothing else.

## Part 1 — `actions/*` → `views/*` migration

Confirmed inventory (grepped the whole repo; `packages/console`,
`packages/net-content-provider`, and all `*.test.ts` have zero matches —
out of scope, not mentioned further).

**Files with a literal `"actions"` CP-path segment or an `actions/dates|daily|reports`
comment/string, to become `"views"`/`views/...`:**
- `packages/dba/src/leads.ts` — `getAllDateEntries`/`getAllDailyEntries`/
  `saveDateEntry`/`saveDailyEntry` and their doc comments; local var names
  `actionsResult`/`actionsLoca` → `viewsResult`/`viewsLoca`.
- `packages/dba/src/actions-reports.ts` → renamed (see naming decision below).
- `packages/dba/src/index.ts` — 1 export line, updated to match the rename.
- `packages/dashboard/app/api/forms/date-entry/route.ts`,
  `daily-entry/route.ts`, `forms/reports/route.ts`,
  `views/reports/route.ts` — comments and the `path: "actions/..."`
  strings in JSON responses.
- `packages/dashboard/app/(dashboard)/dashboard/forms/page.tsx` — 3 toast
  fallback strings + 1 comment.
- `packages/dashboard/app/(dashboard)/dashboard/views/page.tsx` — 1 comment.
- `packages/dashboard/app/api/flow/cp-flow.ts` — the `'actions','dates'`/
  `'actions','daily'` literals in `getDateEntryRecords`/`getDailyEntryRecords`/
  `saveDateEntryForm`/`saveDailyEntryForm` get the same string swap, nothing
  more. (One-line note only: these four functions aren't imported anywhere
  in the repo — noted in `04_todos.md`, not removed, not otherwise
  touched.) `saveActionForm`/`getCurrentUserForms` in the same file use an
  unrelated `'forms','actions'` path — not part of this migration, not
  touched.

**Docs to update** (same string swap):
`documentation/dashboard/views/features/views-tracker.md`,
`documentation/dashboard/forms/features/daily-tracker-dates.md`,
`documentation/dashboard/views/features/views.md`,
`documentation/dashboard/forms/features/reports-form.md`,
`documentation/dba/features/actions-reports.md` (renamed, see below),
`documentation/ai-docs/what-and-where.md` (2 lines).

Not touched: `documentation/dba/bugs/getlist-valuetuple-and-date-entries-mismap.md`
(historical bug report quoting old literal args — rewriting it would
falsify the record; one added sentence noting the later rename is enough).

### Naming decision: `actions-reports.ts` → `report-entries.ts` (not `views-reports.ts`)

Per feedback: the filename must describe the module's *responsibility*,
not today's physical/logical CP path. `reports.ts` is the natural name by
responsibility, but it's **already taken** — `packages/dba/src/reports.ts`
is a real, pre-existing, unrelated feature (`GetReports`/`GetReportByName`
against a different root-level `reports` folder with existing unrelated
data, confirmed in `documentation/dba/features/actions-reports.md`'s own
header). So a plain rename to `reports.ts` is a genuine name collision.

The module already exports `ReportEntryItem`, `createReportEntry`,
`updateReportEntry`, `getAllReportEntries` — it's already named around the
concept of a "report entry", the same convention `leads.ts` uses for
`DateEntryItem`/`DailyEntryItem`/`getAllDateEntries`/`saveDateEntry`. So the
new filename is **`packages/dba/src/report-entries.ts`** — describes the
responsibility (CRUD for report entries), matches the existing exported
symbol names, avoids the collision, and doesn't derive from the `views`
path. Doc file renamed to match:
`documentation/dba/features/report-entries.md`.

## Part 2 — Reports form rewrite

**Reuse, no new shared components:**
- `EditorPageShell` (outer full-height column) — doesn't force a single
  frame, right wrapper for two stacked panels.
- The exact rounded-frame classes already standardized in
  `DashboardPageShell` (`rounded-xl border bg-card shadow-sm`, `p-[10px]`)
  for the new metadata panel (`shrink-0`, not `flex-1` — fixed height).
- `TextEditorWithToolbar` unchanged for the editor panel — already renders
  its own rounded frame and fills remaining height, matching the prompt's
  ASCII layout exactly.
- The existing `generateActionTitle`/`generateActionDate` pattern in
  `forms/page.tsx` (~line 177-188) as the model for a new, separate
  name-generation helper for Reports: same `{YY-MM-DD}_{kind}_{suffix}`
  shape, 4 kinds (`dg`/`ng`/`op`/`other`) instead of 2. Kept as its own
  function, not a widened `generateActionTitle` — that one belongs to the
  unrelated "Actions" form and its `'dg'|'ng'` union must stay as-is.

**State model** (alongside existing `reportContent`/`reportLoca`/
`reportSaving`/`reportSaved`/`reportError`):
- New: `reportDate` (YYYY-MM-DD, default today), `reportKind`
  (`"dg"|"ng"|"op"|"other"`, default `"dg"`), `reportSuffix` (free text).
- `reportLoca !== null` is reused as the "created" signal — before create,
  the metadata panel is editable and there is no editor panel; after
  create, metadata is locked and the editor panel appears.

**Generated name is an identity, not a live-recomputed display, once created:**
- Before Create: the generated name is a `useMemo` over
  date/kind/suffix — recomputes live as the user edits any of the three, per spec.
- On Create success: the server-confirmed name (see collision handling
  below) is stored in a separate piece of state (`reportItemName`) and
  becomes the value shown from then on. Date/kind/suffix inputs become
  `disabled`, and the memo is no longer read for display — the locked
  `reportItemName` is. There is **no** rename/re-generate path for an
  existing report: to change date/kind/suffix, the user creates a new
  report (matches "Reset"/back-to-menu already resetting all report state).

**Create flow:**
- New handler `handleReportCreate`: calls `POST /api/forms/reports` with
  `{ content: "", itemName: <generated name> }` (no `loca`). On success,
  sets `reportLoca` and `reportItemName` from the response (locking the
  panel, revealing the editor, empty content ready to type). Editor's
  existing `handleReportSave` → `updateReportEntry` flow is unchanged.
- API contract: `POST /api/forms/reports` gains `itemName`, required when
  `loca` is absent. `createReportEntry(content, itemName)` in
  `report-entries.ts` uses the passed name instead of `generateEntryName`,
  checks `folder.children` for a collision and appends `b`, `c`, ... on
  conflict (same "same-day suffix" convention already documented in
  `views.md`), and returns the actually-used name so the client can display
  it if it differs from what was requested.

**Render restructure** (`selectedForm === "reports"` branch):
```
<EditorPageShell>
  <toolbar row: Back + "Reports" label + error>          (unchanged)
  <metadata panel: rounded-xl border bg-card shadow-sm, shrink-0, p-[10px]>
     Date | Kind select | Suffix | Generated name (readOnly)
     [Create] button, hidden once reportLoca is set; inputs disabled once set
  </metadata panel>
  {reportLoca && <TextEditorWithToolbar ... />}            (unchanged component)
</EditorPageShell>
```

## Files touched (summary)

- `packages/dba/src/leads.ts` (edit)
- `packages/dba/src/actions-reports.ts` → `packages/dba/src/report-entries.ts` (rename + edit)
- `packages/dba/src/index.ts` (edit, 1 line)
- `packages/dashboard/app/api/forms/{date-entry,daily-entry,reports}/route.ts`, `app/api/views/reports/route.ts` (edit)
- `packages/dashboard/app/api/flow/cp-flow.ts` (edit, string swap only)
- `packages/dashboard/app/(dashboard)/dashboard/forms/page.tsx` (edit: Part 1 strings + full Part 2 rewrite of Reports render/state/handlers)
- `packages/dashboard/app/(dashboard)/dashboard/views/page.tsx` (edit, 1 comment)
- Docs: `views-tracker.md`, `daily-tracker-dates.md`, `views.md`, `reports-form.md`, `actions-reports.md`→`report-entries.md`, `what-and-where.md`
- `documentation/stories/53/04_todos.md`, `documentation/ai-docs/knowledge/01_story-standard.md` (new)

## Verification (mandatory full UI click-through, not just build/typecheck)

1. `tsc --noEmit` (dba, dashboard) and `next lint` — baseline hygiene only,
   not reported as "tested".
2. Add a short new category to `what-and-where.md` for
   `documentation/stories/<N>/` so future stories are discoverable from the
   index, distinct from the existing per-package `features/`/`bugs/` docs.
3. Direct `/invoke` checks against the real local Content Provider
   (`localhost:12024`, repo `21d11bdc-...`) for the new `report-entries.ts`
   create/collision-suffix logic, mirroring what was already done for
   `views/dates` and `views/daily` during research.
4. **Mandatory real browser click-through** of the exact user scenario,
   using the `run`/`verify` skill to launch the dashboard dev server and
   drive it:
   1. Open Forms
   2. Select Reports
   3. Pick a date
   4. Pick a report kind
   5. Type a suffix
   6. Confirm the generated name updates live
   7. Click Create
   8. Confirm the metadata fields are now locked
   9. Confirm the editor panel appears
   10. Type report content
   11. Click Save
   12. Go to Views
   13. Select Reports
   14. Open the just-created report
   15. Confirm the content matches what was saved
   If any step can't be executed (e.g. no working login/session available
   in this environment), `05_report.md` will say exactly which step and
   why — never "verified" for anything beyond what was actually driven
   end-to-end.

## Story-53 documentation to finalize at the end

`05_report.md` (full account, including which verification steps actually
ran), `03_knowledge.md` (updated for final filenames), `04_todos.md`
(deferred items only), and `what-and-where.md` patched for the
`report-entries.md` filename and the new `documentation/stories/`
convention.
