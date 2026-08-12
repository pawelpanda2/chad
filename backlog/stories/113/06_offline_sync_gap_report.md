# Raport: awaryjny snapshot lokalny vs żywa baza QNAP — co działa / co naprawić

Status: analiza (2026-08-09), **bez implementacji** auto-syncu.
Cel użytkownika: lokalny snapshot ma śledzić produkcyjno-testową bazę
co jakiś czas, żeby przy braku internetu mieć większość danych; synch
planowany też przy otwarciu strony.

## Architektura docelowa (już w red-rules)

| Tryb LOCAL | Źródło | Rola |
|---|---|---|
| Normalny (domyślny) | Server PostgreSQL QNAP Tailscale `:12042` | pełny R/W, wspólna baza z TEST/PROD |
| Awaryjny | `offline-readonly-backup` | tylko odczyt, gdy brak sieci |

Źródło prawdy: **zawsze** Server PostgreSQL. Lokalny snapshot nigdy nie
zastępuje Tailscale w normalnej pracy.

## Co już istnieje

1. **Dev Panel** — przełącznik `Server PostgreSQL` / `Offline backup — read only`
   (`dev-db-override.ts`, default = `server`).
2. **Ręczny refresh awaryjny** —
   `infrastructure/offline-readonly-backup/refresh-from-server.sh`
   (`pg_dump` → restore → verify read-only → `metadata/latest.json`).
   README wprost: **nie uruchamia się automatycznie**.
3. **Legacy mirror** — `syncLocalPostgresFromQnap` +
   `POST /api/dev-settings/sync-local-postgres` (oznaczony **deprecated**;
   cel: stary compose profile `local-postgres-mirror`, nie offline-readonly-backup).
4. **Restart local** (`03_re-start.sh`) — czasem pomija sync lokalnego volume
   gdy `cp_items` > 0; seeduje tylko fallback `test3`. To **nie** odświeża
   offline-readonly-backup.
5. **Dokumentacja** — Rule 1/3 w `red-rules.md` + `01_ai_start.md` (Błąd A,
   2026-08-09): lokalny volume ≠ źródło danych aplikacji.

## Luki względem oczekiwanego zachowania

| # | Luka | Skutek |
|---|------|--------|
| G1 | Brak **okresowego** refreshu `offline-readonly-backup` | Snapshot starzeje się; po awarii sieci dane mogą być tygodnie/miesiące wstecz |
| G2 | Brak **planowania syncu przy otwarciu Dashboardu** | Wejście na stronę nie trigguje odświeżenia awaryjnego lustra |
| G3 | `POST /api/dev-settings/sync-local-postgres` celuje w **zły target** (sibling `postgres:5432` / local-postgres-mirror), nie w `chad-postgres-offline-readonly-backup` | UI/API sync „lokalnego Postgresa” nie zasila trybu awaryjnego z red-rules |
| G4 | Dwa lokalne Postgresy mylą AI i ludzi: `chad-postgres-local-mac-docker` (compose sibling) vs `offline-readonly-backup` | Agent odpytuje pusty volume i raportuje „brak danych” mimo Tailscale |
| G5 | Rule 3 dziś **zakazuje** automatycznego refreshu | Auto-sync wymaga świadomej zmiany kontraktu red-rules (nie „cichej” poprawki) |
| G6 | Brak schedulera w `instrumentation.ts` dla offline backup (jest dla Links V2 / outboxów) | Nie ma miejsca na interval + debounce „przy page load” |
| G7 | Brak metadanych w UI „kiedy ostatni snapshot / ile wierszy” poza plikiem `metadata/latest.json` | Użytkownik nie wie, czy awaryjna kopia jest świeża |
| G8 | Full `pg_dump`/`TRUNCATE` jest ciężki — bez throttlingu przy każdym page open zabije QNAP/laptopa | Potrzebny cooldown (np. max 1×/N godzin) + background job, nie sync w requestcie strony |

## Propozycja naprawy (kolejne Story — nie ten commit)

1. **Zmień kontrakt red-rules Rule 3** (jawnie): dozwolony automatyczny
   refresh snapshotu **tylko** gdy aktywne źródło = Server PostgreSQL i
   Tailscale zdrowy; nigdy gdy już jesteś w trybie offline.
2. **Jeden target awaryjny:** wyłącznie
   `infrastructure/offline-readonly-backup/` (nie sibling local mirror).
   Deprecated endpoint albo przekierować na ten refresh, albo usunąć z UI.
3. **Scheduler lokalny** (tylko `CHAD_ENVIRONMENT=local`):
   - interval (np. co 6–12 h) woła ten sam pipeline co `refresh-from-server.sh`
     (lub współdzieloną funkcję Node),
   - przy otwarciu Dashboardu / first authenticated request: **enqueue**
     refresh jeśli `now - lastSnapshot > cooldown` (nie blokuj renderu).
4. **Dev Panel:** pokaż `lastSyncedAt`, `cp_items` count, przycisk
   „Refresh emergency snapshot now”, status last error.
5. **Guards:** nie syncuj jeśli Tailscale/QNAP probe fail; nie syncuj jeśli
   już offline; log + toast „snapshot N godzin temu”.
6. **Dokumentacja:** po wdrożeniu zaktualizować Rule 3 + `01_ai_start`
   Błąd A (że lokalny snapshot bywa odświeżany w tle, ale nadal nie jest
   źródłem prawdy).

## Co NIE robić

- Nie przełączać domyślnego LOCAL na lokalny Postgres.
- Nie seedować `pawel_f` / `kamil_s` w lokalnym volume „żeby działało”.
- Nie robić synchronicznego pełnego dumpa w middleware każdego requestu.
- Nie mylić Beeper Mongo mirror z CHAD Postgres snapshot.

## Weryfikacja obecnego stanu (lokalny runtime 2026-08-09)

- Compose ustawia `POSTGRES_URI=…@postgres:5432` (sibling), ale
  `defaultPostgresSource()` → **`server`** (Tailscale) — zgodne z Rule 1.
- Sibling local volume bywał prawie pusty → mylący przy bezpośrednim `psql`
  do `:5433`.
- Offline-readonly-backup: refresh wyłącznie ręczny; brak joba przy page open.
- **G9 (log mylący):** `03_re-start.sh` wypisuje
  `CHAD Postgres via local mirror (postgres:5432)` — to opis env
  `POSTGRES_URI` w compose, **nie** aktywnego źródła Dev Panel. Agent/człowiek
  czyta to jako „LOCAL = lokalna baza”. Naprawa: komunikat ma mówić
  „default runtime source = Server PostgreSQL (Tailscale); compose
  POSTGRES_URI is bootstrap/fallback only”.
