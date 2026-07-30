# Story 93 — Plan

## Goal

Forms → **Add recording** and Views → **Recordings**: capture real
microphone audio (MediaRecorder), save it with metadata, then browse and
play it back from a dedicated recordings list.

## Out of scope

Transcription, Whisper, AI, edit/delete UI, MP3 conversion, migration of
legacy files, PROD deploy, push, changing speech-to-text
(`VoiceRecordingPanel`).

## Architecture

```
Views button → ?view=recordings
  → list from GET /api/views/recordings
  → + Add → /dashboard/forms?form=add_recording&returnTo=/dashboard/views?view=recordings

Forms button → ?form=add_recording
  → AudioRecordingForm (date + generated displayName + MediaRecorder)
  → POST /api/forms/audio-recording (multipart, session)
  → dba.saveAudioRecording({ bytes, mimeType, displayName, recordedDate })
  → write audio + sidecar metadata under process.env.CHAD_AUDIO_RECORDINGS_DIR/<repoGuid>/

Playback:
  GET /api/views/recordings/[id]/audio
  → dba.getAudioRecordingReadInfo(id)
  → range-safe stream, no host path exposure
```

- Client never sees host path; never sends destination path/filename.
- Server generates `YYYY-MM-DD_HH-mm-ss_<uuid>.<ext>`.
- Metadata JSON sidecar stores `displayName`, `recordedDate`, `createdAt`,
  `durationMs`, `mimeType`, `sizeBytes`.
- Per-user isolation is by `repoGuid` subdirectory, derived from session via
  `runWithRepoContext`.
- Env `CHAD_AUDIO_RECORDINGS_DIR` = path **as seen by Node** (host or
  container). Docker bind-mounts host `02_files_refrenced/10_files_audio`
  to `/app/audio-recordings`.

## Formats

Prefer `audio/webm` / `audio/ogg` via `MediaRecorder.isTypeSupported`.
Extension matches MIME. Max size 50 MiB. No overwrite (wx flag + uuid).
