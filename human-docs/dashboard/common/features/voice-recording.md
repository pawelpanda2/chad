# Voice recording (speech-to-text)

Status: first implementation, Story 55 (2026-07-14); UI/flow rebuilt and a
real append bug fixed, Story 56 (2026-07-14).

## Cel

Let the user dictate a report's body by voice instead of typing it, without
locking the app to one speech-recognition engine — the input explicitly
required a design that doesn't make swapping engines later hard.

## Zakres

Architecture (engine-agnostic interface + hook) plus one concrete engine
(Web Speech API), wired into the Reports form's editor as the first, and
so far only, consumer. Not implemented: a Whisper-backed engine, a native
mobile adapter, or any other editor usage.

## Architecture

```
components/shared/voice-record-button.tsx   (UI: Record/Stop button + live transcript)
        │  uses
        ▼
hooks/use-speech-to-text.ts                 (React state around one engine)
        │  takes any
        ▼
lib/speech/types.ts                         (SpeechToTextEngine interface)
        ▲  implemented by
        │
lib/speech/web-speech-engine.ts             (Web Speech API adapter — the ONLY
                                              file that touches the vendor API)
```

`SpeechToTextEngine` (`lib/speech/types.ts`): `id`, `isSupported()`,
`start({ lang, onPartialResult, onError })`, `stop(): Promise<{ text }>`,
`abort()`. **Every** UI component and hook talks only to this interface —
never to `SpeechRecognition`/`webkitSpeechRecognition` directly. That
boundary is what lets a future engine (e.g. Whisper) be swapped in by
writing a new file that implements the same interface and changing one
`createXEngine()` call at the call site — no UI changes.

## First engine: Web Speech API

`lib/speech/web-speech-engine.ts`, `createWebSpeechEngine()`. Chosen as
the first cut (not Whisper) specifically to validate the report-by-voice
UX without building backend infrastructure first — see
`backlog/stories/55/02_plan.md` for the full comparison against
Whisper and local/on-device recognition.

**Permanent limitations of this engine (approved tradeoffs, not bugs):**
- **Chrome/Edge only.** Firefox and Safari have no
  `SpeechRecognition`/`webkitSpeechRecognition` at all.
  `VoiceRecordButton` calls `isSupported()` and renders a plain,
  muted-text explanatory note instead of the Record button when
  unsupported — **never** an error state. Verified in real Firefox via
  Playwright (Story 55 testing): message reads "Voice recording isn't
  available in this browser (needs Chrome or Edge)".
- **Audio goes to the browser vendor's own cloud STT** (e.g. Google's, in
  Chrome) — outside this app's control.
- **Not a mobile solution.** There is no native-mobile equivalent of this
  API; a future mobile app needs an entirely different
  `SpeechToTextEngine` implementation (see `backlog/stories/55/
  06_others_from_report.md`). This engine is never presented to the user as a
  cross-device answer, only as what currently powers the Record button in
  a desktop browser.

## Usage (Reports form) — rebuilt in Story 56

`components/shared/voice-recording-panel.tsx` (`VoiceRecordingPanel`) is
now a standalone rounded frame in the Reports form (between the metadata
panel and the editor), not a `toolbarExtra` button. It owns its own
`useSpeechToText(engine)` instance and renders `[Record] [Move]` plus the
live/final transcript, growing with the transcript's length (the
transcript text container caps at `max-h-[35vh] overflow-y-auto` so very
long dictation scrolls internally instead of ever pushing the page into a
global scroll).

**Move** (`onMove` prop, supplied by the Reports form): builds
`reportContent.trim() ? \`${reportContent}\n${transcript}\` : transcript`
(same separator convention as the old `handleReportVoiceTranscript`),
calls `setReportContent`, then saves via the **same** `handleReportSave`
function the Save button uses (extended with an optional content-override
parameter so it can save the just-computed value without waiting on a
state update) — no duplicated save logic. On confirmed success the panel
clears its own transcript (`clear()`, see below); on failure the
transcript is left untouched and the existing save-error UI shows the
problem. Move is disabled when the report hasn't been created yet, the
transcript is empty, or a save (Move's own or the regular Save button's)
is already in progress.

Language defaults to `pl-PL` (`VoiceRecordingPanel`'s `lang` prop) — report
content is assumed Polish by default for this single-user tool, but the
prop exists specifically so this is not hardcoded past the UI boundary.

**`VoiceRecordButton`** (the Story 55 toolbar-button component) still
exists as a generic building block for any other editor's `toolbarExtra`
slot — Reports no longer uses it, but nothing else changed about it.

## Bug fixed in Story 56: Record → Stop → Record wiped the transcript

`useSpeechToText`'s `start()` used to unconditionally reset `transcript`
to `""`, and the engine's own per-session `finalTranscript` is also always
fresh per `start()` call (by design — an engine session only ever knows
about itself). Combined, a second Record/Stop cycle silently **replaced**
whatever had already been dictated instead of appending to it. Fixed
entirely inside the hook (`hooks/use-speech-to-text.ts`), which now tracks
a `baseRef` — the text finalized across all completed Record/Stop cycles
since the last `clear()`. Each new `start()` composes
`${base} ${sessionPartialText}` live (so the combined text updates in
real time during the second/third/... recording too, not just after
stopping), and `stop()` folds the session's final text into `baseRef` for
next time. No change to `lib/speech/web-speech-engine.ts` was needed — the
engine's per-session `finalTranscript` reset is correct in isolation; the
bug was purely in how the hook composed sessions together.

## Edge cases

- **No microphone permission**: surfaced via the engine's `onError`
  callback (`reason: "permission-denied"`), rendered as inline destructive
  text under the Record/Move row — not a silent failure.
- **Stopping with no speech recognized**: `stop()` resolves with the
  unchanged accumulated text (nothing appended); Move stays disabled if
  that's still empty.
- **Recording, then navigating away mid-recording**: not handled specially
  — the engine instance is created fresh per component mount
  (`useMemo(() => createWebSpeechEngine(), [])`), so it's garbage
  collected with the component; no explicit cleanup/abort-on-unmount was
  added (out of scope, low risk given the single-user, same-tab usage
  pattern).

## Testing

Story 55: real Chromium via Playwright, `--use-fake-ui-for-media-stream
--use-fake-device-for-media-stream` — confirmed `isSupported()` is `true`,
clicking Record transitions the button to a "Stop" state with no console
errors, clicking Stop completes with no errors. Real Firefox via
Playwright — confirmed `isSupported()` is `false` and the graceful
unsupported-browser message renders instead of the button. Did **not**
test actual speech transcription against a real human voice (no audio
input in the sandboxed test environment) — the recognition engine itself
is Chrome's own, not this app's code, so this was considered out of scope
for automated verification here.

Story 56: real Chromium via Playwright against the rebuilt local Docker
stack, logged in as a real user — confirmed Record/Stop with the fake
(silent) audio device produces no console/page errors and correctly
leaves Move disabled (empty transcript); confirmed the new panel renders
as its own frame with Record above Move, transcript to the right. The
Record→Stop→Record append-bug fix itself was verified by code
review/reasoning (the fake device produces no actual speech, so the fix
couldn't be exercised end-to-end with real recognized text in this
sandboxed environment) — same limitation as Story 55's own testing notes
above.

## Dalsze etapy

See `backlog/stories/55/06_others_from_report.md`: a Whisper-backed engine
(if Web Speech API's accuracy/support/privacy tradeoffs prove
unacceptable), and a native-mobile adapter.
