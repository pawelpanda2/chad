# AI start — read this first

Status: utworzone 2026-07-14 jako nowy punkt startowy dla AI (wydzielony z
`what-and-where.md`, które teraz jest indeksem, nie punktem wejścia).

To jest **pierwszy dokument**, który AI ma przeczytać przed jakimkolwiek
większym zadaniem w tym repo. Jest celowo krótki — to tylko wskazanie
kolejności czytania, nie opis standardów samych w sobie.

## Najczęstszy błąd AI w tym repo — przeczytaj to PIERWSZE

### Błąd A — lokalny Postgres ≠ źródło danych LOCAL (powtarza się)

**(wzmocnione 2026-08-09 po kolejnym incydencie: agent weryfikował Features
na prawie pustym `chad-postgres-local-mac-docker` i wnioskował „brak danych”,
mimo że normalny LOCAL czyta wspólną bazę QNAP przez Tailscale.)**

- **Domyślne źródło danych LOCAL = Server PostgreSQL (QNAP) przez Tailscale**
  (`100.117.139.83:12042`). TEST, PROD i LOCAL (normalny tryb) dzielą **tę
  samą** żywą bazę. To jest zamierzone — patrz
  `ai-docs/databases/red-rules.md` Rule 1.
- Kontener `chad-postgres-local-mac-docker` / `POSTGRES_URI=…@postgres:5432`
  w `docker-compose.local.yml` **nie jest** domyślnym źródłem aplikacji.
  Dev Panel → Settings: **Server PostgreSQL** (primary) vs
  **Offline backup — read only** (wyłącznie awaria bez sieci).
- **Zakaz:** uznawać pustą lokalną volume za „stan produkcji” albo „brak
  raportów użytkownika”. Zanim ocenisz dane: sprawdź aktywne źródło
  (`GET /api/dev-settings/db-source` / Dev Panel) albo odpytaj QNAP
  Tailscale — nie lokalny port `5433`, chyba że świadomie jesteś w trybie
  awaryjnym.
- `offline-readonly-backup` = tylko awaria / brak internetu / brak
  Tailscale; **tylko odczyt**; nigdy development write ani „żeby login
  działał”.
- Pełne reguły: `ai-docs/databases/red-rules.md` →
  `ai-docs/databases/ai-start.md`.

### Błąd B — deploy PROD ≠ osobny build

**(dodane 2026-07-22, po realnym incydencie: AI zapytało o zgodę na deploy
PROD tak, jakby to była ryzykowna, osobna operacja budowania — mimo że
odpowiedź jest już opisana w `04_deployment-rules.md` i
`deploy/ai-start.md`, tylko AI ich nie zastosowało w praktyce.)**

- **Domyślny deploy TEST (szybszy):** buduj lokalnie na Macu i wyślij obraz
  przez GHCR — `bash-scripts/dashboard/08_registry_test/deploy.sh`
  (build+push na Macu → QNAP tylko `docker pull` + restart). **Nie używaj
  domyślnie** `06_qnap_test_ssh/06_deploy.sh` (build na QNAP jest wolniejszy);
  ta ścieżka zostaje tylko jako awaryjna/równoległa.
- **Deploy PROD:** wyłącznie przekierowanie na TEN SAM obraz, który już
  działa na TEST — `bash-scripts/dashboard/07_qnap_prod_ssh/06_last_from_test.sh`.
  **Nigdy nie buduje** niczego od nowa. Nie ma „osobnego buildu dla PROD”.
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

## DBA vs Content Provider — nie są alternatywami, są warstwami

**(dodane 2026-08-08, Story 109, po tym jak AI zadało pytanie "DBA czy
Content Provider?" tak, jakby to były dwie konkurencyjne architektury do
wyboru — to fałszywa alternatywa.)**

Docelowa architektura CHAD jest warstwowa, nie "albo/albo":

```
Dashboard / API route / Console
        ↓
    packages/dba          — sesja/repo context, uprawnienia, orchestracja aplikacyjna CHAD
        ↓
packages/content-provider — domenowe reguły CP (kontrakty, walidacja, import), backend-independent
        ↓
      cp-entry             — wybiera backend (postgre dziś jedyny realny — patrz ai-docs/databases/red-rules.md)
        ↓
    provider (postgre/files/mongo/net-adapter) — fizyczny zapis
```

- **DBA** = publiczna warstwa aplikacyjna/orchestracyjna dla CHAD:
  `runWithRepoContext`, uprawnienia (system-folder read-only, admin
  unlock, `assertChadWriteAllowed`), mapowanie błędów domenowych na
  kontrakt CHAD. DBA **wywołuje** Content Provider dla operacji domenowych
  na CP Items — nie jest z nim równorzędną alternatywą.
- **Content Provider** (`packages/content-provider/`) = domenowe reguły CP
  same w sobie: kontrakty (`cp-core`), walidacja drzewa/configu, reguły
  importu, zachowanie backend-independent. Wystawiane wyłącznie przez
  `cp-entry` — caller nigdy nie wybiera providera bezpośrednio.
- **Provider** = fizyczny backend (dziś: PostgreSQL, `chad-postgres` — jedyny
  aktywny backend danych CHAD, patrz `ai-docs/databases/red-rules.md`).

**Stan przejściowy:** większość istniejącego kodu w `packages/dba` (np.
`folders.ts`, `item-ops.ts`) woła `data-providers/postgres-cp-provider.ts`
bezpośrednio — pomija tę warstwę. To jest **znany, akceptowany dług
migracyjny**, nie wzorzec do kopiowania. Zasada: stary kod może zostać
przejściowy i być poprawiany stopniowo przy okazji pracy w danym obszarze;
**nowy kod nie ma pogłębiać tego długu** — jeśli `packages/content-provider`
ma już (albo można tanio dodać) odpowiedni kontrakt dla operacji, nowy kod
ma iść przez `cp-entry`, nie bezpośrednio do providera. Nie rób przy tym
szerokiej migracji całego istniejącego kodu — tylko nowa praca stosuje się
do docelowego podziału.

Pełny opis (peryferyjne szczegóły, historia decyzji, kontrakt importu ZIP):
[`ai-docs/content-provider/ai-start.md`](../content-provider/ai-start.md).

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
