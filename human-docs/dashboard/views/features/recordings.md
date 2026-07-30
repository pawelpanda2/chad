# Views → Recordings

Status: Story 93 follow-up (2026-07-30).

## Cel

Oddzielny widok listy zapisanych nagrań audio, podobny rolą do Views →
Reports, ale bez pól tekstowych specyficznych dla raportów.

## UI

- Menu: `Views` → `RECORDINGS`
- Lista: nazwa, data, czas utworzenia, opcjonalnie długość i MIME
- `+ Add` jak w Daily Tracker, prowadzi do
  `/dashboard/forms?form=add_recording&returnTo=/dashboard/views?view=recordings`
- Kliknięcie wiersza otwiera prosty szczegół z odtwarzaczem `<audio>`

Bez wyszukiwarki, filtrowania, tagów i kasowania.

## Dane / bezpieczeństwo

```
GET /api/views/recordings
  → runWithRepoContext(user, () => listAudioRecordings())

GET /api/views/recordings/[id]/audio
  → runWithRepoContext(user, () => getAudioRecordingReadInfo(id))
  → stream z Content-Type + Range support
```

- Frontend nie czyta systemu plików bezpośrednio.
- Klient nie dostaje host path `/Volumes/...` ani `/share/...`.
- Izolacja użytkowników: tylko podkatalog bieżącego `repoGuid`.
- Stare pliki z wcześniejszego, nieizolowanego zapisu (jeśli istnieją)
  nie są automatycznie listowane — wymagałyby świadomej migracji.
