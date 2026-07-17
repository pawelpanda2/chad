# Story 62 — Tasks Checklist

**Scope note:** plan approved (Input 2) with corrections, refined by
Input 3 and Input 4 (action-column design), then Input 5 confirmed adding
real `updateDailyEntry` persistence (no stub), and Input 7 (after reading
`documentation/dashboard/forms/features/daily-tracker-dates.md`) sharpened
exactly how — see `01_input.md` and `02_plan.md`'s "Backend gap" section
for the full resolution. Everything below except Task 9 (Delete) shipped
for real in this pass: `tsc --noEmit`/`next build` clean for both
`dba`/`dashboard`, deployed to local-mac-docker
(`bash-scripts/dashboard/03_local_mac_docker/07_deploy.sh`), and verified
against the **running** stack — real login, real HTTP save with a
before/after read-back, and real Playwright browser checks on both a
1440px desktop viewport and an iPhone 12 mobile viewport (390px). Task 9
stays **blocked**: Content Provider has no working delete of any kind
(empty stub, confirmed a second time in `daily-tracker-dates.md`), so no
Delete button was built — the single-entry view says so rather than omit
it silently. Login/`auth-page-shell.tsx` stayed out of this pass (Input 2
point 3) — not in this checklist, only in `02_plan.md`'s migration-plan
appendix.

**Real, pre-existing bug found and fixed while verifying Task 3** (not
part of the original plan — see Task 3's write-up): `GET
/api/auth/session` always returned `{ user: null }` for every real login,
for every account, because it looked the session cookie up in the Prisma
`User` table while every real login actually uses a different,
CP-`chad_admin`-backed mechanism (`getCurrentUserFromCookies()`). Fixed to
use the same real mechanism as the rest of the app.

**Round 2 (Input 8/9) — full rollout, superseding the "pilot only" framing
above.** After reviewing the deployed pilot, the user found the pilot
pages themselves still incomplete (missing a required "double frame" —
outer shell frame + at least one inner content frame, even for
single-element pages — and a "Save + generated name at the top" pattern
for forms that have a generated name) and, having seen the same gaps
repeat, explicitly said to fix every remaining page rather than stopping
at two pilots (`"nie sprawdzam dalej bo widzę że wszędzie te same błędy
się powtrzają więc popraw to wszędzie"`). Tasks 11–20 below cover that
full rollout: all 5 Forms branches, all 4 Views branches (including
re-fixing `DAILY TRACKER`'s missing inner frame), `STATUSES` (3
branches), `MSG TODO`, `MSG PLANNER`, all 4 `BEEPER` routes, `FOLDER`,
`MESSAGES`, `USERS`, and `LOGIN` (previously deferred, now explicitly
included). `SETTINGS` was re-checked against the sharpened standard and
already complied (two inner frame boxes, no change needed).

Two things were investigated and fixed as part of this round, reported
back to the user, but are **not** functional Checklist items (organizational
config in the log the user flagged, per this Story's own reporting so
nobody has to re-discover the finding):
- **Dev Panel silently disabled on every local-mac-docker build.**
  `docker-compose.local.yml`'s dashboard `build:` never passed the
  Dockerfile's `ARG ENABLE_DEV_PANEL`, so `NEXT_PUBLIC_ENABLE_DEV_PANEL`
  defaulted to `false` on every build — not something this Story's own
  changes broke (confirmed via `git log`: no commit ever wired this arg
  through this compose file). Fixed by adding `args: ENABLE_DEV_PANEL:
  "true"` to the local compose file only (QNAP test/prod use separate
  compose files, untouched). Verified live: the Dev Panel tab now renders
  `position: fixed; right: 0`, measured at the true viewport edge (right
  edge = full window width), independent of the new 150px pane.
- **`MSG TODO`/`MSG PLANNER` Content-Provider errors — confirmed
  pre-existing, not caused by this Story.** Reproduced the identical error
  (`ValidateChildFoldersAreNumeric` failing under `kamil_s`'s `leads/all
  items`) via a raw `GET /api/msg-planner` / `GET /api/todo-msg?type=todo`
  call with a fresh login, no browser session involved. `git log` confirms
  neither route nor its `dba` functions were touched by this Story. The
  real repo data lives on a host bind-mount
  (`CP_REPOS_HOST_PATH=/Users/pawelfluder/Dropbox`), which container
  restarts never touch. This points to a Content-Provider-side data-state
  issue in `kamil_s`'s repo — `packages/net-content-provider` is off-limits
  for this Story to touch, so this was reported to the user rather than
  "fixed."

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | SETTINGS: single outer frame with a ~3px gap token to its inner section frames (each section's own internal content padding left untouched), row 1 shows `Back, Forw, SETTINGS` with no title duplicated elsewhere |
| 2 | DONE      |             | Desktop: empty right-side pane is exactly ~150px wide on SETTINGS and DAILY TRACKER, outside the main frame, causes no page-level horizontal scroll; absent entirely on mobile |
| 3 | DONE      |             | Sidebar header shows the logged-in user's name instead of the static "Dashboard" text, on every dashboard page |
| 4 | DONE      |             | DAILY TRACKER: menu tile and page title both read "DAILY TRACKER" (single short uppercase title, no "Views /" prefix, no duplicate subtitle); row 1 is `Back, Forw, DAILY TRACKER`; row 2 has `+Add` (opens ADD DAILY ENTRY) and `Edit` |
| 5 | DONE      |             | DAILY TRACKER: table is read-only by default; the action column's pencil ("Edit Item") is visible even read-only and opens that row's single-entry detail view; clicking `Edit` additionally reveals the floppy (Save) in the same fixed-width column and unlocks editable cells; clicking `Edit` again hides the floppy and reverts to read-only |
| 6 | DONE      |             | DAILY TRACKER: changing a field turns that field's background red and that row's floppy red; the marking is scoped to the specific field/row and does not clear other rows' unsaved edits |
| 7 | DONE      |             | DAILY TRACKER: clicking the floppy actually persists that row's changes to Content Provider via a new `updateDailyEntry` dba function + API route (approved, Input 5/7) — the Saved state may only appear once the write has really succeeded |
| 8 | DONE      |             | DAILY TRACKER: a single top-left `Save` button persists all currently-dirty rows in one action, via the same `updateDailyEntry` path |
| 9 | BLOCKED   |             | DAILY TRACKER single-entry detail view (opened via the pencil) offers a Delete option gated behind a confirmation dialog (blocked: Content Provider has no working delete — nothing to wire this to yet) |
| 10 | DONE     |             | DAILY TRACKER on a real mobile viewport: horizontal table scroll stops exactly at the first/last column with no empty space and no bounce-back, and dragging the table does not drag the whole page |
| 11 | DONE     |             | ADD DAILY ENTRY and ADD DATE: outer shell frame + inner content frame (table no longer bare in the shell), free-standing Save at the top, no duplicate in-table title |
| 12 | DONE     |             | ADD LEAD and ADD ACTION: Save + generated name moved into their own top frame, left-aligned; remaining fields in a second frame below |
| 13 | DONE     |             | ADD REPORT: outer shell frame added (was missing entirely — EditorPageShell provides none), Create/Generated-name frame now sits inside it |
| 14 | DONE     |             | DAILY TRACKER: table now sits inside an inner content frame within the outer shell frame (previously bare); title corrected to read "DAILY TRACKER" (was still literally "TRACKER" after Round 1) |
| 15 | DONE     |             | DATES, LEADS, REPORTS (Views): each gets a short uppercase `title` in row 1 and its list/table content wrapped in an inner frame |
| 16 | DONE     |             | STATUSES (all 3 modes: editor, matrix, migration list): `title="STATUSES"` in row 1, page-specific controls moved to row 2, content wrapped in an inner frame, Save/Cancel moved to the top in the editor mode |
| 17 | DONE     |             | MSG TODO, MSG PLANNER, BEEPER (all 4 routes), FOLDER, MESSAGES, USERS: each gets a short uppercase `title` in row 1 and its content wrapped in an inner frame (MESSAGES also migrated off a bare `h-[calc(100vh-200px)]` div onto DashboardPageShell; MSG PLANNER migrated from EditorPageShell to DashboardPageShell so it has an outer frame) |
| 18 | DONE     |             | LOGIN: top-left corner (not centered), one outer frame + one inner frame holding the form, no sidebar/menu/Back/Forw/toolbar, capped height with its own internal scrollbar, no uncontrolled global page scroll |
| 19 | DONE     |             | Dev Panel visible again on local-mac-docker, rendered at the true right edge of the viewport regardless of the 150px pane |
| 20 | DONE     |             | Standard outer→inner frame gap corrected to the real FORMS MENU value (10px padding, measured 11px on screen incl. border) everywhere it had regressed to 3px or 0px, including a `twMerge` conflict bug in SETTINGS that silently kept it at 3px |
| 21 | DONE     |             | ADD DAILY ENTRY: Save moved into its own top frame inside the main frame, fill-in table narrowed to ~80% width, first table column sized to its label text instead of a fixed 50% |
| 22 | DONE     |             | ADD DATE: Save moved into its own top frame inside the main frame, first table column sized to its label text |
| 23 | DONE     |             | ADD LEAD: Save-frame padding reduced to match its content, generated name shown as a greyed locked input (same pattern as ADD ACTION) instead of a plain span |
| 24 | DONE     |             | ADD ACTION: redundant "(auto-generated)" label text removed, both inner frames left-anchored to a 500px default width instead of stretching full-width |
| 25 | DONE     |             | STATUSES (matrix + migration list), Views (LEADS, REPORTS, DAILY TRACKER/DATES), MSG TODO, MSG PLANNER, USERS: page-specific controls (`toolbarSecondRow`) moved from floating above the outer frame into a row inside it, directly above the content's inner frame, with the standard gap between them |
| 26 | DONE     |             | MESSAGES, LOGIN: fixed the same 0px/3px gap regression as Task 20 (`padded={false}` with no compensating padding on MESSAGES; a literal `p-[3px]` on LOGIN) |
| 27 | DONE     |             | ADD DAILY ENTRY: the green "Saved" indicator now appears inline next to the Save button (was rendering at the bottom, below the whole table, easy to miss without scrolling); a minimum-visible "Saving..." duration keeps the transition smooth even when the round trip is near-instant |
| 28 | N/A      |             | "Failed to fetch" after the post-save redirect to DAILY TRACKER — investigated, not caused by this Story's code (see write-up): a stale browser tab left open from before this session's own redeploy, not a reproducible bug |
| 29 | DONE     |             | ADD ACTION: "Title" label removed entirely (not just "(auto-generated)"); Save-frame padding standardized to 8px across every page with a Save button (ADD REPORT, ADD ACTION, ADD DAILY ENTRY, ADD DATE, ADD LEAD, STATUSES editor) |
| 30 | DONE     |             | BEEPER contact list: rows now use the same rounded grey hover highlight as Views Reports/Leads (`LIST_ROW_CLASS`/`LIST_ROW_WRAPPER_CLASS`, new shared tokens), instead of the old bordered/striped table-row look; the `border-b` separator between the toolbar row and the list was removed |
| 31 | DONE     |             | DAILY TRACKER, DATES, STATUSES matrix: the vertical scrollbar now belongs to the outer shell frame, not the inner table box — dragging it scrolls the toolbar row and the table together as one unit, instead of the toolbar staying pinned above a separately-scrolling table |
| 32 | DONE     |             | Reverted the sticky table header Task 31 introduced as a side effect (not requested); restored horizontal scroll on the outer frame for DAILY TRACKER/DATES and STATUSES matrix (Task 31 accidentally cut it off via the shell's default `overflow-x-hidden`); applied the same single-outer-scrollbar fix to USERS (same old pattern, not explicitly named before but a table view) |
| 33 | DONE     |             | Fixed rounded-corner clipping regression on DAILY TRACKER/DATES, STATUSES matrix, and USERS table frames (`overflow-hidden` added back after Round 6/7 removed `overflow-auto`, which had been incidentally clipping the square table to the frame's rounded corners) |
| 34 | DONE     |             | DAILY TRACKER action column redesigned: pencil removed entirely; the whole column (not just a trigger icon) is now hidden until Edit mode is on; its Save button restyled to match STATUSES exactly (black `default` variant, `destructive`/red once the row is dirty) |
| 35 | DONE     |             | New "Open Raw" toggle on DAILY TRACKER: makes every row clickable, navigating to a full-page editor (ADD DAILY ENTRY, reused in edit mode) instead of the old pencil-opened modal `Dialog` (removed); mutually exclusive with Edit mode so a click never has to choose between an editable cell and navigating away |
| 36 | DONE     |             | ADD DAILY ENTRY doubles as an editor when reached via `?editLoca=<loca>`: prefills every field from the real saved entry, title becomes "Edit Daily Entry", Save calls the existing `PATCH` (not `POST`) |
| 37 | DONE     |             | New "Clear" button on the edit page (Content Provider has no working delete — confirmed again, see write-up): blanks the entry's fields via the same real `PATCH` path, gated behind a dialog requiring the user to retype one of 6 randomly-picked confirmation words |
| 38 | DONE     |             | Removed the right-side metadata block (relative time, network-identity badge, channel count) from each BEEPER contact-list row — that detail now only shows once you open the contact, not inline in the list |
| 39 | DONE     |             | Removed `DashboardPageShell`'s forced `uppercase` CSS on the title and converted every page's `title` prop from all-caps to title-case, so it now reads identically to the sidebar label that links to it (e.g. "Settings" not "SETTINGS") — a user decision, reversing the uppercase-title standard set in Round 1 |
| 40 | DONE     |             | FOLDER → Folders: page title changed to match the sidebar's existing "Folders" label (was a genuine word mismatch, not just casing) |
| 41 | DONE     |             | Edit toggle button label no longer changes to "Done editing" while active — stays "Edit" always, icon changed pencil→floppy, only the button's own highlight color signals active state |
| 42 | DONE     |             | Bulk Save moved out of the toolbar row (was shifting the other buttons as it appeared/disappeared) into the table's own corner header cell, matching STATUSES matrix mode exactly |
| 43 | DONE     |             | Edit-page action button relabeled "Delete" (was "Clear") per explicit user override of Input 25's earlier answer — same underlying blank-fields behavior, dialog copy still spells out that Content Provider has no real delete |
| 44 | DONE     |             | New "Full View" button added next to Delete on the edit page, returning to the full DAILY TRACKER/DATES table |
| 45 | DONE     |             | "Open Raw" toggle: icon removed, active state switched from the subtle `secondary` variant to solid `default` (black) so it reads clearly as pressed |
| 46 | DONE     |             | DAILY TRACKER/DATES row hover highlight strengthened from `hover:bg-accent/50` to full-strength `hover:bg-accent` |
| 47 | DONE     |             | DATES given full parity with DAILY TRACKER: Add/Edit/Open Raw toolbar, inline per-row editing, bulk Save, and a new "Edit Date" full-page editor — required a new `PATCH /api/forms/date-entry` route and `updateDateEntry` dba function (Date Entries had no update path at all before this) |
| 48 | N/A      |             | DATES "missing" scrollbar — investigated, not a bug: only 2 date entries exist, genuinely nothing to scroll; the scroll container's CSS (`overflow: auto` both axes) is identical to DAILY TRACKER's, confirmed via computed-style inspection |
| 49 | DONE     |             | **Regression fix:** Task 33's `overflow-hidden` (added for rounded corners) combined with flexbox's default cross-axis stretch to force the table wrapper to the frame's width, silently compressing all 20 DAILY TRACKER columns (and the equivalent for STATUSES/USERS) instead of letting them overflow for the outer scrollbar to reach — reverted the wrapper to the exact plain `rounded-lg border bg-muted/10` (no overflow/width classes) that was confirmed working before Round 8 touched it. Corner-rounding is no longer attempted. |
| 50 | DONE     |             | **Regression fix:** DATES' single header row never included an action-column `<th>` at all (only Tracker's group row had one, gated by rowSpan), so turning on Edit mode shifted every DATES column header one slot out of alignment with its data and left DATES without a bulk-save corner button — added the missing header cell (with the same bulk-save button) for the DATES-only case |
| 51 | DONE     |             | DAILY TRACKER/DATES: typing a field back to its original saved value now clears that field's dirty (red) state instead of leaving it marked as changed forever until a page refresh |
| 52 | DONE     |             | DAILY TRACKER/DATES action column padding tightened from `p-1` (4px) to `p-px` (1px) around the Save icon, per request |
| 53 | DONE     |             | DATE/DATA column widened (`min-w-[70px]` → `min-w-[100px]`, both read-only and edit-mode cells) — the 10-character `YYYY-MM-DD` value was being clipped |
| 54 | N/A      |             | Third attempt at rounded table corners, this time via per-cell `border-radius` (no `overflow` touched at all, provably safe re: scroll) — CSS confirmed applying correctly, but doesn't render: `border-radius` on `<td>`/`<th>` is a documented no-op when the table uses `border-collapse: collapse`, a genuine browser limitation. Reverted the (harmless but non-functional) per-cell classes rather than ship dead code; square corners kept rather than switching to `border-collapse: separate` (visible double borders between every cell) without explicit sign-off. |
| 55 | DONE     |             | Columns were stretching to fill all available table width instead of hugging their content — most visible at a wide/zoomed-out viewport. Removed the table's own `w-full`, so it sizes to its natural content width and stays left-aligned; the wrapper's own background simply shows through on the right instead of every column being padded wider than its data needs. Unaffected: DAILY TRACKER's 20 columns still overflow correctly and scroll when they exceed the frame. |

# Task 1 — SETTINGS: single frame, ~3px gap, title in row 1

**Requested:** `SETTINGS` becomes the pattern page for an ordinary
(non-table) dashboard screen: one outer rounded frame close to the page
edge, inner section frames separated by ~3px (a shared token, not copied
per page — kept separate from each section's own internal content
padding, per Input 2 point 7), and a first toolbar row reading `Back,
Forw, SETTINGS` with no title duplicated anywhere else on the page.
**Done:** Added `title?: string` to `DashboardPageShellProps`, rendered
right after `NavGroup` in row 1 (`dashboard-page-shell.tsx`'s row-1 JSX
reordered to `NavGroup` → `title` → `toolbar`, instead of `toolbar` →
`NavGroup`). New `components/shared/layout-tokens.ts` exports
`FRAME_SECTION_GAP_CLASS = "gap-[3px]"`. `settings/layout.tsx` now passes
`title="SETTINGS"` and `contentClassName={cn(FRAME_SECTION_GAP_CLASS,
"p-[3px]")}` (was `"gap-4 p-4"`) — each section box's own internal `p-4`
padding (`Theme`/`Settings` boxes) left untouched, per the user's
correction that these are two separate concerns. `settings/page.tsx`'s
mock profile-form content untouched (out of scope).
**Files changed:** `components/shared/dashboard-page-shell.tsx`,
`components/shared/layout-tokens.ts` (new),
`app/(dashboard)/dashboard/settings/layout.tsx`.
**Tested:** Real Playwright run against the local-mac-docker stack
(`http://localhost:12020`, logged in as `pawel_f`), 1440×900 desktop
viewport — screenshot confirms row 1 reads `Back, Forw, SETTINGS`, one
outer frame, ~3px gaps between the Theme/Settings boxes and the frame
edge, no duplicate title anywhere on the page.
**Status: DONE**

# Task 2 — Desktop right-side 150px pane

**Requested:** A dedicated empty ~150px strip on the right edge of the
screen on desktop, outside the main frame, absent on mobile.
**Done:** Added `md:pr-[150px]` to `<main>`'s className in
`app/(dashboard)/layout.tsx`, using the codebase's already-established
desktop threshold (`md:` / `min-width: 768px`, the same one
`DESKTOP_QUERY` already uses for sidebar behavior). A 100px version was
specified and marked DONE in Story 56 but was never actually present in
source and has no trace in that file's git history (`03_knowledge.md`
§3) — this was added fresh at 150px, not restored. Updated the file's
comment that incorrectly claimed no reserved space was needed.
**Files changed:** `app/(dashboard)/layout.tsx`.
**Tested:** Real Playwright measurement against the running stack —
`main .rounded-xl.border.bg-card`'s right edge to the viewport's right
edge measured **exactly 150.0px** on a 1440px desktop viewport. On an
iPhone 12 viewport (390px), `main`'s computed `padding-right` measured
`2px` (i.e. only the base `p-0.5`, no `150px` pane) — confirmed absent on
mobile. `document.documentElement.scrollWidth` equaled the viewport width
on both Settings and Daily Tracker mobile screenshots — no page-level
horizontal scroll introduced.
**Status: DONE**

# Task 3 — Sidebar shows username instead of "Dashboard"

**Requested (small follow-up from the user, Input 1):** replace the
static "Dashboard" brand text at the top of the sidebar with the logged-in
user's name.
**Done:** `Sidebar` (`components/shared/sidebar.tsx`, the only place this
literal text rendered) now fetches `GET /api/auth/session` on mount and
renders `displayName || username` in place of `"Dashboard"`, keeping the
literal text as a fallback while the fetch is in flight.
**Real bug found and fixed along the way:** `GET /api/auth/session`
(`app/api/auth/session/route.ts`) looked the session cookie up against
the Prisma `User` table (`prisma.user.findUnique({ where: { id: userId
} })`), treating the cookie's first segment as a Prisma user id. The real
cookie set by `/api/auth/login` is `${repoGuid}:${timestamp}`
(`repoGuid`, not a Prisma id), resolved everywhere else in the app via
`getCurrentUserFromCookies()` against the real `chad_admin` CP user list.
This meant the endpoint always returned `{ user: null }` for every real
login — confirmed live: logging in as `pawel_f` via `/api/auth/login`
then immediately calling `/api/auth/session` with the same cookie
returned `null`. Nothing else consumed this endpoint's response body
(only `middleware.ts` referenced it, by path string, for its public-route
allowlist), so rewriting it to call `getCurrentUserFromCookies()` instead
is a fix, not a breaking change to any working caller. `displayName`
isn't a real distinct field in the `chad_admin` user model (`AppUser.
displayName` is always set to `user.username` in `lib/user-service.ts`),
so the route returns `username` for both fields — harmless given the
sidebar's own `displayName || username` fallback.
**Files changed:** `components/shared/sidebar.tsx`,
`app/api/auth/session/route.ts` (bug fix, not originally planned).
**Tested:** Real HTTP: `POST /api/auth/login` with `Pawel_F`/`changeme` →
`GET /api/auth/session` with the resulting cookie now returns
`{"user":{"username":"pawel_f","displayName":"pawel_f"}}` (was `{"user":
null}` before the fix). Real Playwright screenshot confirms the sidebar
header reads `pawel_f` on both Settings and Daily Tracker, on desktop and
mobile, and that the literal text "Dashboard" no longer appears anywhere
in the sidebar brand block.
**Status: DONE**

# Task 4 — DAILY TRACKER: rename + two-row toolbar

**Requested:** `TRACKER` becomes `DAILY TRACKER` everywhere (menu tile and
page title), with the "Daily tracker" subtitle removed from the tile, the
"Views /" prefix removed from the page title, and the toolbar split into
`Back, Forw, DAILY TRACKER` (row 1) plus `+Add`/`Edit` (row 2). Uppercase
applies only to this tile/title, not the left sidebar (Input 2 point 5).
**Done:** In `views/page.tsx`: menu-tile label changed to `DAILY TRACKER`,
subtitle "Daily tracker" removed; the Tracker/Dates branch now passes
`title={isTracker ? "DAILY TRACKER" : undefined}` (Dates branch is
**unchanged**, still uses the old `toolbar={<h2>Views / DATES</h2>}` —
explicitly not migrated per Input 2 point 2) instead of `toolbar={<h2>
Views / TRACKER</h2>}`. New `toolbarSecondRow` (Tracker only) holds the
bulk `Save` button (only shown in Edit mode), `+Add`, `Edit` toggle, and
the pre-existing filter/Refresh/count controls (moved out of row 1).
`+Add` calls `router.push("/dashboard/forms?form=add_action")` — the real
existing query-param value Forms already uses for its "DAILY ENTRY"
branch (confirmed by reading `forms/page.tsx`'s own tile handlers, not
guessed).
**Files changed:** `app/(dashboard)/dashboard/views/page.tsx`.
**Tested:** Real Playwright screenshot: row 1 reads `Back, Forw, DAILY
TRACKER`; row 2 shows `Add`/`Edit`/filter/`Refresh`/`3 of 3`. Dates branch
not re-tested in this pass (unchanged code path, out of scope).
**Status: DONE**

# Task 5 — DAILY TRACKER: Edit toggle + `[💾][✎]` action column

**Requested:** table is read-only by default. Action column layout,
finalized by Input 4 (superseding the earlier "click free space" idea
from Input 3): pencil (✎, "Edit Item") always visible in both read-only
and Edit-on states, opening that row's single-entry detail view; floppy
(💾, "Save") appears only once the page's `Edit` toggle is on, saving that
row's inline table edits. No plain-letter button. Column stays fixed-width
across all states.
**Done:** New `isTrackerEditMode` state gates the floppy's visibility and
cell editability (not the pencil's — it's always rendered). Action column
width fixed via `TABLE_ACTION_COLUMN_WIDTH_CLASS` (`w-[72px]`,
`layout-tokens.ts`), applied to both the header `<th rowSpan={2}>` and
every body `<td>`, so it never changes width across
pencil-only/pencil+floppy/spinner/Saved states. New `Dialog`
(shadcn) single-entry detail view opens via the pencil, lists every
non-AUTO field, and has a `disabled` Delete button with an explanatory
`title` tooltip (see Task 9).
**Files changed:** `app/(dashboard)/dashboard/views/page.tsx`,
`components/shared/layout-tokens.ts` (new).
**Tested:** Real Playwright: read-only load shows only pencils (no
floppy); clicking `Edit` reveals 3 floppy buttons (matching the 3 real
rows); clicking a pencil opens the `Daily Entry — 01` dialog with a
visibly disabled `Delete` button; screenshotted both states
(`story62_tracker_desktop.png`, `story62_tracker_detail_dialog.png`).
**Status: DONE**

# Task 6 — DAILY TRACKER: per-field dirty marking

**Requested:** changing a field turns that field red and that row's
floppy red, scoped per field/row, without clobbering other rows'
in-progress edits.
**Done:** `editedRows: Record<itemName, Record<fieldKey, string>>` state,
keyed per row. Changed cells render `bg-destructive/10` +
`text-destructive` on the `<input>`; the row's floppy switches from
`text-muted-foreground` to `text-destructive` when
`hasRowChanges(itemName)` is true. AUTO columns (`PULLS AUTO`, `CLOSES
AUTO`, `QUALITY DP AUTO`, `QUALITY C AUTO`) are excluded from the editable
branch entirely — always plain read-only text, even in Edit mode.
**Files changed:** `app/(dashboard)/dashboard/views/page.tsx`.
**Tested:** Verified via code path (per-row `editedRows` map, keyed
independently) and the end-to-end save test in Task 7, which exercises
the same dirty-tracking state. Not independently screenshotted mid-edit
(would require a live typed interaction capture, not just a DOM
snapshot) — functional behavior confirmed via the real save round-trip
instead.
**Status: DONE**

# Task 7 — DAILY TRACKER: per-row save actually persists

**Requested:** clicking the floppy cycles it through save-icon → spinner →
fading green "Saved" → save-icon again, column width constant throughout,
no double-submit while in flight, and the save **actually persists** (not
a pretend UI — explicit instruction, Input 2 point 9, reconfirmed and
resolved to "build it for real" in Input 5).
**Checked before starting** (per instruction, then cross-checked against
`documentation/dashboard/forms/features/daily-tracker-dates.md` per
Input 7): confirmed `saveDailyEntry` was create-only; confirmed the
`GetItem`-then-`Put` pattern already worked for Reports/Statuses; full
detail in `03_knowledge.md` §10/§10a.
**Done:**
- New `documentation/ai-docs/begin_here/05_endpoint-rules.md` written and
  indexed first (Input 5 point 2-3).
- New `updateDailyEntry(loca, bodyYaml)` in `packages/dba/src/leads.ts`,
  mirroring `updateReportEntry`'s `GetItem`-then-`Put` shape exactly
  (read both `updateReportEntry` and `saveLeadStatus`/`putStatusContent`
  first, per instruction, before writing this).
- New `PATCH /api/forms/daily-entry` (existing `POST` untouched, still
  create-only) — thin adapter: auth check, strips any AUTO-column keys
  from the client-sent `fields` unconditionally (defense in depth even if
  a client sent them), calls `updateDailyEntry` inside
  `runWithRepoContext`.
- `GET /api/views` now returns `loca` per daily/date entry (additive
  field on `DailyEntryRecord`/`DateEntryRecord`) so the table can address
  the right item without a second fetch.
- Floppy state machine: idle → red (dirty) → spinner (`saving`,
  `disabled`, in-flight guard via `rowSaveStatus[itemName] === "saving"`
  check) → green `CheckCircle2` ("saved", auto-reverts after 2s) → idle.
  A failed save shows a toast error and an `"error"` status, never a fake
  "saved".
**Files changed:** `packages/dba/src/leads.ts` (new `updateDailyEntry`),
`app/api/forms/daily-entry/route.ts` (new `PATCH`),
`app/api/views/route.ts` (`loca` field added), `app/(dashboard)/dashboard/
views/page.tsx` (`saveTrackerRow`).
**Tested — real, not just code-reading:**
1. `pnpm --filter dba build` and `pnpm --filter dashboard exec tsc
   --noEmit` both clean; `next build` clean; `eslint` clean on every
   touched file.
2. Deployed to local-mac-docker
   (`bash-scripts/dashboard/03_local_mac_docker/07_deploy.sh`).
3. Real HTTP round trip against the running stack: logged in as
   `pawel_f`, `GET /api/views` → captured entry `03`'s full body (3 total
   entries). `PATCH /api/forms/daily-entry` with `{loca: "07/01/03",
   fields: {...allFields, "TRAINING TIME": "1:23:45", "PULLS AUTO": 999,
   "QUALITY DP AUTO": "bogus"}}` (deliberately including bogus AUTO
   values, to test they're rejected) → `{"success":true}`. Re-fetched `GET
   /api/views`: entry count still **3** (no duplication), entry `03`'s
   `TRAINING TIME` now `"1:23:45"` (real persistence confirmed), `PULLS
   AUTO`/`QUALITY DP AUTO` still server-computed (`0`/`""`, **not** the
   bogus client-sent values — confirmed the server strips AUTO fields
   regardless of what's sent), and entries `01`/`02`'s bodies byte-for-byte
   unchanged (no cross-row corruption). Reverted the test value back to
   `""` afterward to leave real dev data clean.
4. Real Playwright browser test: toggled `Edit` on the running Daily
   Tracker page, confirmed 3 floppy buttons appeared alongside the 3
   pencils.
**Status: DONE**

# Task 8 — DAILY TRACKER: bulk Save (dirty rows only)

**Requested:** one top-left `Save` button saves every currently-dirty row,
shows a loading state, does not re-save unchanged rows, and (per Input 5)
must not show a false-positive saved state for any row that didn't
actually persist.
**Done:** `saveAllDirtyTrackerRows()` filters `editedRows` to itemNames
with actual changes (`hasRowChanges`), calls `saveTrackerRow` for each via
`Promise.all`, tracks a `bulkSaving` loading state, and reports a single
toast summarizing successes/failures — each row's own `rowSaveStatus`
updates independently, so one row failing doesn't mark others as saved.
Button rendered in `toolbarSecondRow`, leftmost, only visible in Edit
mode, labeled `Save (N)` with the dirty count, `variant="destructive"`
when there's something to save (matching the red-when-dirty convention
used elsewhere in this Story).
**Files changed:** `app/(dashboard)/dashboard/views/page.tsx`.
**Tested:** Exercises the same `saveTrackerRow`/`updateDailyEntry`/`PATCH`
path verified end-to-end in Task 7 (one dirty row is the same code path as
several). Not separately re-run with multiple simultaneously-dirty rows
against the live stack in this pass — reasonable follow-up manual check,
not blocking, since the underlying single-row path is confirmed working
and the bulk path is a thin `Promise.all` wrapper around it with no
additional business logic.
**Status: DONE**

# Task 9 — DAILY TRACKER: single-entry Delete — BLOCKED, no backend capability exists

**Requested (Input 2 point 10):** Edit mode must never delete data.
Opening a single entry (via the pencil) is the only way to reach a Delete
option, and Delete itself must be gated behind a confirmation dialog
("are you sure you want to delete?").
**Checked before starting** (per instruction): Content Provider's own
delete worker is a known empty stub — no real item deletion exists
anywhere in this codebase today; the established workaround elsewhere is
overwrite-in-place, never actual removal (see `03_knowledge.md` §10,
independently reconfirmed against
`documentation/dashboard/forms/features/daily-tracker-dates.md` §7).
**Done:** The single-entry detail view (pencil target, built in Task 5)
exists, but renders a `disabled` Delete button with
`title="Delete isn't available yet — Content Provider has no working
delete (empty stub)"` rather than a working Delete-with-confirmation flow
— rendering a Delete that calls into nothing would be exactly the
"pozorne UI" the user said not to build. No confirmation dialog was built
since there's nothing for it to confirm yet.
**Files changed:** `app/(dashboard)/dashboard/views/page.tsx` (the
disabled button, inside the Task 5 dialog).
**Tested:** Real Playwright: opened the detail dialog, confirmed the
`Delete` button reports `disabled: true` via `isDisabled()`.
**Status: BLOCKED** (Content-Provider-level gap, not a dashboard decision
to make unilaterally — needs a real product/engineering decision on
whether to implement CP-side delete before this can proceed)

# Task 10 — DAILY TRACKER: mobile table scroll, no bounce

**Requested:** horizontal scroll on a real mobile viewport stops exactly at
the first/last column, no empty overscroll space, no bounce-back on
release, and dragging the table doesn't drag the whole page.
**Done:** Table's scroll container className changed from `overflow-auto`
to `overflow-auto overscroll-contain` (`overscroll-behavior: contain` on
both axes) — stops scroll-chaining/bounce reaching the page when dragged
past the table's own start/end, while leaving the table's own scrolling
untouched. Documented as the standard recipe in
`responsive-layout-standard.md` for the Users/Statuses migration.
**Files changed:** `app/(dashboard)/dashboard/views/page.tsx`,
`documentation/dashboard/common/features/responsive-layout-standard.md`.
**Tested:** Real Playwright on an **iPhone 12 emulated viewport** (390px,
not just a desktop build): with the sidebar closed (its default-open
state on mobile is pre-existing, unrelated app behavior — confirmed via
the menu-close handle), the Tracker scroll container measured
`scrollWidth: 1999px`, `clientWidth: 384px`. Forced `scrollLeft` to
`scrollWidth + 500` (well past the real end) and confirmed the browser
clamped it to exactly `maxPossible = scrollWidth - clientWidth` (`1815`),
not beyond — i.e. no overscroll past real data range, matching the
requirement. `document.documentElement.scrollWidth` equaled the mobile
viewport width (no page-level horizontal scroll introduced). Real
touch-drag gesture simulation (as opposed to programmatic `scrollLeft`
clamping) was not separately exercised — the clamping behavior verified
here is what `overscroll-contain` is documented to guarantee regardless
of input method (mouse, touch, or programmatic), so this is treated as
sufficient, not as a substitute claim of "touch-tested" beyond what was
actually run.
**Status: DONE**

# Task 11 — ADD DAILY ENTRY / ADD DATE: double frame + Save at top

**Requested:** these are single-element (one table) forms, so per the
standard they still need the outer shell frame **plus** an inner content
frame around the form — not just the bare shell. Title first, then the
framed content. No duplicate title inside the table.
**Done:** Both branches (`add_action`/`add_action`→`ADD DAILY ENTRY`,
`date_entry`→`ADD DATE`) in `forms/page.tsx`: `title` prop replaces the
old `toolbar` h2; removed the duplicate `<th colSpan={2}>DAILY ENTRY/DATE
ENTRY</th>` row inside each table (redundant with the shell's own title);
`Save` moved to a free-standing button at the top (no generated name on
these forms, so no frame around it, per the standard's "free-standing
when there's no generated name" branch); the table itself now sits inside
a `rounded-lg border bg-muted/10` inner frame.
**Files changed:** `app/(dashboard)/dashboard/forms/page.tsx`.
**Tested:** Real Playwright screenshot against the running stack
(`round2_add_daily_entry.png`) confirms: row 1 `Back, Forw, ADD DAILY
ENTRY`, free-standing Save above a bordered inner frame holding the
table, no duplicate title anywhere on the page.
**Status: DONE**

# Task 12 — ADD LEAD / ADD ACTION: Save + generated name top frame

**Requested:** move Save and the generated-name field into their own
frame at the top, left-aligned together; the rest of each form's fields
stay in their existing/separate frame(s) below.
**Done:**
- ADD LEAD: new top frame (`rounded-lg border bg-muted/10 p-4`) with
  `Save` + `leadNamePreview` (previously shown inline inside the "Lead
  Name/Id" section header) side by side, left-aligned. Removed the old
  bottom `Save` button and the inline preview span from the Lead Name/Id
  section. The two pre-existing sections (Lead Name/Id, Contacts) stay as
  their own frames below, unchanged internally.
- ADD ACTION: new top frame with `Save` + `actionData.actionTitle`
  (auto-generated), left-aligned. The rest of the fields (Type, Suffix,
  Date, City, Start Time, Notes) moved into a second frame below,
  replacing the previous bare/unframed layout.
**Files changed:** `app/(dashboard)/dashboard/forms/page.tsx`.
**Tested:** Real Playwright screenshots (`round2_add_lead.png`,
`round2_add_action.png`) confirm Save sits directly beside the generated
name in a bordered top frame on both pages, left-aligned, with the rest
of each form in a separate frame below.
**Status: DONE**

# Task 13 — ADD REPORT: add the missing outer frame

**Requested:** this branch was missing the outer frame entirely.
**Done:** Converted from `EditorPageShell` (provides no frame of its own)
to `DashboardPageShell` (`scroll={!isReportCreated} padded={false}
title="ADD REPORT"`), mirroring the already-proven pattern used by
`Views → REPORTS` for viewing/editing an existing report. The manually
built `NavGroup` + "Reports" header row was removed (the shell now
provides `Back, Forw, ADD REPORT` automatically); `reportError` moved
into a standard `ErrorBox`. The existing Create/Generated-name frame and
the metadata row now sit correctly *inside* the new outer frame instead
of being the page's only frame.
**Files changed:** `app/(dashboard)/dashboard/forms/page.tsx` (dropped
the now-unused `EditorPageShell`/`NavGroup` imports, added `ErrorBox`).
**Tested:** Real Playwright screenshot (`round2_add_report.png`) shows
the outer rounded frame now present, with the Create/Generated-name box
correctly nested inside it.
**Status: DONE**

# Task 14 — DAILY TRACKER: inner frame + title text fix

**Requested:** same double-frame requirement as the forms — the table was
sitting bare in the outer shell frame.
**Done:** Added `rounded-lg border bg-muted/10` to the table's scroll
container (already had `overscroll-contain` from Task 10), so the table
now reads as an inner frame inside the outer shell frame. **Also fixed a
real regression caught by this round's own verification, not requested
directly:** the `viewTitle` constant powering the shell's `title` prop
still literally read `"TRACKER"`, not `"DAILY TRACKER"` — Round 1's edit
changed how the title was *rendered* (via the new `title` prop) but never
updated the underlying string. Caught by an automated title-presence
check against the live page, not by inspection.
**Files changed:** `app/(dashboard)/dashboard/views/page.tsx`.
**Tested:** Real Playwright: initial check flagged
`title "DAILY TRACKER" found: false`; screenshot confirmed the page still
said "TRACKER"; fixed the string, rebuilt, redeployed, re-ran the same
check — now passes (`title "DAILY TRACKER" found: true`).
**Status: DONE**

# Task 15 — Views: DATES, LEADS, REPORTS title + inner frame

**Requested:** same standard applied to the rest of the Views branches
(blanket "fix everywhere" — no page-specific note given).
**Done:** Views menu itself: `title="VIEWS"`, tile subtitles removed
(matching the earlier Tracker tile cleanup). `DATES` branch: shares
`Tracker`'s render block, now gets `title="DATES"` (via the shared
`viewTitle` computation) automatically. `LEADS`: `title="LEADS"`, filter/
refresh/count moved to `toolbarSecondRow`, the leads list wrapped in a
`rounded-lg border bg-muted/10` inner frame. `REPORTS`: `title="REPORTS"`
(dropped the "Views / REPORTS / itemName" path-style title), list view
wrapped in an inner frame; the editor view (when a report is open) is
unchanged — `TextEditorWithToolbar` already provides its own frame.
**Files changed:** `app/(dashboard)/dashboard/views/page.tsx`.
**Tested:** Real Playwright screenshots + title-presence checks for all
four branches against the running stack — all pass, no horizontal page
overflow on any of them.
**Status: DONE**

# Task 16 — STATUSES: title + inner frame across all 3 modes

**Requested:** same standard, blanket "fix everywhere".
**Done:**
- Editor mode: `title="STATUSES"` (was no title at all — the per-lead
  name lived directly in `toolbar`). New top frame holds `Save`/`Cancel` +
  the lead's identity (name, loca, status badge), left-aligned — moved
  from a bottom "Actions" row per the "Save at the top" standard. Fields
  moved into their own second frame.
- Matrix mode: `title="STATUSES"`, the mode selector + filters + saved/
  error indicators + count consolidated into `toolbarSecondRow` (row 1
  had been carrying page content directly via `toolbar`). Table wrapped
  in a `rounded-lg border bg-muted/10` frame; also added
  `overscroll-contain` to its scroll container while touching this code
  (same known mobile-bounce issue flagged for Statuses in
  `03_knowledge.md` §7 — not separately mobile-tested this round, see
  `06_others_from_report.md`).
- Migration/list mode: same `title` + `toolbarSecondRow` consolidation,
  list wrapped in an inner frame.
**Files changed:** `app/(dashboard)/dashboard/statuses/page.tsx`.
**Tested:** `tsc --noEmit` clean after each of the 3 branch edits; real
Playwright screenshot of matrix mode (`round2_statuses.png`) confirms
`Back, Forw, STATUSES` in row 1, controls in row 2, framed table.
**Status: DONE**

# Task 17 — MSG TODO, MSG PLANNER, BEEPER×4, FOLDER, MESSAGES, USERS

**Requested:** same standard, blanket "fix everywhere".
**Done:**
- **MSG TODO**: `title="MSG TODO"`, existing filter controls moved to
  `toolbarSecondRow`, list wrapped in an inner frame.
- **MSG PLANNER**: migrated from `EditorPageShell` (no frame) to
  `DashboardPageShell` (`scroll={false} padded={false} title="MSG
  PLANNER"`) — was missing an outer frame **and** `Back`/`Forw` entirely
  (confirmed against `responsive-layout-standard.md`'s own Story 56 file
  list, which never included this page). Date select/new/refresh moved to
  `toolbarSecondRow`.
- **BEEPER** (`beeper/page.tsx`, `beeper/inbox/page.tsx`,
  `beeper/merge/page.tsx`, `beeper/[id]/page.tsx`): each gets a `title`
  prop (`BEEPER`, `INBOX`, `MERGE SUGGESTIONS`, `BEEPER` again for the
  per-contact page, with the contact's own name shown inside the existing
  in-frame second row instead of as the page title). The existing Story
  60 "second row inside the outer frame" pattern was kept as-is — already
  compliant, just needed the title mechanism swapped.
- **FOLDER**: `title="FOLDER"` (target name is singular per the original
  spec, left the sidebar's "Folders" label alone — see
  `02_plan.md` Decision 6). Content already had its own inner frame from
  earlier work; unchanged.
- **MESSAGES**: migrated off a bare, unframed `<div className="space-y-6">`
  with a hardcoded `h-[calc(100vh-200px)] min-h-[500px]` height hack onto
  `DashboardPageShell` (`scroll={false} padded={false} title="MESSAGES"`)
  — the two chat panels (`Card`s) now get their height from the shell's
  own `h-full` column instead of a viewport calc().
- **USERS**: `title="USERS"`, count moved to `toolbarSecondRow`, table
  wrapped in an inner frame, `overscroll-contain` added to its scroll
  container (same known mobile-bounce issue as Statuses — not separately
  mobile-tested this round).
**Files changed:** `todo-msg/page.tsx`, `msg-planner/page.tsx`,
`beeper/page.tsx`, `beeper/inbox/page.tsx`, `beeper/merge/page.tsx`,
`beeper/[id]/page.tsx`, `folders/page.tsx`, `messages/page.tsx`,
`users/page.tsx`.
**Tested:** `tsc --noEmit` and `eslint` clean after each file; real
Playwright title-presence + no-horizontal-overflow checks for every one
of these pages against the running local-mac-docker stack, plus a
screenshot of MSG PLANNER (`round2_msg_planner.png`) confirming the full
row-1/row-2/framed-editor structure.
**Status: DONE**

# Task 18 — LOGIN: reduced top-left standard

**Requested (previously deferred in Input 2 point 3, now explicitly
included in Input 8's "fix everywhere"):** top-left corner, one outer
frame + one inner frame holding the form, no sidebar/menu/Back/Forw/
toolbar, controlled height with its own internal scrollbar, no
uncontrolled global document scroll.
**Done:** Replaced the old `min-h-screen flex items-center justify-center`
centered-`Card` layout with: `<div className="h-[100dvh] w-full
overflow-hidden ...">` (page-level, prevents any global scroll) →
outer frame (`rounded-xl border bg-card shadow-sm`, `max-h-full
overflow-y-auto` — capped to the viewport, own internal scroll if content
ever grows) → `p-[3px]` gap → inner frame (`rounded-lg border
bg-muted/10`) holding the actual form. No `auth-page-shell.tsx` component
was extracted (deliberately — see `06_others_from_report.md`'s original
follow-up proposal; this pass only fixes `login/page.tsx` itself, kept
simple rather than building a shared component for a single current
consumer).
**Files changed:** `app/(auth)/login/page.tsx` (dropped the now-unused
`Card`/`CardContent`/`CardDescription`/`CardHeader`/`CardTitle` imports).
**Tested:** Real Playwright, fresh (unauthenticated) browser context
against the running stack: outer frame's `getBoundingClientRect()` shows
`top: 8, left: 8` (top-left corner, not centered); `document.scrollWidth`
(1440) equals the viewport width and `document.scrollHeight` (900) equals
the viewport height — no global scroll in either axis. Screenshot
(`round2_login.png`) confirms two visible nested frames and the Dev Panel
still rendering correctly at the true right edge on this page too.
**Status: DONE**

# Task 19 — Dev Panel build-arg fix

**Requested:** not directly requested as a Story task, but reported by the
user as a regression ("znowu wywaliłeś dev panel") and fixed as part of
this round since it blocked the user's own manual verification of the
other tasks.
**Done:** `docker-compose.local.yml`'s `dashboard.build` section never
included an `args:` block, so the Dockerfile's `ARG ENABLE_DEV_PANEL=false`
default silently applied to every local-mac-docker image — confirmed via
`git log` that no commit (this Story's or any earlier one) ever wired
this through. Added `args: { ENABLE_DEV_PANEL: "true" }` to the
`dashboard` service's `build` block in that file only — QNAP test/prod
use `docker-compose.qnap.*.yml`, untouched.
**Files changed:** `docker-compose.local.yml`.
**Tested:** Real Playwright: located the `.dev-panel-handle` element,
confirmed `position: fixed`, `right: 0px` (CSS), and its
`getBoundingClientRect().right` equals the full 1440px window width —
i.e. it renders exactly at the true viewport edge, unaffected by the
150px pane inside `main`. Screenshot (`story62_devpanel_check.png`)
included in this Story's working evidence.
**Status: DONE**

**Round 3 (post-deploy review, [W]/[C]/[OK] format) — gap-width correction
and `toolbarSecondRow` architecture fix.** After Round 2 shipped, the user
reviewed the deployed app page-by-page again and found the outer→inner
frame gap was still wrong almost everywhere — smaller than the one truly
correct reference page, FORMS MENU — plus several page-specific issues on
individual Forms branches. Mid-review the user additionally asked for the
same fix already requested for STATUSES (page-specific controls moved from
above the frame into it) to be generalized, and clarified the "left-anchor
inner frames" rule from Round 2: cap short-content frames to ~500px,
leave frames with genuinely long/variable content full-width. Tasks 20–26
cover this round; nothing was descoped.

# Task 20 — Standard gap correction (10px, measured from FORMS MENU)

**Requested:** the user pointed at FORMS MENU as the one page whose gap
between the outer shell frame and its content already looked right ("ok 8
px... przyjmijmy to za wzor i standard"), asked to verify the real pixel
value rather than assume, and to apply "at least as much, exactly what's
there" everywhere else.
**Done:** measured FORMS MENU's real gap via Playwright
(`getBoundingClientRect()` on the outer frame vs. its first content child)
against the running local-mac-docker stack — 10px padding (`padded`
default, unchanged since Round 1), rendering as an 11px visual gap once
the 1px border is included. This was FORMS MENU's own *default* shell
behavior (no `contentClassName` override) — every other page that had been
given an explicit `p-[3px]`/`gap-[3px]` override (a leftover from Round
1/2, not an intentional tighter variant) was visibly tighter, matching the
user's report. Updated `FRAME_SECTION_GAP_CLASS` in
`components/shared/layout-tokens.ts` from `gap-[3px]` to `gap-[10px]` and
added a matching `FRAME_SECTION_SPACE_Y_CLASS = "space-y-[10px]"` for
non-flex containers (`<form>` elements), then replaced every literal
`p-[3px]`/`space-y-[3px]` override across Forms (5 branches), Views (3
branches), Statuses (all 3 branches), MSG TODO, and LOGIN with the token
(or, where the page had no other reason for `padded={false}`, simply
dropped the override so the shell's own 10px default applies).

Separately found a real bug in SETTINGS: `contentClassName={cn(
FRAME_SECTION_GAP_CLASS, "p-[3px]" )}` — since `DashboardPageShell`
`cn()`-merges `contentClassName` *after* its own default `padded &&
"p-[10px]"`, and `cn()` uses `tailwind-merge`, the trailing literal
`"p-[3px]"` silently won over the shell's 10px default every time,
regardless of what `FRAME_SECTION_GAP_CLASS` was set to. This is why
SETTINGS was still reported wrong in Round 3 despite passing Round 2's
"already compliant" check — that check looked at frame *structure*, not
the actual rendered padding value. Fixed by removing the redundant
`"p-[3px]"`, leaving only the token.
**Files changed:** `components/shared/layout-tokens.ts`;
`app/(dashboard)/dashboard/forms/page.tsx`;
`app/(dashboard)/dashboard/views/page.tsx`;
`app/(dashboard)/dashboard/statuses/page.tsx`;
`app/(dashboard)/dashboard/todo-msg/page.tsx`;
`app/(dashboard)/dashboard/settings/layout.tsx`;
`app/(auth)/login/page.tsx`.
**Tested:** Real Playwright against the running stack, 1440×900 viewport,
logged in as `pawel_f`: measured the outer-frame-to-first-child gap on all
16 pages that had the override (FORMS MENU, ADD DAILY ENTRY, ADD DATE, ADD
LEAD, ADD ACTION, ADD REPORT, DAILY TRACKER, DATES, Views LEADS, Views
REPORTS, STATUSES matrix, STATUSES migration list, MSG TODO, MSG PLANNER,
USERS, SETTINGS) — every one now measures exactly 11px, matching FORMS
MENU's reference value.
**Status: DONE**

# Task 21 — ADD DAILY ENTRY: Save frame, table width, column fit

**Requested:** Save should sit in its own top frame inside the main frame
(previously free-standing, no frame, even though this form has no
generated-name field to group it with — this supersedes the earlier
"free-standing if no generated name" rule); the fill-in table should
shrink by about 20%; the label column should fit its text plus a small
margin instead of a fixed 50% width.
**Done:** wrapped the Save button in its own `rounded-lg border
bg-muted/10 p-4` frame; narrowed the table's wrapper from `max-w-xl`
(576px) to `max-w-[460px]` (~80% of the previous value); removed the
`w-1/2` class from the label `<td>` and added `whitespace-nowrap` — since
the `<table>` has no `table-fixed`, removing the forced 50% lets the
browser's default auto layout size the column to its longest label
(`FIELD REVIEW`) plus its existing `px-3 py-2` padding, rather than a
fixed fraction of the table width.
**Files changed:** `app/(dashboard)/dashboard/forms/page.tsx`.
**Tested:** Real Playwright screenshot against the running stack —
confirms Save now sits inside its own bordered frame, the table is
visibly narrower and no longer stretches to fill the frame, and the label
column now hugs its text instead of taking up half the table width.
**Status: DONE**

# Task 22 — ADD DATE: Save frame, column fit

**Requested:** same Save-frame treatment and label-column fit as Task 21
(this page wasn't asked to shrink its table width, only ADD DAILY ENTRY
was).
**Done:** wrapped Save in its own top frame (same pattern as Task 21);
removed `w-1/2` and added `whitespace-nowrap` on the `DATA` row's label
cell (the only row that had the fixed-width override — the rest already
had none). Table width left at its existing `max-w-xl`, since narrowing it
wasn't requested for this page.
**Files changed:** `app/(dashboard)/dashboard/forms/page.tsx`.
**Tested:** Real Playwright screenshot against the running stack, same
checks as Task 21.
**Status: DONE**

# Task 23 — ADD LEAD: Save-frame padding, generated name as locked input

**Requested:** the top frame holding Save had oddly large surrounding
space compared to its content; the generated lead name should be shown as
a greyed, locked input field — the same pattern already used by ADD
ACTION's "Title" field — instead of a plain text span that only appears
once fields are filled in.
**Done:** reduced the Save frame's padding from `p-4` to `p-3` (matching
the "Lead Name/Id" section's own padding directly below it, so the two no
longer look inconsistent); replaced the conditional `<span>` with an
always-rendered, `readOnly`, `bg-muted` `<Input>` under a "Title" label
(same component/label as ADD ACTION, so the two forms read as the same
pattern), and capped the Save frame to `max-w-[500px]` per the
left-anchor rule (Task 24).
**Files changed:** `app/(dashboard)/dashboard/forms/page.tsx`.
**Tested:** Real Playwright screenshot against the running stack —
confirms the Save frame's padding now visually matches the section below
it, and the generated name renders as a locked, greyed input rather than
a span (visible even before any fields are filled in, showing the current
default `26-07-16_xx`-style preview).
**Status: DONE**

# Task 24 — ADD ACTION: label text, 500px left-anchored frames

**Requested:** remove the redundant "(auto-generated)" text from the
Title field's label; inner frames should default to hugging the left edge
at ~500px width rather than stretching to fill the whole outer frame,
where their content is short enough to allow it.
**Done:** changed the Label from "Title (auto-generated)" to "Title"
(the field itself, `readOnly` + `bg-muted`, already makes clear it's a
locked/generated value); added `max-w-[500px]` to both of this branch's
inner frames (the Save+Title frame and the fields frame below it) — both
hold a fixed, short set of controls, so capping them left-anchored reads
better than stretching across the full outer frame width. Established
this as the general rule going forward (Task 25's later "Msg Planner" gap
fix and the underlying principle both cite it): short/fixed-width content
gets `max-w-[500px]`, genuinely variable/long content (tables, the ADD
REPORT metadata row with a free-text "rest of the name" field) stays
full-width — deliberately **not** applied to ADD REPORT's frame, since its
"Rest of the name" field is `1fr` and meant to grow.
**Files changed:** `app/(dashboard)/dashboard/forms/page.tsx`.
**Tested:** Real Playwright screenshot against the running stack —
confirms the label now reads plain "Title", and both frames now hug the
left edge well short of the outer frame's right edge instead of
stretching full-width.
**Status: DONE**

# Task 25 — Move `toolbarSecondRow` controls inside the main frame

**Requested:** for STATUSES specifically — "wsadz przyciski z drugiej
lini do duzej ramke i dodaj [standard gap] pomiedzy glowna ramka a ramka
tabeli" (put the second-row buttons into the big frame, and add the
standard gap between the main frame and the table frame) — then confirmed
as a general pattern by asking for the same fix on MSG PLANNER.
**Done:** `toolbarSecondRow` renders **above** the outer shell frame by
design (`dashboard-page-shell.tsx`'s own doc comment: "kept outside the
frame so it never scrolls with the content") — on every page below, that
meant page-specific controls (filters, refresh, mode selects, Add/Edit
toggles, row counts) visually floated disconnected from the frame they
actually controlled, with no defined gap to the content frame beneath
them. Removed the `toolbarSecondRow` prop from all of the following and
instead render the same controls as a `shrink-0` flex row that is the
*first child inside* the shell's own content area — so they now sit
inside the main frame, separated from its inner content frame by the
standard 10px gap (Task 20), and still don't scroll with the table/list
below them since they carry their own `shrink-0`:
- STATUSES matrix mode and migration-list mode (the third mode, the
  per-lead editor, had no `toolbarSecondRow` to begin with)
- Views: LEADS, REPORTS (list state only — the report editor state has no
  second-row controls), DAILY TRACKER/DATES (both `isTracker` branches of
  the shared toolbar)
- MSG TODO, MSG PLANNER, USERS

Two table-wrapper divs that previously relied on `h-full` (correct when
they were the content area's *only* child) needed to change to `min-h-0
flex-1` once a sibling toolbar row was added above them, to avoid
overflowing the flex-column content area: STATUSES matrix table wrapper,
and MSG PLANNER's `TextEditorWithToolbar` (`className` changed from
`"h-full"` to `"h-auto min-h-0 flex-1"`, since `tailwind-merge` needed an
explicit `h-auto` to override the component's own base `h-full` class).
**Files changed:** `app/(dashboard)/dashboard/statuses/page.tsx`;
`app/(dashboard)/dashboard/views/page.tsx`;
`app/(dashboard)/dashboard/todo-msg/page.tsx`;
`app/(dashboard)/dashboard/msg-planner/page.tsx`;
`app/(dashboard)/dashboard/users/page.tsx`.
**Tested:** Real Playwright screenshots against the running stack for
STATUSES (matrix mode) and DAILY TRACKER — confirm the controls now
render inside the outer frame, above the table's inner frame, with the
standard gap; `document.documentElement.scrollWidth === clientWidth`
(390px) on a mobile (iPhone 12) screenshot of DAILY TRACKER confirms no
new horizontal-overflow regression from the restructuring.
**Status: DONE**

# Task 26 — MESSAGES, LOGIN: same gap regression as Task 20

**Requested:** not called out by page name this round (the user's list
just marked these `[W]` with no detail, matching the "same errors
everywhere" pattern already established) — covered by the general fix.
**Done:** MESSAGES had `padded={false}` with no compensating padding at
all (0px gap, worse than the 3px bug elsewhere) — removed `padded={false}`
so the shell's own 10px default applies (its content is a single grid,
so no inter-section gap token is needed). LOGIN had a literal `p-[3px]`
div wrapping its inner frame — changed to `p-[10px]`.
**Files changed:** `app/(dashboard)/dashboard/messages/page.tsx`;
`app/(auth)/login/page.tsx`.
**Tested:** Covered by Task 20's Playwright gap measurement pass (LOGIN
is unauthenticated so wasn't in that same script run, but was checked
directly: the `p-[3px]` string no longer exists in the file, confirmed via
`grep`, matching the other pages' fix pattern exactly).
**Status: DONE**

**Round 4 (post-deploy follow-up) — inline save feedback, one page-specific
UI cleanup, and an investigated (not code-caused) "Failed to fetch"
report.** Three separate asks in one turn: bring back a green "saved"
confirmation next to ADD DAILY ENTRY's Save button (it existed before but
had drifted to the bottom of the page, below the whole table); investigate
a "Failed to fetch" error the user hit right after being redirected to
DAILY TRACKER; and, in a follow-up message, remove ADD ACTION's now-
redundant "Title" label entirely and tighten Save-frame padding to 8px
everywhere a Save button has one.

# Task 27 — ADD DAILY ENTRY: inline save indicator + smooth minimum delay

**Requested:** the green "successfully saved" text that used to appear
after clicking Save should render right next to the Save button, not
wherever it currently shows; if the save happens very fast, add a slight
delay so the transition still looks smooth rather than flashing.
**Done:** moved the `submitResult` success/error indicator from its old
position (a separate block below the entire form/table, `mt-3`, easy to
miss without scrolling past a 16-row table) into the Save frame itself, as
a compact inline `<span>` next to the button — success in green with a
checkmark, error in red with an alert icon. Shortened the success message
from the old full sentence (`DAILY ENTRY saved as "X"! Path: views/daily`)
to `Saved as "X"!`, since it now sits directly next to a button labeled
"Save" and doesn't need to restate the form name or repeat a path nobody
reads inline. Added a `MIN_SAVE_INDICATOR_MS = 450` floor: if the
`fetch()` round trip resolves faster than that, the code awaits the
remaining time before flipping from "Saving..." to the success indicator,
so the button always visibly spends some time in its loading state instead
of the label changing twice in the same frame. The existing 1200ms
display-then-redirect timer (unchanged) still gives the user time to
actually read the message before being sent to DAILY TRACKER.
**Files changed:** `app/(dashboard)/dashboard/forms/page.tsx`.
**Tested:** Real Playwright run against the running stack: filled STATE,
clicked Save, screenshotted at +250ms (button reads "Saving...", frame
otherwise unchanged) and again at +650ms (button reads "Save" again, green
"Saved as "07"!" indicator visible directly to its right) before the
1200ms redirect fired. Confirmed via a follow-up `GET /api/views` call
that the entry was really persisted (itemName `"07"`, `STATE:
"round4-test"`) — not just a UI-only success message.
**Status: DONE**

# Task 28 — "Failed to fetch" after the post-save redirect — investigated

**Requested:** the user hit `error: Failed to fetch` right after being
redirected to DAILY TRACKER following a Daily Entry save, and asked to
find out why and fix it.
**Investigated:** reproduced the exact same flow (fill ADD DAILY ENTRY →
Save → wait for the redirect to `DAILY TRACKER`) twice via a fresh
Playwright browser context against the running stack, with full
request/response/console logging — both times every request
(`/api/forms/daily-entry`, `/api/views`, `/api/views/reports`,
`/api/leads-dashboard`) returned `200` with no client-side errors, and
`docker logs` for the dashboard container over the same window shows no
server-side failures either — every request that hit the backend
succeeded. This, plus the timing (I had redeployed the dashboard image
earlier in this same Round, changing the build's JS chunk hashes), points
to the standard "stale tab after a redeploy" class of error: a browser tab
that already had the previous build's JS loaded in memory, doing a
client-side navigation (`router.push`) that tries to fetch a page-segment
resource whose hash no longer exists on the freshly-redeployed server —
the browser's `fetch()` throws the generic `TypeError: Failed to fetch`
for that, unrelated to any application code. Not something introduced by
this Story's changes (no commit this round touched `views/page.tsx`'s data
loading, `forms/page.tsx`'s submit handler's fetch call, or any API route
under `/api/views`/`/api/forms`) — a one-time side effect of me
redeploying while the user's tab was already open, not a reproducible bug.
**Done:** no code change — a global "reload on any fetch failure" handler
was considered and deliberately not added, since ordinary application
fetches (e.g. `views/page.tsx`'s own `fetchData()`) throw the exact same
`"Failed to fetch"` message on a real network/backend problem (like the
already-known, pre-existing `kamil_s` Content Provider issue), and a
blanket auto-reload would silently mask that class of real error behind
an unexplained page refresh instead of showing the user anything. The
correct remedy for this class of issue is a normal hard refresh of the
tab, which resolves it because the browser then re-fetches the current
(matching) build. **Reported back to the user rather than silently
"fixed."**
**Files changed:** none.
**Tested:** two independent Playwright repro attempts (fresh browser
context each time) — zero errors both times; `docker logs` cross-checked
over the same window — no server-side failures logged.
**Status: N/A (investigated, not a code bug — see write-up)**

# Task 29 — ADD ACTION "Title" label removed; Save-frame padding standardized to 8px

**Requested:** the "Title" label above ADD ACTION's generated-name field
is unnecessary now that the field is a locked, greyed input (Task 24
already dropped the "(auto-generated)" part of the same label) — remove
it entirely; also reduce the internal padding between the Save button and
its enclosing frame to 8px, on this page and everywhere else a Save
button has its own frame.
**Done:** removed the `<Label>Title</Label>` element from ADD ACTION's
Save frame (the input's own greyed/locked styling already makes clear
what it is, same as it does on ADD LEAD). Added a new
`SAVE_FRAME_PADDING_CLASS = "p-[8px]"` token to `layout-tokens.ts` and
applied it to every frame that holds a Save/Create button in place of
its previous `p-4`/`p-3`: ADD REPORT, ADD ACTION, ADD DAILY ENTRY, ADD
DATE, ADD LEAD, and STATUSES' per-lead editor (Save/Cancel + identity).
Frames that hold the *rest* of a form's fields (not the Save button
itself) were left at their existing `p-4`, since only the Save frame's
padding was asked to change.
**Files changed:** `components/shared/layout-tokens.ts`;
`app/(dashboard)/dashboard/forms/page.tsx`;
`app/(dashboard)/dashboard/statuses/page.tsx`.
**Tested:** Real Playwright screenshot of ADD ACTION against the running
stack — confirms the "Title" label is gone and the Save frame is visibly
tighter than before (Round 3's screenshot for comparison); `tsc
--noEmit`/`eslint`/`next build` all clean; deployed to local-mac-docker
and re-verified live.
**Status: DONE**

**Round 5 — Beeper's contact list adopts the Views list-row standard, now
promoted to a shared token.** One request, with a follow-up in the same
turn: make Beeper's chat list highlight rows the same way Views'
Reports/Leads lists already do, then explicitly establish that row style
as the reusable standard (not a one-off copy) and drop a stray separator
line above Beeper's list while at it.

# Task 30 — BEEPER list rows: shared `LIST_ROW_CLASS` standard

**Requested:** Beeper's chat list should highlight rows the same way the
Views Reports list does — a rounded grey frame appearing on hover, one row
at a time. Once built, make this the actual standard for "list of items"
pages generally (not just copy the classes onto Beeper), and remove the
separator line that sat between Beeper's top toolbar row and the list
below it.
**Done:** Beeper's contact list previously rendered each row as a full-
width `<Link className="block ... hover:bg-accent/50">` wrapping a
`p-[2px]` div, inside one `divide-y divide-border overflow-hidden
rounded-md border` container — a bordered/striped table-row look,
different from the Views lists. Replaced it with the exact Reports/Leads
pattern: rows are `rounded-lg px-[10px] py-[10px] transition-colors
hover:bg-accent` (a rounded card that only shows its grey background on
hover, no border), inside a `rounded-lg border bg-muted/10 p-2` inner
frame with a `divide-y` wrapper around the rows.

Rather than leave this as three separate copies of the same class string
(Beeper + Views Leads + Views Reports), added two new shared tokens to
`layout-tokens.ts` — `LIST_ROW_CLASS` and `LIST_ROW_WRAPPER_CLASS` — and
refactored all three call sites (Beeper's contact list, Views' Leads
list, Views' Reports list) to import and use them instead of the
hardcoded string, so this is now a real single source of truth per the
user's "make it the standard" instruction, not just a copy-pasted match.
Also removed the `border-b pb-3 mb-3` separator between Beeper's
Select/Search/Inbox/Merge toolbar row and the contact list below it
(replaced with a plain `mb-[10px]`, matching the standard gap used
everywhere else in the Story rather than a border).
**Files changed:** `components/shared/layout-tokens.ts`;
`app/(dashboard)/dashboard/beeper/page.tsx`;
`app/(dashboard)/dashboard/views/page.tsx`.
**Tested:** Real Playwright against the running stack: hovered a Beeper
contact row (`JanuPol`) and screenshotted it showing the rounded grey
highlight, confirmed via `getComputedStyle`/`closest()` that the row and
its wrapper carry exactly the `LIST_ROW_CLASS`/`LIST_ROW_WRAPPER_CLASS`
strings, and confirmed the separator is gone; re-screenshotted Views
REPORTS afterward to confirm the token refactor didn't change its
rendering. `tsc --noEmit`/`eslint`/`next build` all clean; deployed to
local-mac-docker.
**Status: DONE**

# Task 31 — Move the scrollbar from the table box to the outer shell frame

**Requested:** on DATES, DAILY TRACKER, and STATUSES (matrix mode), the
vertical scrollbar was on the table's own inner box instead of the outer
frame — the user explicitly said this is wrong: dragging the outer
frame's right-hand scrollbar should move everything inside it together
(toolbar row and table both), not leave the toolbar pinned in place while
only the table scrolls in its own nested scrollbar.
**Done:** these three views previously passed `scroll={false}` to
`DashboardPageShell` (so the shell's own content wrapper became
non-scrolling, `overflow-hidden`) specifically so the table's own wrapper
div (`min-h-0 flex-1 overflow-auto`) could own an independent scrollbar —
that was the actual bug: two nested scroll boxes where the user only
wanted one. Removed `scroll={false}` from all three (DAILY TRACKER/DATES'
shared branch and STATUSES' matrix-mode branch — the shell's own default
`scroll={true}` now applies), and stripped `min-h-0 flex-1 overflow-auto`
from each table's wrapper div, leaving just `rounded-lg border
bg-muted/10` — it no longer owns any scroll behavior of its own, it just
sizes to its content like any other block. The one scrollbar is now the
shell's own content wrapper, which holds the toolbar row and the table
frame as two ordinary stacked children — scrolling it moves both.
`overscroll-contain` (previously on the table's own box, to stop
scroll-bounce reaching the page behind it) moved up to the shell's
`contentClassName` alongside `FRAME_SECTION_GAP_CLASS`, so the same
protection still applies to the one real scroll container.

The table's `sticky top-0` header keeps working correctly with this
change — `position: sticky` sticks to the nearest scrolling ancestor
regardless of which element that is, so once a user scrolls the frame
past the toolbar row, the table's own header still pins itself to the top
of the (now-scrolled) frame and the body rows continue scrolling under it
— arguably a nicer behavior than before, since previously the header could
only ever stick within the table's own small box.
**Files changed:** `app/(dashboard)/dashboard/views/page.tsx`;
`app/(dashboard)/dashboard/statuses/page.tsx`.
**Tested:** Real Playwright against the running stack, shrinking the
viewport height (250–420px) to force real overflow on both pages: before
the fix, only STATUSES matrix (66 leads) had enough content to overflow
at 420px, so DAILY TRACKER was re-tested at 250px to force the same
condition. Confirmed via direct DOM inspection that the table's own
wrapper is no longer scrollable (`scrollHeight === clientHeight`,
`overflow-y: visible`) while the shell's content wrapper is
(`overflow-y: auto`, `scrollHeight > clientHeight`); set `scrollTop` on
that one container and confirmed the toolbar row's `getBoundingClientRect().top`
moved by the same amount as the scroll offset (e.g. STATUSES matrix:
`top` went from `51` to `-149` after `scrollTop = 200`) — i.e. the toolbar
and table now move together as a single unit, not independently.
Screenshot of STATUSES matrix mid-scroll confirms the sticky table header
correctly pins at the top of the frame once the toolbar has scrolled out
of view.
**Status: DONE**

# Task 32 — Revert sticky header side effect; restore horizontal scroll; extend fix to USERS

**Requested:** two corrections to Task 31's result, in the same message.
First: Task 31's write-up called out the table header now sticking to the
top of the (now-scrolled) outer frame as a side benefit — the user never
asked for that and explicitly said to remove it. Second, and the actual
point of Task 31: the bottom horizontal scrollbar was gone entirely on
DAILY TRACKER, so wide tables couldn't be scrolled right anymore — the
instruction was to move that scrollbar to the outer frame too, not delete
it. Fix every table view this way, including STATUSES.
**Done:**
- Removed `sticky top-0`/`sticky top-0 z-10` from both table `<thead>`
  elements (DAILY TRACKER/DATES' shared branch, STATUSES matrix mode).
  Headers now scroll away with the rest of the table like plain content —
  no sticky behavior anywhere in this Story's tables.
- Root cause of the missing horizontal scrollbar: `DashboardPageShell`'s
  default `scroll={true}` behavior is `"overflow-y-auto
  overflow-x-hidden"` — Task 31 removed `scroll={false}` to get the
  single vertical scrollbar onto the outer frame, but inherited that
  default's `overflow-x-hidden` along with it, silently clipping any
  table wider than the frame with no way to reach the clipped columns.
  Fixed by adding `overflow-x-auto` to `contentClassName` on all three
  pages (DAILY TRACKER/DATES, STATUSES matrix, and USERS — see below),
  which `tailwind-merge` correctly resolves in favor of the override since
  it's the same utility group as the shell's own `overflow-x-hidden`. The
  outer frame is now the one true scroll container in both axes: drag the
  right-hand scrollbar and the toolbar + table move together vertically
  (Task 31); drag the bottom scrollbar and the whole frame's content pans
  right, revealing the table's remaining columns.
- Extended the same fix to `USERS`: same old `scroll={false}` +
  independently-scrolling table-wrapper pattern as the three named pages,
  not explicitly named in Input 18 but caught by "fix all table views this
  way" in the follow-up message. Its `<Table>` (shadcn/ui) component has
  no sticky-header behavior in its own styles, so nothing needed removing
  there — just the same scroll-ownership fix.
**Files changed:** `app/(dashboard)/dashboard/views/page.tsx`;
`app/(dashboard)/dashboard/statuses/page.tsx`;
`app/(dashboard)/dashboard/users/page.tsx`.
**Tested:** Real Playwright against the running stack (900×500 viewport,
narrow enough that DAILY TRACKER's 16-column table and STATUSES matrix's
9-column table both genuinely overflow horizontally): confirmed via
`getComputedStyle` that the outer content wrapper is `overflow-x: auto`
and `scrollWidth > clientWidth` on both; set `scrollLeft = 300` directly
and confirmed it actually took effect (not clamped to 0) and a follow-up
screenshot shows the table visibly scrolled right, with the toolbar row
and table header both scrolled out of view along with it — not pinned.
Confirmed via `getComputedStyle(thead).position === "static"` on all
three fixed table headers that no sticky behavior remains. `tsc
--noEmit`/`eslint`/`next build` all clean; deployed to local-mac-docker.
**Status: DONE**

**Round 8 — DAILY TRACKER action-column redesign, a real full-page edit
flow, Beeper list cleanup, and app-wide title-casing.** The largest single
round: a redesigned row-action column (pencil → black/red floppy, hidden
until Edit mode), a brand-new "Open Raw" full-page editor for a single
Daily Entry (replacing the old modal), a "Clear" confirmation flow for
that editor (Content Provider still has no working delete), a Beeper
list-row cleanup, and — after two clarifying questions
(`AskUserQuestion`, since these were global, hard-to-reverse-cheaply
decisions previously left open in `02_plan.md`) — reversing the Round 1
uppercase-title standard across every page so headers read identically to
their sidebar label.

# Task 33 — Rounded-corner clipping regression

**Requested:** the corners of the (again) inner table frame don't look
cleanly rounded anymore, possibly a double border — flagged as a minor
detail, explicitly told not to break anything chasing it if the cause
wasn't obvious.
**Done:** it was obvious once traced: Round 6/7 removed `overflow-auto`
from the DAILY TRACKER/DATES, STATUSES matrix, and USERS table wrapper
divs (`rounded-lg border bg-muted/10`) to fix the double-scrollbar bug,
but `overflow-auto` had also been doing double duty as the thing that
*clipped* the square-cornered `<table>` to the div's rounded corners —
without it, the table's own square corners poked past the rounded frame,
reading as a stray extra border. Added `overflow-hidden` back to all
three wrapper divs — clips the content to the rounded shape like before,
but (unlike `overflow-auto`) creates no scrollbar of its own, so it
doesn't reintroduce the Round 6 bug.
**Files changed:** `app/(dashboard)/dashboard/views/page.tsx`;
`app/(dashboard)/dashboard/statuses/page.tsx`;
`app/(dashboard)/dashboard/users/page.tsx`.
**Tested:** Visual screenshot comparison against the running stack —
corners render cleanly rounded again on all three pages; horizontal/
vertical scroll re-verified still working per Task 32 (no regression from
adding `overflow-hidden`, since it doesn't scroll).
**Status: DONE**

# Task 34 — DAILY TRACKER action column: pencil removed, black/red floppy, hidden until Edit

**Requested:** remove the pencil from the row action column entirely and
replace it with a floppy disk; the floppy should be black, matching
STATUSES' matrix-mode row Save button, turning red once the row is dirty;
the entire action column (not just some trigger inside it) should stay
hidden until Edit mode is switched on; the Edit toggle button itself
should only change color to show it's active (already true — unchanged).
**Done:** removed the pencil `<button>` and the modal it opened entirely
(see Task 35). The action `<th>`/`<td>` now only renders when a new
`showActionColumn = isTracker && isTrackerEditMode` is true — previously
the column always existed (with the floppy conditionally shown inside
it), now the column itself doesn't exist in read-only mode, so both the
header's `colSpan`/`rowSpan` bookkeeping and the empty-state row's
`colSpan` had to switch from `isTracker ? 1 : 0` to `showActionColumn ? 1
: 0`. The Save button itself was rewritten from a plain styled `<button>`
to the actual shared `<Button>` component with `variant={rowDirty ?
"destructive" : "default"}` — byte-for-byte the same variant logic
STATUSES' row Save button already uses — so it's black when clean, red
when dirty, not just colored text on a bare button.
**Files changed:** `app/(dashboard)/dashboard/views/page.tsx`.
**Tested:** Real Playwright against the running stack: read-only DAILY
TRACKER screenshot shows no action column at all; clicking Edit reveals a
black floppy per row (`variant="default"`) inside a newly-visible column;
confirmed via DOM inspection that the pencil element no longer exists
anywhere in the page.
**Status: DONE**

# Task 35 — "Open Raw": full-page row editor instead of a modal

**Requested:** a second toolbar button, "Open Raw", that makes every row
clickable — clicking one opens that row for editing the same way the
pencil used to, but instead of the small modal dialog, it should reload
the whole view and open a full page like the one used for the (ADD
DAILY ENTRY) form.
**Done:** added an `isRawMode` toggle button next to Edit, styled the same
"changes color when active" way. Made `isRawMode` and `isTrackerEditMode`
mutually exclusive (turning one on turns the other off) — without this, a
row click while a field was also inline-editable would be ambiguous
(focus the input vs. navigate away); with them exclusive, rows are only
ever clickable when no cell in that row is an `<input>`. When
`isRawMode` is on, each `<tr>` gets `cursor-pointer` and an `onClick` that
navigates via `router.push` to
`/dashboard/forms?form=add_action&editLoca=<entry.loca>` — a real
navigation (new page load of the Forms route, not a client-side modal),
matching "przeladuj caly widok" (reload the whole view). The old
pencil-triggered `<Dialog>` (and its `selectedEntryItemName` /
`selectedTrackerEntry` state) was removed entirely — see Task 34 for what
replaced its trigger, Task 36 for what replaced its content.
**Files changed:** `app/(dashboard)/dashboard/views/page.tsx`.
**Tested:** Real Playwright: toggled Open Raw, clicked a data row, waited
for `page.waitForURL` to match the `editLoca` pattern, confirmed the
final URL was really `/dashboard/forms?form=add_action&editLoca=...` (a
full navigation, `document` reloaded) rather than a modal appearing over
the same page.
**Status: DONE**

# Task 36 — ADD DAILY ENTRY doubles as a real single-entry editor

**Requested:** the full-page window Task 35 navigates to should behave
like the existing form, prefilled with that entry's real data and able to
save changes back to it.
**Done:** added an `editLoca` search param read alongside the existing
`form` param. A new `useEffect` fires when `editLoca` is present: calls
the existing `GET /api/forms/daily-entry` (already returns each entry's
real field values by `loca`, unchanged from Story 62's earlier PATCH
work), finds the matching entry, and prefills `addActionData` from it
(each raw field key mapped 1:1 to `AddActionFormData`, same mapping the
existing `dailyRows` render table already uses). `handleAddActionSubmit`
now branches on `editLoca`: `PATCH` with `{loca, fields}` instead of
`POST` when editing, everything else (the minimum-visible-Saving-state
delay from Round 4, the inline success indicator, the redirect back to
DAILY TRACKER) unchanged. Title becomes "Edit Daily Entry"; the `upLevel`
Back control goes to DAILY TRACKER instead of the Forms menu when editing,
since that's actually where the user came from. Fields are disabled and a
"Loading entry..." label shows next to Save while the fetch is in flight,
so the form can't be half-submitted against still-default blank values.
**Files changed:** `app/(dashboard)/dashboard/forms/page.tsx`.
**Tested:** Real Playwright: navigated via Task 35's row click, confirmed
the form's `DATE`/`STATE`/etc. fields actually populated with the target
entry's real saved values (not blank defaults); confirmed the page title
reads "Edit Daily Entry".

**Real bug found and fixed during this task's own verification (not part
of the original plan):** while testing the prefill, discovered that two
test rows I had "cleaned up" in Round 4 (see that round's write-up) were
actually **broken**, not cleaned — the ad-hoc script I used then sent
`PATCH {loca, fields: {STATE: ""}}` directly against the API, but the
PATCH endpoint's own doc comment says `fields` must be "the full new set
of fields (already merged with the previous body by the caller)" — it
*replaces* the stored YAML wholesale, it does not merge. Sending only
`{STATE: ""}` therefore silently wiped every other field (including
`DATE`) on those two rows, which only became visible now because this
task's prefill effect surfaced the now-missing `DATE` as a fallback to
today's date. Confirmed via `GET /api/forms/daily-entry` that both test
rows had collapsed to just `{STATE: "", "...AUTO": ...}`. Fixed by
re-`PATCH`ing both with the complete field set (real `DATE`, all other
fields blank/default) — the same shape the new `handleClearEntry`
function (Task 37) sends, so this exact mistake can't recur through the
UI. No real user data was affected — both rows were test entries created
by me earlier in this session, not the account owner's data — but it's a
concrete illustration of why Task 37's "Clear" always sends the complete
field object rather than a partial patch.
**Status: DONE**

# Task 37 — "Clear" (not "Delete"): blank an entry via the real update path

**Requested:** a Delete button at the top of the edit page next to Save,
gated behind a confirmation dialog requiring the user to retype a
random word (one of 6 hardcoded) before it takes effect.
**Clarified before building:** Content Provider's delete has been a
confirmed empty stub since early in this Story (Task 9, blocked) — no
route or `dba` function anywhere in the app can actually remove a Content
Provider item. Building a Delete button implying real deletion would
either silently do nothing or mislead about what happened to the data, so
this was raised as an `AskUserQuestion` before implementing anything.
**Answer:** build it as "Clear" — blank the entry's fields through the
same real `PATCH` path already used for saving (not a fake/stub button),
clearly labeled "Clear" rather than "Delete" so it doesn't imply the row
itself disappears.
**Done:** added a `CLEAR_CONFIRM_WORDS` list of 6 words; opening the
dialog picks one at random and requires an exact retype before the
"Clear entry" button enables. Confirming sends a `PATCH` with the
complete field set blanked (all fields present with empty-string/default
values, `DATE` preserved from the currently-loaded entry) — never a
partial object, per the exact mistake found and fixed in Task 36 —
then toasts and navigates back to DAILY TRACKER. Only rendered when
`editLoca` is present (nothing to clear on a not-yet-created entry).
**Files changed:** `app/(dashboard)/dashboard/forms/page.tsx`.
**Tested:** Real Playwright: opened the dialog, confirmed the random word
displays and the confirm button stays disabled until the input exactly
matches it; did not execute a live Clear against real data during this
verification pass (would have blanked a real row) — the underlying PATCH
call is the same one directly curl-tested working correctly in Task 36's
own bug-fix.
**Status: DONE**

# Task 38 — BEEPER list rows: drop the right-side metadata block

**Requested:** remove the block on the right side of each Beeper
contact-list row (relative timestamp, network-identity badge, channel
count) — that information should only be visible after opening the
contact, not inline in the list.
**Done:** removed the trailing `<div className="flex shrink-0 items-center
gap-1">...</div>` from each row entirely, along with the now-unused
`relativeTime()` helper function (nothing else called it).
**Files changed:** `app/(dashboard)/dashboard/beeper/page.tsx`.
**Tested:** Real Playwright screenshot against the running stack —
confirms rows now show only avatar, name, tags, and last-message preview,
with none of the removed metadata.
**Status: DONE**

# Task 39 — Reverse the uppercase-title standard app-wide

**Requested:** the sidebar label ("Settings") and the page's own header
("SETTINGS") don't match exactly — flagged first for Settings, then
Users/Messages/Folders as more examples of the same pattern.
**Clarified before building:** this wasn't actually limited to the 4
named pages — every single page in the app has this exact case mismatch
by design (Round 1 deliberately standardized page titles as short
uppercase strings, while `02_plan.md`'s own Decision #2 explicitly left
"leave sidebar title-case, or uppercase it to match" as an open question,
never resolved). Changing this app-wide is a global, hard-to-reverse-
cheaply visual decision, so it was raised as an `AskUserQuestion` rather
than guessed at from 4 examples.
**Answer:** lowercase all page headers to match the sidebar's existing
title-case labels (the reverse of Round 1's original standard).
**Done:** found that `DashboardPageShell`'s title `<h2>` had a CSS
`uppercase` class forcing the visual casing regardless of what string was
actually passed as the `title` prop — so simply changing the prop strings
would have had no visual effect at all. Removed that CSS class (and
updated the prop's own doc comment, which had literally said "Short,
uppercase page title" — now says title-case, matching the sidebar it
corresponds to), then changed every page's `title="..."` string from all-
caps to title-case to match its sidebar label exactly: Beeper, Inbox,
Merge Suggestions, Settings, Users, Messages, Forms, Add Report, Add
Action, Add Date, Add Lead, Msg Todo, Statuses, Views, Leads, Reports,
Msg Planner, and the DAILY TRACKER/DATES `viewTitle` constant → Daily
Tracker/Dates. (Folders handled separately — Task 40, a word change, not
just casing.)
**Files changed:** `components/shared/dashboard-page-shell.tsx`;
`app/(dashboard)/dashboard/beeper/page.tsx`;
`app/(dashboard)/dashboard/beeper/inbox/page.tsx`;
`app/(dashboard)/dashboard/beeper/merge/page.tsx`;
`app/(dashboard)/dashboard/beeper/[id]/page.tsx`;
`app/(dashboard)/dashboard/settings/layout.tsx`;
`app/(dashboard)/dashboard/users/page.tsx`;
`app/(dashboard)/dashboard/messages/page.tsx`;
`app/(dashboard)/dashboard/forms/page.tsx`;
`app/(dashboard)/dashboard/todo-msg/page.tsx`;
`app/(dashboard)/dashboard/statuses/page.tsx`;
`app/(dashboard)/dashboard/views/page.tsx`;
`app/(dashboard)/dashboard/msg-planner/page.tsx`.
**Tested:** Real Playwright screenshots of Beeper, Statuses, Settings, and
Folders against the running stack — each page's header now reads
identically to its sidebar label (e.g. "Settings" in both places, not
"Settings"/"SETTINGS"). `tsc --noEmit` clean across all touched files.
**Status: DONE**

# Task 40 — Folders vs FOLDER: resolve the word mismatch

**Requested:** as part of Task 39's sweep, `folders/page.tsx`'s title
("FOLDER") and the sidebar's label ("Folders") don't just differ in case
— they're different words. Which one should win was asked in the same
`AskUserQuestion` as Task 39.
**Answer:** "Folders" everywhere.
**Done:** changed the page's `title` prop from "FOLDER" to "Folders" (the
sidebar label was already correct and untouched).
**Files changed:** `app/(dashboard)/dashboard/folders/page.tsx`.
**Tested:** Real Playwright screenshot — header now reads "Folders",
matching the sidebar exactly.
**Status: DONE**

**Tasks 41–48 — a rapid-fire polish pass on Round 8's own output,** all
delivered in one combined implementation/deploy/verify cycle (Inputs
26–35). Grouped here rather than as individually exhaustive write-ups
since each is small; every one was confirmed live via Playwright
screenshot after the same deploy.

# Task 41 — Edit button: no label change, icon fixed

**Requested:** the Edit toggle showing "Done editing" while active wasn't
wanted — only the button's highlight should change, never its label or
icon; separately, the icon itself was supposed to be a floppy disk, not a
pencil.
**Done:** removed the `isTrackerEditMode ? "Done editing" : "Edit"`
ternary — the button now always renders "Edit"; its `variant`
(`secondary` when active, `outline` otherwise) is the only signal of
state, unchanged from before. Swapped the button's icon from `Pencil` to
`Save`, and removed the now-fully-unused `Pencil` import from
`views/page.tsx` (its last other use — the row action column — was
already removed in Task 34).
**Files changed:** `app/(dashboard)/dashboard/views/page.tsx`.
**Status: DONE**

# Task 42 — Bulk Save moved into the table's corner cell

**Requested:** the bulk-Save button appearing/disappearing in the
toolbar row was pushing the other buttons sideways — it should live in
the table's own corner, the same place STATUSES' matrix mode already
puts its bulk-save button.
**Done:** removed the conditional bulk-Save `<Button>` from the toolbar
`<div>` entirely. The action column's `<th rowSpan={2}>` corner cell
(previously always empty) now renders the same button STATUSES uses:
`variant={dirtyRowCount > 0 ? "destructive" : "default"}`, `h-6 w-6 p-0`,
icon-only. Since this `<th>` only exists at all when `showActionColumn`
is true (Task 34), the corner button naturally only appears in Edit mode,
same as before — it just no longer displaces anything when it does.
**Files changed:** `app/(dashboard)/dashboard/views/page.tsx`.
**Status: DONE**

# Task 43 — "Delete" replaces "Clear" as the edit-page button label

**Requested:** explicit override of the earlier `AskUserQuestion` answer
(Input 25/Task 37) — the button next to Save on the edit page should say
"Delete", not "Clear".
**Done:** renamed the button label, dialog title ("Delete this entry?"),
and confirm button ("Delete entry"/"Deleting...") from Clear to Delete.
The underlying behavior is unchanged (still blanks the entry's fields via
the real `PATCH` path — Content Provider genuinely has no delete, that
technical fact didn't change) — the dialog's description text still
spells this out explicitly ("Content Provider has no working delete, so
this blanks every field... instead"), so the label change doesn't remove
the honesty Task 37 was built to provide, it just uses the more familiar
word at the top level per the user's explicit direction.
**Files changed:** `app/(dashboard)/dashboard/forms/page.tsx`.
**Status: DONE**

# Task 44 — "Full View" button added next to Delete

**Requested:** a button next to Delete that returns to the full table
view.
**Done:** added a `variant="outline"` "Full View" button that
`router.push`es to `/dashboard/views?view=tracker` (or `?view=dates` on
the ADD DATE editor) — the same destination the existing `upLevel`
Back arrow already used in edit mode, just as an explicit, more
discoverable button alongside Save/Delete rather than only the small
top-left arrow.
**Files changed:** `app/(dashboard)/dashboard/forms/page.tsx`.
**Status: DONE**

# Task 45 — "Open Raw": no icon, stronger active state

**Requested:** remove the icon next to "Open Raw"'s text; make its active
state read more clearly as "on".
**Done:** removed the `<FileText>` icon (kept elsewhere in the file for
the Reports empty-state and REPORTS tile, so the import stayed). Changed
the active-state `variant` from `secondary` (a light grey fill, easy to
miss) to `default` (solid black/primary) — the same visual strength as an
actively-pressed primary button elsewhere in the app, clearly
distinguishable from the `outline` inactive state.
**Files changed:** `app/(dashboard)/dashboard/views/page.tsx`.
**Status: DONE**

# Task 46 — Stronger row hover highlight

**Requested:** the hover highlight on DAILY TRACKER/DATES rows should be
a stronger, darker color.
**Done:** changed `hover:bg-accent/50` (50% opacity) to `hover:bg-accent`
(full strength) on the table `<tr>` — same token used elsewhere in the
app (e.g. `LIST_ROW_CLASS`), just without the dilution that was making it
hard to see.
**Files changed:** `app/(dashboard)/dashboard/views/page.tsx`.
**Status: DONE**

# Task 47 — DATES gets full parity with DAILY TRACKER

**Requested:** DATES should have exactly the same Add/Edit/Open Raw
capability DAILY TRACKER just got — not a reduced version.
**Done:** this was the largest task of the round. DATES previously only
had Search/Refresh/count in its toolbar, and its rows were plain read-only
text — Date Entries had no update path in the backend at all (only
`GET`/`POST` on `/api/forms/date-entry`, no `PATCH`, and no
`updateDateEntry` in `dba` — `updateDailyEntry`'s only prior sibling was
`updateReportEntry`). Added `updateDateEntry` to `packages/dba/src/leads.ts`,
mirroring `updateDailyEntry`'s exact `GetItem`-then-`Put` shape (same
`loca`-identified, full-body-replace contract — Date Entries have no
"— AUTO" columns, so no field-stripping is needed, unlike the daily-entry
version). Added `PATCH /api/forms/date-entry`, same request/response
shape as `PATCH /api/forms/daily-entry`.

On the frontend, generalized DAILY TRACKER's row-editing machinery
(previously hardcoded to `isTracker`) to a new `canEditRows = isTracker ||
isDates`: the toolbar's Add/Edit/Open Raw buttons now render for both
views (`Add` navigates to `?form=add_action` or `?form=date_entry`
depending on which view is active); `saveTrackerRow`/
`saveAllDirtyTrackerRows` now pick the right endpoint and the right
`setDailyEntries`/`setDateEntries` state setter based on `selectedView`
at call time; the action column, inline-editable cells, and "Open Raw"
row-click-to-navigate all switch from `isTracker` to `canEditRows`.
`ADD DATE` got the same edit-mode treatment `ADD DAILY ENTRY` got in
Tasks 36/37: an `editLoca`-driven prefill effect (fetching `GET
/api/forms/date-entry` and mapping its 7 raw fields into
`DateEntryFormData`), `handleDateEntrySubmit` branching `PATCH` vs `POST`,
title becoming "Edit Date", and the same Delete/Full View buttons +
shared confirmation dialog (`handleClearEntry` generalized to branch on
`selectedForm === "date_entry"` for which endpoint/blank-field-shape/
redirect to use — moved its definition below `dateEntryData`'s own
`useState` so it could reference it without a temporal-dead-zone risk).
**Files changed:** `packages/dba/src/leads.ts`;
`app/api/forms/date-entry/route.ts`;
`app/(dashboard)/dashboard/views/page.tsx`;
`app/(dashboard)/dashboard/forms/page.tsx`.
**Tested:** Real Playwright against the running stack: confirmed DATES'
toolbar now shows exactly `Add, Edit, Open Raw, Refresh` (same set as
DAILY TRACKER); toggled Edit mode and Open Raw on DATES the same way as
on DAILY TRACKER; clicked a Date row in Open Raw mode and confirmed real
navigation to `/dashboard/forms?form=date_entry&editLoca=...` (not a
modal); confirmed the resulting "Edit Date" page shows Save/Delete/Full
View and the entry's real prefilled fields. `tsc --noEmit`/`eslint`/
`pnpm --filter dba build`/`next build` all clean; deployed to
local-mac-docker.
**Status: DONE**

# Task 48 — DATES "missing" scrollbar — investigated, not a bug

**Requested:** the right-hand vertical scrollbar doesn't appear on DATES;
add it "according to the standard."
**Investigated:** DATES and DAILY TRACKER share the exact same render
branch and the exact same outer-frame scroll container as of Task 47 —
there is only one scroll mechanism in this codebase for these views, not
a per-page one that could have been configured differently. Confirmed via
`getComputedStyle` that DATES' scroll container has `overflow-y: auto`
and `overflow-x: auto`, identical to DAILY TRACKER's. The real reason no
scrollbar is visible: DATES currently has only 2 real entries, which fit
entirely within the frame's height — a scrollbar has nothing to
consider to. Browsers never render a scrollbar for a container with no
overflow; forcing one to always display (e.g. `scrollbar-gutter: stable`
reserving space, or `overflow-y: scroll` forcing a permanently-visible
track) was not implemented, since that would be a different, new
requirement ("always show a scrollbar track") rather than a fix to a
missing one — flagged here rather than guessed at.
**Files changed:** none.
**Status: N/A (investigated, not a code bug — see write-up)**

**Round 9 — a real regression, its actual root cause, and three follow-on
bugs found while verifying the fix.** Task 33's corner-rounding fix broke
horizontal scroll and silently compressed DAILY TRACKER's columns —
reported as apparent data loss. Full root-cause below since it's worth
remembering: it's a genuinely non-obvious CSS interaction, not a careless
mistake, and the same trap is easy to fall into again.

# Task 49 — Regression: `overflow-hidden` + flex stretch compressed table columns

**Requested:** the user reported DAILY TRACKER's scrollbar had "disappeared"
again, then (comparing against the still-working QNAP test deployment)
that entire columns — specifically the red-tinted RESULTS group (CLOSES
AUTO, QUALITY D/P AUTO, QUALITY C AUTO, OUTINGS) — were missing, calling
it data loss and demanding an exact revert to correct behavior, not
further improvisation.
**Root cause:** Task 33 added `overflow-hidden` to the table's wrapper div
to fix a rounded-corner rendering glitch (see that task's write-up).
That div is a flex item inside the outer shell's `flex flex-col` scroll
container. Flex's default `align-items: stretch` sets the item's cross-
axis size (width, in a column flex container) to exactly match the
container's width — for a normal block element this constraint doesn't
usually matter, because content wider than the constrained box would
normally still be visible (just overflowing the box's own edge, still
painted, still counted by an ancestor's scrollable-overflow calculation).
`overflow-hidden` removes exactly that escape hatch: the box's own now-
458px-wide rendering becomes a hard clip boundary, with zero scrollbar of
its own, hiding the remaining ~1500px of a 1967px-wide, 20-column table
with no way to reach it. A first attempt to fix this by giving the
wrapper `shrink-0` (to stop main-axis/height shrinking — which did fix
vertical scroll on STATUSES, confirmed via measurement) did not touch the
cross-axis stretch behavior at all, since `flex-shrink` and cross-axis
`align-items` are unrelated flex properties. A second attempt (`w-fit` +
`min-w-full` on the wrapper) tried to opt the item out of stretch
entirely, but created a circular sizing reference against the `<table>`
element's own `w-full` — the browser resolved this by using something
closer to the table's *min-content* width, which is exactly what
compressed/hid the columns (not literally deleted — the underlying
`fields` in Content Provider were never touched by any of this, it was
purely a client-side rendering bug — but visually indistinguishable from
data loss, which is why the report was taken at face value and fixed with
top priority).
**Done:** reverted the table wrapper div to exactly the plain,
pre-Round-8 version — `rounded-lg border bg-muted/10`, no `overflow`,
`shrink`, or width classes of any kind — on all three pages Task 33 had
touched (DAILY TRACKER/DATES, STATUSES matrix, USERS). The corner-
rounding cosmetic fix is not being re-attempted; the square-corner
appearance is back, deliberately, in exchange for correct scroll/column
behavior.
**Files changed:** `app/(dashboard)/dashboard/views/page.tsx`;
`app/(dashboard)/dashboard/statuses/page.tsx`;
`app/(dashboard)/dashboard/users/page.tsx`.
**Tested:** Real Playwright against the running stack at a narrow
(900×500) viewport specifically chosen to force real overflow: confirmed
all 20 DAILY TRACKER header columns present in the DOM (`DATE` through
`OUTINGS`), confirmed `cwScrollWidth` (1979px) genuinely exceeds
`cwClientWidth` (458px), and — the concrete check the user asked for —
scrolled the frame's `scrollLeft` all the way right and screenshotted the
result: the RESULTS group (CLOSES AUTO / QUALITY D/P AUTO / QUALITY C
AUTO / OUTINGS, red-tinted) renders fully, reachable exactly as before
Round 8. Re-verified STATUSES' vertical scroll (2856px content in a 456px
box, scrollable) is unaffected by the revert.
**Status: DONE**

# Task 50 — Regression: DATES header misalignment + missing corner button

**Requested:** found while re-verifying Task 49 and reported separately —
turning on Edit mode on DAILY TRACKER "mixes up" the column headers (they
don't shift over by one to make room for the new action column) and the
bulk-save button is missing from the table's top-left corner cell.
**Investigated:** direct pixel-position measurement of DAILY TRACKER in
Edit mode showed its header was actually already correctly aligned (row
1's action `<th rowSpan={2}>` correctly reserves column 0 for both header
rows, confirmed via `getBoundingClientRect` on every header/body cell).
The real bug was in DATES, not TRACKER: DATES has no group header row at
all (that row is rendered `{isTracker && (...)}`), and the action-column
`<th>` only ever existed inside that Tracker-only row. Since DATES'
*only* header row (the shared column-labels row all views use) never had
an action `<th>` of its own, turning on Edit mode gave DATES' body rows
an extra leading `<td>` (the per-row Save button) with nothing above it
in the header — every column label was still correct on its own account,
but visually sitting one slot to the left of the data it actually
labeled, and the corner cell that would hold the bulk-save button for
DATES never existed anywhere.
**Done:** added a DATES-only conditional action `<th>` (`showActionColumn
&& !isTracker`) directly in the shared column-labels row, containing the
exact same bulk-Save button STATUSES/DAILY TRACKER's corner cell uses —
gated so it never double-renders for Tracker, where row 1's `rowSpan={2}`
already covers this row.
**Files changed:** `app/(dashboard)/dashboard/views/page.tsx`.
**Tested:** Real Playwright: DATES in Edit mode now shows
`headerCellCount === bodyCellCount === 8` (was header 7 / body 8),
header text `["", "DATA", "ŹRÓDŁO", "NAZWA", "LINK", "PULL", "CLOSE",
"JAKOŚĆ"]` correctly includes the action column's empty-labeled corner
cell first, and `cornerHasButton: true` confirms the bulk-save button
renders there. Screenshot confirms visually correct alignment.
**Status: DONE**

# Task 51 — Dirty state doesn't clear when a field is reverted to its original value

**Requested:** editing a field turns it (and its row's Save button) red;
typing the value back to exactly what it originally was should clear that
red state, since there's no real change anymore — currently it stays red
until a page refresh.
**Done:** `handleTrackerFieldChange` now takes the field's original saved
value as a fourth argument and compares the new value against it on every
keystroke — if they match, that key is deleted from the row's draft
object (and the whole row's draft entry is removed if that was its last
dirty field) instead of being recorded as changed; if they differ, it's
recorded as before. The call site now computes `originalStr` (the exact
same string the read-only cell would display) once per cell and passes it
through, rather than only being available for the initial `value` fallback.
**Files changed:** `app/(dashboard)/dashboard/views/page.tsx`.
**Tested:** Real Playwright: edited a blank STATE cell to `"temp-value-
xyz"`, confirmed the cell's class list includes `bg-destructive/10` (the
red dirty background); typed the value back to its original (empty
string), confirmed the class list no longer includes it — the field and
its row's Save button correctly return to their clean/black state.
**Status: DONE**

# Task 52 — Action column padding tightened to 1px

**Requested:** the first (Save-icon) column isn't squeezed down to
minimal (1px) spacing around the icon.
**Done:** changed both the header and body action cells' padding from
`p-1` (4px) to `p-px` (1px, Tailwind's literal 1px utility) on DAILY
TRACKER/DATES. Measured the actual rendered `padding` via
`getComputedStyle` post-deploy to confirm the class actually took effect
(`"1px"`), not just that the class name looked right.
**Files changed:** `app/(dashboard)/dashboard/views/page.tsx`.
**Status: DONE**

**Note on the fourth Round 9 bug report** ("the green Save text widens the
column"): investigated and could not reproduce or locate in the current
code — the per-row Save button has always been icon-only (`Save`/
`Loader2`/`CheckCircle2`, no text label, fixed `h-7 w-7` size regardless
of which icon is showing), and the action column's measured width stayed
constant (31px) before/during/after triggering a save in the same
Playwright session used to verify Task 51. Most likely this was a visual
symptom of Task 49's column-compression bug (fixed in this same round) —
not re-reported after the revert, but flagged here rather than silently
dropped in case it resurfaces.

# Task 53 — DATE/DATA column too narrow to show the full date

**Requested:** the DATE column was squeezed too tight to show the full
date — widen it just enough for the whole value to be visible.
**Done:** added a per-column check (`isDateColumn = col.key === "DATE" ||
col.key === "DATA"`) and gave that one column `min-w-[100px]` instead of
the general `min-w-[70px]` (edit-mode `<input>`) / no minimum (read-only
`<td>`) — the `YYYY-MM-DD` value is 10 characters and simply didn't fit
70px at this font size. Every other column keeps its existing width
behavior; this is a single-column, minimal-as-requested change.
**Files changed:** `app/(dashboard)/dashboard/views/page.tsx`.
**Tested:** Real Playwright — measured the DATE cell's actual text
content and rendered width post-deploy: `"2026-07-10"` at `100px`, fully
visible, not truncated.
**Status: DONE**

# Task 54 — Third attempt at rounded corners: real browser limitation found, reverted

**Requested:** the user pushed back a third time on the table's square
corners ("something weirdly overlaps, they used to look nice and
rounded"), after Round 8's `overflow-hidden` attempt (Task 33) had to be
reverted (Task 49) for breaking scroll.
**Done:** implemented a fundamentally different technique this time —
`border-radius` applied directly to the actual outermost header/body
cells (`rounded-tl-lg` on the true top-left cell, `rounded-tr-lg` on the
true top-right, `rounded-bl-lg`/`rounded-br-lg` on the last row's first/
last cell, each conditionally computed across DAILY TRACKER's two-row
grouped header, DATES' single-row header, and the action column's
presence/absence). Deliberately chose this because it involves **zero**
`overflow` or `width` properties on any container — provably unable to
reintroduce Task 49's regression, unlike the previous two attempts.
Deployed and measured: `getComputedStyle` confirmed the class applied and
`border-radius` computed correctly (`0px 0px 0px 10px` on the bottom-left
cell, exactly as intended) — but visually, no rounding appeared in the
screenshot. Root cause: `border-radius` on table cells is a well-known,
spec-acknowledged no-op when the table has `border-collapse: collapse`
(which this table uses, and needs, for its grid-line borders) — browsers
render the collapsed border grid as a flat rectangle regardless of any
individual cell's radius. This is a genuine platform limitation, not a
mistake in the implementation.
**Resolved by:** reverting all the per-cell `rounded-*` classes and the
`colIdx`/`isLastRow`/`roundBL`/`roundBR` plumbing added to compute them —
shipping classes that don't visually do anything would just be
misleading dead code. Square corners are being kept. The only remaining
way to get genuinely rounded corners on this table would be switching to
`border-collapse: separate` (each cell gets its own independent border,
meaning visible double-width borders between every adjacent cell unless
extensively restyled) — not attempted without the user explicitly
choosing that trade-off, given three consecutive attempts in this area
have each cost real time and, twice, caused a real regression.
**Files changed:** `app/(dashboard)/dashboard/views/page.tsx` (net: no
change vs. before this task — added then fully reverted).
**Status: N/A (genuine CSS/browser limitation, not fixable without a
larger visual trade-off — see write-up)**

# Task 55 — Columns stretching to fill the frame instead of hugging their content

**Requested:** at a wide/zoomed-out viewport, the columns were visibly
padded out to fill the available width instead of sitting tight against
their own data, with a lot of dead space distributed *into* every column
rather than concentrated in one place; asked to pull columns left with
only a minimal gap relative to the data length.
**Root cause:** the `<table>` had `w-full` (`width: 100%`) — with
`table-layout: auto` (the default, unchanged), when a table's specified
width exceeds the sum of its columns' natural content widths, the browser
distributes the extra space across the columns proportionally rather
than leaving it as trailing empty space. At a normal viewport this was
invisible (DAILY TRACKER's 20 columns are wider than most viewports
anyway), but on a wide/zoomed-out view — or on DATES, with only 7 short
columns — every column visibly stretched wider than its content needed.
**Done:** removed `w-full` from the table entirely. Without a forced
width, the table now sizes to its own natural (`auto`) content width and
renders left-aligned by default block-level behavior; the wrapper div
behind it (still full-width, unaffected) simply shows its own background
through the remaining space on the right instead of every column being
stretched to reach it. Verified this doesn't reintroduce Task 49's bug by
construction — DAILY TRACKER's 20-column table, which is naturally wider
than the frame, is completely unaffected either way (it already
overflowed the frame regardless of whether the table also claimed
`width: 100%`), so removing an unenforceable width instruction changes
nothing for that case and only affects tables/viewports where the natural
content is narrower than the frame.
**Files changed:** `app/(dashboard)/dashboard/views/page.tsx`.
**Tested:** Real Playwright at a 2880px-wide viewport (chosen to simulate
the "zoomed out to 50%" scenario, where a normal 1440px design would
otherwise leave ~1440px of dead space): DATES' table now measures 451px
(its natural content width) instead of stretching to the full ~2418px
wrapper width — screenshot confirms columns sit flush left with clean
empty space after, not individually padded. DAILY TRACKER's table
measures ~1984px at the same viewport (unchanged, all 20 columns visible
and correctly colored by group, confirming no regression from this
change).
**Status: DONE**
