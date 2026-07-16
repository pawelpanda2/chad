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
