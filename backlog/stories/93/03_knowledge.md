# Story 93 — Knowledge

## Decisions

1. **Binary audio ≠ speech-to-text.** Left `VoiceRecordingPanel` untouched.
2. **Filesystem via env, not CP.** Target
   `/Volumes/cp_1/02_files_refrenced/10_files_audio/` is outside CP
   `repos/` trees. Contract: `CHAD_AUDIO_RECORDINGS_DIR` +
   `saveAudioRecording` in dba.
3. **Host vs container.** Docker bind-mounts host
   `…/02_files_refrenced/10_files_audio` → `/app/audio-recordings`.
   QNAP host default `/share/cp_1/…`; Mac `/Volumes/cp_1/…`.
4. **Per-user isolation by repoGuid.** Files and sidecar metadata live under
   `CHAD_AUDIO_RECORDINGS_DIR/<repoGuid>/`, derived from session via
   `runWithRepoContext`. Views/stream routes never accept a host path.
5. **Metadata sidecar, no DB migration.** Each audio file gets a sibling JSON
   file with `displayName`, `recordedDate`, `createdAt`, `durationMs`,
   `mimeType`, `sizeBytes`, `storedFileName`.
6. **Spelling `refrenced` preserved** — do not rename.

## Formats / limits

- Prefer webm/ogg via `MediaRecorder.isTypeSupported`
- Max 50 MiB; MIME allowlist; server-generated name; `wx` write
