# Story 93 — Plan

## Goal

Forms → **Add recording**: capture real microphone audio (MediaRecorder),
preview, discard/re-record, upload to a thin Dashboard API that writes a
binary file under the configured audio directory (host target
`/Volumes/cp_1/02_files_refrenced/10_files_audio/`).

## Out of scope

Transcription, Whisper, AI, recording list/edit, MP3 conversion, migration,
PROD deploy, push, changing speech-to-text (`VoiceRecordingPanel`).

## Architecture

```
Forms button → ?form=add_recording
  → AudioRecordingForm (MediaRecorder + preview)
  → POST /api/forms/audio-recording (multipart, session)
  → dba.saveAudioRecording({ bytes, mimeType })
  → write under process.env.CHAD_AUDIO_RECORDINGS_DIR
```

- Client never sees host path; never sends destination path/filename.
- Server generates `YYYY-MM-DD_HH-mm-ss_<uuid>.<ext>`.
- Env `CHAD_AUDIO_RECORDINGS_DIR` = path **as seen by Node** (host or
  container). Docker bind-mounts host `02_files_refrenced/10_files_audio`
  to `/app/audio-recordings`.

## Formats

Prefer `audio/webm` / `audio/ogg` via `MediaRecorder.isTypeSupported`.
Extension matches MIME. Max size 50 MiB. No overwrite (wx flag + uuid).
