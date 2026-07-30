# Story 93 — Tasks and checklist

## Checklist

- [x] Forms → ADD RECORDING opens recording view
- [x] Views → RECORDINGS list uses real data
- [x] + Add from Views opens Add Recording
- [x] Record / Stop / timer / preview / Discard / Save
- [x] Local date auto-fills and prefixes display name
- [x] Server writes under configured dir (host target
  `/Volumes/cp_1/02_files_refrenced/10_files_audio/`)
- [x] Safe server filename; MIME/size validation; no path from client
- [x] Per-user isolation via repoGuid subdirectory
- [x] Safe playback route (no `/Volumes/...`, range-aware)
- [x] Mic stream released on Stop / Discard / unmount
- [x] Speech-to-text unchanged
- [x] Tests on temp dir (not real /Volumes in automated tests)
- [x] Commit (no push / no PROD deploy)

## Tests run

- `pnpm exec vitest run packages/dba/src/audio-recordings.test.ts packages/dashboard/components/forms/audio-recording-utils.test.ts`
  — **18 passed** (fixtures / temp dirs only)
- `pnpm --filter dba build` — OK
- `pnpm --filter dashboard build` — OK
- One-off `saveAudioRecording` to real
  `/Volumes/cp_1/02_files_refrenced/10_files_audio/` — OK (smoke bytes; file removed after)
- Real microphone / browser Record UI — **not** automated

Commits so far: `c22e439`, follow-up pending

