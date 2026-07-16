# Story 55 — Others (decisions, problems, limitations, propositions)

**Note (Story 56 migration):** this file merges what used to be
`05_report.md`'s non-Task sections and the separate `06_propositions.md`
(after two intermediate renames) into one optional file, per the final
Story documentation standard. Content unchanged from the originals, only
relocated/merged.

## Organizational work (not on the Checklist)

**Documentation reorganization (`01_input.md` Input 2).** Restructured
`documentation/ai-docs/knowledge/` into `01_ai_start.md` (new, short entry
point), `02_what-and-where.md` (moved from `documentation/ai-docs/`),
`03_story-standard.md`, `04_deployment-rules.md` (both renumbered from
`01_`/`02_`). Fixed every cross-reference repo-wide, including
`documentation/README.md`'s pointer. This Story's own `01_ai_start.md`
reading order reflects the new structure it introduced.

**Story 54 correction, done before Story 55's own work started.** The
user separately flagged that Story 54 was missing a task: renaming every
`begin.sh`/`<NN>_begin.sh` script repo-wide to `re-start.sh`/
`<NN>_re-start.sh`. Confirmed by inspection this had never been
implemented and was absent from Story 54's own Checklist/report/plan/
knowledge. Implemented (6 files renamed, every real cross-reference fixed
across scripts/`docker-compose.*.yml`/docs), tested end-to-end against
the live local-mac-docker stack, and Story 54's own documentation was
retroactively corrected — full detail lives in
`documentation/stories/54/05_tasks_and_checklist.md` (Task 4), not
repeated here since it is a different Story's own record.

**Per-feature documentation updated:** `documentation/dashboard/forms/
features/reports-form.md` (Create-button layout, `defaultTab="editor"`,
voice recording), `documentation/dashboard/common/features/
shared-text-editor-toolbar.md` (`defaultTab` prop, stale `label`/`icon`
correction, Reports added to "Views Using This Component", Back-button
example updated to use the new shared component),
`documentation/dashboard/common/features/responsive-layout-standard.md`
(new "Back button" subsection describing the `BackButton` standard),
`documentation/dashboard/common/features/voice-recording.md` (new —
architecture, engine tradeoffs, testing notes),
`documentation/ai-docs/knowledge/02_what-and-where.md` (index entries for
all of the above).

## Problems encountered

- No test credentials were available to browser-test the app as a logged
  -in user; asked the user directly (`01_input.md`, the exchange around
  Input 5) rather than guessing or skipping verification — received
  working test credentials and completed full Playwright-driven
  verification of all 5 tasks against the real, running local-mac-docker
  stack (rebuilt from source via this repo's own `03_build.sh`/
  `04_re-start.sh` so the test genuinely reflected the new code, not a
  stale image).
- A first attempt to reposition the Back button in
  `dashboard-deployment-scripts.md`-unrelated files via a blind
  find-and-replace corrupted a hand-written before/after mapping during
  the separate Story 54 correction (unrelated to Story 55's own code) —
  caught immediately by re-reading the file, fixed manually. No equivalent
  issue occurred in Story 55's own edits (all were targeted `Edit` calls,
  no bulk `sed` used against Story 55 source files).

## Not done / left undone

- Actual Whisper/mobile-adapter engines for Task 1 — deliberately out of
  scope for this Story's "first implementation," recorded in Propositions
  below.
- The sidebar-doesn't-collapse-on-mobile and Back-doesn't-visibly-navigate
  observations from Task 2/3 testing — both confirmed pre-existing and
  unrelated to this Story's own changes, recorded in Propositions below
  rather than fixed here.
- `msg-planner`'s missing Back button and the icon-only/icon+text styling
  inconsistency — both explicitly out of scope for a position-only Task 2,
  recorded in Propositions below.

## Propositions

- **Mobile voice-recording adapter (Task 1 follow-up).** The first
  implementation targets Web Speech API (browser, desktop-first). A
  future native-mobile adapter implementing the same `SpeechToTextEngine`
  interface would be needed to actually reach mobile — likely backed by
  device-native audio capture uploaded to a future Whisper-backed
  endpoint, since `webkitSpeechRecognition` has no native-mobile
  equivalent. Not implemented now; the interface is designed so this can
  be added without touching the Reports UI.
- **Whisper-backed engine as a quality upgrade (Task 1 follow-up).** If
  Web Speech API's accuracy/browser-support/privacy tradeoffs prove
  unacceptable in real use, add a second `SpeechToTextEngine`
  implementation backed by a backend transcription endpoint (OpenAI
  Whisper API or self-hosted whisper.cpp) — the interface from Task 1
  is designed specifically to make this a swap, not a rewrite.
- **`msg-planner` has no Back button at all** (Task 2 follow-up). Out of
  scope for Task 2 (which repositions *existing* Back buttons), but the
  page's own feature doc already notes it hasn't been migrated to the
  shared shell standard — adding one, using the new `back-button.tsx`
  from Task 2, would close this gap. (Superseded in part by Story 56's
  `NavGroup` — see `documentation/stories/56/`.)
- **Icon-only vs. icon+text Back button styling is inconsistent**
  (Task 2 follow-up). Three occurrences (todo-msg/edit, leads/msg-workout,
  forms/reports — all `EditorPageShell`-based) render icon-only, the rest
  render icon+"Back" text. Task 2 only standardizes *position*; unifying
  the visual style too would be a separate, deliberate follow-up.
- **Sidebar doesn't collapse at mobile viewport widths.** Noticed while
  browser-testing Task 3 at 390px width (Playwright, fresh navigation —
  not a resize artifact): the dashboard sidebar stays fully rendered,
  crowding page content, instead of collapsing/hiding. Unrelated to what
  Task 3 actually asked for (the Reports Create-button row) and not
  touched. Worth its own responsive-layout follow-up if mobile use is a
  real priority.
- **`Back` on Views/Leads and on several Forms sub-pages doesn't visibly
  navigate anywhere** (pre-existing, confirmed via `git diff` to predate
  Story 55 — Task 2 only repositioned these buttons, never touched their
  `onClick`). `handleBack`/`handleFormBack` call `router.push(pathname)`,
  which strips only the query string; since `usePathname()` already
  excludes the query string, this is effectively a same-URL no-op
  navigation on these particular pages. Worth a dedicated look at what
  these handlers were actually meant to do (return to a "hub" state?
  reset local state instead of navigating?) — out of scope for a
  position-only Story.
