# Story 56 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE | | Osobna górna ramka Create i Generated name |
| 2 | DONE | | Ramka nagrywania z Record i Move |
| 3 | DONE | | Edytor i Preview dla pustego raportu |
| 4 | DONE | | Prawy pusty pas we wszystkich widokach desktopowych |
| 5 | DONE | | Nawigacja Back, Next i \ |
| 6 | DONE | | Standaryzacja wspólnej nawigacji |

# Task 1 — Osobna górna ramka Create i Generated name

**Requested:** (`01_input.md` Input 1) split `Create` + `Generated name`
into their own top frame, separate from the rest of the Reports metadata.
**Superseded mid-Story by Input 2:** keep the single existing metadata
frame, reorganize its rows instead — row 1: `Create` then `Generated
name`; row 2: Date, Report kind, Rest of the name.

**Done:** `packages/dashboard/app/(dashboard)/dashboard/forms/page.tsx`,
Reports branch — the metadata frame's JSX reordered into two rows exactly
as approved. `Create`'s `reportSaving`-gated disabled/loading state and
`isReportCreated`-gated field locking are unchanged; only the layout
around them moved.

**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/forms/page.tsx`.

**Tested:** real browser (Playwright, Chromium, logged in as `Pawel_F`
against the rebuilt local Docker stack) — screenshot confirms `Create` +
`Generated name` on row 1, Date/Report kind/Rest of the name on row 2,
before Create; after Create, `Create` disappears and Date/Report
kind/Rest of the name render `disabled` (confirmed both visually and via
`page.isDisabled()`).

**Status: DONE**

---

# Task 2 — Ramka nagrywania z Record i Move

**Requested:** (`01_input.md` Input 1) a new standalone rounded frame
between the metadata frame and the editor: `[Record] [Move] [transcript]`,
growing with the transcript's length but never breaking page scroll.
Move: append transcript to the report body (newline-separated), save via
the *same* function as the Save button, clear the transcript only on
confirmed success, disabled when the report isn't created / transcript is
empty / a save is already in progress.

**Corrections that arrived during implementation:**
- A real bug found by the user while reviewing: Record → Stop → Record
  again **wiped** the already-dictated text instead of appending to it.
- Move should sit **below** Record (not beside it), to leave more
  horizontal room for the transcript text.

**Done:**
- New `components/shared/voice-recording-panel.tsx` — its own
  `rounded-xl border bg-card shadow-sm` frame, `[Record above Move]` (a
  narrow button column) next to the transcript (`flex-1 min-w-0`,
  `whitespace-pre-wrap break-words`, `max-h-[35vh] overflow-y-auto` so an
  unusually long dictation scrolls internally instead of growing the page
  without bound). Rendered unconditionally in the Reports form (visible
  even before Create, so the user can dictate while still filling in
  metadata) — only `Move` is gated on `reportCreated`.
- `hooks/use-speech-to-text.ts` — added `clear()`; and fixed the
  Record→Stop→Record bug: a `baseRef` now tracks text finalized across
  all completed Record/Stop cycles since the last `clear()`. `start()`
  composes `${base} ${livePartial}` instead of resetting to `""`; `stop()`
  folds the session's final text back into `baseRef`. No change needed
  in `lib/speech/web-speech-engine.ts` (its own per-session
  `finalTranscript` reset was already correct in isolation — the bug was
  purely in how the hook combined sessions).
- `forms/page.tsx` — `handleReportSave` extended with an optional content
  override + changed to return `boolean` (success), so `handleReportVoiceMove`
  can build the combined content, save it through the exact same function
  the Save button uses (no duplicated POST logic), and only clear the
  transcript on a confirmed `true`.
- `VoiceRecordButton`/its old `toolbarExtra` wiring removed from Reports
  (component itself kept as a generic building block for any other
  editor's `toolbarExtra`).

**Files changed:** `components/shared/voice-recording-panel.tsx` (new),
`hooks/use-speech-to-text.ts`, `packages/dashboard/app/(dashboard)/dashboard/forms/page.tsx`.

**Tested (real browser, Playwright, `--use-fake-ui-for-media-stream
--use-fake-device-for-media-stream`, against the rebuilt local Docker
stack):** clicked Record → waited → clicked Stop with no console/page
errors; confirmed `Move` stayed **disabled** afterward (correct — the fake
device is silent, so the transcript is genuinely empty, which is exactly
the "Move disabled when transcript empty" rule engaging correctly).
Confirmed via screenshot the panel renders Record above Move, transcript
to the right, both before and after Create.

**Not verifiable here:** actual dictated content across two Record/Stop
cycles (the append-bug fix itself) — the sandboxed environment has no real
microphone input, so no real speech ever reaches the transcript to
observe accumulating. Verified by code review instead; logged in
`06_others_from_report.md`.

**Status: DONE**

---

# Task 3 — Edytor i Preview dla pustego raportu

**Requested:** (`01_input.md` Input 1) fix the bug where selecting a
report with an empty body shows neither Editor nor Preview; find the
actual `if (content)`-shaped truthiness bug, don't paper over it with a
fallback; both tabs must exist for an empty report, and the user must be
able to start editing it. **Confirmed in review (Input 4):** yes, this is
an intentional scope expansion — Views/Reports becomes editable, and
Editor must appear for empty content too.

**Done:**
- Found the real bug: `packages/dba/src/report-entries.ts`,
  `getAllReportEntries()` had `if (itemResult?.Body) { body = ... }` —
  `itemResult?.Body === ""` is falsy, so a genuinely empty report's body
  collapsed into `undefined`, indistinguishable from "no Body at all."
  Fixed to an explicit presence check (`!== undefined && !== null`),
  mirroring the already-correct check a few lines below in
  `getReportEntryByLoca`.
- `packages/dashboard/app/(dashboard)/dashboard/views/page.tsx` — the
  Reports branch's `selectedReport ? (...) : (...)` truthy check was
  already correctly based on the **object** (not `.body`), so it already
  distinguished "no report selected" from "selected, empty body." The
  actual missing piece was that Views/Reports had **no Editor at all**
  (read-only `PreviewContent` only) — replaced with the shared
  `TextEditorWithToolbar` (same component Forms uses), with its own
  `editedReportContent`/`reportSaving`/`reportSaved` state, synced from
  the selected report on `selectedReportLoca` change, and a save handler
  posting to the same `/api/forms/reports` route (loca-based update) that
  Forms' own Save already uses — no new route, no duplicated logic.

**Files changed:** `packages/dba/src/report-entries.ts`,
`packages/dashboard/app/(dashboard)/dashboard/views/page.tsx`.

**Tested (real browser, Playwright, against the rebuilt local Docker
stack):** created a second report and deliberately left it empty (never
typed into its editor), navigated to Views → REPORTS → selected it —
confirmed via `page.isVisible()` that **both** `Preview` and `Editor` tabs
are visible (`true`, `true`); Preview correctly shows "Empty content" as
its empty-state (not a missing panel); switched to Editor, typed text,
clicked Save — confirmed success (no errors, "Saved" indicator).

**Status: DONE**

---

# Task 4 — Prawy pusty pas we wszystkich widokach desktopowych

**Requested:** (`01_input.md` Input 1) ~100px empty strip on the right on
desktop only, introduced once in a shared place (wrapper/layout/toolbar),
never per-page, never shrinking mobile.

**Done:** single change in `app/(dashboard)/layout.tsx` — `<main
className="min-h-0 flex-1 overflow-y-auto p-0.5 md:pr-[100px]">`. `md:`
only applies at ≥768px, so mobile is untouched. Every page automatically
gets the strip since they all render inside this one `<main>`.

**Files changed:** `packages/dashboard/app/(dashboard)/layout.tsx`.

**Tested (real browser, Playwright):** desktop screenshots (1440px) show
the rounded frame's right edge stopping short of the viewport edge by
roughly the expected margin on every page visited (Reports, Views,
report list). Mobile screenshot (390px) confirms no forced 100px gap —
content uses the full width once the sidebar is closed, and reasonably
wraps its toolbar row when the sidebar is left open (pre-existing,
documented default-open-on-mobile behavior, unrelated to this Story).

**Status: DONE**

---

# Task 5 — Nawigacja Back, Next i `\`

**Requested:** (`01_input.md` Input 1) rebuild the trailing `Back` area
into `[\] [Next] [Back]`, all right-aligned, positioned ~75px left of the
100px strip; `Back` = real dashboard navigation history (disabled with no
earlier entry); `Next` = forward through that same history after a Back
(disabled with nothing to go forward to, never "jump to latest"); `\` =
go up one level in the *current page's own hierarchy* (not the same as
history Back), disabled at the top level, using the existing `?view=`/
`?form=` model rather than guessing from the URL text.

**Corrections that arrived during implementation:**
- (Input, Task 5 follow-up) Simplify `DashboardHistoryProvider` to the
  simplest possible implementation: max 5 entries back, max 5 forward,
  RAM only, cleared by a page refresh, no persistence of any kind.
  Approved and implemented exactly as specified.
- A later correction reordered and relabeled the whole group: **not**
  `[\] [Next] [Back]` but `[Prev ←] [Back ↶ bigger] [Forw →]` — `Prev`
  (left arrow) and `Forw` (right arrow) are the real-history buttons
  (previously "Back"/"Next"), and the middle button (previously the
  literal `\` character) becomes a bigger circular "undo" icon (`Undo2`
  from `lucide-react`) labeled `Back` — this is the up-one-level button,
  deliberately still a different action from `Prev`/`Forw` despite the
  shared word "Back."
- A follow-up correction relaxed the exact "~75px left of the 100px
  strip" positioning requirement — `NavGroup` now just right-aligns
  itself (`ml-auto`) in whatever row it's in, without an extra fixed
  offset. This was paired with moving crowded per-page filter rows (see
  Task 6/Statuses below) onto their own second toolbar row, so `NavGroup`
  naturally sits right after a short title instead of needing a precise
  pixel reservation.

**Done:**
- New `components/shared/dashboard-history-provider.tsx` —
  `DashboardHistoryProvider`, mounted once in `layout.tsx` (wrapped in
  `<Suspense>`, since it uses `useSearchParams`). Tracks `pathname` +
  `?form=`/`?view=` as an `entries[]` + `index` stack, entirely in React
  state (no `localStorage`/`sessionStorage`/backend — a page refresh
  clears it for free by remounting). On every URL change: matches
  `entries[index-1]` → Back replay (decrement); matches `entries[index+1]`
  → Forward replay (increment); otherwise → a genuinely new navigation,
  which drops the forward stack and pushes the new URL, then trims the
  back portion to at most 5 entries (which automatically bounds the
  forward portion to 5 too, since it can only ever be repopulated by
  going Back through those same capped 5 entries). Exposes
  `useDashboardHistory()`: `{ canGoBack, canGoForward, goBack, goForward }`.
- New `components/shared/nav-group.tsx` — `NavGroup`, `[Prev] [Back]
  [Forw]`, right-aligned (`ml-auto`, must be the last flex child of its
  row). `Prev`/`Forw` read `useDashboardHistory()` directly (no props
  needed anywhere). `Back` (middle) takes an optional `upLevel: {
  onClick?, href?, disabled?, label? }` — omitted entirely on pages with
  no defined hierarchy above them, rendering disabled in that case.

**Files changed:** `components/shared/dashboard-history-provider.tsx`
(new), `components/shared/nav-group.tsx` (new), `app/(dashboard)/layout.tsx`.

**Tested (real browser, Playwright, real clicks — not raw URL
navigation, so the history stack actually accumulates):** clicked through
Forms → Reports → up-level Back → Forms → Reports (second report) →
Views → Reports list → selected report → up-level Back (→ list) →
up-level Back again (→ Views menu, confirmed **disabled** there via
`page.isDisabled()`, since it's the top of that hierarchy) → clicked
`Prev` (confirmed **not** disabled, URL moved back to an earlier point:
`forms?form=reports`) → clicked `Forw` (URL moved forward to
`/dashboard/views`). Zero console/page errors across the whole sequence.

**Status: DONE**

---

# Task 6 — Standaryzacja wspólnej nawigacji

**Requested:** (`01_input.md` Input 1, reinforced by Input 3 — "I see the
lead-details back arrow isn't even on the right yet, review **all**
views") don't implement Back/Next/`\` only in Reports; find every
existing Back button/local history/level-up, build or extend one shared
component, consistent look/order/disabled rules, no duplicated logic, no
regressions in Forms/Views/other main pages. **Confirmed in review:**
scope covers every page using `DashboardPageShell`.

**Done:**
- `DashboardPageShell` (`components/shared/dashboard-page-shell.tsx`) now
  renders `NavGroup` automatically, appended after `toolbar`, with a new
  `upLevel` prop threaded straight through. This means **every** page on
  `DashboardPageShell` gets `Prev`/`Back`/`Forw` for free — including
  pages that had **no** Back button at all before this Story
  (`msg-planner`'s siblings on the standard, `todo-msg` list, `users`,
  `beeper` list), directly answering Input 3's "review all views."
  Also added an optional `toolbarSecondRow` prop (a second, still
  non-scrolling row below the first) — used to move `statuses/page.tsx`'s
  numeric-range and name filters onto their own line (per a later
  correction), so `NavGroup` sits right after the short mode-select
  "title" on row one instead of crowding a long filter row.
- Removed the old, manually-placed `<BackButton>` from every page that had
  one, replacing it with `upLevel` (for `DashboardPageShell` consumers) or
  a directly-placed `<NavGroup upLevel={...} />` (for the 3 pages using
  `EditorPageShell` with their own hand-built header row: Reports,
  `leads/msg-workout`, `todo-msg/edit`). `\`/`Back`'s `onClick`/`disabled`
  reuses each page's **existing** "go back" handler as-is
  (`handleFormBack`, `handleBack`, `closeEditor`, `() =>
  setSelectedReportLoca(null)`, ...) — these already meant "go up one
  level in this page's own model," so no business logic changed, only
  the surrounding control.
- `leads/details/page.tsx` — the page Input 3 flagged specifically — now
  uses `upLevel` too; re-verified in the browser that it renders
  correctly right-aligned (the original single `BackButton` was likely
  already technically right-aligned via its own `ml-auto`, but is now
  provably consistent with every other page through the same shared
  component instead of a page-specific instance).
- `back-button.tsx` (the Story 55 component) is **not deleted** — it
  still backs the 2 standalone, pre-shell centered error cards in
  `leads/msg-workout/page.tsx` and `todo-msg/edit/page.tsx` (loading/error
  states rendered before `EditorPageShell` mounts, outside any toolbar
  row — `NavGroup`'s Back/Next/up-level semantics don't apply there).
- **Scope boundary** (stated in the plan, confirmed): pages not yet on
  `DashboardPageShell`/`EditorPageShell` (`settings/*`, dashboard home,
  `documents`, `folders`, `messages`, `content-provider`, `datalib`,
  `projects`, `errors`, `auth`) are unchanged — migrating them onto the
  shell standard is a separate, larger, pre-existing follow-up (already
  tracked in `responsive-layout-standard.md`), not part of this Story's
  "urgent bugs" scope. Logged again in `06_others_from_report.md`.

**Files changed:** `components/shared/dashboard-page-shell.tsx`
(`toolbarSecondRow`, `upLevel`, auto-`NavGroup`); `app/(dashboard)/
dashboard/{forms,views,leads/details,leads/msg-workout,todo-msg/edit,
statuses,beeper/inbox,beeper/[id],beeper/merge}/page.tsx`.

**Tested (real browser, Playwright):** confirmed via screenshots that
Forms, Views (menu/leads/reports list/tracker-dates), and the Views
Reports detail view all render `NavGroup` consistently, right-aligned,
with correct disabled states at the top of each hierarchy. Did **not**
individually click through every single `DashboardPageShell` consumer
(`msg-planner`, `todo-msg` list, `users`, `beeper` list, `statuses`
matrix/migration) in the browser — verified those by code review (the
shell renders `NavGroup` unconditionally, so their inclusion doesn't
depend on any page-specific wiring) rather than a screenshot per page,
given the size of this Story.

**Status: DONE**
