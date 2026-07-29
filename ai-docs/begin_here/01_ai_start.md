# AI start — read this first

Status: utworzone 2026-07-14 jako nowy punkt startowy dla AI (wydzielony z
`what-and-where.md`, które teraz jest indeksem, nie punktem wejścia).

To jest **pierwszy dokument**, który AI ma przeczytać przed jakimkolwiek
większym zadaniem w tym repo. Jest celowo krótki — to tylko wskazanie
kolejności czytania, nie opis standardów samych w sobie.

## Najczęstszy błąd AI w tym repo — przeczytaj to PIERWSZE

**(dodane 2026-07-22, po realnym incydencie: AI zapytało o zgodę na deploy
PROD tak, jakby to była ryzykowna, osobna operacja budowania — mimo że
odpowiedź jest już opisana w `04_deployment-rules.md` i
`deploy/ai-start.md`, tylko AI ich nie zastosowało w praktyce.)**

- **Obraz Dockera buduje się WYŁĄCZNIE podczas deployu na TEST**
  (`bash-scripts/dashboard/08_registry_test/deploy.sh` albo
  `06_qnap_test_ssh/06_deploy.sh`). **Deploy na PROD nigdy nie buduje
  niczego od nowa** — to wyłącznie promocja/przełączenie na TEN SAM,
  już zbudowany i zweryfikowany na TEST obraz
  (`07_qnap_prod_ssh/06_last_from_test.sh`). Nie ma czegoś takiego jak
  "osobny build dla PROD".
- TEST i PROD to **osobne kontenery** (celowo — żeby oddzielić GUI/proces
  dashboardu i najpierw zweryfikować na TEST, zanim ten sam obraz trafi na
  PROD), ale **współdzielą te same, prawdziwe dane** przez
  `docker-compose.qnap.shared.yml` — TEST **nie jest środowiskiem z
  fejkowymi/testowymi danymi**. Shared zawiera `chad-postgres` (CHAD's
  jedyny backend danych — cp_items/cp_history/outboxy) oraz `beeper-mongodb`
  (dane Beepera) — oba współdzielone przez TEST i PROD. Stary `chad-mongodb`
  (Mongo dla CHAD, replica set) został **całkowicie usunięty** z runtime
  2026-07-27 (patrz `ai-docs/databases/red-rules.md`) — nie zakładaj, że
  nadal istnieje, nawet jeśli starsza dokumentacja/backlog o nim wspomina.
- **Wniosek praktyczny:** deploy na PROD (promocja już przetestowanego na
  TEST obrazu) to rutynowa, niskiego ryzyka operacja przez oficjalny
  skrypt — nie wymaga tego samego poziomu ostrożności co np. migracja
  danych czy zmiana schematu. Nie pytaj o zgodę na "zbudowanie i wdrożenie
  na PROD" jakby to był nowy build — to zawsze tylko przełączenie na obraz,
  który już działa na TEST.
- Pełny kontrakt: `04_deployment-rules.md` (niżej w tej kolejności) i
  `deploy/ai-start.md` → `deploy/dashboard-deployment-scripts.md`.

### Bazy danych — `ai-docs/databases/` (przeczytaj przed dotknięciem Postgres/Mongo)

**(dodane 2026-07-27.)** `ai-docs/databases/red-rules.md` zawiera twarde,
niepodważalne zasady: LOCAL łączy się z prawdziwym współdzielonym Server
PostgreSQL przez Tailscale (to zamierzone, nie regresja do "naprawienia"),
Beeper Mongo tak samo przez Tailscale, `offline-readonly-backup` jest
wyłącznie awaryjny i tylko do odczytu. `ai-docs/databases/ai-start.md` to
mapa orientacyjna (który backend gdzie, gdzie leży kod, jak zrobić
backup/restore/integrity). Przeczytaj oba PRZED jakąkolwiek zmianą w
`packages/dba/src/dev-db-override.ts` albo w routingu backendu TEST/PROD.

### offline-readonly-backup — awaryjny snapshot (NIE development database)

- Normalny CHAD **nigdy** nie używa lokalnej bazy do zapisów.
- Lokalna baza `offline-readonly-backup` jest wyłącznie awaryjnym snapshotem
  do odczytu (`infrastructure/offline-readonly-backup/`).
- Agent **nie może** używać jej jako development database, test database,
  migration target ani fallbacku do zapisu.
- Dev Panel: `Server PostgreSQL` (primary) vs `Offline backup — read only`
  (emergency read-only) — native radio + Apply; Mongo: `Server Mongo` /
  `Local Mongo` osobno. Regresja: `pnpm test:offline-readonly-backup`.
- **Bez internetu:** Settings nie może wisieć na remote probe — short timeout;
  switch → offline nie wymaga QNAP.

### Lokalny Postgres mirror (legacy, opt-in) — NIE rób śmietnika (Story 89)

**(dodane 2026-07-25, po realnym incydencie: lokalny volume wyglądał jak
„skasowane dane pawel_f”, bo AI/testy wsadziły fixture'y pod produkcyjny
GUID i/albo przełączyły dashboard na pustą lokalną bazę bez syncu z QNAP.)**

- **Lokalny Postgres mirror** (compose profile `local-postgres-mirror`) to
  opcjonalne lustro QNAP — nie jest częścią normalnego workflow. Dane
  ściągasz przez `07_sync-postgres-from-qnap.sh` jeśli ten profil jest włączony.
- Dev Panel Settings przełącza **CHAD źródło** (`Server PostgreSQL` vs
  `offline-readonly-backup`). Mongo Beeper jest tylko informacyjny.
- **Zakaz:** tworzyć / seedować drzewa `cp_items` pod GUID `pawel_f`
  (`21d11bdc-…`) ani `kamil_s` w lokalnej bazie „żeby login działał”.
  To łamie model Content Providera (prawdziwe itemy / historia / adresy).
- **Dane testowe i mutacje automatyczne:** wyłącznie użytkownik **`test3`**
  (`5a9c8b7d-…`) + `assertIsTest3Session` / `assertTest3Scoped`. Nigdy
  `pawel_f` / `kamil_s` / `chad_admin` body poza świadomą migracją.
- Seed `seed-local-postgres-login.mjs` to **tylko fallback** `test3`, gdy
  users-list jest puste (np. QNAP offline). Nie inventuj listy produkcyjnych
  userów lokalnie.
- **History → Google Sheets:** `GOOGLE_SHEETS_SPREADSHEET_MAP` musi dojść do
  kontenera z cudzysłowami JSON. Compose `${VAR}` je zjada → pusty HTTP 500
  → UI `Unexpected end of JSON input`. Regresja:
  `pnpm test:regression:google-sheets-history`.

### Tabele ↔ Google Sheets — obowiązkowy regression test (`tests/1_2_google-sheets-sync`, `tests/1_4_tables-release`)

**(pakiet regresyjny dla Daily Tracker/Dates/Leads ↔ Google Sheets sync,
folder-protection i outboxów — od reorganizacji `tests/` z 2026-07-28
rozłożony na 4 filary, zobacz `tests/README.md`.)**

- Po **każdej** zmianie dotykającej: dane tabel (Daily Tracker/Dates/Leads),
  listy w Dashboardzie, History, outboxy (`data-outbox*`,
  `google-sheets/outbox*`), sync z Google Sheets, albo system folders
  (`system-folders.ts`, `assertNotSystemFolderWrite`) — agent MA OBOWIĄZEK
  uruchomić `pnpm test:tables-sync` (lokalnie z realną bazą:
  `pnpm test:tables-sync:local`) przed zgłoszeniem taska jako DONE. Pełny
  regression całych filarów: `pnpm test:regression:google-sheets` i
  `pnpm test:regression:tables-release`.
- **Zakaz** oznaczania taska jako DONE albo deployu na TEST, jeśli ten
  zestaw testów nie przechodzi. Failing test = sygnał **regresji danych**,
  nie "test do naprawienia później" — zgłoś to jawnie w raporcie/checkliście
  (`05_tasks_and_checklist.md`), nie pomijaj cicho.
- Zobacz `tests/README.md`, `tests/1_2_google-sheets-sync/description.md` i
  `tests/1_4_tables-release/description.md` po zakres testów (mapping-schema
  drift UI↔mapper, fizyczny delete w Sheets, kolejność
  create→update→delete, ochrona system folders, kształt statusu w
  History, walidacja `GOOGLE_SHEETS_SPREADSHEET_MAP`).

## Kolejność

1. **Ten dokument** — jesteś tu.
2. [`02_what-and-where.md`](02_what-and-where.md) — spis treści całej wiedzy
   (knowledge) i indeks całej pozostałej dokumentacji projektu. Otwórz go
   dalej i użyj jako indeksu — nie czytaj całej dokumentacji projektu za
   każdym razem, tylko sekcje potrzebne do aktualnego zadania.
3. [`03_story-standard.md`](03_story-standard.md) — opisuje obowiązujący
   standard realizacji Story (kiedy zakładać katalog `backlog/stories/<N>/`,
   sześć plików, **obowiązkowy `05_tasks_and_checklist.md`** — Checklist
   RAZEM z opisem każdego tasku, to najważniejszy plik całego standardu —
   opcjonalny `06_others_from_report.md` na decyzje/problemy/propozycje).
4. [`05_endpoint-rules.md`](05_endpoint-rules.md) — zasady dodawania/zmiany
   endpointów i metod `dba`: kiedy wolno dodać brakującą obsługę zapisu,
   zakaz pozornego Save/stuba, kompatybilność przy zmianie istniejącego
   endpointu. Czytaj przed implementacją **każdego** feature'a, który
   zapisuje/modyfikuje dane (numer `05` odzwierciedla kiedy plik powstał,
   nie kolejność czytania — stąd czytany tu, przed `04_deployment-rules.md`).
5. [`04_deployment-rules.md`](04_deployment-rules.md) — zasady buildu/startu/
   stopu/deploymentu wyłącznie oficjalnymi skryptami projektu.

## Podczas pracy nad Story

- Regularnie aktualizuj `backlog/stories/<N>/04_todos.md`. Służy
  wyłącznie do zapisywania bieżącego stanu pracy, żeby po przerwaniu sesji
  AI mogło wznowić pracę tam, gdzie skończyło.
- Po zakończeniu Story `04_todos.md` ma być puste — to sygnał, że nie
  zostały żadne nierozwiązane wątki (szczegóły w `03_story-standard.md`).

**Dopiero po przeczytaniu powyższego** rozpocznij analizę kodu i
implementację.
