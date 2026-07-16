# Plan — Story 56

Status: draft, awaiting approval before implementation.

## Task 1 — Reports form: Create + Generated name inside the existing metadata frame

Superseded by Input 2 (clarification): **do not** create a second top frame.
Keep the single existing metadata frame (`rounded-xl border bg-card shadow-sm
p-[10px]`, `packages/dashboard/app/(dashboard)/dashboard/forms/page.tsx`,
Reports branch, lines 735–784) and reorganize its internal rows:

- **Row 1** (top, left-aligned): `Create` button, then `Generated name`
  (read-only input), in that order.
- **Row 2** (below row 1): `Date`, `Report kind`, `Rest of the name` — same
  three inputs as today, same disabled-after-create behavior.

No new frame, no new component. Pure JSX reordering inside the existing
`<div className="shrink-0 rounded-xl border bg-card shadow-sm p-[10px]">`.
`Create`'s existing disabled/loading logic (`reportSaving`) and the
disabled-metadata-after-create logic (`isReportCreated`) are unchanged.

## Task 2 — Recording panel + Move

New component: `components/shared/voice-recording-panel.tsx`, replacing the
current `toolbarExtra={<VoiceRecordButton .../>}` wiring in the Reports form
(`VoiceRecordButton` stays as a generic building block/export for any other
future `toolbarExtra` consumer, but Reports switches to the new panel).

- Owns its own `useSpeechToText(engine)` instance (same hook, same
  `SpeechToTextEngine` interface — no change to `voice-recording.md`'s
  architecture).
- Renders as its own `rounded-xl border bg-card` frame, positioned in
  `EditorPageShell` between the metadata frame and the (conditionally
  rendered) editor — visible even before the report is created, so the user
  can dictate while still filling in metadata.
- Layout: `[Record] [Move] [transcript]`, `items-start` so multi-line
  transcript text doesn't re-center the buttons; transcript wraps
  (`whitespace-pre-wrap break-words`) in a `flex-1 min-w-0` column next to
  the buttons.
- Height: no fixed/small height — the frame is `shrink-0` and grows with
  content. To satisfy "must not blow up the whole page," the transcript
  text container itself gets `max-h-[35vh] overflow-y-auto` (an internal
  scroll only for unusually long dictation), while the frame as a whole
  stays `shrink-0` next to the `flex-1 min-h-0` editor in the same
  `flex-col` `EditorPageShell` — exactly the layout mechanism already used
  for the metadata frame today, so no new page-scroll risk.
- `useSpeechToText` hook gets one addition: `clear(): void` (resets
  `transcript` to `""` without starting a new recording) — needed so the
  panel can clear the box after a confirmed successful Move.
- **Move** (`onMove` prop, provided by the Reports form):
  1. Panel calls `onMove(transcript)`.
  2. Reports form's handler builds `combined = reportContent.trim() ?
     `${reportContent}\n${transcript}` : transcript` (same separator rule
     `handleReportVoiceTranscript` already uses), calls
     `setReportContent(combined)`, then calls the **same** save function via
     a new optional override param: `handleReportSave(combined)` instead of
     duplicating the POST logic. `handleReportSave` is changed to accept an
     optional `contentOverride?: string` (falls back to `reportContent`
     state) and to **return `boolean`** (success) instead of `void`, so
     Move can decide whether to clear the transcript.
  3. On success (`true`): panel calls `clear()`.
  4. On failure (`false`): transcript is left as-is; `handleReportSave`
     already sets `reportError` + toasts the error, so no separate error
     path is needed in the panel.
- Disabled rules for **Move**: `!reportCreated || !transcript.trim() ||
  saving` (`saving` = the Reports form's existing `reportSaving` state,
  shared with the regular Save button so the two can't race).
- **Record** keeps today's behavior (start/stop via the same hook).

## Task 3 — Views / Reports: real bug + missing Editor

Two separate things, both required:

1. **Root-cause bug** (the literal `if (content)` pattern): in
   `packages/dba/src/report-entries.ts`, `getAllReportEntries()` has:
   ```ts
   let body: string | undefined;
   if (itemResult?.Body) {
     body = ...
   }
   ```
   `itemResult?.Body === ""` is falsy, so a genuinely-empty report's body
   collapses to `undefined` — indistinguishable from "no Body field at
   all." Fix: check presence, not truthiness —
   `itemResult?.Body !== undefined && itemResult?.Body !== null` (mirrors
   the already-correct check in `getReportEntryByLoca` a few lines below).
   This makes `body: ""` for a genuinely empty report flow through as `""`,
   not `undefined`, all the way to the client.
2. **Missing Editor in Views**: today `views/page.tsx`'s Reports branch
   renders only a read-only `<PreviewContent body={selectedReport.body ||
   ""} />` when a report is selected — there is no Editor tab at all, in
   any case (empty or not). That contradicts "Editor ma się pojawić także
   dla pustego stringa" and "użytkownik musi móc rozpocząć edycję pustego
   raportu," which require actual editing capability from Views, not just
   Preview. Fix: replace the plain `PreviewContent` render with the shared
   `TextEditorWithToolbar` (same component Forms uses), wired to a new
   local save handler in `views/page.tsx` that POSTs to the **same**
   `/api/forms/reports` route (loca-based update — the route already
   supports this, no route change needed) — reusing the existing update
   endpoint from a second page is not logic duplication (one route, one
   `updateReportEntry` function; the page only adds a fetch call, same
   shape Forms already uses).
   - `selectedReport ? (...)` (a truthy check on the **object**, not on
     `.body`) already correctly distinguishes "no report selected" from "a
     selected report with empty body," and is kept as-is.
   - This does soften the documented "Reports view is read-only" limitation
     from `reports-form.md` — the doc will be updated to reflect this
     (Views/Reports becomes editable, same update endpoint as Forms).

## Task 4 — Right 100px reserved strip (desktop only)

Single change in `app/(dashboard)/layout.tsx`'s `<main>` element: add
`md:pr-[100px]` (in addition to the existing `p-0.5`) so every page gets the
strip automatically, only at `md:` and above. Mobile is untouched (no `pr`
override below `md`). This becomes the reserved space Task 5's nav group
sits near (see below) — answers Task 4's own question ("padding of a shared
container" vs "reserved space for navigation" vs "part of a shared
toolbar"): it's shared-container padding that doubles as reserved nav space.

## Task 5 & 6 — Shared navigation: `\` (level up), `Back`/`Next` (real history)

### New shared pieces

1. **`components/shared/dashboard-history-provider.tsx`** — a client
   context mounted once in `app/(dashboard)/layout.tsx`, wrapping `<main>`.
   Tracks the dashboard's own visited-URL stack (`pathname` +
   `searchParams`, since that's the existing source of truth for
   `?form=`/`?view=` state) as an array + index, independent of the raw
   browser History API (which doesn't expose "can go back/forward"
   reliably cross-browser). On every URL change: if the new URL matches
   `entries[index-1]` → treat as Back (decrement index, keep forward
   stack); if it matches `entries[index+1]` → treat as Forward (increment);
   otherwise → truncate anything after `index` and push the new URL
   (standard "new navigation from a mid-point drops forward history"
   semantics, same as native browsers). Exposes `useDashboardHistory()`:
   `{ canGoBack, canGoForward, goBack, goForward }`, where `goBack`/
   `goForward` call `router.push(entries[index ± 1])`.
2. **`components/shared/nav-group.tsx`** — renders `[\] [Next] [Back]`,
   right-aligned (same `ml-auto`-on-wrapper trick as today's `BackButton`,
   must be the last flex child of its row), sized/styled like the existing
   `BackButton` (outline, icon-size buttons). Props: `upLevel?: { onClick:
   () => void; disabled?: boolean; label?: string }` (the hierarchy-up `\`
   button; omitted → rendered disabled, no page-specific parent level).
   `Next`/`Back` read `useDashboardHistory()` internally — no props needed,
   so every consumer gets them "for free." Extra `md:mr-[75px]` on the
   group's wrapper (only at `md:`) so it sits ~75px to the left of the
   100px strip from Task 4, per the spec's positioning; no extra margin on
   mobile (falls back to the plain `ml-auto` position among wrapped toolbar
   buttons, like `BackButton` today).
   `\` is disabled when `upLevel` is absent or `upLevel.disabled` is true.

### Rollout — replacing `BackButton`

`\`'s `onClick`/`disabled` reuses each page's **existing** "Back" handler
as-is (semantically, today's per-page `handleBack`/`handleFormBack` already
mean "go up one level in this page's own hierarchy," e.g. `router.push(pathname)`
strips `?form=`/`?view=`, or `setSelectedReportLoca(null)` un-selects a
report) — no business-logic changes, only relabeling/repositioning plus a
real `disabled` condition for "already at the top level."

**Baked into the shell (zero/near-zero per-page change):**
`DashboardPageShell` gets the `NavGroup` appended automatically at the end
of its toolbar row, plus a new optional `upLevel` prop threaded straight
into `NavGroup`. This means the many `DashboardPageShell`-based pages that
currently have **no** Back button at all (`msg-planner`, `todo-msg` list,
`users`, `beeper` list) get `Back`/`Next` for free with `\` simply disabled
— directly addressing Input 3 ("review all views," not just the ones that
already had a Back button).

**Per-file changes** (remove the manual `<BackButton .../>` from `toolbar`,
pass `upLevel` instead):
- `forms/page.tsx` — all branches (`action`, `add_action`, `date_entry`,
  `lead` use `DashboardPageShell`; `reports` uses `EditorPageShell` with a
  hand-built header row, so there `NavGroup` is placed directly in that row
  in place of `BackButton`).
- `views/page.tsx` — `leads`, `reports` (list level and selected-report
  level get different `upLevel.onClick`: `handleBack` vs
  `() => setSelectedReportLoca(null)`), `tracker`/`dates`.
- `leads/details/page.tsx` — `upLevel.onClick = handleBack`. This is the
  page Input 3 flagged; will verify in-browser it now renders correctly
  right-aligned with the group (existing single-`BackButton` toolbar
  should already have been right-aligned via `ml-auto`, but will be
  visually re-checked once `NavGroup` replaces it, since this is the page
  the user flagged as *not* being on the right).
- `statuses/page.tsx` — `upLevel.onClick = closeEditor`.
- `beeper/inbox/page.tsx`, `beeper/[id]/page.tsx`, `beeper/merge/page.tsx`
  — currently `href`-based (`/dashboard/beeper`); `NavGroup`'s `upLevel`
  gets an `href` variant too (mirroring `BackButton`'s `onClick`/`href`
  duality) so these keep working as plain links.
- `leads/msg-workout/page.tsx`, `todo-msg/edit/page.tsx` — these use
  `EditorPageShell` with their own hand-built header row (not
  `DashboardPageShell`); `NavGroup` replaces their header-row
  `BackButton`. Their **separate**, pre-shell centered error-state
  `BackButton` (loading/error before the shell mounts, `className="ml-0"`,
  2 occurrences) is left as a plain `BackButton` — it's outside the
  toolbar/shell entirely and isn't part of "the navigation area of a
  view," so `NavGroup`'s Back/Next/`\` semantics don't apply there.

**Scope boundary** (stated explicitly, please confirm): pages not yet on
`DashboardPageShell`/`EditorPageShell` (`settings/*`, dashboard home,
`documents`, `folders`, `messages`, `content-provider`, `datalib`,
`projects`, `errors`, `auth`) are **not** touched by this Story — they
already sit outside the layout standard per
`responsive-layout-standard.md`'s own documented "Known limitations," and
Input 3's examples (leads details, Forms, Views) are all inside the shelled
set. Migrating the remaining pages onto the shell standard is a separate,
larger, pre-existing follow-up, not part of "urgent bugs."

`back-button.tsx` itself is **not deleted** — it keeps the 2 standalone
pre-shell error-card call sites above.

## Files touched (summary)

- `packages/dashboard/app/(dashboard)/dashboard/forms/page.tsx`
- `packages/dashboard/app/(dashboard)/dashboard/views/page.tsx`
- `packages/dashboard/app/(dashboard)/dashboard/leads/details/page.tsx`
- `packages/dashboard/app/(dashboard)/dashboard/leads/msg-workout/page.tsx`
- `packages/dashboard/app/(dashboard)/dashboard/todo-msg/edit/page.tsx`
- `packages/dashboard/app/(dashboard)/dashboard/statuses/page.tsx`
- `packages/dashboard/app/(dashboard)/dashboard/beeper/inbox/page.tsx`
- `packages/dashboard/app/(dashboard)/dashboard/beeper/[id]/page.tsx`
- `packages/dashboard/app/(dashboard)/dashboard/beeper/merge/page.tsx`
- `packages/dashboard/app/(dashboard)/layout.tsx`
- `packages/dashboard/components/shared/dashboard-page-shell.tsx`
- `packages/dashboard/components/shared/nav-group.tsx` (new)
- `packages/dashboard/components/shared/dashboard-history-provider.tsx` (new)
- `packages/dashboard/components/shared/voice-recording-panel.tsx` (new)
- `packages/dashboard/hooks/use-speech-to-text.ts` (add `clear()`)
- `packages/dba/src/report-entries.ts` (`getAllReportEntries` fix)
- Documentation updates: `documentation/dashboard/forms/features/reports-form.md`,
  `documentation/dashboard/common/features/responsive-layout-standard.md`,
  `documentation/dashboard/common/features/voice-recording.md` (or a new
  sibling doc for the recording panel), plus a new
  `documentation/dashboard/common/features/shared-navigation.md` describing
  the history provider + `NavGroup` standard.

## Verification plan

- `tsc`/`next lint`/`next build` for `packages/dashboard`; `tsc` for
  `packages/dba`.
- Manual click-through per the mandatory test list in `01_input.md`
  (Forms→Reports create/record/Move/save, Views→Reports empty report,
  Back/Next/`\` at ≥2 hierarchy levels, disabled states, desktop strip,
  mobile regression check) using the local dev stack.

## Open assumptions to confirm before implementing

1. Task 1: single reorganized frame (per Input 2), not a second separate
   frame (superseding the original Task 1 text) — confirmed by Input 2.
2. Task 3: Views/Reports becomes genuinely editable (Preview+Editor+Save),
   not just "Preview with a correct empty state" — required by "Editor ma
   się pojawić" + "musi móc rozpocząć edycję pustego raportu."
3. Task 5/6 scope boundary: only pages already on
   `DashboardPageShell`/`EditorPageShell` are migrated to `NavGroup` this
   Story (listed above); the remaining not-yet-shelled pages are left for a
   future Story.
4. `Back`/`Next` use an app-tracked history stack (not raw
   `window.history`/browser back-forward-cache), so `canGoBack`/
   `canGoForward` are reliable in every browser, not just Chromium.

## Approved (all 4 confirmed) + Task 5 revision

All 4 assumptions above confirmed as-is. Task 5's history provider is
further constrained (simplest possible implementation):

- Max **5** entries back, max **5** entries forward — **not** unbounded.
- RAM only (plain React state in `DashboardHistoryProvider`) — no
  `localStorage`/`sessionStorage`/backend persistence of any kind.
- A page refresh clears history entirely — this falls out for free from
  RAM-only state (a reload remounts the provider from scratch); no explicit
  reset code needed.

Implementation: single `entries: string[]` + `index: number`, exactly as
described above, but every time a **new** navigation pushes an entry (not a
Back/Forward replay), the back portion (`entries.slice(0, index)`) is
trimmed to at most 5 by dropping the oldest. Because the forward portion
can only ever be repopulated by first going Back through *those same*
already-capped 5 back-entries, the forward side is automatically bounded to
5 too — no separate trim needed for it.

Task 6 confirmed: covers **all** pages using `DashboardPageShell` (baked
into the shell itself, as planned), plus the `EditorPageShell` pages with
their own hand-built header row listed above.

Implementation starting now.
