# Forms → Add recording (binary audio)

Status: Story 93 (2026-07-30).

## Cel

Nagrać rzeczywiste audio z mikrofonu (MediaRecorder) i zapisać **plik
binarny** na dysku — nie transkrypcję. Osobne od speech-to-text
(`VoiceRecordingPanel` / Web Speech API).

## UI

Forms → **ADD RECORDING** → `?form=add_recording`:

- Record / Stop / timer
- preview (`<audio controls>`)
- Save / Discard / Record again
- status sukcesu lub błędu

Bez AI, tagów, listy nagrań, edycji.

## Zapis

```
Browser → POST /api/forms/audio-recording (multipart `file`)
       → packages/dba/src/audio-recordings.ts → saveAudioRecording
       → process.env.CHAD_AUDIO_RECORDINGS_DIR
```

- Sesja wymagana; klient **nie** wysyła ścieżki ani nazwy docelowej.
- Nazwa serwerowa: `YYYY-MM-DD_HH-mm-ss_<uuid>.<ext>` (`wx`, bez overwrite).
- MIME allowlist: webm / ogg / mp4 / mpeg / wav (max 50 MiB).
- Błędy nie ujawniają pełnej ścieżki hosta.

## Konfiguracja środowisk

| Środowisko | Host path (bind source) | `CHAD_AUDIO_RECORDINGS_DIR` (w procesie) |
|---|---|---|
| Mac bare / Next local | `/Volumes/cp_1/02_files_refrenced/10_files_audio` | ten sam path |
| Mac Docker | jak wyżej (`CHAD_AUDIO_RECORDINGS_HOST_PATH`) | `/app/audio-recordings` |
| QNAP TEST/PROD | `/share/cp_1/02_files_refrenced/10_files_audio` | `/app/audio-recordings` |

Pisownia katalogu `02_files_refrenced` jest zamierzona — nie „poprawiać”.

Brak env / brak uprawnień → kontrolowany błąd (`NOT_CONFIGURED` / `WRITE_FAILED`), bez fallbacku.

## Pliki

- `packages/dashboard/components/forms/audio-recording-form.tsx`
- `packages/dashboard/app/api/forms/audio-recording/route.ts`
- `packages/dba/src/audio-recordings.ts`
- `packages/dba/src/audio-recordings.test.ts`
