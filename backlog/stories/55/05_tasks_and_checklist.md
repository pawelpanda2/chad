# Story 55 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | Reports editor has a "Record" button that transcribes speech into the report body (Chrome/Edge); other browsers show a clear "not available" message instead of an error |
| 2 | DONE      |             | The "Back" button is on the right on every dashboard page that has one |
| 3 | DONE      |             | Reports form's "Create" button is on its own row, both on mobile and desktop |
| 4 | DONE      |             | A newly created report opens on the "Editor" tab automatically; other editors (Msg Todo, Msg Workout, Msg Planner) still open on "Preview" as before |
| 5 | DONE      |             | Dashboard now lands on "Forms" (not "Statuses") right after login |

# Task 1 — Voice recording for reports

**Requested:** (`01_input.md` Input 1) architecture + first implementation
for dictating a report instead of typing it; analyze Web Speech API,
Whisper, local recognition, and future mobile extensibility first; never
implement something that makes swapping the recognition engine later hard.
Approved (Input 4): Web Speech API as the first implementation behind a
`SpeechToTextEngine` interface, unsupported-browser handled as a normal
state (not an error), Chrome/Edge limitation and future Whisper adapter
documented, never presented as a mobile solution.

**Done:**
- `lib/speech/types.ts` — `SpeechToTextEngine` interface
  (`isSupported`/`start`/`stop`/`abort`); the only contract any UI code is
  allowed to depend on.
- `lib/speech/web-speech-engine.ts` — first concrete engine, wraps
  `SpeechRecognition`/`webkitSpeechRecognition` behind that interface; the
  only file in the codebase that references the vendor API.
- `hooks/use-speech-to-text.ts` — React state binding over any engine.
- `components/shared/voice-record-button.tsx` — reusable Record/Stop
  control; renders a plain explanatory note (never an error) when
  `isSupported()` is `false`.
- Wired into Reports only, via `TextEditorWithToolbar`'s existing
  `toolbarExtra` slot — no changes needed to the shared editor component
  itself. `handleReportVoiceTranscript` (forms/page.tsx) appends the
  transcript to existing content rather than replacing it.
- Documented in `documentation/dashboard/common/features/
  voice-recording.md` (new) and cross-referenced from `reports-form.md`.

**Files changed:** `lib/speech/types.ts` (new), `lib/speech/
web-speech-engine.ts` (new), `hooks/use-speech-to-text.ts` (new),
`components/shared/voice-record-button.tsx` (new), `app/(dashboard)/
dashboard/forms/page.tsx` (`handleReportVoiceTranscript`, `toolbarExtra`
wiring).

**Tested (real browsers, Playwright, against the actually-running local
Docker stack — not a mock):**
- Chromium: `isSupported()` → `true`; clicking Record transitions the
  button to a "Stop" state with no console/page errors; clicking Stop
  completes with no errors.
- Firefox: `isSupported()` → `false`; the Record button is replaced with
  "Voice recording isn't available in this browser (needs Chrome or
  Edge)" — confirmed via screenshot, plain muted text, not a red error.
- **Not tested:** actual transcription accuracy against a real human
  voice — the sandboxed test environment has no real audio input device;
  `--use-fake-device-for-media-stream` provides a synthetic silent
  stream, sufficient to prove the start/stop state machine and error
  paths work, not to judge recognition quality (which is Chrome's own
  engine, not this app's code).

**Status:** DONE.

# Task 2 — Standardize the Back button to the right

**Requested:** (`01_input.md` Input 1) move "Back" to the right side on
every dashboard page; review all pages; no unjustified exceptions.

**Done:**
- New shared `components/shared/back-button.tsx` — every page now renders
  the *same* component instead of hand-rolled markup (root cause of the
  original inconsistency: no shared component existed at all).
  `showLabel`/`label`/`onClick`/`href` cover every variant found (icon+text,
  icon-only, custom label, link-based).
- Migrated all 19 occurrences across 8 files: `leads/details/page.tsx`,
  `views/page.tsx` (×3), `statuses/page.tsx`, `todo-msg/edit/page.tsx`
  (×2), `leads/msg-workout/page.tsx` (×2), `forms/page.tsx` (×5),
  `beeper/inbox/page.tsx`, `beeper/merge/page.tsx`, `beeper/[id]/page.tsx`
  (×3). Each toolbar's other content (titles, search boxes, action
  buttons) was read in full and reordered so Back is the last flex child
  (required for its self-applied `ml-auto` to isolate only Back on the
  right, not drag trailing siblings with it).
- Deliberately excluded, with reasons recorded in `03_knowledge.md`: the
  401/403 auth-error pages (different route group, different design,
  literally labeled "Go Back") and `msg-planner` (has no existing Back
  button to reposition).

**Files changed:** `components/shared/back-button.tsx` (new), plus the 8
page files listed above (removed now-unused `ArrowLeft`/`Button` imports
where applicable).

**Tested (real browser, Playwright, logged in as a real user):**
- Screenshotted and visually confirmed right-alignment on: Reports form
  (icon-only), Views/Leads (icon+text), Action form (icon+text), Beeper
  Inbox (link-based). All render with Back as the rightmost toolbar
  element, title/search/other controls on the left.
- Clicked Back on Beeper Inbox → correctly navigated to `/dashboard/beeper`.
- Clicked Back on Views/Leads and on the Reports form's icon-only Back →
  confirmed (via `git diff` on `handleBack`/`handleFormBack`) this is
  pre-existing `router.push(pathname)` behavior unrelated to this Story —
  see `06_others_from_report.md`.

**Status:** DONE.

# Task 3 — Reports "Create" button on its own row

**Requested:** (`01_input.md` Input 1, refined by Input 4) Create button
in its own row in the mobile layout; evaluate desktop too; apply the
clearer layout everywhere if it's genuinely clearer, not just on mobile.
Approved: own row at all breakpoints, no mobile/desktop branch.

**Done:** Split the combined "Generated name + Create" row
(`forms/page.tsx`, Reports branch) into two: a "Generated name" row, then
a "Create" row underneath, unconditionally (same JSX at every viewport
width) — Reports form only, no other form on that page touched.

**Files changed:** `app/(dashboard)/dashboard/forms/page.tsx`.

**Tested (real browser, Playwright):** screenshotted at desktop (1400px)
and mobile (390px, fresh navigation, not a resize) — confirmed Create
renders on its own row at both widths.

**Status:** DONE.

# Task 4 — Configurable default tab on the shared editor

**Requested:** (`01_input.md` Input 1) make the shared editor's default
tab (Preview/Editor) configurable as a component-level option, not a
Reports-only hack; Reports should open on Editor immediately after
creating a new report; other usages keep their existing behavior unless a
UX review says otherwise.

**Done:**
- Added `defaultTab?: "preview" | "editor"` to
  `TextEditorWithToolbarProps` (`components/shared/
  text-editor-with-toolbar.tsx`), defaulting to `"preview"` — a genuine
  shared-component option, not a per-page branch.
- Reports (`forms/page.tsx`) passes `defaultTab="editor"` — confirmed the
  instance only ever mounts *after* report creation (conditional render),
  so the `useState` lazy initializer reads the right value on its one and
  only relevant mount.
- Reviewed the other three usages (Msg Todo edit, Msg Workout, Msg
  Planner) — all edit *existing* content, where Preview-first still makes
  sense (see `02_plan.md`'s UX reasoning); left unset, no behavior change.
- Corrected a stale doc detail found while touching this component:
  `shared-text-editor-toolbar.md` previously listed `label`/`icon` props
  that never actually existed on the real component — removed to match
  the real source.

**Files changed:** `components/shared/text-editor-with-toolbar.tsx`,
`app/(dashboard)/dashboard/forms/page.tsx`.

**Tested (real browser, Playwright, logged in):** created a report for
real against the live stack → screenshot confirms the "Editor" tab is
active (highlighted) immediately, with the "Record" button (Task 1)
already visible in the same toolbar.

**Status:** DONE.

# Task 5 — Default dashboard tab: Forms, not Statuses

**Requested:** (`01_input.md` Input 5, added urgently mid-implementation)
the first tab that opens should be Forms, not Statuses.

**Done:** `app/(dashboard)/dashboard/page.tsx` — the single `redirect()`
target changed from `/dashboard/statuses` to `/dashboard/forms`. Confirmed
by inspection this is the *only* place the "first tab" is decided (root
`/` and post-login both just route to `/dashboard` generically; the
sidebar nav order was never the cause).

**Files changed:** `app/(dashboard)/dashboard/page.tsx`.

**Tested (real browser, Playwright, real login):** logged in for real as
`pawel_f` against the live stack — landed on `http://localhost:12020/
dashboard/forms` immediately after authentication, screenshot confirms
the Forms hub (Daily Entry / Date Entry / Add Lead / Actions / Reports)
renders as the very first screen.

**Status:** DONE.
