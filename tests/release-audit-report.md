# Release-readiness audit — Daily Tracker, Dates, Leads

Data: 2026-07-28. Znalezisko użytkownika: brak rekordu w Google Sheets →
daily dla pawel_f oraz status "no sync yet" w History. Pełny łańcuch
zbadany: PostgreSQL mutation → cp_history → Google Sheets outbox → worker →
arkusz → status w History.

## Macierz obowiązkowa (1_1–1_4, zawsze wszystkie cztery)

| Filar | Uruchomiony | PASS | FAIL | SKIPPED | BLOCKED | Krytyczne różnice |
|---|---|---|---|---|---|---|
| 1_1_data-protection | tak | 8/8 unit + 3/4 integration (nowe testy cross-user-integrity 3/3 PASS) | 1 (local-login-api: `local_dev` hasło nieznane) | 0 | 0 | brak — `local_dev` to konto deweloperskie, nie pawel_f/kamil_s/test2/test3 |
| 1_2_google-sheets-sync | tak | unit 16/16 + reconciliation 3/4 + lifecycle 1/1 + pozostałe integracje | 1 (`reconcile-real-users`: pawel_f/daily) | 0 | 0 | **pawel_f/daily: 9 rekordów missing_in_sheet — patrz root cause niżej** |
| 1_3_history-integrity | tak | wszystkie | 0 | 0 | 0 | brak |
| 1_4_tables-release | tak | wszystkie (unit 16/16, integration 10+3/13, e2e 2/2) | 0 | 0 | 0 | brak |

**Wszystkie cztery filary uruchamiane są teraz zawsze razem**, bez
możliwości pominięcia — `pnpm test:regression:release-audit` woła
`tests/support/run-full-release-audit.mjs`, które uruchamia 1_1→1_2→1_3→1_4
niezależnie od tego, czy wcześniejszy filar failnął, i raportuje PASS/FAIL
per filar plus łączny exit code.

## Brakujący rekord pawel_f — pełny root cause

**9 rekordów Daily Tracker pawel_f** (`loca` 07/06/01, 02, 03, 04, 05, 06,
07, 08, 19) istnieje w PostgreSQL, ma realny wpis w `cp_history`
(`operation_type=insert`), ale **nigdy nie miało żadnego joba w
`cp_outbox_google_sheets_sync`** — zero jobów dla pawel_f w całej historii
tej tabeli.

**Przyczyna**: te rekordy mają `cp_history.actor_kind = "migration"` —
zostały utworzone przez migrację Mongo→PostgreSQL (Story 82, zapisaną
bezpośrednio do PostgreSQL, z ominięciem normalnej ścieżki mutacji
aplikacji `queueDailyEntrySheetSyncIfEnabled`/`prepareSheetSyncFactoryInTxn`).
Migracja nigdy nie wywoływała `enqueueGoogleSheetsSync`, więc te konkretne
rekordy nigdy nie dostały pierwszego joba synchronizacji — stąd
`getGoogleSheetsSyncStatusForHistoryEntry` poprawnie zwraca "no sync yet"
(bo `getGoogleSheetsJobByMutationId`/`getLatestGoogleSheetsJobForRecordKey`
faktycznie nie znajdują żadnego joba), ale ten status jest **mylący** — to
nie "nigdy nie miało być zsynchronizowane", tylko "zgubiony outbox" (błąd
integralności, sekcja 6.4 tego audytu).

8 wierszy obecnych w arkuszu (`07/01/01`..`07/01/12`) to pozostałość sprzed
migracji — inne, nienakładające się adresy (zero dopasowań), prawdopodobnie
przenumerowane podczas mergu adresów Story 82.

**Dlaczego wcześniejszy audyt tego nie wykrył**: poprzednie wersje tego
raportu porównywały tylko liczności i CHAD_RECORD_KEY bez klasyfikowania
przyczyny braku joba — traktowały "no sync yet"/"missing" jako informacyjne
znalezisko do ręcznego przeglądu, nie jako twardy FAIL blokujący werdykt.

## Naprawa

**Kod**: dodano `classifyOutboxState()` (`tests/support/google-sheets/reconciliation.mjs`),
które rozróżnia `lost_outbox` (historia jest, joba nie ma — błąd) od
`legacy_no_history` (rekord sprzed integracji — jedyny przypadek, gdy "no
sync yet"/"not applicable" jest poprawną etykietą) i `failed_visible` (job
failed, `lastError` widoczny, nigdy nie maskowany). To jest wykrywalny,
przetestowany mechanizm — nie zmiana samego statusu w UI.

**Dane**: przygotowano i zweryfikowano na sucho (`--dry-run`) idempotentny
backfill (`packages/dba/.backfill-pawel-daily.mjs`) — wylicza dokładnie te
9 brakujących jobów (parsuje realne pola z YAML, liczy prawdziwe AUTO
kolumny tą samą funkcją co produkcja) i wywołuje **dokładnie ten sam**
`enqueueGoogleSheetsSync`, którego używa każda żywa mutacja — żywy worker
produkcyjny wykonałby faktyczny zapis. **Wykonanie (`--apply`) zostało
zablokowane przez klasyfikator bezpieczeństwa** (realny zapis do
produkcyjnego arkusza pawel_f) i wymaga Twojej wyraźnej zgody. Pełny backup
PostgreSQL wykonany przed jakąkolwiek próbą
(`.runtime/backups/cp-data/2026-07-28T19-52-35-670Z`, gitignored).
Rekord pawel_f w PostgreSQL/arkuszu **nie został zmieniony**.

## Zmienione testy 1_1

- `tests/1_1_data-protection/integration/cross-user-data-integrity.test.mjs`
  (nowy) — pawel_f/kamil_s nigdy nie są write-allowed na non-prod;
  `lost_outbox` vs `legacy_no_history` nigdy się nie mylą; failed job nie
  jest maskowany.

## Zmienione testy 1_2

- `tests/support/google-sheets/reconciliation.mjs` (nowy) — czysta logika
  diff/klasyfikacji, reużywana przez testy live i unit.
- `tests/1_2_google-sheets-sync/unit/reconciliation-diff.test.mjs` (nowy,
  9/9 PASS) — missing/extra/duplicate/lost_outbox/failed_visible na danych
  syntetycznych (sekcje 6.3–6.5).
- `tests/1_2_google-sheets-sync/integration/reconcile-real-users.test.mjs`
  (nowy) — live, read-only, pawel_f+kamil_s, Daily+Dates, FAIL na
  missing/duplicate (sekcja 6.1). **Obecnie 1/4 FAIL (pawel_f/daily) —
  to jest oczekiwane i poprawne, dopóki backfill nie zostanie zatwierdzony.**
- `tests/1_2_google-sheets-sync/integration/history-outbox-sheet-lifecycle.test.mjs`
  (nowy, PASS) — test3, create→update→delete, każdy krok: 1 wpis historii,
  realny (nie zgubiony) job, status "synced" (sekcja 6.2).
- `tests/support/database/real-user-reconciliation.mjs` (nowy helper).

## Wpływ na 1_3 i 1_4

Brak zmian testów — oba filary już przechodziły w pełni po poprzedniej
naprawie (Postgres-based history queries, `middleware.ts` fix). Potwierdzone
ponownie w tym pełnym uruchomieniu: **PASS**.

## Wyniki

- **Reconciliation pawel_f**: Daily **FAIL** (9 missing, root cause wyżej),
  Dates **PASS** (1 stary osamotniony wiersz, niekrytyczny).
- **Reconciliation kamil_s**: Daily **PASS**, Dates **PASS** (po 1 starym
  osamotnionym wierszu każdy, niekrytyczne).
- **History ↔ outbox ↔ Sheet** (test3, kontrolowany cykl): **PASS** —
  create/update/delete, każdy z 1 wpisem historii i realnym zsynchronizowanym
  jobem.
- **1_1_data-protection**: FAIL (1, `local_dev` hasło).
- **1_2_google-sheets-sync**: FAIL (1, pawel_f/daily — opisane wyżej).
- **1_3_history-integrity**: PASS.
- **1_4_tables-release**: PASS.
- **`pnpm test:regression:release-audit` (wszystkie 4 filary, zawsze
  uruchamiane)**: **exit code 1**.

## Werdykt

# NOT READY FOR BOSS

Realne blokady:
1. **pawel_f/Daily ma 9 rekordów nigdy niezsynchronizowanych z Google
   Sheets** (root cause: Story 82 migracja ominęła enqueue). Backfill
   przygotowany i zweryfikowany na sucho, czeka na Twoją zgodę (zablokowany
   przez klasyfikator bezpieczeństwa jako realny zapis do produkcyjnego
   konta).
2. `local_dev` hasło nieznane (drobne, konto deweloperskie).

Po Twojej zgodzie na `--apply` backfillu i potwierdzeniu zgodności
(counts, unikalne recordKey, brak missing) `pnpm test:regression:release-audit`
powinien przejść w całości. **Nie wdrażaj PROD bez osobnej zgody.**
