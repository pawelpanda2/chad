# Release-readiness audit — Daily Tracker, Dates, Leads

Data: 2026-07-28. Zakres: audyt po reorganizacji `tests/` na 4 filary.

## Matryca

| Obszar | Unit | Integration | E2E | LOCAL | TEST | PROD read-only | Wynik |
|---|---|---|---|---|---|---|---|
| 1_1 Data protection | PASS (8/8 no-chad-mongo + offline-readonly-backup) | FAIL (local-login-api: 2/3 — realny login zwraca 401, brak `E2E_LOGIN_PASSWORD` w tym środowisku) | BLOCKED — reason: nie uruchomiono (wymaga tego samego loginu) | częściowo PASS (backend Postgres-only potwierdzony `docker inspect`) | SKIPPED — reason: brak sesji SSH na QNAP w tej sesji, tylko źródło compose zweryfikowane | SKIPPED — reason: brak jakiejkolwiek akcji na PROD w tym zadaniu | BLOCKED |
| 1_2 Google Sheets sync | PASS (config-validator) | PASS (local-google-sheets-info, qnap-test3-google-sheets — poprawnie `skipIf` bez danych) / SKIPPED (delete-physical, worker-order — lokalny Mongo zgłoszony jako nieosiągalny mimo działającego kontenera) | BLOCKED — reason: nie uruchomiono (wymaga loginu) | PASS/SKIPPED jak wyżej | SKIPPED — reason: brak `GOOGLE_SERVICE_ACCOUNT_*`/`E2E_TEST3_PASSWORD` w tym środowisku — realny cykl create→update→delete na Sheets test3 nie wykonany | SKIPPED — reason: reconciliation pawel_f/kamil_s (read-only) nie wykonany w tej sesji | BLOCKED |
| 1_3 History integrity | PASS (status-shape, część DB-gated poprawnie SKIP) | — (pokrywane częściowo przez qnap-test3-daily-dates, patrz niżej) | BLOCKED — reason: nie uruchomiono (wymaga loginu QNAP TEST) | PASS (część statyczna) | SKIPPED — reason: brak realnej mutacji test3 do zweryfikowania "1 wpis historii na mutację" | SKIPPED | BLOCKED |
| 1_4 Tables release (Daily/Dates/Leads) | PASS (daily mapping-schema, system-folders, dates mapping-schema) | FAIL — `local-msg-auto-links-api.test.mjs`: 1/3 realny fail (`/api/msg-automation/links` zwraca `{"error":"Unauthorized"}` zamiast oczekiwanego `{"success":false,"error":"NOT_AUTHENTICATED"}` — błąd **przedistniejący**, niezwiązany z przenosinami); `qnap-test3-daily-dates` BLOCKED (brak `E2E_TEST3_PASSWORD`) | BLOCKED — reason: nie uruchomiono | PASS (unit) / FAIL (integration, patrz wyżej) | SKIPPED — reason: brak danych logowania test3 | SKIPPED | FAIL |

## Weryfikacja bazy danych

- **LOCAL** (`chad-dashboard-local-mac-docker`, żywy kontener, `docker inspect`):
  `DBA_PRIMARY_BACKEND=postgres`, `DBA_MONGO_ENABLED=false`,
  `DBA_CONTENT_PROVIDER_ENABLED=false`, `DBA_POSTGRES_ENABLED=true`. Brak
  aktywnej ścieżki CHAD->Mongo (`MONGODB_URI` ustawione, ale nieużywane —
  `DBA_MONGO_ENABLED=false`). Beeper Mongo osobny, niezmieniony.
- **TEST/PROD**: zweryfikowano wyłącznie źródło
  `docker-compose.server1.test-prod.dashboard.yml` (`DBA_PRIMARY_BACKEND=postgres`,
  `DBA_MONGO_ENABLED=false`, brak `MONGODB_URI`) i
  `docker-compose.qnap.shared.yml` (brak serwisu `chad-mongodb`/
  `mongo-keyfile-init`/`mongo-rs-init`, tylko `beeper-mongodb` i
  `chad-postgres`). **Nie nawiązano sesji SSH do QNAP w tej sesji** — nie
  zweryfikowano live, że wdrożony kontener faktycznie odpowiada temu
  źródłu (był to już wcześniej zatwierdzony i wdrożony cutover z
  poprzedniego zadania, nie ponawiany tutaj).
- `pnpm test:backend-config:no-chad-mongo` — **PASS (8/8)**, potwierdza
  statycznie brak `chad-mongodb` w każdym compose i brak Mongo w ścieżce
  logowania/Dev Panelu.

## Google Sheets — audyt

- `qnap-test3-google-sheets.test.mjs` (realny zapis na dedykowany arkusz
  test3) — poprawnie oznaczony w komentarzu nagłówkowym jako real-write
  test, `describe.skipIf` zadziałał czysto (SKIP, nie FAIL) wobec braku
  `GOOGLE_SERVICE_ACCOUNT_EMAIL/PRIVATE_KEY` w tym środowisku. **Pełny
  cykl create→synced→update→synced→delete→synced nie został wykonany** —
  wymaga tych danych uwierzytelniających.
- Reconciliation pawel_f/kamil_s (read-only) — nie wykonana w tej sesji
  (brak danych dostępowych).
- `delete-physical.test.mjs`/`worker-order.test.mjs` (FakeGoogleSheetsClient,
  lokalny Mongo outbox) — zgłosiły "no local MongoDB reachable" mimo że
  `chad-mongodb-local-mac-docker` jest uruchomiony (`docker ps` potwierdza
  `healthy`); prawdopodobnie kwestia uwierzytelniania/formatu URI w
  `.env.local` dla tego konkretnego probe'a — **nie jest to regresja
  wprowadzona przez przenosiny** (identyczny probe istniał przed reorgiem),
  ale warto to zbadać osobno.

## History — audyt

- `status-shape.test.mjs` — PASS dla części statycznej ("not configured"),
  część DB-gated poprawnie SKIP.
- Weryfikacja "1 wpis historii na mutację" na żywej mutacji test3 — nie
  wykonana (zależna od tego samego brakującego `E2E_TEST3_PASSWORD`).

## Daily / Dates / Leads — audyt funkcjonalny

- Unit (mapping-schema UI↔mapper dla Daily i Dates, system-folders
  protection dla Daily/Dates/Leads) — **PASS**.
- `qnap-test3-daily-dates.test.mjs` (login-izolacja, round-trip Daily/Dates,
  cp_history, DELETE) — BLOCKED, brak `E2E_TEST3_PASSWORD`.
- `local-msg-auto-links-api.test.mjs` — **1 realny FAIL**: endpoint
  `/api/msg-automation/links` bez sesji zwraca `{"error":"Unauthorized"}`
  (status 401 poprawny, ale kształt JSON inny niż oczekiwany
  `{"success":false,"error":"NOT_AUTHENTICATED"}`). Test i asercje
  niezmienione przy przenosinach — to błąd przedistniejący w kodzie
  aplikacji, nie w reorgu testów.
- Login/Daily/Dates/Leads/History/logout end-to-end na żywym LOCAL — **nie
  zweryfikowane w tej sesji**: brak `E2E_LOGIN_PASSWORD` w tym środowisku
  (nigdy niehardkodowany/niecommitowany, zgodnie z zasadą projektu).

## Wynik `pnpm test:regression:release-audit`

Uruchomiony zgodnie z wymogiem przed DONE. **Exit code 1 (FAIL)** —
zatrzymał się na pierwszym bloku (`1_1_data-protection` → `test:integration:local-login`)
z powodu braku `E2E_LOGIN_PASSWORD`. Pozostałe 3 filary zweryfikowane
osobno, plik po pliku (wyniki w matrycy wyżej), żeby nie tracić informacji
przez wczesne zatrzymanie łańcucha `&&`.

## Werdykt

# NOT READY FOR BOSS

Realne blokery:
1. Brak w tym środowisku danych uwierzytelniających koniecznych do
   pełnej weryfikacji: `E2E_LOGIN_PASSWORD` (LOCAL login), `E2E_TEST3_PASSWORD`
   (QNAP TEST test3), `GOOGLE_SERVICE_ACCOUNT_EMAIL`/`_PRIVATE_KEY` (realny
   zapis do Google Sheets). Bez nich nie da się potwierdzić PASS dla
   loginu, pełnego cyklu Google Sheets, ani realnej mutacji
   Daily/Dates/History na test3.
2. Jeden realny, przedistniejący błąd: `/api/msg-automation/links`
   zwraca zły kształt JSON przy 401 (`local-msg-auto-links-api.test.mjs`).
3. Brak weryfikacji live TEST/PROD w tej sesji (tylko źródła compose) —
   zgodnie z zakazem jakiejkolwiek akcji na TEST/PROD w tym zadaniu.
