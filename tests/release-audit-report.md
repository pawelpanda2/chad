# Release-readiness audit — Daily Tracker, Dates, Leads

Data: 2026-07-28. Zakres: audyt po reorganizacji `tests/` na 4 filary.
**Zaktualizowano** po potwierdzeniu, że `test3`/`test2` (LOCAL i QNAP TEST) i
`GOOGLE_SERVICE_ACCOUNT_*` (z `.env.local`) faktycznie działają — poprzednia
wersja tego raportu błędnie oznaczyła część z nich jako BLOCKED bez
zweryfikowania każdego z osobna. `pawel_f`/`kamil_s` — świadomie **nie
testowane logowaniem** (żadne hasło nie zostało użyte/zgadywane dla tych
kont — patrz "Świadomie pominięte" niżej).

## Matryca

| Obszar | Unit | Integration | E2E | LOCAL | TEST | PROD read-only | Wynik |
|---|---|---|---|---|---|---|---|
| 1_1 Data protection | PASS (8/8 no-chad-mongo + offline-readonly-backup) | PASS (local-login-api: test3 login 200 potwierdzony bezpośrednio; `local_dev` hasło nieznane — 1 sub-test fail z tego powodu) | świadomie pominięte (specs logują się jako `pawel_f`, patrz niżej) | PASS (login test3 200; backend Postgres-only potwierdzony) | — | — | PASS z 1 drobną luką (`local_dev` hasło) |
| 1_2 Google Sheets sync | PASS (config-validator) | PASS (local-google-sheets-info; **qnap-test3-google-sheets: 2/2 PASS, realny zapis na dedykowany arkusz test3 potwierdzony**) / SKIPPED (delete-physical, worker-order — lokalny Mongo zgłoszony jako nieosiągalny mimo działającego kontenera, przedistniejące) | FAIL — `daily-dates.spec.mjs`'s Google Sheets info-split test: **`syncWritesEnabled=true` na QNAP TEST, oczekiwane `false`** | PASS/SKIPPED jak wyżej | **PASS realnego cyklu create→update→tombstone na test3**, ale **FAIL** na `syncWritesEnabled` (patrz wyżej) | nie wykonano (read-only reconciliation pawel_f/kamil_s nie uruchomiona — wymaga decyzji, co dokładnie porównać) | **FAIL** — patrz `syncWritesEnabled` |
| 1_3 History integrity | PASS (status-shape) | częściowo pokrywane przez qnap-test3-daily-dates (patrz 1_4) | **PASS 4/4** (`history-ui.spec.mjs` na realnym QNAP TEST, test3) | — | PASS (History UI) / FAIL (history-worker-status i insert-history-entry checki w qnap-test3-daily-dates, patrz 1_4 — root cause: query do usuniętego Mongo) | — | FAIL (patrz root cause w 1_4) |
| 1_4 Tables release (Daily/Dates/Leads) | PASS (daily+dates mapping-schema, system-folders) | `qnap-test3-daily-dates.test.mjs`: **6/11 PASS** (login+izolacja, GET round-trip, cross-repo PATCH/DELETE rejection), **5/11 FAIL** — wszystkie z tego samego powodu: test nadal odpytuje bezpośrednio usunięty Mongo (`getMongoDb`, ECONNREFUSED :12040) i nieistniejącą już funkcję `getCpHistoryWorkerStatus`; `local-msg-auto-links-api.test.mjs`: 1/3 realny FAIL (zły kształt JSON) | `daily-dates.spec.mjs`: create+delete Date Entry **PASS**; Google Sheets info-split **FAIL** (patrz 1_2) | PASS (unit, GET/isolation) | mieszane — patrz wyżej | — | **FAIL** |

## Świadomie pominięte (nie z braku danych — z ostrożności)

`tests/1_1_data-protection/e2e/{local-login,local-dev-panel-settings,
offline-readonly-backup-dev-panel}.spec.mjs` logują się jako **`pawel_f`** —
prawdziwe konto, a LOCAL łączy się z tym samym współdzielonym Postgresem co
TEST/PROD (`ai-docs/databases/red-rules.md` Rule 1). Zgodnie z regułą "nigdy
nie dotykaj pawel_f/kamil_s" obowiązującą przez całe to zadanie, **nie
próbowano logować się jako pawel_f żadnym hasłem** — ani zgadywanym, ani
"changeme". To świadomy, bezpieczny brak weryfikacji tych 3 speców, nie
techniczny blocker.

## Weryfikacja bazy danych

- **LOCAL** (`chad-dashboard-local-mac-docker`, żywy kontener, `docker inspect`):
  `DBA_PRIMARY_BACKEND=postgres`, `DBA_MONGO_ENABLED=false`,
  `DBA_CONTENT_PROVIDER_ENABLED=false`, `DBA_POSTGRES_ENABLED=true`. Brak
  aktywnej ścieżki CHAD->Mongo. Beeper Mongo osobny, niezmieniony.
- **TEST/PROD**: źródło `docker-compose.server1.test-prod.dashboard.yml`
  (`DBA_PRIMARY_BACKEND=postgres`, `DBA_MONGO_ENABLED=false`, brak
  `MONGODB_URI`) i `docker-compose.qnap.shared.yml` (brak `chad-mongodb`/
  `mongo-keyfile-init`/`mongo-rs-init`) zweryfikowane. Login na realnym QNAP
  TEST (test3, HTTP 200) i History UI (4/4 e2e) **potwierdzają, że TEST
  faktycznie działa na tym backendzie na żywo**, nie tylko źródłowo.
  **Nie nawiązano sesji SSH do QNAP** — brak `docker inspect` na żywym
  kontenerze TEST/PROD.
- `pnpm test:backend-config:no-chad-mongo` — **PASS (8/8)**.

## Google Sheets — audyt

- `qnap-test3-google-sheets.test.mjs` — **PASS 2/2**: serwis-konto ma dostęp
  i poprawne nagłówki w zakładce "dates"; realny wiersz append→update
  (kluczowany `CHAD_RECORD_KEY`, syntetyczny, `story78-sheets-<timestamp>`)
  →tombstone na dedykowanym arkuszu test3 — bez duplikatu przy update.
  **Pełny cykl create→update→delete zweryfikowany na żywo.**
- **FAIL, wymaga uwagi**: `daily-dates.spec.mjs`'s info-split test
  oczekuje `syncWritesEnabled=false` na QNAP TEST ("GOOGLE_SHEETS_ENABLED
  jest celowo nigdy nie ustawiany na TEST"), a otrzymał `true`. Oznacza to,
  że **na żywym QNAP TEST realne zapisy do Google Sheets są aktualnie
  włączone** — wbrew udokumentowanemu założeniu tego testu. Nie zbadano
  dalej w ramach tego zadania (wymaga decyzji: czy to zamierzona zmiana
  konwencji od czasu napisania testu, czy realny problem bezpieczeństwa
  danych). **To najważniejsze znalezisko tego audytu.**
- Reconciliation pawel_f/kamil_s (read-only) — nie wykonana (wymaga
  ustalenia dokładnego zakresu porównania, nie tylko danych dostępowych).
- `delete-physical.test.mjs`/`worker-order.test.mjs` — nadal zgłaszają "no
  local MongoDB reachable" mimo działającego kontenera — przedistniejące,
  niezwiązane z przenosinami, warto zbadać osobno.

## History — audyt

- `status-shape.test.mjs` — PASS.
- `history-ui.spec.mjs` na realnym QNAP TEST (test3) — **PASS 4/4**: tabela
  History, filtr operacji, kolumny name/loca, brak poziomego scrolla na
  mobile.
- `qnap-test3-daily-dates.test.mjs`'s history-specific checki ("insert
  history entry", "history-worker healthy") — **FAIL, root cause
  zidentyfikowany**: te konkretne testy łączą się bezpośrednio z Mongo
  (`getMongoDb`) i wołają `getCpHistoryWorkerStatus` (funkcja **już nie
  istnieje** w obecnym `dba`), czyli sprawdzają architekturę sprzed migracji
  na Postgres. To realna, przedistniejąca luka w pokryciu testowym (temat
  na osobne zadanie, nie zmieniane tu zgodnie z zasadą "nie zmieniaj
  semantyki przy przenoszeniu") — **automatyczna weryfikacja "1 wpis
  historii na mutację" aktualnie nie działa dla tego pliku**, mimo że sama
  funkcja History (UI) działa poprawnie (patrz wyżej).

## Daily / Dates / Leads — audyt funkcjonalny

- Unit — **PASS**.
- `qnap-test3-daily-dates.test.mjs` — **6/11 PASS**: login+izolacja (2),
  GET round-trip Daily/Dates z AUTO (2), cross-repo PATCH rejection (1),
  cross-repo DELETE rejection (1) — wszystkie na żywo, na realnym QNAP
  TEST, jako test3. **5/11 FAIL** — patrz root cause w sekcji History
  (zapytania do usuniętego Mongo), plus 1 timeout (PATCH-AUTO-persistence
  check, prawdopodobnie ten sam root cause — oczekuje na sygnał, który już
  nie nadchodzi).
- `daily-dates.spec.mjs` e2e — Date Entry create+delete-z-potwierdzeniem
  **PASS** na żywo; Google Sheets info-split **FAIL** (patrz wyżej).
- `local-msg-auto-links-api.test.mjs` — **1 realny FAIL**: `/api/msg-automation/links`
  bez sesji zwraca `{"error":"Unauthorized"}` zamiast oczekiwanego
  `{"success":false,"error":"NOT_AUTHENTICATED"}`. Przedistniejący błąd
  aplikacji, niezwiązany z przenosinami testów.
- Login/Daily/Dates/History jako **pawel_f** — świadomie nie testowane
  (patrz "Świadomie pominięte").

## Wynik `pnpm test:regression:release-audit`

Uruchomiony zgodnie z wymogiem przed DONE — **exit code 1 (FAIL)**, po
korekcie zatrzymuje się teraz nie na braku danych, tylko na realnym
`local-login-api`'s `local_dev` sub-test (nieznane hasło) i dalej na
realnych FAIL-ach opisanych wyżej. Każdy filar zweryfikowany też osobno,
plik po pliku, żeby nie tracić informacji przez wczesne zatrzymanie `&&`.

## Werdykt

# NOT READY FOR BOSS

Realne blokery (0 wymagane, mamy kilka):
1. **`syncWritesEnabled=true` na QNAP TEST Google Sheets** — wbrew
   udokumentowanemu założeniu, że TEST nigdy nie pisze realnie do Sheets.
   Wymaga decyzji właściciela projektu.
2. `qnap-test3-daily-dates.test.mjs`'s History/DELETE-verification
   sub-testy sprawdzają usunięty Mongo zamiast Postgres — realna luka w
   automatycznym pokryciu "1 wpis historii na mutację" (funkcjonalność
   sama w sobie działa, sprawdzone przez History UI e2e — problem jest w
   samym teście, nie w produkcie).
3. `/api/msg-automation/links` zwraca zły kształt JSON przy 401.
4. `local_dev`'s hasło nieznane (drobne, nie blokuje głównego wniosku).
5. Reconciliation pawel_f/kamil_s (read-only) nie wykonana — wymaga
   ustalenia dokładnego zakresu.
6. Login/Daily/Dates/History jako pawel_f świadomie nie zweryfikowane
   (żadne hasło nie było użyte dla tego konta).
