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

## Follow-up 2026-07-31 — prawdziwe Pause/Resume + drafty odporne na refresh

### Checklist

- [x] Pause = `MediaRecorder.pause()`, Resume = `MediaRecorder.resume()` —
  jedna instancja na sesję (`audio-recorder-session.ts`), Resume nigdy nie
  tworzy nowego recordera
- [x] Timer liczy tylko aktywny czas nagrania (pauzy wykluczone)
- [x] Stop = JEDEN Blob sesji; brak konkatenacji gotowych kontenerów
- [x] Chunki checkpointowane w IndexedDB (nie localStorage); beforeunload
  tylko jako dodatkowe ostrzeżenie
- [x] Draft backendowy: `CHAD_AUDIO_RECORDINGS_DIR/drafts/<draftId>/`
  (draft.json + segmenty), zapis atomowy temp→rename, checkpoint po Pause
  (provisional, zastępowany), finalny upload po Stop
- [x] Recovery po refresh: chunki z IndexedDB dogrywane jako segment tego
  samego draftu („Recovered draft · N saved segments")
- [x] Views → Recordings: sekcja draftów (Draft/Finalizing/Error, łączny
  czas, liczba segmentów, Continue)
- [x] Finalizacja: mkvmerge --webm remux/append → jeden plik + sidecar;
  idempotentna; podwójny Save = jeden plik; błąd finalizacji zachowuje
  draft; katalog draftu usuwany dopiero po potwierdzeniu
- [x] mkvtoolnix dodany do obrazu Docker (runner stage, +75 MB — zamiast
  ffmpeg: 196 pakietów, kilkaset MB); na hoście Mac przez brew
- [x] Izolacja repoGuid (draft innego usera = 404 we wszystkich
  operacjach) + walidacja draftId/sessionId (path traversal)
- [x] Stary endpoint POST /api/forms/audio-recording bez zmian kontraktu

### Tests run (2026-07-31)

- `npx vitest run` (audio-recordings, audio-recording-drafts,
  audio-recording-utils, audio-recorder-session) — **39 passed**:
  - regresja: 4s+Pause+4s+Pause+4s = 1 instancja recordera, 1 blob, 12 000 ms
    aktywnego czasu (fake recorder + fake clock — mock, nie fizyczny mikrofon)
  - integracja na PRAWDZIWYCH fixture: 3 × ~4 s Opus/WebM generowane
    ffmpegiem przez pipe (bez Duration header, jak MediaRecorder) →
    finalizacja mkvmerge → ffprobe mierzy ~12.02 s; single-segment remux
    → ~4.007 s (naprawa Infinity duration)
  - idempotencja: równoległy podwójny finalize = 1 plik; failed finalize
    (niescalalne mp3×2) → status error, segmenty zostają
  - izolacja cross-user + path traversal draftId/sessionId
- `pnpm --filter dba build`, `pnpm --filter dashboard build` — OK

