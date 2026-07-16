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
