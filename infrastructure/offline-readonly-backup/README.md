# offline-readonly-backup

Awaryjny, **tylko do odczytu** snapshot PostgreSQL dla CHAD. Nie jest częścią
normalnego workflow developerskiego.

## Cel

```
QNAP / Server PostgreSQL
        │
        │ jawny refresh (pg_dump)
        ▼
offline-readonly-backup  (lokalny snapshot, read-only)
```

Używaj wyłącznie gdy serwer lub sieć (Tailscale) są niedostępne, a potrzebujesz
pilnie przejrzeć istniejące dane.

**Nie używaj do:** development write, testów zapisów, migracji, Google Sheets
sync, outboxów, seeda.

## Lokalizacja danych

Poza repo, konfigurowalne przez `CHAD_OFFLINE_READONLY_BACKUP_ROOT`:

```
$CHAD_OFFLINE_READONLY_BACKUP_ROOT/
├── postgres-data/
├── backups/
├── restore-logs/
└── metadata/
```

Domyślnie: `~/04_chad_offline_readonly_backup/`

## Identyfikatory

| Element | Nazwa |
|---------|--------|
| Kontener | `chad-postgres-offline-readonly-backup` |
| Baza | `chad_offline_readonly_backup` |
| Rola read-only | `chad_offline_readonly_backup_reader` |
| Compose profile | `offline-readonly-backup` |

## Start / stop

```bash
cp .env.example .env   # uzupełnij hasła
./start.sh
./status.sh
./stop.sh
```

## Refresh ze serwera

```bash
export OFFLINE_READONLY_BACKUP_SOURCE_PASSWORD='...'  # lub POSTGRES_QNAP_PASSWORD
./refresh-from-server.sh
```

Skrypt: dump `pg_dump -Fc` → restore → nadanie roli read-only → `verify-readonly.sh`
→ zapis `metadata/latest.json`. **Nie uruchamia się automatycznie.**

## Read-only

Rola `chad_offline_readonly_backup_reader` ma tylko `CONNECT`, `USAGE`, `SELECT`
oraz `default_transaction_read_only = on`.

```bash
./verify-readonly.sh   # exit 0 = PASS
```

## Dev Panel

Settings → dwie kolumny **ACTIVE** / **CHANGE OPTIONS** dla PostgreSQL i
osobno dla Mongo:

- natywne **radio buttons** (nie combobox):
  - CHAD PostgreSQL: `Server PostgreSQL` | `Offline backup — read only`
  - Beeper Mongo: `Server Mongo` | `Local Mongo`
- osobne przyciski **Apply PostgreSQL source** / **Apply Mongo source**
- krótki warning przy offline Postgres (+ checkbox potwierdzenia)
- GET Settings **nie wisi** na martwym Tailscale (probe ≤ ~2.5s)
- przełączenie na offline **nie wymaga** remote probe — tylko lokalny snapshot
- powrót na Server wymaga udanego krótkiego probe; inaczej zostaje offline
- wybór persistowany w `.runtime/dev-data-source.json` (bare + local Docker
  bind-mount → `/app/runtime/…`) — atomic write temp→rename; TEST/PROD nie
  pozwalają na runtime switching (`CHAD_ENVIRONMENT` ≠ `local`)

### Root cause (2026-07-29, café / no internet)

1. GET `/api/dev-settings/db-source` wołał `probePostgres()` bez timeoutu na
   aktywnym Server PostgreSQL. Bez Tailscale request wisiał → Settings w
   „Ładowanie…” i brak możliwości Apply offline. Naprawione: krótkie
   `connectionTimeoutMillis` + probe-before-commit dla Server.
2. Persist po Apply zapisywał do root-owned `/app/data` (named volume) —
   `USER nextjs` nie mógł utworzyć pliku `.tmp` → catch połykał błąd → po
   restarcie wracał Server. Naprawione: bind-mount `.runtime` +
   `DEV_DB_SOURCE_PREF_PATH`.

## Switch w aplikacji

`CHAD_DATA_MODE=offline-readonly-backup` blokuje zapisy w API (`OFFLINE_READONLY_BACKUP_WRITE_FORBIDDEN`),
wyłącza workery, pokazuje czerwony banner.

Powrót na Server PostgreSQL przywraca write access — **bez** automatycznej synchronizacji
z backupu (backup jest read-only).

## Recovery

1. Przywróć sieć / serwer.
2. Dev Panel → Switch → `Server PostgreSQL`.
3. Opcjonalnie: `./refresh-from-server.sh` aby odświeżyć snapshot na przyszłość.

## Zagrożenie nieaktualnego snapshotu

Snapshot może być starszy niż dane na serwerze. Traktuj go jako awaryjny podgląd,
nie jako źródło prawdy.
