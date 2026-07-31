# Views → Recordings

Status: Story 93 follow-up (2026-07-30); drafty (2026-07-31).

## Cel

Oddzielny widok listy zapisanych nagrań audio, podobny rolą do Views →
Reports, ale bez pól tekstowych specyficznych dla raportów.

## UI

- Menu: `Views` → `RECORDINGS`
- Nad listą zapisanych nagrań: sekcja **draftów** (nagrania w toku /
  przerwane odświeżeniem) z badge `Draft` / `Finalizing` / `Error`,
  łącznym czasem, liczbą segmentów (gdy > 1) i akcją **Continue**
  prowadzącą do `?form=add_recording&draft=<id>`.
- Lista zapisanych: nazwa, data, czas utworzenia, opcjonalnie długość i MIME
- `+ Add` jak w Daily Tracker, prowadzi do
  `/dashboard/forms?form=add_recording&returnTo=/dashboard/views?view=recordings`
- Kliknięcie wiersza otwiera prosty szczegół z odtwarzaczem `<audio>`
- Po poprawnej finalizacji pozycja przechodzi z Draft do zwykłego
  zapisanego nagrania (draft znika — bez duplikatów).

Bez wyszukiwarki, filtrowania, tagów i kasowania.

## Dane / bezpieczeństwo

```
GET /api/views/recordings
  → runWithRepoContext(user, () => listAudioRecordings())
  → + drafts: listAudioRecordingDrafts() (pole addytywne `drafts`;
    błąd listowania draftów nie blokuje listy zapisanych)

GET /api/views/recordings/[id]/audio
  → runWithRepoContext(user, () => getAudioRecordingReadInfo(id))
  → stream z Content-Type + Range support

GET /api/forms/audio-recording/drafts/[draftId]/segments/[sessionId]/audio
  → odsłuch pojedynczego segmentu draftu w widoku Continue
```

- Frontend nie czyta systemu plików bezpośrednio.
- Klient nie dostaje host path `/Volumes/...` ani `/share/...`.
- Izolacja użytkowników: pliki leżą płasko w katalogu nagrań, a `repoGuid`
  (z sesji, nigdy z requestu) jest zapisany w sidecar `.json` i filtruje
  listę/odczyt; drafty w `drafts/<draftId>/` mają `repoGuid` w `draft.json`.
- Legacy pliki bez sidecara (sprzed metadanych) są nadal listowane w trybie
  kompatybilności.
