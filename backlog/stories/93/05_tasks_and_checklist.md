# Story 93 — Tasks and checklist

## Checklist

- [x] Forms → ADD RECORDING opens recording view
- [x] Record / Stop / timer / preview / Discard / Save
- [x] Server writes under configured dir (host target
  `/Volumes/cp_1/02_files_refrenced/10_files_audio/`)
- [x] Safe server filename; MIME/size validation; no path from client
- [x] Mic stream released on Stop / Discard / unmount
- [x] Speech-to-text unchanged
- [x] Tests on temp dir (not real /Volumes in automated tests)
- [x] Commit (no push / no PROD deploy)

## Tests run

- `pnpm exec vitest run packages/dba/src/audio-recordings.test.ts`
- `pnpm --filter dba build`
- `pnpm --filter dashboard build` (or typecheck)

Real microphone / live browser Record not automated (MediaRecorder mock
would not prove hardware). Optional one-off write to real host path may
be noted in report if performed.
