# Story 62 — Plan: shared layout/table standard, pilot on SETTINGS + DAILY TRACKER

**Status: plan approved by the user (Input 2) with corrections, refined
further by Input 3 and Input 4 (all in `01_input.md`).** Implementation of
`SETTINGS` and `DAILY TRACKER` may proceed for the parts that don't touch
`packages/dba`/new API routes; the daily-entry save/delete backend gap
(§"Backend gap" below) is described but explicitly **not** implemented
without separate agreement, per Input 2 point 9. No `documentation/stories`
→ `backlog/stories` doc fixes beyond what's already done in
`06_others_from_report.md`. No TEST/PROD deploy in this phase (Input 2
point 12) — local-mac-docker only, once implementation is done.

## Goal

One shared layout/table standard for every CHAD dashboard page, piloted on
two pages (`SETTINGS`, `Views → DAILY TRACKER`), documented so the standard
can be mechanically applied to the remaining ~17 pages afterward without
re-deriving it per page. See `03_knowledge.md` for the full current-state
findings this plan is based on.

## Decisions this plan is making explicit (flag if any should go differently)

1. **`DashboardPageShell` gets a new `title` prop.** Today the shell
   renders `{toolbar}` then `<NavGroup>` in row 1 (title and NavGroup order
   is whatever `toolbar` contains, then Back/Forw last) — the opposite of
   what every one of this Story's target pages wants (`Back, Forw, TITLE`).
   Rather than reordering `toolbar`'s existing free-form content around
   NavGroup (which varies wildly per page today — icons, search inputs,
   counts), row 1 becomes: `NavGroup` → new `title` prop (plain uppercase
   string, e.g. `"SETTINGS"`, `"DAILY TRACKER"`) → nothing else. All
   page-specific controls (search, refresh, +Add, Edit, filters) move to
   `toolbarSecondRow`, which already exists as a prop and is already used
   by `statuses/page.tsx`. Existing `toolbar` prop stays for now (some
   pages haven't migrated), but the two pilot pages stop using it in favor
   of `title` + `toolbarSecondRow`.
2. **Shared spacing token for the ~3px inter-frame gap — kept separate from
   each section's own content padding (Input 2 point 7).** Two distinct
   things were being conflated in the first draft of this plan:
   - the gap **between** the outer `DashboardPageShell` frame's edge and
     its inner section boxes, and the gap **between** the inner section
     boxes themselves — this is what shrinks to ~3px;
   - the padding **inside** each inner section box (its own content
     breathing room) — this is **not** touched, stays whatever reads well
     (currently `p-4` on each box in `settings/layout.tsx`).
   New `components/shared/layout-tokens.ts` exports
   `FRAME_SECTION_GAP_CLASS = "gap-[3px]"` (or equivalent), applied to the
   shell's `contentClassName` (today `"gap-4 p-4"` on `settings/layout.tsx`
   — the `gap-4` part becomes the token; the wrapper's own `p-4` is a
   separate call, not automatically shrunk to 3px, so the frame edge doesn't
   end up flush against the inner boxes — actual value confirmed at
   implementation time by eye, not hardcoded here). Each inner box's own
   `p-4` is untouched.
3. **Right pane goes to `150px`, on the verified desktop breakpoint.**
   `app/(dashboard)/layout.tsx`'s `<main>` className gets `md:pr-[150px]`
   added (currently has neither `100px` nor any right padding — see
   `03_knowledge.md` §3, this isn't a "restore"). Per Input 2 point 8, this
   isn't assumed blindly: the same file already defines `DESKTOP_QUERY =
   "(min-width: 768px)"` (used for the `isDesktop` state that drives
   sidebar-close-on-navigate behavior) and `responsive-layout-standard.md`
   explicitly documents this as "the same threshold Tailwind `md` uses" —
   i.e. `md:` is already the codebase's single, established desktop
   threshold, not a fresh guess for this Story. The stale comment claiming
   "no extra reserved space is needed" gets corrected in the same change.
4. **Username in the sidebar header — needs one confirmation:**
   `Sidebar` will fetch `GET /api/auth/session` (existing endpoint, already
   returns `{ user: { username, displayName, ... } }`) on mount and render
   in place of the static "Dashboard" text. **Open question:** show
   `displayName` (falling back to `username` if empty) or always
   `username`? Defaulting to **`displayName || username`**, falling back to
   the literal text `"Dashboard"` only while the fetch is in flight or if
   logged out (shouldn't normally happen post-auth) — say now if you want
   `username` always instead.
5. **Sidebar menu label casing** (`"Msg Todo"`, `"Folders"`, etc.) — left
   as-is, confirmed explicitly (Input 2 point 5 + the user's separate
   answer to the clarifying question). Uppercase applies only to short page
   titles (`SETTINGS`, `DAILY TRACKER`) **and** the Forms/Views tile-menu
   labels that appear after clicking into those sections (e.g. the
   `TRACKER`→`DAILY TRACKER` tile rename in the Views menu grid) — not the
   left sidebar's own group/item labels, which are a separate, untouched
   style.
6. **"FOLDER" vs "Folders"** — the prompt's target list says `FOLDER`
   (singular); the current sidebar/menu label is `"Folders"` (plural). This
   Story does not touch the Folders page at all (not one of the two pilot
   pages), so this is only recorded here as a flag for whoever migrates
   Folders later — resolve singular-vs-plural then, not guessed now.
7. **Editable-table pattern deliberately deviates from `STATUSES`** in two
   ways the prompt itself calls for: (a) read-only-by-default + explicit
   Edit toggle (Statuses is always-editable), and (b) bulk Save saves only
   dirty rows (Statuses currently saves every visible row unconditionally
   — see `03_knowledge.md` §6). Statuses itself is not modified by this
   Story; only its *mechanics* (per-row spinner/Saved states, `destructive`
   token for dirty) are reused as a reference.
8. **Row action-column design — finalized by Input 4, superseding the
   earlier "click free space to open the row" idea from Input 3:**
   ```
   [💾] [✎]
    Save  Edit Item
   ```
   - **Pencil (✎, "Edit Item")** — always visible, in **both** read-only
     and Edit-toggle-on states. Opens the full single-Item detail/edit view
     for that row (a drill-down, not the inline table edit). `title="Edit
     item"` tooltip, `aria-label="Edit item"`.
   - **Floppy disk (💾, "Save")** — only appears once the table's global
     `Edit` toggle is on; saves that row's inline table edits directly.
     Never present in read-only mode.
   - No plain-letter ("E") button — rejected explicitly as non-standard,
     ambiguous, worse on mobile, and confusable with the page's own global
     `Edit` toggle button.
   - **Consequence for the "first column hidden by default" rule in the
     original prompt (§10):** since the pencil must be reachable even in
     read-only mode, the action column itself is not fully hidden pre-Edit
     the way the original spec implied — it always shows at least the
     pencil; `Edit` toggling on adds the floppy inside the same column,
     which is still fixed-width across all states (hidden-floppy /
     spinner / Saved / icon-only), per the original width-stability
     requirement.
   - **Delete lives only inside the opened single-Item view** (never in the
     table row itself), gated behind a confirmation dialog ("are you sure
     you want to delete?") — per Input 2 point 10. See the Backend gap
     section below: this cannot actually be wired to a working delete yet.

## New/changed shared components

- `components/shared/dashboard-page-shell.tsx` — add `title?: string` prop,
  reorder row 1 to `NavGroup` → `title`.
- `components/shared/layout-tokens.ts` (new) — the ~3px gap token, plus any
  other spacing constant this pilot surfaces (e.g. the fixed action-column
  width, so it's one number instead of copy-pasted `w-*` classes).
- `components/shared/editable-table/` (new, name TBD at implementation
  time) — extracted from the Statuses pattern, but corrected:
  - dirty-state tracking **per field** (not just per row), driving both a
    red field background and the red row-save-button variant, using the
    existing `destructive` design-system token (no inline hex).
  - `RowSaveButton`-equivalent: icon → spinner → green fading "Saved" →
    icon, rendered in a cell with a genuinely fixed width across all three
    states (Statuses' current version lets the "saved" text label widen the
    cell slightly — this Story's version fixes that, e.g. by giving the
    label the same reserved width via absolute positioning or an explicit
    `w-*` on the cell sized for the widest state).
  - Bulk save: dirty-rows-only, loading state, positioned top-left of the
    table/toolbar per the prompt.
  - Table scroll container: `overscroll-behavior`, `touch-action`,
    `min-width: 0`, explicit table width — tuned against the bug described
    in `03_knowledge.md` §7 (hard stop at first/last column, no bounce, no
    page-drag-through). Verified on Daily Tracker (new code); documented
    precisely enough that Users/Statuses can adopt the same recipe later
    without re-deriving it.

**Not building in this pass (Input 2 point 3):** `auth-page-shell.tsx` /
any login-page change. Login is not one of the two pilot pages — it stays
in the migration-plan list only, untouched, including its current
centered-card layout.

## Backend gap for DAILY TRACKER save/delete — save is now GO (Input 5 + 7), delete stays blocked

**Resolved (Input 5):** the user confirmed adding real `updateDailyEntry`
now — explicitly rejecting a stub/no-op ("Interfejs nie może pokazywać
spinnera i komunikatu `Saved`, jeżeli dane nie zostały zapisane"). Before
implementing, two things were required first and are now done:

1. A new global architecture doc,
   `documentation/ai-docs/begin_here/05_endpoint-rules.md`, covering: it's
   fine (expected) to add a missing endpoint/`dba` method when a feature
   needs one; CP logic stays inside `dba`, never called directly from
   `packages/dashboard`; API routes stay thin adapters; never build a
   pretend Save/stub; compatibility rules for changing an existing
   endpoint (find usages first, prefer a new method over changing an
   existing contract when unsure); naming by business operation, not raw
   CP method name; verify both the new path and prior features afterward.
   Linked prominently in `02_what-and-where.md`, placed before the Deploy
   section per instruction, and added to `01_ai_start.md`'s reading order.
2. Reading `documentation/dashboard/forms/features/daily-tracker-dates.md`
   (Input 7) — the already-audited, verified record of this exact data
   flow, now also added to `02_what-and-where.md`'s Dashboard section
   index (it existed but wasn't indexed). It corrects/sharpens the
   `updateDailyEntry` design (full detail in `03_knowledge.md` §10a):
   - Item names are sequential numbers (`01`, `02`, ...), not date-based —
     `generateEntryName`'s `_dateStr` param is unused already.
   - `itemName`/`loca` already exist per entry in `dba`
     (`DailyEntryItem`), but `GET /api/views` (what the Tracker page
     actually renders from) currently drops `loca` — needs a pure additive
     field added to that response (safe per the new endpoint-rules doc).
   - Overwrite-in-place via `Put` on daily/date entries has already been
     done once for real (CSV-import cleanup), just not through a reusable
     function/route yet.
   - AUTO columns are never persisted — computed server-side on every
     read; `updateDailyEntry` must not write them either.

**Implementation constraints (Input 5 + Input 7, both binding):**
- Do not build an independent save mechanism from scratch — reuse the
  existing `runWithRepoContext` + Content-Provider-invocation flow.
- Keep the existing `POST /api/forms/daily-entry` as create-only, exactly
  as today.
- Add a new `updateDailyEntry(loca, bodyYaml)` in `packages/dba/src/
  leads.ts`, modeled on `updateReportEntry`'s `GetItem`-then-`Put` shape —
  but read both `updateReportEntry` and `saveLeadStatus`/
  `putStatusContent`'s current code first, don't copy mechanically.
- Add a compatible update route (`PATCH`/`PUT` — exact verb decided at
  implementation time) alongside the existing `POST` on
  `/api/forms/daily-entry` (or a sibling route), not replacing it.
- Identify the target Item by its real `itemName`/`loca` — never by
  matching on `DATE` alone.
- Never call `generateEntryName()` or `PostParentItem` during update —
  those are create-only; using them here would create a duplicate instead
  of overwriting.
- Never write the four AUTO columns.
- After `Put`, re-read and confirm: total entry count unchanged, and
  exactly the targeted Item's content changed — a regression guard against
  accidental duplication, run for real (not just asserted).
- `GET /api/views`'s response gets `loca` added per entry (additive,
  non-breaking per `05_endpoint-rules.md`) so the Tracker table has what
  it needs to call the new update route.

**Delete is unaffected by this resolution and stays blocked** — Content
Provider's delete is still an empty stub (now confirmed a second time,
independently, in `daily-tracker-dates.md` §7). No Delete UI is being
built this pass regardless.

## Original backend-gap writeup (superseded above, kept for the record)

Checked the existing daily-entry data path before designing the table's
Save/Delete UI, per instruction. Findings (full detail in
`03_knowledge.md` §10):

- **No edit path exists today.** `saveDailyEntry` in `packages/dba` is
  create-only (always generates a fresh unique name via
  `PostParentItem`+`generateEntryName`); there is no update/edit
  counterpart, and no `PATCH`/edit route on `/api/forms/daily-entry` or
  `/api/views`.
- **The primitive it needs already exists and works elsewhere**, twice:
  `report-entries.ts`'s `updateReportEntry(loca, content)` (`GetItem` then
  `Put` to the same `loca` — powers the already-working Reports edit flow)
  and `statuses-dashboard.ts`'s `saveLeadStatus`/`putStatusContent` (powers
  Statuses' working save). **Minimal needed change:** a new
  `updateDailyEntry(loca, bodyYaml)` in `packages/dba/src/leads.ts`
  mirroring `updateReportEntry`'s shape, plus a new/extended API route to
  call it. Low-risk by precedent, but it's a `dba` (business-logic) change
  — **not implemented in this pass without explicit go-ahead**, per
  instruction.
- **Delete is a harder, separate blocker.** The Content Provider's own
  delete worker is a known empty stub (no real item deletion is possible
  anywhere in this codebase today; the established workaround elsewhere is
  overwrite-in-place, never actual removal). The user's Delete-with-
  confirmation requirement (Input 2 point 10) currently has **no working
  backend counterpart at all** — this is not a missing dashboard-layer
  wire-up, it's a Content-Provider-level gap. Building a Delete button that
  calls into nothing (or silently no-ops) would be exactly the "pozorne UI"
  (pretend UI) the user said not to build.

**What this means for implementation scope, until the user confirms which
way to go:**
- Buildable now, no backend dependency: table read-only rendering, `Edit`
  toggle, the pencil ("Edit Item") column always visible and navigating to
  a single-entry detail view, per-field dirty highlighting (pure client
  state), the floppy/spinner/Saved visual state machine wired to a
  **stubbed** save call.
- **Not buildable yet** without a decision: making Save actually persist
  (needs the `updateDailyEntry` addition above) and any Delete affordance
  at all (needs a Content-Provider-level capability that doesn't exist).
  The plan's default, absent other instruction: ship the UI shell with
  Save wired to the real endpoint **once** `updateDailyEntry` is added (ask
  first — see the chat message accompanying this plan), and leave Delete
  out of the single-Item detail view entirely for this pass rather than
  render a non-functional button, noting the gap visibly in that view
  instead (e.g. disabled with an explanatory tooltip) until Content
  Provider delete support exists.

## Pilot implementation — `SETTINGS`

1. `settings/layout.tsx`: pass `title="SETTINGS"` to `DashboardPageShell`
   instead of no toolbar at all.
2. Replace the two inner sections' `gap-4 p-4` with the new
   `FRAME_SECTION_GAP_CLASS` token (~3px).
3. No `toolbarSecondRow` content needed today (Settings has no page-level
   actions) — row 2 stays absent, not an empty placeholder.
4. Explicitly **not** touched: `settings/page.tsx`'s mock profile form
   content (real-data wiring is a separate, undocumented gap — see
   `03_knowledge.md` §4), the Password backend 501 stub, any
   `settings/{account,appearance,notifications,display,api-keys}/page.tsx`
   sub-page content.

## Pilot implementation — `Views → DAILY TRACKER`

This is the larger piece — today's Tracker table is 100% read-only with no
edit/save machinery at all (`03_knowledge.md` §5), so this is real feature
work, not a relabel:

1. Rename: menu tile "TRACKER" → "DAILY TRACKER" (drop the "Daily tracker"
   subtitle, matching the "no duplicate subtitle" rule applied to Forms
   tiles too — see migration notes below), branch title `"Views /
   TRACKER"` → `title="DAILY TRACKER"` (drop the "Views /" prefix per the
   shell's new `title` prop).
2. Row 1: `Back, Forw, DAILY TRACKER` via the shell's new ordering.
3. Row 2 (`toolbarSecondRow`): `+Add` (routes to the Forms → `ADD DAILY
   ENTRY` branch — reusing whatever route/query-param Forms already uses
   for that branch, not a hardcoded guess) and `Edit` toggle. Existing
   filter/Refresh/count controls move here too, out of row 1.
4. `Edit` toggle: table defaults read-only (current behavior unchanged when
   off). The action column's **pencil** ("Edit Item") is visible in both
   states; toggling `Edit` on additionally reveals the **floppy** (Save)
   in the same fixed-width column and unlocks editable cells; toggling off
   hides the floppy again and reverts to read-only rendering. See the
   "Backend gap" section above and Decision 8 for the finalized
   `[💾][✎]` design (supersedes the earlier "click free space" idea from
   Input 3).
5. Field edit → dirty state (red field bg + red per-row floppy, both via
   the `destructive` token), scoped per field/row, other rows' in-progress
   edits untouched. Pure client-side state — buildable regardless of the
   backend gap.
6. Per-row save (floppy): icon → spinner → fading green "Saved" → icon,
   fixed-width action column throughout, no double-submit while a row's
   save is in-flight. Actually persisting requires the `updateDailyEntry`
   backend addition (see "Backend gap") — held pending confirmation.
7. Bulk `Save` (top-left, in the table/toolbar per the prompt): saves only
   dirty rows, shows a loading state, doesn't perturb other rows' states.
   Same backend dependency as item 6.
8. Pencil → single-entry detail view: opens that one Daily Entry's fields
   in a dedicated view/panel. Delete intentionally **not** rendered there
   in this pass (Content Provider delete is a stub — see "Backend gap");
   the view should say so rather than omit any mention, so it doesn't read
   as an oversight.
9. Mobile table scroll: hard stop at first/last column, no bounce, no
   page-level drag-through, working horizontal scrollbar.

Everything else on the Views page (`DATES`/`LEADS`/`REPORTS` branches) is
**not** touched by this Story — Dates shares the same file/component today,
so implementation will need to make sure Tracker's new edit machinery
doesn't leak into the Dates branch by accident (they currently share
`columns`/`viewTitle` logic).

## Global (applies immediately, not page-by-page)

- Right pane `md:pr-[150px]` on `app/(dashboard)/layout.tsx` — desktop
  only, absent on mobile (existing `md:` breakpoint convention).
- Sidebar "Dashboard" → username (see Decision 4 above) — this is small
  and independent of the SETTINGS/DAILY TRACKER pilot; can ship in the same
  pass as the rest of this Story's implementation once approved.

## Documentation deliverable

Update `documentation/dashboard/common/features/responsive-layout-standard.md`
(fix the two stale claims found in `03_knowledge.md` §1) and add the new
material required by `01_input.md` §14: frame schema, ~3px token, two-row
toolbar convention, 150px pane rule, table standard (Edit mode, dirty
states, save states, fixed action-column width, scroll/touch rules), the
reduced login/auth standard, and the full page list from `03_knowledge.md`
§9 marked with migration status. Also populate the currently-empty
`documentation/dashboard/views/views-tracker.md` (or point it at the new
doc — implementation-time call). This documentation work is organizational,
not a Checklist item (per the Story standard, doc work belongs in
`06_others_from_report.md`), but it's a required deliverable of this
Story's implementation phase regardless.

## Out of scope (explicitly, per the prompt's own architecture section)

No direct Content Provider or MongoDB calls from `packages/dashboard`, no
changes to `runWithRepoContext(...)` or per-user repo isolation. The one
possible `packages/dba` addition (`updateDailyEntry`, "Backend gap" above)
is explicitly gated on separate confirmation, not assumed in scope by
default. No TEST/PROD deployment in this phase — local-mac-docker only.

## Verification plan (once implementation is approved and done)

`tsc`/`next build` for the whole dashboard; manual desktop check of
Settings + Daily Tracker (frame, title, row order, 150px pane, no
page-level horizontal scroll); manual **real mobile-viewport** check
(explicitly not just a desktop build) of both pages plus the touch-scroll
behavior; full table state walkthrough (read-only → Edit → pencil opens
single-entry view → dirty field → floppy save → Saved → revert) with fixed
column width verified across states. Login is not part of this pass's
verification (not implemented this round). Per the prompt's own
instruction: nothing gets marked verified from static analysis alone if
it's a mobile/visual claim.

## Migration plan for remaining pages (recorded, not scheduled)

Full page-by-page inventory with current shell/title/scroll/button state is
in `03_knowledge.md` §9. Once `SETTINGS` and `DAILY TRACKER` are approved
and shipped, the same shape of change applies to: Forms (`ADD DAILY
ENTRY`, `ADD DATE`, `ADD LEAD`, `ADD ACTION`, `ADD REPORT` — including
removing the in-table duplicate `<th>` headings on Daily/Date Entry found
in `03_knowledge.md` §9), Views (`DATES`, `LEADS`, `REPORTS`), `STATUSES`,
`MSG TODO`, `MSG PLANNER`, `BEEPER` (4 routes), `FOLDER`, `MESSAGES`
(currently not on any shared shell at all), `USERS`, and the login page's
sibling `(auth)` routes. Each gets its own future Story (or a batch of
Stories) — not opened here, per the "don't implement everywhere yet"
instruction.
