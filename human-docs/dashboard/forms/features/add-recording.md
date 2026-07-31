# Forms → Add recording (binary audio)

Status: Story 93 (2026-07-30); Pause/Resume + drafty (2026-07-31).

## Cel

Nagrać rzeczywiste audio z mikrofonu (MediaRecorder) i zapisać **plik
binarny** na dysku — nie transkrypcję. Osobne od speech-to-text
(`VoiceRecordingPanel` / Web Speech API).

## UI

Forms → **ADD RECORDING** → `?form=add_recording` (opcjonalnie
`&draft=<id>` = kontynuacja draftu z Views → Recordings):

- local date field + auto-prefixed display name
- Record / **Pause / Resume** / Stop / timer (timer liczy tylko realny
  czas nagrywania — pauza nie powiększa czasu)
- preview (`<audio controls>`) + lista zapisanych segmentów draftu
- Save (finalizacja) / Discard / Record next segment
- status sukcesu lub błędu

Bez AI, tagów ani edycji. Przeglądanie listy jest w
`Views → Recordings`, nie w Forms.

## Pause/Resume i sesje (2026-07-31)

- Jedna nieprzerwana sesja = **jedna instancja MediaRecorder** sterowana
  `pause()`/`resume()` (`components/forms/audio-recorder-session.ts`) —
  Resume nigdy nie tworzy nowego recordera; Stop daje JEDEN poprawny Blob.
- Naprawiony bug: poprzedni „Continue" tworzył nowy MediaRecorder na każdy
  fragment i sklejał gotowe kontenery `new Blob([b1, b2, b3])` — player
  pokazywał tylko ~4 s pierwszego fragmentu zamiast ~12 s.

## Drafty (ochrona przed odświeżeniem)

- Chunki nagrywanej sesji są checkpointowane w **IndexedDB**
  (`audio-recording-draft-store.ts`; nigdy localStorage); `beforeunload`
  jest tylko dodatkowym ostrzeżeniem.
- Każda sesja trafia na backend jako **segment draftu**: checkpoint po
  Pause (provisional, nadpisywany) i finalny upload po Stop.
- Po odświeżeniu formularz odzyskuje chunki z IndexedDB i dogrywa je jako
  segment tego samego draftu („Recovered draft · N saved segments").
- Draft jest widoczny w Views → Recordings (status Draft/Finalizing/Error,
  akcja Continue).

## Zapis / finalizacja

```
Nagranie:  PUT /api/forms/audio-recording/drafts/[draftId]/segments/[sessionId]
Save:      POST /api/forms/audio-recording/drafts/[draftId]/finalize
        → packages/dba/src/audio-recording-drafts.ts → finalizeAudioRecordingDraft
        → mkvmerge --webm (remux/append segmentów WebM/Ogg-Opus)
        → JEDEN plik + `<id>.json` sidecar w CHAD_AUDIO_RECORDINGS_DIR
        → katalog draftu usuwany dopiero PO potwierdzonej finalizacji
```

- Finalizacja jest **idempotentna** (podwójny Save = jeden plik); błąd
  finalizacji zachowuje draft i segmenty do ponowienia.
- `mkvmerge` (mkvtoolnix, +75 MB w obrazie Docker) zapisuje poprawny
  Duration header + cues — naprawia też brak duration w pojedynczych
  nagraniach WebM z MediaRecordera. Na gołym Macu: `brew install
  mkvtoolnix`; bez niego finalizacja wielosegmentowa zwraca kontrolowany
  błąd (draft zostaje). Segmenty MP4/AAC (Safari) nie są scalane.
- Drafty żyją w `CHAD_AUDIO_RECORDINGS_DIR/drafts/<draftId>/`
  (`draft.json` + `segment-<sessionId>.<ext>`); każdy zapis jest atomowy
  (temp → rename), a `draft.json` nigdy nie wskazuje nieistniejącego pliku.
- Stary endpoint `POST /api/forms/audio-recording` (pojedynczy plik) nadal
  działa — kontrakt bez zmian.
- Sesja wymagana; klient **nie** wysyła ścieżki ani nazwy fizycznego pliku.
- Nazwa serwerowa: `YYYY-MM-DD_HH-mm-ss_<uuid>.<ext>` (`wx`, bez overwrite).
- Widoczna nazwa (`displayName`) jest osobną metadaną pochodzącą z
  formularza (`YYYY-MM-DD_<namePart>`).
- MIME allowlist: webm / ogg / mp4 / mpeg / wav (max 50 MiB łącznie).
- Błędy nie ujawniają pełnej ścieżki hosta.
- Izolacja użytkowników: `repoGuid` z sesji (nigdy z requestu) — drafty
  innego użytkownika zachowują się jak nieistniejące (404), nie da się ich
  listować, dogrywać, finalizować ani odtwarzać.

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
