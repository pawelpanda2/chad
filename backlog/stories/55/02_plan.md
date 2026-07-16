# Story 55 — 02_plan.md

**This plan is presented for approval before any Task 1-4 implementation
starts**, per the input's explicit "Nie rozpoczynaj implementacji przed
przygotowaniem planu." The documentation reorganization (Input 2) was
already executed directly — see `03_knowledge.md`'s "Organizational work"
section — because it was mechanical, fully reversible, and unrelated to
the four Tasks below; it is not gated by this plan.

## Approval (2026-07-14)

Plan approved with two decisions confirmed by the user:

1. **Task 1** uses Web Speech API as the first implementation, with these
   binding requirements: the UI must not depend on Web Speech API
   directly (only on the `SpeechToTextEngine` interface/hook); an
   unsupported browser must be shown as a normal, expected state (clear
   message), never as an error; the Chrome/Edge-only limitation and the
   future Whisper adapter must both be written into the documentation;
   Web Speech API must never be presented as the target mobile solution.
2. **Task 3**: Create button gets its own row at **all** breakpoints,
   including desktop — confirmed, one layout, no mobile/desktop branch.

Implementation starts below.

## Task 5 — Default dashboard tab: Forms, not Statuses (added mid-implementation, Input 5)

Added urgently while Tasks 1-4 were already in progress — implemented
immediately rather than deferred, since it's a one-line, low-risk,
independent change.

- Root cause confirmed by direct inspection (not guessed): `app/
  (dashboard)/dashboard/page.tsx` — visiting `/dashboard` (the landing
  target after both `/` and post-login `router.push("/dashboard")`)
  server-side `redirect()`s straight to `/dashboard/statuses`. This one
  file/line is the entire mechanism; the sidebar nav order was already
  "Forms" before "Statuses" visually (`components/shared/sidebar.tsx`) and
  was never the cause.
- Change: `redirect("/dashboard/statuses")` → `redirect("/dashboard/forms")`.
  No other file needed changes (confirmed `app/page.tsx`,
  `app/(auth)/login/page.tsx`, and `middleware.ts` all just route to
  `/dashboard` generically and don't hardcode a tab themselves).

## Task 1 — Voice recording for reports: architecture + first implementation

**Analysis (Web Speech API vs. Whisper vs. local STT vs. mobile):**

| Option | Fit |
|---|---|
| **Web Speech API** (`webkitSpeechRecognition`) | Zero infrastructure, no API key/cost, real-time partial results, purely client-side. Downsides: Chrome/Edge/Safari only (no Firefox), audio is sent to the browser vendor's own cloud STT (Chrome → Google) with no control over that, quality/language support varies by vendor, **not usable at all from a native mobile app** (it's a browser Web API, not a device capability). |
| **OpenAI Whisper** (API or self-hosted whisper.cpp/faster-whisper) | High, consistent accuracy including Polish, works identically regardless of browser, and — critically for the mobile-extensibility requirement — a mobile app can record audio locally and upload it to the *same* backend transcription endpoint, no browser API involved. Downsides: needs a backend endpoint, either an OpenAI API key + per-request cost, or self-hosted compute; not real-time streaming without extra work. |
| **Local/on-device recognition** (e.g. Whisper via WASM in-browser) | Best privacy, no per-request cost, works offline. Downsides: large model download, slow without a GPU, meaningfully more implementation effort, worst fit for "later extend to mobile" (mobile devices are the least equipped for heavy on-device inference of the three options). |

**Decision, driven by the input's explicit constraint ("nie implementuj
rozwiązania utrudniającego późniejszą zmianę silnika"):** introduce a
provider-agnostic interface first, so the concrete engine is swappable
without touching any UI code — mirroring this repo's existing pattern of
hiding a volatile dependency behind a stable interface (`dba` hides
Content Provider specifics from dashboard/console the same way).

- `packages/dashboard/lib/speech/types.ts` — `SpeechToTextEngine`
  interface: `isSupported(): boolean`, `start(opts: { lang?: string;
  onPartialResult?: (text: string) => void }): void`, `stop(): Promise<{
  text: string }>`, `abort(): void`.
- `packages/dashboard/lib/speech/web-speech-engine.ts` — **first concrete
  implementation**, using `webkitSpeechRecognition`/`SpeechRecognition`.
  Chosen as the first cut over Whisper because it validates the actual
  product UX (does voice-reporting feel good at all?) at zero
  infrastructure cost before investing in a backend endpoint, API key,
  and cost management — a walking-skeleton approach. `lang` defaults to
  `pl-PL` but is a parameter, never hardcoded past the engine boundary.
- `packages/dashboard/hooks/use-speech-to-text.ts` — thin React hook
  wrapping whichever engine is injected, returning `{ isRecording,
  transcript, error, start, stop }`. UI code (the Record button) talks
  only to this hook, never to the concrete engine directly.
- `components/shared/voice-record-button.tsx` — small, reusable component
  (mic icon, recording indicator, live partial transcript) taking an
  `onTranscript: (text: string) => void` callback. Wired into Reports via
  `TextEditorWithToolbar`'s existing, currently-unused `toolbarExtra`
  prop — **not** built into `TextEditorWithToolbar` itself and **not**
  Reports-specific, so any other editor usage can opt in the same way
  later without further shared-component changes.
- Mobile extensibility documented, not built: a future native-mobile
  adapter would implement the same `SpeechToTextEngine` contract (likely
  backed by device audio capture + the same future Whisper backend
  endpoint, since native apps cannot use `webkitSpeechRecognition` at
  all) — recorded in `06_propositions.md`, not implemented now.

**Open question for approval:** confirm Web Speech API is an acceptable
first cut given its Chrome/Edge-only + Google-cloud-STT tradeoffs, versus
going straight to a Whisper-backed endpoint as the first implementation
instead (more infra work up front, but avoids building something that
gets thrown away if Web Speech API's quality/privacy tradeoffs turn out
to be unacceptable for report content).

## Task 2 — Back button standardized to the right

- Add `components/shared/back-button.tsx` — a single, shared component
  (`onClick` or `href`, icon+text) so every page renders the *same*
  component going forward instead of hand-rolling it, which is the root
  cause of today's inconsistency (confirmed: no shared component exists
  at all, see `03_knowledge.md`'s full inventory table).
- Update every one of the 14 confirmed occurrences (leads/details,
  views×3, statuses, todo-msg/edit×2, leads/msg-workout×2, forms×5,
  beeper×5) to use it, and to render right-aligned within its toolbar row
  (each toolbar's other content — titles, action buttons — needs reading
  in full per-page before repositioning, so the rest of that row doesn't
  break; not a blind find-and-replace).
- Excluded with reason (see `03_knowledge.md`): the 401/403 auth-error
  pages (different route group, different design, different label) and
  `msg-planner` (has no existing Back button to move).
- Icon-only vs. icon+text styling stays as-is per page — this task is
  about *position*, not visual style; the inconsistency in style is
  noted separately in `06_propositions.md`, not conflated with this task.

## Task 3 — Reports Create button on its own row

- UX judgment (per the input's "najpierw oceń UX, potem podejmij
  decyzję"): today Create shares a plain `flex` row with the read-only
  "Generated name" preview field, with zero responsive classes anywhere
  in this file — on mobile this row is the first thing in the whole form
  likely to overflow/crowd. Giving Create its own row below "Generated
  name" reads as clearer on mobile (primary action gets visual weight),
  and — since a "confirm the generated name, then a dedicated action
  row" pattern is also a clean, standard form layout on desktop, not
  just a mobile compromise — the same structure will be applied at all
  breakpoints rather than maintaining two different conditional layouts
  for one button. This avoids inventing new `sm:`-only markup in a file
  that has none today.
- Implementation: split the current combined row (`forms/page.tsx`
  ~768-778) into two — "Generated name" row, then a Create-button row —
  for the Reports form only. No other form on this page is touched
  (Action/Daily Entry/Date Entry/Add Lead keep their existing layout;
  this task's input scoped this to Reports specifically).

## Task 4 — Configurable default tab on the shared editor

- Add `defaultTab?: "preview" | "editor"` to `TextEditorWithToolbarProps`
  (`components/shared/text-editor-with-toolbar.tsx`), defaulting to
  `"preview"` so all four existing usages keep their current behavior
  unless they explicitly opt in — satisfies "Nie implementuj tego
  wyłącznie dla Reports" (it's a prop on the shared component, not a
  Reports-only branch) and "Pozostałe miejsca pozostaw zgodnie z ich
  dotychczasową logiką" (unspecified callers get no behavior change).
  `useState<"preview"|"editor">(defaultTab ?? "preview")` — safe as a
  lazy initializer because the Reports instance only ever mounts *after*
  `isReportCreated` flips true (confirmed conditional-render, not an
  always-mounted instance whose prop changes post-mount).
- Reports (`forms/page.tsx`): pass `defaultTab="editor"` — matches the
  explicit requirement ("po utworzeniu nowego raportu powinna
  automatycznie otworzyć się zakładka Editor"), and matches the UX logic
  that Preview of empty just-created content is useless.
- Other three usages (`leads/msg-workout`, `todo-msg/edit`,
  `msg-planner`): all edit *existing* content, where opening on Preview
  to review before editing still makes sense — leave their default
  unspecified (inherits `"preview"`), per the input's own "lub dostosuj
  po analizie UX" escape hatch, this analysis concludes no change is
  warranted there.

## Testing plan

- Task 1: manual browser test of record → live partial transcript →
  stop → transcript lands in the Reports editor's `value`, in a
  Chrome/Edge-family browser (Web Speech API's actual support surface).
  Note explicitly in the report that Firefox/Safari are not supported by
  this first implementation, and that this is a Web Speech API
  limitation, not a bug.
- Task 2: click through every one of the 14 updated occurrences, confirm
  Back renders on the right and still navigates identically to before.
- Task 3: resize to a mobile viewport and confirm Create is on its own
  row on the Reports form; confirm the same structure reads cleanly at
  desktop width too.
- Task 4: create a new report, confirm Editor tab is active immediately;
  open an existing todo-msg/msg-workout/msg-planner item, confirm Preview
  is still the default there (regression check for the "leave unchanged"
  usages).
- No automated test suite exists for `packages/dashboard` today (not
  introducing one as part of this Story — out of its stated scope);
  verification is manual click-through per the above, run for real in a
  browser, not just `next build`/typecheck.
