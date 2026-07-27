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

Settings → dwie kolumny **ACTIVE** / **CHANGE OPTIONS**:

- combobox: `Server PostgreSQL` | `offline-readonly-backup`
- czerwone ostrzeżenie przy backupie
- Switch wymaga potwierdzenia dla backupu
- Mongo Beeper — osobny blok informacyjny (nie źródło CHAD)

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
