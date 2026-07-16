# Story 62 — Knowledge

Pointers discovered while scoping this Story, with why each matters. Global
project knowledge (`documentation/ai-docs/begin_here/`) was read first per
`01_ai_start.md`; this file only records what's specific to *this* Story.

## 0. Two path corrections vs. what the user's prompt assumed

- The prompt says `documentation/ai-docs/what-and-where.md` — that file
  doesn't exist. The real entry point is
  `documentation/ai-docs/begin_here/01_ai_start.md`, which points to
  `documentation/ai-docs/begin_here/02_what-and-where.md` (the actual index).
  `documentation/README.md` itself says the pre-monorepo structure it
  describes is largely stale and to start from `01_ai_start.md` instead.
- The prompt says the user moved stories into `documentation/backlog`. That
  directory does not exist. What actually exists (mtime: today) is a
  **repo-root** `backlog/stories/<N>/` — Stories 53–61 are there, plus a
  pre-numbering `backlog/stories/01_todo/` (freeform notes, not a real
  Story). The project's own standard doc
  (`documentation/ai-docs/begin_here/03_story-standard.md`) still described
  `documentation/stories/<N>/` as canonical — that's the stale part the
  prompt's step 2.7 asked to fix. Treated `backlog/stories/<N>/` as the real,
  current location and updated the six forward-looking docs that cited the
  old path (see `06_others_from_report.md`) — did **not** touch Stories
  53–56's own file contents (that's their historical record, not to be
  rewritten).
- Mid-Story, the user separately renamed `documentation/ai-docs/knowledge/`
  itself to `documentation/ai-docs/begin_here/` (file names/content
  unchanged). All references above and in the six previously-fixed
  forward-looking docs were updated a second time to match — see
  `06_others_from_report.md`.

## 1. The authoritative layout standard doc — and where it's now stale

`documentation/dashboard/common/features/responsive-layout-standard.md` is
the single documented layout standard (confirmed via
`02_what-and-where.md`'s Dashboard section). Read in full. It is **out of
date** in two load-bearing ways, confirmed against current source:

- Doc says `<main>` in `app/(dashboard)/layout.tsx` has `md:pr-[100px]`
  (added "DONE" in Story 56). **Not present in current source** — the
  current `<main>` className is just `"min-h-0 flex-1 overflow-y-auto
  p-0.5"`, with a comment explicitly saying no reserved space is needed
  because NavGroup sits left-aligned in the toolbar now. `git log
  -S"pr-[100px]"` against this file returns **zero commits** — the string
  never existed in this file's git history, despite Story 56's own
  checklist marking the task DONE. So either it was reverted without a
  commit trail, or it was never actually applied to source despite the
  Story/doc both claiming so. This Story's right-pane task (150px) needs to
  add it fresh, not "restore" it.
- Doc says `NavGroup` renders `[Prev] [Back] [Forw]`, **right-aligned**
  (`ml-auto`, appended last in the toolbar row). **Current source
  contradicts this**: `components/shared/nav-group.tsx`'s own doc-comment
  says `Forw` only (no `Prev` — removed), **left-aligned, no `ml-auto`,
  must be the FIRST element** in the toolbar row. But
  `components/shared/dashboard-page-shell.tsx` still renders `{toolbar}`
  *then* `<NavGroup />` (NavGroup last, not first) — i.e. the shell's own
  render order contradicts NavGroup's own doc-comment about where it must
  sit. This is a real, current inconsistency, not a misreading: on
  `SETTINGS` today this doesn't surface (no `toolbar` content is passed, so
  NavGroup is the only thing in the row) — see item 4. It first bites once
  a page has both a title/toolbar content *and* wants `Back`/`Forw` before
  it, which is exactly Task 1 of this Story (`SETTINGS`) and Task 4
  (`DAILY TRACKER`) both requested `Back, Forw, TITLE` order.
- Likely explanation for both: **Story 60** (`backlog/stories/60/`, Task 3
  "Beeper tab: header line 1 vs. in-frame second row") reworked toolbar-row
  conventions and NavGroup's left/right position after Story 56 shipped the
  doc above, but `responsive-layout-standard.md` itself was never updated to
  match. Story 60's own `05_tasks_and_checklist.md` Task 4 also already
  touched `settings/layout.tsx` (see item 4) — so Settings has had two
  rounds of frame fixes already (Story 56's original migration, Story 60's
  duplicate-frame fix), neither of which added a title or fixed row order.

## 2. `DashboardPageShell` / `NavGroup` — current source (not just the doc)

- `packages/dashboard/components/shared/dashboard-page-shell.tsx` — read in
  full. Props: `toolbar`, `toolbarSecondRow`, `upLevel`, `scroll` (default
  `true`), `padded` (default `true`), `className`, `frameClassName`,
  `contentClassName`. Row 1: `<div className="flex min-h-9 shrink-0
  flex-wrap items-center gap-x-3 gap-y-1 pl-14">{toolbar}<NavGroup
  upLevel={upLevel} /></div>` — **`toolbar` renders before `NavGroup`**, so
  today's row order is whatever `toolbar` contains, then `Back`/`Forw`.
  Getting `Back, Forw, TITLE` (this Story's requirement) means either
  reordering this JSX (NavGroup first, then `toolbar`) or having pages pass
  their title through a distinct prop that's positioned after NavGroup —
  a shared-component decision to make explicitly in `02_plan.md`, not
  per-page.
  Outer column: `flex h-full min-h-0 w-full flex-col gap-0.5` — the `0.5`
  (2px) gap here is between the toolbar row(s) and the frame, not the
  ~3px "gap between main frame and inner frames" the user means (that one
  is page-content spacing, e.g. `settings/layout.tsx`'s own `p-4`/`gap-4`
  on its section boxes — see item 4).
  Frame: `rounded-xl border bg-card shadow-sm`. Content wrapper:
  `flex h-full min-h-0 w-full flex-col` + `overflow-y-auto
  overflow-x-hidden` (when `scroll`) + `p-[10px]` (when `padded`).
- `packages/dashboard/components/shared/nav-group.tsx` — read in full.
  Exports `NavGroup({ upLevel, className })`. Renders `[Back, Forw]` only
  (no `Prev`/`Next` anymore — comment says it was deliberately dropped
  2026-07-14, `goBack`/`canGoBack` may still exist in
  `dashboard-history-provider.tsx` for future reuse). `Back` = `Undo2` icon
  + text "Back", calls `upLevel.onClick` or renders a `Link` if
  `upLevel.href` is given; disabled when `!upLevel || upLevel.disabled`.
  `Forw` = text "Forw" + `ArrowRight` icon, wired to
  `useDashboardHistory().canGoForward/goForward` — no props needed, works
  identically on every page.
  `useDashboardHistory()` — from
  `components/shared/dashboard-history-provider.tsx`, mounted once in
  `app/(dashboard)/layout.tsx` inside `<Suspense>` (needs
  `useSearchParams`). In-memory only (no persistence), max 5 back/5
  forward entries.
- No shared "SecondRow"/"table" component exists yet beyond
  `toolbarSecondRow` (a plain `ReactNode` prop, no built-in styling
  convention of its own — pages that use it today, e.g.
  `statuses/page.tsx`, just pass raw JSX).

## 3. Right-side pane — prior Story/task history (what the prompt asked to trace)

- `backlog/stories/56/` (`01_input.md`, `02_plan.md`,
  `05_tasks_and_checklist.md`) specified and marked DONE a **100px**
  `md:pr-[100px]` desktop-only right pane. Not present in current source
  (see item 1) — no trace in git history for that file/string either.
- `backlog/stories/01_todo/note.md` (a pre-Story freeform note, not a real
  Story — separate from and possibly *earlier* than Story 56) independently
  raises the same idea but leaves the width undecided between `100px` and
  `200px` ("Do rozstrzygnięcia"). `note.txt` has a plain-text duplicate
  leaning `100px`.
- Conclusion for `02_plan.md`: this is not a regression to "restore" — it
  needs to be **added fresh** to `app/(dashboard)/layout.tsx`'s `<main>`
  className (`md:pr-[150px]`, per this Story's explicit target, overriding
  both the old 100px value and the undecided 100/200px note), and the
  layout's own comment claiming "no extra reserved space is needed" needs
  updating since it's no longer true once this ships.

## 4. `SETTINGS` — current state (target: first pattern page)

- `packages/dashboard/app/(dashboard)/dashboard/settings/layout.tsx` (read
  in full) wraps everything in `DashboardPageShell` with **no `toolbar`
  prop at all** — confirms the user's own diagnosis exactly: only
  `NavGroup` (Back/Forw) renders in row 1 today, no title, `Back` is
  disabled (no `upLevel` passed either). Two content sections inside the
  shell's single frame: a theme-selector box and a "Settings" box (with its
  own internal `sidebarNavItems` sub-nav: Profile/Account/Password/
  Appearance/Notifications/Display/API Keys), both styled
  `rounded-lg border bg-muted/10 p-4`, stacked with `contentClassName="gap-4
  p-4"` on the shell. This two-box styling is itself the result of
  `backlog/stories/60/` Task 4 ("Settings page no longer shows two nested
  boxes that look like duplicate outer frames") — so the *duplicate outer
  frame* problem is already fixed; what's left unfixed is exactly what the
  user listed: no title, and the `p-4`/`gap-4` spacing (16px) is far above
  the ~3px target.
- `packages/dashboard/app/(dashboard)/dashboard/settings/page.tsx` (the
  "Profile" child route, read in full) is **stock shadcn-nextjs-dashboard
  template content** — a mock `react-hook-form` with hardcoded
  `defaultValues` (`"I own a computer."`, `shadcn.com` URLs), a fake avatar
  (`/avatars/01.png`, `alt="@username"`), and `onSubmit` that only
  `console.log`s + shows a toast — no real backend, not wired to
  `chad_admin`/the real user record. This is unrelated to this Story's
  scope (pure layout/shell), but worth flagging in `06_others_from_report.md`
  so nobody mistakes "SETTINGS now looks right" for "Settings is finished/
  real" — the frame/title/gap fix here should not touch this fake form
  content.
- `documentation/dashboard/settings/features/settings-page.md` — existing
  feature doc, describes the two-box layout and the Password tab (real UI,
  backend intentionally not wired: `POST /api/auth/change-password`
  returns `501`). Confirms scope boundary: don't touch this backend gap in
  this Story.

## 5. `DAILY TRACKER` (`Views → TRACKER`) — current state (target: table pattern page)

- Lives inside `packages/dashboard/app/(dashboard)/dashboard/views/page.tsx`
  (682 lines, one file, branches on `selectedView` state — not separate
  routes/files for tracker vs dates vs leads vs reports). Menu branch
  (`!selectedView`) renders a 4-tile grid: `TRACKER` (subtitle "Daily
  tracker"), `DATES` ("Date entries"), `LEADS` ("All leads"), `REPORTS`
  ("Saved reports") — same subtitle-under-tile pattern the user wants
  removed from Forms tiles.
  Table branch (`selectedView === "tracker" | "dates"`): title rendered as
  `<h2>Views / {viewTitle}</h2>` where `viewTitle` is `"TRACKER"` or
  `"DATES"` — i.e. today's title is literally `"Views / TRACKER"`, the
  exact "menu name + path + title in one line" pattern the user's prompt
  explicitly says not to do. `DashboardPageShell` call:
  `scroll={false} padded={false} upLevel={{ onClick: handleBack }}
  toolbar={<>...</>}` — the whole toolbar (icon+title, filter `Input`,
  Refresh `Button`, count) is one row; there is no `toolbarSecondRow` use
  here today.
  **The table itself is 100% read-only** — a hand-rolled `<table>` (not
  `components/ui/table.tsx`), `sticky` group+column headers, sortable
  columns (`toggleSort`), horizontal+vertical scroll via `<div
  className="min-h-0 flex-1 overflow-auto">`. **No Edit toggle, no action
  column, no per-row save, no dirty-state, no bulk save, no `+Add` button**
  exist yet on this page at all. Building the editable-table pattern here
  is new feature work, not a relabel — this Story's Task 4–8 for Daily
  Tracker are a real implementation, not just a shell swap. Not
  investigated in this Story: the `/api/views` PATCH/edit contract this
  will need (no existing edit endpoint for daily entries was found —
  `app/api/forms/daily-entry/route.ts` only handles *create*; whether an
  edit endpoint needs to be added is implementation-phase work, out of
  scope for this planning Story).
  `documentation/dashboard/views/views-tracker.md` exists but is **empty**
  (0 bytes) — a placeholder never filled in; this Story's documentation
  task should populate it (or supersede it with a pointer to the new shared
  standard doc — decide in implementation, not here).

## 6. `STATUSES` — reference pattern for row edit/save (with known deviations to NOT copy)

`packages/dashboard/app/(dashboard)/dashboard/statuses/page.tsx` (1085
lines), Matrix mode, read in full by a research pass:

- **Always-on editing**, no Edit toggle — every cell (`Input`/`Select`/date
  `Input`) is directly editable as soon as the table renders. This Story
  wants the opposite default (read-only, Edit toggle reveals editing) for
  `DAILY TRACKER` — Statuses is the reference for the *save mechanics*
  only, not for "always editable".
- **No per-field red highlighting** — dirtiness is tracked per-**row** only
  (`hasRowChanges(leadKey)`), and the only visual effect is the per-row save
  button's variant (`variant={isDirty ? "destructive" : "default"}` — a
  shadcn/ui design-system token, not an inline color). This Story's spec
  explicitly wants per-**field** red background *and* a red save button —
  Statuses only has the second half; the per-field highlight needs to be
  added new, following the same "use the destructive/design-system token,
  not an inline hex" convention.
- **Per-row save button states**: icon `Save` → spinner (`RefreshCw
  animate-spin`) while `rowState.saving` → `CheckCircle2` + adjacent
  `text-[10px] text-green-600` "saved" label while `rowState.saved`, then
  auto-reverts via `setTimeout` (2000ms) back to idle. Button itself is
  fixed `h-7 w-7 p-0`, **but** the adjacent "saved" text label sits next to
  it in a flex container, which **can widen the cell** beyond the button's
  own fixed size — this Story's requirement that the action column never
  changes width means Daily Tracker's version needs the label absolutely-
  positioned or the cell given an explicit fixed width that already
  accounts for the widest state, not Statuses' current approach verbatim.
- **Bulk "Save all"** button lives inside the table's own `<thead>`
  top-left corner cell (not in the page toolbar) and — important deviation
  from what this Story wants — **saves every currently-filtered row
  unconditionally** (`visibleLeads.map(...)`, no dirty filter), not just
  the changed ones. This Story's spec (§10, "nie zapisywać ponownie wierszy
  bez zmian") is a deliberate improvement over Statuses' current behavior,
  not a copy of it — flagged explicitly so implementation doesn't
  "faithfully" reproduce this particular bug.
- No shared table component exists (`components/ui/table.tsx` is a plain
  shadcn primitive used only by `users/page.tsx`; Statuses hand-rolls its
  own `<table>`) — whatever shared edit/save table pieces this Story
  extracts (dirty-field token, per-row save button w/ fixed-width states,
  bulk-save-dirty-only helper) will be new shared components, not a
  refactor of an existing one.

## 7. `USERS` and mobile table overscroll/bounce — the only place the bug is actually documented

- `packages/dashboard/app/(dashboard)/dashboard/users/page.tsx` — fully
  read-only today (uses `components/ui/table.tsx` primitives), no inline
  editing, no save of any kind. Row actions dropdown (`Send Email`, `Call`,
  `Edit User`, `Delete User`) has **no `onClick` handlers at all** — dead
  placeholders, confirmed by
  `documentation/dashboard/users/features/users-list.md`'s own "Known
  limitations" section. Out of scope for this Story (no editable table here
  to standardize against yet) — mentioned only because it's one of the two
  pages named for the scroll-bounce bug.
- The touch/overscroll-bounce bug (§11 of the prompt) has **no
  documentation anywhere under `documentation/`** — `grep -ri
  "overscroll|bounce|touch-action|overscroll-behavior"` across the entire
  `documentation/` tree returns zero hits. The only place it's written down
  at all is `backlog/stories/01_todo/note.md` (a pre-Story freeform todo
  list, not a numbered Story), which names exactly `USERS` and `STATUSES`
  and describes: missing bottom horizontal scrollbar, touch-drag pulls past
  the last column into empty space, view "bounces" back on release, wants a
  hard stop at first/last data pixel. No CSS (`overscroll-behavior`,
  `touch-action`) addressing this exists anywhere in `packages/dashboard`
  today (not verified exhaustively file-by-file, but no shared table/scroll
  utility was found that would be the natural place for it).
- Practical implication for `02_plan.md`: fixing this needs to happen where
  Daily Tracker's new table scroll container is built (new code, easy to
  get right from scratch) — Users and Statuses are pre-existing pages this
  Story does **not** implement fixes for (Users has no editable table yet;
  Statuses is out of this Story's two-page scope per §5 of the prompt), but
  the *pattern* documented here must be written so migrating them later is
  a known recipe, not a fresh investigation.

## 8. "Dashboard" text at the top → replace with username

- The only literal top-of-app `"Dashboard"` text is
  `packages/dashboard/components/shared/sidebar.tsx` lines ~94–104 (the
  sidebar's logo/brand block): `<Link href="/dashboard" ...><div
  ...><LayoutDashboard .../></div><span className="text-xl font-bold
  ...">Dashboard</span></Link>`. Nothing else in `components/shared/*.tsx`
  renders this brand text (the other "Dashboard" hits found by grep are
  identifier names — `DashboardPageShell`, `DashboardHistoryProvider`,
  `DashboardLayout`, `LoadingDashboard` — not rendered text; and
  `components/shared/app-switcher.tsx`'s `name: "Dashboard"` is a picker
  entry in an unrelated app-switcher list, not the sidebar header, and was
  left alone since the user's ask is specifically about "u góry napisu
  dashboard" — the top-of-page label).
  `Topbar` (`components/shared/topbar.tsx`) is currently unrendered
  everywhere (`SHOW_TOPBAR = false` flag in `app/(dashboard)/layout.tsx`)
  so it's not a second place this text shows.
- Getting the username: no client-side user/session hook or context exists
  yet (`sidebar.tsx` is a `"use client"` component with no user data
  today). `GET /api/auth/session`
  (`packages/dashboard/app/api/auth/session/route.ts`, already exists,
  reads the `session` cookie, looks up `prisma.user`) already returns
  `{ user: { id, username, displayName, isActive } }` or `{ user: null }`
  — this is the existing, real mechanism to reuse (fetch it from
  `Sidebar`, e.g. on mount) rather than inventing a new session source.
  Open decision for `02_plan.md`: show `displayName` (falls back how, if
  null/empty?) or `username` — needs a call in the plan, not a guess here.

## 9. Full page inventory (routes / files / shells / current titles / menu labels)

Compiled from direct reads + targeted greps across
`packages/dashboard/app/(dashboard)/dashboard/**` and
`components/shared/sidebar.tsx`. "Shell" = which shared component wraps the
page; "Title today" = what's literally rendered as the page's own heading
(not the browser tab title).

### Forms (`app/(dashboard)/dashboard/forms/page.tsx`, single 1212-line file, branches on `selectedForm` state)

| Target name | Menu tile (today) | Branch title (today) | Duplicate subtitle? | Shell |
|---|---|---|---|---|
| ADD DAILY ENTRY | "DAILY ENTRY" (subtitle "Daily log") | `toolbar` h2 "DAILY ENTRY" **+** a second `<th colSpan={2}>DAILY ENTRY</th>` repeated inside the form table | Yes — both the tile subtitle and the in-table repeated heading | `DashboardPageShell` |
| ADD DATE | "DATE ENTRY" | `toolbar` h2 "DATE ENTRY" **+** a second `<th colSpan={2}>DATE ENTRY</th>` inside the table | Yes, same pattern | `DashboardPageShell` |
| ADD LEAD | "ADD LEAD" (already matches) | `toolbar` h2 "Add Lead" (mixed case, not caps) | No | `DashboardPageShell` |
| ADD ACTION | "ACTIONS" (plural) | `toolbar` h2 "Action" (singular, not caps, inconsistent with the tile) | No | `DashboardPageShell` |
| ADD REPORT | "REPORTS" | Manually-built header (not shell `toolbar`): `<NavGroup .../><span>Reports</span>` | No | `EditorPageShell` (no frame of its own — the metadata box + editor are the page's real content) |
| (menu itself) | — | `toolbar` h2 "Forms" | — | `DashboardPageShell` |

### Views (`app/(dashboard)/dashboard/views/page.tsx`, single 682-line file, branches on `selectedView` state)

| Target name | Menu tile (today) | Branch title (today) | Shell |
|---|---|---|---|
| DAILY TRACKER | "TRACKER" (subtitle "Daily tracker") | `<h2>Views / TRACKER</h2>` | `DashboardPageShell` (`scroll={false} padded={false}`) |
| DATES | "DATES" (subtitle "Date entries") | `<h2>Views / DATES</h2>` (same branch, `columns = DATE_COLUMNS`) | `DashboardPageShell` (`scroll={false} padded={false}`) |
| LEADS | "LEADS" (subtitle "All leads") | `<h2>Views / LEADS</h2>` | `DashboardPageShell` |
| REPORTS | "REPORTS" (subtitle "Saved reports") | `<h2>Views / REPORTS{...selected report name}</h2>` | `DashboardPageShell` (`scroll`/`padded` toggle when a report is open, editor via `TextEditorWithToolbar`) |
| (menu itself) | — | `toolbar` h2 "Views" | `DashboardPageShell` |

### Other top-level pages

| Page | Route | File | Shell | Title today | Sidebar label |
|---|---|---|---|---|---|
| STATUSES | `/dashboard/statuses` | `statuses/page.tsx` (1085 lines: editor / matrix / migration-list branches) | `DashboardPageShell` | varies by branch, has its own `toolbarSecondRow` usage already | "Statuses" |
| MSG TODO (list) | `/dashboard/todo-msg` | `todo-msg/page.tsx` | `DashboardPageShell` | — (not read in full this pass) | "Msg Todo" |
| MSG TODO (edit) | `/dashboard/todo-msg/edit` | `todo-msg/edit/page.tsx` | `EditorPageShell` + manual `NavGroup` | — | (reached via list, not its own menu entry) |
| MSG PLANNER | `/dashboard/msg-planner` | `msg-planner/page.tsx` (356 lines) | `EditorPageShell` | — (not read in full this pass) | "Msg Planner" |
| BEEPER (contacts list) | `/dashboard/beeper` | `beeper/page.tsx` | `DashboardPageShell` | `<h2>Beeper</h2>` | "Beeper" |
| BEEPER (inbox) | `/dashboard/beeper/inbox` | `beeper/inbox/page.tsx` | `DashboardPageShell`, `upLevel={{href:"/dashboard/beeper"}}` | `<h2>Inbox</h2>` | (reached via Beeper) |
| BEEPER (merge) | `/dashboard/beeper/merge` | `beeper/merge/page.tsx` | `DashboardPageShell`, `upLevel={{href:"/dashboard/beeper"}}` | `<h2>Merge suggestions</h2>` | (reached via Beeper) |
| BEEPER (conversation) | `/dashboard/beeper/[id]` | `beeper/[id]/page.tsx` | `DashboardPageShell` (per Story 60 Task 3) | — (not read in full this pass) | (reached via Beeper) |
| FOLDER | `/dashboard/folders` | `folders/page.tsx` (419 lines) | `DashboardPageShell` — **no `toolbar` at all** (same gap as Settings: no title today) | none | "Folders" (**plural** — user's prompt says target name "FOLDER" singular; flagging the mismatch, not resolving it here) |
| MESSAGES | `/dashboard/messages` | `messages/page.tsx` (379 lines) | **None** — plain custom div layout, `<h2 className="text-3xl font-bold tracking-tight">Messages</h2>`, not on `DashboardPageShell` at all | "Messages" (large heading, different style from every other page) | "Messages" |
| SETTINGS | `/dashboard/settings` (+ 6 sub-routes) | `settings/layout.tsx` + `settings/page.tsx` (+ `account`/`password`/`appearance`/`notifications`/`display`/`api-keys` sub-pages) | `DashboardPageShell` (see item 4) | none | "Settings" |
| USERS | `/dashboard/users` | `users/page.tsx` (168 lines) | `DashboardPageShell` (per grep; not confirmed via full read this pass — flag to re-verify at implementation time) | — | "Users" |
| LEADS details | `/dashboard/leads/details` | `leads/details/page.tsx` (468 lines) | `DashboardPageShell` | — | (reached via Views → LEADS, not its own top-level menu entry) |
| LEADS msg-workout | `/dashboard/leads/msg-workout` | `leads/msg-workout/page.tsx` | `EditorPageShell` + manual `NavGroup` | — | (reached via a lead's own page) |
| Login | `/login` | `app/(auth)/login/page.tsx` | **None of the dashboard shells** — `<div className="min-h-screen flex items-center justify-center ...">` wrapping a shadcn `Card`, i.e. today it's **centered**, not top-left, and has no relationship to `DashboardPageShell`/frame conventions at all | "Personal Dashboard" (`CardTitle`) | n/a (pre-auth) |

Sidebar menu source: `packages/dashboard/components/shared/sidebar.tsx`,
`sidebarGroups` array (lines 26–57) — four groups: **ACTIONS** (Forms,
Views), **MESSAGES / LEADS** (Statuses, Msg Todo, Msg Planner, Beeper,
Folders, Messages), **Others** (Settings), **Admin** (Users). Item labels
are title-case today (`"Msg Todo"`, `"Folders"`), not uppercase — the
prompt's target names (STATUSES, MSG TODO, ...) read as page-title
convention; whether the *sidebar menu labels themselves* should also become
uppercase is not specified either way in the prompt and needs a decision in
`02_plan.md`, not a guess.

## 10a. Corrected against `documentation/dashboard/forms/features/daily-tracker-dates.md` (read on the user's explicit instruction, supersedes parts of §10 below)

This doc (status: "done and verified against real data, including a real
CSV import, 2026-07-12") is the authoritative, already-audited record of
the Daily Entry/Tracker/Date Entry/Dates data flow — added to
`02_what-and-where.md`'s index in this Story since it wasn't listed there
before. Corrections to §10's original (code-reading-only) findings:

- **Item naming is sequential numbers, not date-based.**
  `generateEntryName(existingNames, _dateStr?)` in `packages/dba/src/
  leads.ts` (current source, re-checked): `let n = existingNames.length + 1;
  candidate = String(n).padStart(2, "0")`, incrementing past collisions —
  produces `"01"`, `"02"`, `"03"`, ... The `_dateStr` parameter is accepted
  but unused (prefixed `_`). The JSDoc comment on `saveDailyEntry` still
  says `@param itemName - The name of the entry (e.g., "26-07-10")`, which
  is stale relative to this current behavior — not fixed in this Story
  (out of scope), just noted so nobody re-trusts that comment.
- **`itemName`/`loca` already exist per entry in `dba`, but only `itemName`
  currently reaches the Views/Tracker table.** `DailyEntryItem` (`leads.ts`)
  is `{ itemName: string; loca: string; body?: string }` — `getAllChildTextItems`
  (which `getAllDailyEntries`/`getAllDateEntries` call) already returns
  `loca` per item. `GET /api/forms/daily-entry` surfaces both `itemName`
  and `loca` per row already. But `GET /api/views` — **the endpoint the
  Views/Tracker page actually renders from** — maps each entry to only
  `{ itemName, body }`, dropping `loca` entirely (`route.ts`'s
  `DailyEntryRecord`/`DateEntryRecord` interfaces don't declare it). Adding
  `loca` to that response is a pure additive field — safe per
  `05_endpoint-rules.md` §5 (existing consumers ignore unknown-to-them
  fields; nothing currently reads `entry.loca` from `/api/views`, so
  nothing breaks).
- **Overwrite-in-place via `Put` on daily/date entries has already been done
  once, for real** — not just "proven for Reports/Statuses" as §10 said.
  During the CSV import (§7 of that doc), `kamil_s`'s test daily entries
  `01`/`02` and date entries `01`-`04` were overwritten in place (same item
  name, real CSV data written via `Put`) rather than left in the dataset —
  run as a one-off Node script using the same `runWithRepoContext` +
  existing save functions, not through a dedicated update function/route.
  So the underlying `Put`-to-known-loca operation is proven end-to-end for
  this exact data, just not yet wrapped in a reusable `dba` function or API
  route — that gap is real (see §10 below) but the risk of the underlying
  CP operation itself is already retired.
- **Delete confirmed, independently, a second time:** "No delete method
  exists (`DeleteWorker.Delete()` in the C# is an empty, unimplemented
  stub — confirmed by reading it)" — matches this Story's own §10 finding
  from project memory, now confirmed directly against the C# source by a
  prior session, not just recalled.
- **AUTO fields are never persisted** — `computeDailyAutoFieldsByDate()` is
  a pure function computed server-side on every `GET`, merged into the
  response; nothing writes `PULLS AUTO`/`CLOSES AUTO`/`QUALITY DP AUTO`/
  `QUALITY C AUTO` back to storage anywhere. `updateDailyEntry` must not
  either — persisting a stale computed snapshot would drift from the real
  rule the moment any Date Entry changes.
- **User's explicit implementation constraints for `updateDailyEntry`**
  (their words, recorded verbatim in `01_input.md` as the message after
  Input 4): reuse the existing flow, don't build an independent save
  mechanism from scratch; keep the existing `POST` as create-only; add a
  compatible update operation; identify the target Item by its real
  `itemName`/`loca`, never by matching on `DATE` alone (dates aren't
  guaranteed unique — nothing currently enforces one entry per day); never
  call `generateEntryName()` or `PostParentItem` during an update (those
  are create-only operations — using them for update would create a
  duplicate instead of overwriting); never write the AUTO columns; after
  `Put`, re-read and confirm the total entry count is unchanged and exactly
  the targeted Item's content changed (regression guard against accidental
  duplication).

## 10. Daily-entry save/edit backend path — checked before touching DAILY TRACKER, per the user's explicit instruction not to build a pretend Save UI

- **No edit/update path exists for daily entries today.** `packages/dba/src/leads.ts`'s `saveDailyEntry(itemName, bodyYaml)` (used by `POST /api/forms/daily-entry`) always goes through `PostParentItem` + `generateEntryName(existingNames, dateStr)` — i.e. it's create-only, generating a fresh unique name (`26-07-10`, `26-07-10b`, ...) every call. There is no `updateDailyEntry`/`editDailyEntry` counterpart, and no `PATCH`/`PUT` handler on `/api/forms/daily-entry` or anywhere under `/api/views`.
- **But the underlying primitive this would need already exists and is proven elsewhere**, twice:
  - `packages/dba/src/report-entries.ts`'s `updateReportEntry(loca, content)` — the exact "edit an existing item in place" pattern: `GetItem` (read current type/name at a known `loca`) then `Put` to that same `loca`, explicitly documented in its own comment as "never `PostParentItem`, which is only for create-or-get of a not-yet-known item." This is what powers the already-working Reports edit flow in `Views → REPORTS` (`TextEditorWithToolbar`'s `onSave` → `handleReportEditorSave`).
  - `packages/dba/src/statuses-dashboard.ts`'s `saveLeadStatus` does the analogous thing for Statuses: `PostParentItem` to find-or-create the status item (idempotent), then a `Put`-based `putStatusContent(statusLoca, newBody)` to overwrite it — this is what powers Statuses' currently-working per-row and bulk save.
  - So a `updateDailyEntry(loca, bodyYaml)` in `leads.ts`, mirroring `updateReportEntry`'s `GetItem`-then-`Put` shape almost line for line, plus a new API route (`PATCH`/`POST` on `/api/forms/daily-entry` or a new `/api/views/daily-entry/edit`, mirroring `/api/statuses/edit`'s shape) is the **minimal concrete change** needed to make Daily Tracker's per-row/bulk Save actually persist. Per the user's explicit instruction, this is described here and **not implemented without separate agreement** — it's a `dba` addition (business logic), not a dashboard-layer decision to make unilaterally.
- **Delete is a harder blocker, not just a missing endpoint.** Per prior project context (not re-derived in this Story, carried over from earlier work on this repo): the Content Provider's own `DeleteWorker.Delete` is an empty stub — nothing in this codebase can currently perform a real delete of a Content Provider item; the established workaround elsewhere in the app is overwrite-in-place (rename/blank out), never actual deletion. This directly conflicts with the user's later requirement (mid-Story clarification) for a working Delete-with-confirmation flow on a single Daily Tracker entry. Flagging this as a real, currently-unresolved blocker rather than an implementation detail — see `02_plan.md`'s revised Task 10 and the open question raised back to the user.

## 11. Architectural boundary (unaffected by this Story, confirmed)

`packages/dba` remains the only layer that talks to the Content Provider;
none of the pages/components touched by this Story's plan call it or
MongoDB directly — this is a pure UI-layer (`packages/dashboard`) layout
Story. Confirmed nothing in the inventory above crosses that boundary.
