# What and where — AI documentation index

Status: utworzone 2026-07-13, zaktualizowane 2026-07-14 (przeniesione do
`documentation/ai-docs/knowledge/` jako `02_what-and-where.md` — punktem
startowym dla AI jest teraz [`01_ai_start.md`](01_ai_start.md), ten plik
jest **indeksem** do reszty dokumentacji, nie punktem wejścia), oraz
2026-07-16 (użytkownik zmienił nazwę katalogu `documentation/ai-docs/
knowledge/` na `documentation/ai-docs/begin_here/` — treść i numeracja
plików bez zmian, zmieniła się wyłącznie nazwa katalogu; wszystkie ścieżki
w tym pliku i w `03_story-standard.md` już wskazują nową nazwę).

**Jeśli jeszcze nie czytałeś [`01_ai_start.md`](01_ai_start.md), zrób to
najpierw** — wskazuje kolejność czytania całej globalnej wiedzy
(`documentation/ai-docs/begin_here/`), zanim wrócisz tutaj po indeks reszty
dokumentacji projektu, per-kategoria, otwierając tylko to, co potrzebne do
aktualnego zadania.

## Zasada

**Przed rozpoczęciem większego zadania przeczytaj najpierw ten plik**, a
dopiero potem — na jego podstawie — otwórz WYŁĄCZNIE dokumenty potrzebne do
aktualnego zadania z właściwej kategorii niżej. Nie czytaj całej dokumentacji
projektu za każdym razem.

Ten plik jest **indeksem**, nie treścią — nie kopiuje wiedzy z dokumentów,
tylko mówi, gdzie ona jest i kiedy po nią sięgnąć. Aktualizuj go przy każdej
nowej kategorii albo ważnym nowym dokumencie.

---

## Endpoints i zmiany API (przeczytaj przed implementacją każdego feature'a z zapisem danych)

**Opis:** Podstawowa zasada architektury dla dodawania/zmiany endpointów i
metod `dba` — kiedy wolno dodać brakującą obsługę zapisu, gdzie ma żyć
logika Content Providera, zakaz pozornego Save/stuba, zasady kompatybilności
przy zmianie istniejącego endpointu, nazewnictwo, co sprawdzić po
implementacji. Umieszczone wysoko w tym indeksie (przed Deploy) celowo —
to zasada potrzebna **przed** implementacją, nie tylko przy wdrażaniu.

**Lokalizacja:** [`05_endpoint-rules.md`](05_endpoint-rules.md) (część tego
samego katalogu `documentation/ai-docs/begin_here/`, część globalnej wiedzy
— patrz sekcja "Knowledge" niżej).

**Czytać gdy:** dowolny feature, który zapisuje lub modyfikuje dane —
zwłaszcza gdy odpowiedni endpoint/metoda `dba` jeszcze nie istnieje.

---

## Deploy

**Opis:** Budowanie obrazów Docker, tagowanie release'ów, uruchamianie
środowisk (lokalnie z Dockerem, lokalnie przez tmux bez Dockera, QNAP TEST,
QNAP PROD, współdzielony stack QNAP), MongoDB, Content Provider API jako
usługa wdrożeniowa, `.env.qnap`/`.env.local`, standard skryptów
build/restart/end/status/deploy (jeden stały zestaw numerowanych slotów,
Story 63).

**Lokalizacja:** `ai-docs/deploy/` (kontrakty/architektura konkretnej aplikacji)
i `ai-docs/bash-scripts/` (ogólny, wielokrotnego użytku standard pisania
skryptów — patrz osobna sekcja niżej).

**Najważniejsze dokumenty:**
- [image-tagging-standard.md](../bash-scripts/image-tagging-standard.md) — **przeczytaj
  zawsze przed jakimkolwiek buildem/deployem.** Własne obrazy CHAD nigdy nie
  używają `:latest`; jeden zapisany tag na release, wspólny dla TEST i PROD;
  od Story 63 obraz TEST niesie też git SHA jako OCI label.
- [qnap-data-path.md](../deploy/qnap-data-path.md) — incydent `/share` jako
  16MB tmpfs, jak go rozpoznać, jak skrypt to teraz waliduje.
- [dashboard-deployment-scripts.md](../deploy/dashboard-deployment-scripts.md) —
  autorytatywny kontrakt skryptów Docker Compose (`00_qnap_shared`,
  `03_local_mac_docker`, `04_qnap_test`, `05_qnap_prod`) oraz SSH-remote
  layer (`06_qnap_test_ssh`, `07_qnap_prod_ssh`): co robi
  `02_build.sh`/`03_re-start.sh`/`04_end.sh`/`05_status.sh`/`06_deploy.sh`,
  architektura shared/test/prod, tabela stałych numerów operacji, dlaczego
  PROD nie buduje (`07_qnap_prod_ssh/06_last_from_test.sh` promuje obraz z
  TEST zamiast deployować niezależnie) (przeczytaj przed zmianą nazw
  jakiegokolwiek skryptu deploymentowego).
- [shared-qnap-services.md](../deploy/shared-qnap-services.md) — jedno wspólne
  MongoDB + jeden wspólny Content Provider dla TEST i PROD: decyzja
  architektoniczna, porty, mounty, procedura promocji obrazu, rollback,
  wyniki realnych testów na QNAP.
- [dashboard-start-scripts.md](../deploy/dashboard-start-scripts.md) — lokalny
  dev flow BEZ Dockera (tmux/tmuxinator: `dba` watch + `next dev` + Content
  Provider), `restart.sh`/`end.sh`/`status.sh` z roota repo.
- [2026-07-10_decision-beeper-mac-qnap-architecture.md](../deploy/2026-07-10_decision-beeper-mac-qnap-architecture.md) —
  matryca środowisk (Mac / local Docker / QNAP test / QNAP prod), konwencja
  portów właściciela (12020–29 = test, 12030–39 = prod).
- [2026-07-10_mongodb-replica-set-migration-plan.md](../deploy/2026-07-10_mongodb-replica-set-migration-plan.md) —
  Mongo pozostaje standalone (bez replica set) na dziś; plan migracji gdyby
  zaszła taka potrzeba (change streams dla `beeper-oplog`).
- [bash-scripts-structure.md](../bash-scripts/bash-scripts-structure.md) — **częściowo
  przestarzałe**, zachowane jako zapis historyczny uzasadnienia nazewnictwa;
  NIE ufaj jego drzewu katalogów jako aktualnemu (użyj `ls bash-scripts/dashboard/`).

**Ogólny standard pisania skryptów (niezależny od konkretnej aplikacji):**
`ai-docs/bash-scripts/` — zacznij od `ai-docs/bash-scripts/ai-start.md`.
Zawiera kontrakt numeracji operacji, kiedy pełna rodzina plików a kiedy prosty
`config.sh`+`deploy.sh`, standard tagowania obrazów, git preflight, wzorce SSH
— to, co jest wspólne dla KAŻDEGO środowiska w `bash-scripts/dashboard/`, nie
tylko dla jednego z nich. `ai-docs/deploy/` opisuje, jak te wzorce są
zastosowane konkretnie w tym repo (architektura shared/test/prod, GHCR,
QNAP, MongoDB) — czytaj oba, ogólny standard najpierw.

**Czytać gdy:** każde zadanie dotyczące builda, Dockera, `docker compose`,
QNAP, release'u, tagowania obrazów, `.env.qnap`/`.env.local`, MongoDB jako
infrastruktury, Content Providera jako *usługi wdrożeniowej* (nie jego API
domenowego — to jest w kategorii "Content Provider (domenowo)" niżej).

---

## Dashboard (Next.js UI)

**Opis:** Feature'y i bugi konkretnych zakładek dashboardu CHAD (Next.js,
`packages/dashboard`) oraz wspólne komponenty layoutu/edytora używane przez
wszystkie zakładki.

**Lokalizacja:** `documentation/dashboard/<zakładka>/{features,bugs}/`

**Podkatalogi (potwierdzone, 2026-07-13):** `common/` (layout, edytor, panel
dev, ssl/domeny, izolacja danych użytkownika), `statuses/`, `msg-todo/`
(wraz z `documentation/features/todo-msg-*.md` — patrz niżej, częściowo
zdublowane), `msg-planner/`, `leads/`, `forms/`, `views/`, `settings/`,
`users/`, `beeper/` (UI zakładki Beeper w dashboardzie — **nie** to samo co
kategoria "Beeper" niżej, która opisuje sync/integrację).

**Najważniejsze dokumenty:**
- `common/features/responsive-layout-standard.md` — jedyny obowiązujący
  standard layoutu (DashboardPageShell/EditorPageShell), scroll, mobile,
  **wspólny komponent `BackButton`, zawsze po prawej stronie toolbara**
  (Story 55, 2026-07-14).
- `common/features/shared-text-editor-toolbar.md` — wspólny edytor
  (CodeMirror), dark mode, numery linii, Preview/Editor tabs, **prop
  `defaultTab`** (Story 55).
- `common/features/voice-recording.md` (nowy, Story 55, 2026-07-14) —
  architektura nagrywania raportów głosem: interfejs `SpeechToTextEngine`
  (silnik wymienny), pierwsza implementacja Web Speech API (tylko Chrome/
  Edge, obsłużone jako normalny stan, nie błąd), `VoiceRecordButton`
  podpięty pod Reports przez `toolbarExtra`.
- `common/features/compile-time-flags-and-error-box.md` — flagi
  `NEXT_PUBLIC_ENABLE_DEV_PANEL`/`NEXT_PUBLIC_ENABLE_DIAGNOSTICS`,
  standardowy `ErrorBox` (bezpieczeństwo: co jest widoczne na test/prod).
- `common/features/chad-user-data-isolation.md`, `chad-domain-ssl.md`,
  `nginx-proxy-manager-domains.md` — auth/multi-user, SSL, domeny publiczne.
- `forms/features/reports-form.md` (2026-07-13, przebudowany w Story 53;
  Story 55 dodała nagrywanie głosowe, `defaultTab="editor"` po utworzeniu,
  Create na osobnym wierszu) — formularz "Reports" (Forms, dwuetapowy
  panel danych + edytor) i widok "Reports" (Views): lista + podgląd
  zapisanych raportów pod `views/reports` (przemianowane z
  `actions/reports` w Story 53). Zawiera też opis wywołań Content
  Providera i wynik testu ręcznego względem realnego CP.
- `forms/features/daily-tracker-dates.md` (zweryfikowane end-to-end,
  2026-07-12; dodane do tego indeksu w Story 62, 2026-07-16 — **przeczytaj
  przed dotknięciem Daily Entry/Tracker/Date Entry/Dates kodu**) — Forms →
  DAILY ENTRY/DATE ENTRY i Views → TRACKER/DATES: pełny audytowany
  przepływ zapisu (`saveDailyEntry`/`saveDateEntry` w `packages/dba/src/
  leads.ts`, `runWithRepoContext`, `invokeContentProvider`), aktualne
  nazewnictwo Itemów (kolejne numery `01`, `02`, ... — NIE nazwy oparte na
  dacie), reguła kolumn `— AUTO` (liczone przy odczycie, nigdy zapisywane),
  potwierdzone: brak działającej metody Delete w Content Providerze
  (`DeleteWorker.Delete()` to pusty stub), istniejące Itemy były już
  bezpiecznie nadpisywane w miejscu przez `Put` (nie przez tworzenie od
  nowa).

**Uwaga o duplikacji:** `documentation/features/*.md` (katalog w rootcie
`documentation/`, BEZ `dashboard/`) zawiera starsze dokumenty o tych samych
tematach (`todo-msg-dashboard.md`, `todo-msg-editor.md`, `msg-planner.md`,
`statuses-dashboard.md`, `statuses-matrix.md`, `forms-features.md`,
`folders-features.md`, `AUTHENTICATION.md`, `FEATURE-REGISTRY.md` i inne) —
sprzed przejścia na strukturę `documentation/dashboard/<zakładka>/`.
**Nie skonsolidowane w tym zadaniu** (poza zakresem — dotyczyło głównie
deploy). Przy pracy nad daną zakładką sprawdź OBA miejsca; jeśli treść się
powtarza, nowszy/dokładniejszy jest zwykle ten pod `dashboard/`.
`documentation/bugs/*.md` (rootowy, bez `dashboard/`) ma analogiczny problem
względem `documentation/dashboard/<zakładka>/bugs/`.

**Czytać gdy:** dowolna zmiana w `packages/dashboard` — UI, layout, konkretna
zakładka, edytor, auth dashboardu.

---

## dba (`packages/dba`)

**Opis:** Warstwa domenowa między dashboardem/console a Content Providerem.
**Cała** surowa komunikacja z Content Providerem (`IRepoService`,
`IItemWorker`, `IManyItemsWorker`, `PostParentItem`, `GetByNames*`, ...) MA
być ukryta tutaj — dashboard i console nigdy nie wywołują tych metod
bezpośrednio.

**Lokalizacja:** `documentation/dba/`

**Najważniejsze dokumenty:**
- `project-goal.md` — po co istnieje `dba`, kontrakt dashboard→dba→CP.
- `post-parent-item.md` — `PostParentItem` = find-or-create, idempotentne;
  wzorzec do tworzenia dzieci Itemów bez duplikatów.
- `data-access.md`, `data-retrieve.md`, `resolve-paths.md`, `cp-paths.md`,
  `import-dba.md` — jak `dba` rozwiązuje ścieżki logiczne na numeryczne
  `loca`, jak pobiera/zapisuje dane.
- `features/`, `bugs/` — konkretne funkcje domenowe (statusy, msg workout,
  konwersacje, AI prompt) i znane błędy.
- `features/report-entries.md` (2026-07-13, przemianowany z
  `actions-reports.md` w Story 53) — feature "Reports" pod `views / reports`
  (dawniej `actions / reports`; GetByNames2 z pustego loca startowego i dwie
  nazwy logiczne naraz); NIE mylić z istniejącym, osobnym, root-level
  folderem `reports` (`reports.ts` — `GetReports`/`GetReportByName`), który
  ma już realne, niezwiązane dane — to jest właśnie dlaczego plik dba nazywa
  się `report-entries.ts`, nie `reports.ts`.
- `provider-migration-audit.md` (Story 72, follow-up) — pełny audyt
  wszystkich publicznych metod `dba` względem wzorca
  `if(mongoEnabled)`/`if(contentProviderEnabled)`: tylko 6 funkcji (Daily/
  Date Entry) jest w pełni zmigrowanych, 55 nadal Content-Provider-only.
  Wykrył i naprawił martwy, zduplikowany kod omijający `dba`
  (`packages/dashboard/lib/chad-dba/*`, `lib/form-storage.ts` — usunięte,
  0 realnych importerów). Czytaj przed planowaniem migracji kolejnej
  funkcji na wzorzec dual-backend.

**Zasada Content Providera (obowiązkowa, patrz też
`documentation/ai-docs/feature-documentation-rules.md`):** fizyczne foldery
Itemów są numeryczne (`01`, `02`, ...); nazwy logiczne żyją w konfiguracji
Itemu. Kod domenowy pracuje na ścieżkach logicznych
(`leads → all items → [nazwa] → msg workout`), nie na ręcznie sklejanym
`loca`. Przed dodaniem nowej operacji zapisu do CP przeczytaj
`post-parent-item.md` i sprawdź istniejące działające wzorce w
`packages/dba/src/*.ts`.

**Czytać gdy:** dowolna zmiana w `packages/dba`, dowolna nowa operacja
czytająca/zapisująca do Content Providera z dashboardu lub console.

---

## Content Provider (domenowo, .NET)

**Opis:** Sam Content Provider (`packages/net-content-provider`) jako
aplikacja — API, model Itemów, znane błędy domenowe. (Deployment/build tego
serwisu jako kontenera QNAP jest w kategorii "Deploy" wyżej —
`00_qnap_shared`/`shared-qnap-services.md`; to jest osobna, świadoma
separacja udokumentowana w `dashboard-deployment-scripts.md`, sekcja "Różnica
względem `packages/net-content-provider/03_scripts/qnap/*.sh`".)

**Lokalizacja:** `documentation/content-provider/`

**Najważniejsze dokumenty:**
- `CONTENT_PROVIDER_GUIDE.md`, `content-provider.md` — ogólny przewodnik.
- `project-items.md` — model Itemów (Folder/Text, numeryczne dzieci, config).
- `frequent-bugs.md` — powtarzające się błędy przy pracy z CP.
- `next-tasks/qnap-test-deployment.md` — dotyczy STAREGO,
  samodzielnego systemu deployu `packages/net-content-provider/03_scripts/qnap/*.sh`
  (plain `docker run`, bez Compose) — **nie** tego samego co "Deploy" wyżej.

**Uwaga:** `packages/net-content-provider` jest **w trakcie przepisywania**
(patrz pamięć projektu / `project_net_content_provider_rewrite`) — nie
analizuj ani nie zmieniaj bez wyraźnej prośby.

**Czytać gdy:** zadanie dotyczy samego Content Providera jako aplikacji
(nie jego deploymentu jako kontenera).

---

## dba-console (`packages/console`)

**Opis:** CLI (`packages/console`) do zarządzania danymi CHAD z terminala.

**Lokalizacja:** `documentation/console/`

**Najważniejsze dokumenty:** `ai-start.md`, `cp-paths.md`, `features/`,
`bugs/`, `next-tasks/`.

**Czytać gdy:** zadanie dotyczy `packages/console`.

---

## Beeper (sync/integracja, nie zakładka UI)

**Opis:** Integracja Beeper Desktop ↔ MongoDB — architektura, migracja z
poprzedniego samodzielnego repo `contacts`, schemat Mongo. Od Story 73
(2026-07-19): każdy CHAD użytkownik ma osobną bazę MongoDB
(`beeper_<repoGuid>`), nie jedną wspólną `beeper` — krytyczna poprawka
izolacji danych (wcześniej `kamil_s` widział kontakty `pawel_f`).

**Lokalizacja:** `ai-docs/beeper/` (przeniesione 2026-07-19, Story 73, z
`human-docs/beeper/` — ten katalog jest częścią globalnej wiedzy AI, nie
dokumentacji per-feature dla ludzi, stąd `ai-docs/`, nie `human-docs/`).

**Zacznij od:** [`ai-docs/beeper/ai-start.md`](../beeper/ai-start.md) —
indeks kolejności czytania dla tego katalogu (analogiczny do
`ai-docs/deploy/ai-start.md`), opisuje wiążącą decyzję o bazie per
użytkownik i wskazuje dokładne pliki kodu (`mongo.ts`, `beeper-crm.ts`,
`repo-context.ts`, route'y `/api/beeper-crm/**`, `owner-db.mjs` w trzech
pakietach backgroundowych).

**Najważniejsze dokumenty:** `architecture.md`, `migration.md`,
`mongo-schema.md`. Powiązane z kategorią "Deploy" (środowiska Mac/QNAP,
replica set) — patrz linki wewnątrz tych dokumentów.

**Czytać gdy:** zadanie dotyczy `packages/beeper-sync`, `beeper-ws`,
`beeper-oplog`, `packages/dba/src/beeper-crm.ts`,
`packages/dashboard/app/api/beeper-crm/**`, albo integracji z Beeper
Desktop.

---

## Headers format

**Opis:** Format nagłówków treści (`headers-format`) używany w treściach
zapisywanych do Content Providera i renderowanych w dashboardzie.

**Lokalizacja:** `documentation/headers/`

**Czytać gdy:** zadanie dotyczy parsowania/renderowania treści z nagłówkami
(np. `headers-parser` w `dba`, `headers-renderer` w dashboardzie).

---

## Knowledge (globalna baza wiedzy — czytaj pierwsza, zacznij od
`01_ai_start.md`)

**Opis:** Krótkie, obowiązujące dla całego projektu zasady, niezależne od
konkretnego zadania/Story. Numerowane wg kolejności czytania.

**Lokalizacja:** `documentation/ai-docs/begin_here/`

**Pliki (2026-07-16):**
- [01_ai_start.md](01_ai_start.md) — pierwszy dokument do przeczytania;
  bardzo krótki, wskazuje tylko kolejność czytania reszty (ten plik,
  `03_story-standard.md`, `05_endpoint-rules.md`, `04_deployment-rules.md`)
  i przypomina o bieżącym aktualizowaniu `stories/<N>/04_todos.md` podczas
  pracy nad Story.
- [03_story-standard.md](03_story-standard.md) —
  standard numerowanych katalogów Story (`backlog/stories/<N>/`,
  6 plików `01_input.md`...`06_others_from_report.md`; **`05_tasks_and_checklist.md`
  jest obowiązkowy i musi zawierać zarówno Checklistę JAK I opis każdego
  tasku** — to najważniejszy plik całego standardu, oznaczony na czerwono
  w samym dokumencie po tym, jak pominięcie opisów tasków faktycznie się
  zdarzyło w Story 56; `06_others_from_report.md` jest opcjonalny —
  decyzje/problemy/propozycje, może być pusty), zasada "puste
  `04_todos.md` = Story bez nierozwiązanych wątków", i rozróżnienie
  względem per-Story `03_knowledge.md`.
- [04_deployment-rules.md](04_deployment-rules.md) —
  build/start/stop/deploy wyłącznie oficjalnymi skryptami projektu; dlaczego
  `docker-compose.*.yml` nie jest źródłem wiedzy o procesie deploymentu
  (IMAGE_TAG, generowany appsettings, health-checki, port ownership).
- [05_endpoint-rules.md](05_endpoint-rules.md) (nowy, Story 62, 2026-07-16)
  — zasady dodawania/zmiany endpointów i metod `dba`: kiedy wolno dodać
  brakującą obsługę zapisu, gdzie żyje logika Content Providera, zakaz
  pozornego Save/stuba, kompatybilność przy zmianie istniejącego endpointu,
  nazewnictwo, co sprawdzić po implementacji. Mimo numeru `05`, czytać
  **przed** `04_deployment-rules.md` przy jakimkolwiek zadaniu z zapisem
  danych — numeracja odzwierciedla kolejność powstania plików, nie
  kolejność czytania dla tego konkretnego przypadku (patrz też sekcja
  "Endpoints i zmiany API" wyżej w tym indeksie).

**Czytać gdy:** zawsze, na samym początku pracy w tym repo — nie tylko przy
zadaniach dotyczących akurat Story albo deploymentu.

## Standardy dla AI (meta)

**Opis:** Zasady, którym samo AI ma podlegać przy pisaniu dokumentacji i
przy pracy w tym repo — nie wiedza domenowa, tylko konwencje.

**Lokalizacja:** `documentation/ai-docs/` (pliki bezpośrednio w tym
katalogu, nie w podkatalogach kategorii) oraz `documentation/ai-docs/begin_here/`
dla `01_ai_start.md`/`02_what-and-where.md` (ten plik) samych.

**Najważniejsze dokumenty:**
- [feature-documentation-rules.md](../feature-documentation-rules.md) —
  obowiązkowy standard dokumentowania nowych feature'ów (sekcje: cel,
  zakres, zmienione pliki, route/API, przepływ danych, zależność od Content
  Providera, cache, edge cases, ograniczenia, dalsze etapy). **Uwaga:**
  ten dokument podaje lokalizację `architecture/[projekt]/features/...`,
  która NIE odpowiada faktycznej strukturze repo
  (`documentation/dashboard/<zakładka>/features/...`, `documentation/dba/features/...`
  itd.) — traktuj sekcje o TREŚCI dokumentacji jako obowiązujące, a ścieżkę
  jako przestarzałą; nie twórz katalogu `architecture/`.
- `02_what-and-where.md` (ten plik) — indeks, aktualizuj przy każdej nowej
  kategorii/ważnym dokumencie.
- [bash-scripts-standard-compendium.md](../bash-scripts-standard-compendium.md)
  (nowy, Story 63) — **przenośny** standard `bash-scripts/` (numeracja
  slotów, `common/lib.sh`, Git preflight, promocja TEST→PROD) wyprowadzony
  z faktycznie poprawionej struktury CHAD, przeznaczony do przekazania
  Claude w INNYM repozytorium jako wzorzec — nie opisuje CHAD-owej
  dokumentacji dla samego CHAD (do tego służy
  `deploy/dashboard-deployment-scripts.md`).

**Czytać gdy:** tworzysz nową dokumentację feature'a/buga w dowolnej
kategorii — sprawdź wymaganą zawartość sekcji.

---

## Stories (numerowane katalogi, historia całego zadania)

**Opis:** Od Story 53 (2026-07-14) każde większe zadanie ("story" — feature,
migracja, poprawki, zmiany w kilku warstwach, testy, dokumentacja i
świadomie odłożone follow-upy razem) dostaje kolejny numer i katalog z
pełną historią zadania: dokładny wejściowy prompt użytkownika, plan,
potrzebna wiedza, końcowy raport, odłożone tematy.

**Lokalizacja (od Story 62, 2026-07-16 — przeniesione z `documentation/stories/`
do `backlog/stories/`, root repo; stare ścieżki `documentation/stories/<N>/`
cytowane w treści Story 53–56 są historycznym zapisem i nie zostały
przepisane):** `backlog/stories/<numer>/` — katalog nazwany
WYŁĄCZNIE numerem (nigdy `53_reports` ani `Story 53`; nazwa story to
metadana w nagłówku pliku, nie część nazwy katalogu — tak jak w Content
Providerze fizyczne foldery są numeryczne, a nazwa logiczna żyje w
`config.yaml`). Pliki wewnątrz mają numeryczny prefiks:
`01_input.md`, `02_plan.md`, `03_knowledge.md`, `04_todos.md`,
`05_tasks_and_checklist.md` (obowiązkowy), `06_others_from_report.md`
(opcjonalny).

**Standard opisany raz w:** `documentation/ai-docs/begin_here/03_story-standard.md`
(część globalnej bazy wiedzy — patrz sekcja "Knowledge" wyżej) — przeczytaj
go przed założeniem nowego story albo kontynuacją istniejącego, zamiast
zgadywać konwencję z przykładu.

**Nie zastępuje** dokumentacji per-funkcjonalność (`documentation/dashboard/<zakładka>/features/`,
`documentation/dba/features/`, ...) — ta nadal żyje i jest aktualizowana w
swoim miejscu; katalog story dokumentuje historię zadania i może
obejmować/aktualizować kilka takich plików naraz.

**Czytać gdy:** zaczynasz nowe większe zadanie (żeby założyć story
poprawnie) albo wracasz do poprawki w obrębie istniejącego story (zacznij
od `03_knowledge.md` tego story, żeby nie odkrywać kontekstu od zera).

---

## Planowanie / historia architektoniczna (duże, rzadko potrzebne)

**Opis:** Duże, historyczne dokumenty planistyczne — pełny kontekst decyzji
o migracji na monorepo `chad`, docelowy model MongoDB, kompatybilność
Content Providera. Rzadko potrzebne w całości; zwykle wystarczy węższy
dokument z kategorii powyżej, który je cytuje.

**Lokalizacja:** `documentation/ai-docs/` (pliki bezpośrednio w tym
katalogu)

**Dokumenty:**
- [26-07-10_cline_prompt_mongodb_qnap_folders_v3.md](../26-07-10_cline_prompt_mongodb_qnap_folders_v3.md) —
  **2035 linii.** Oryginalny prompt migracyjny: monorepo `chad`, MongoDB na
  QNAP, kompatybilność Content Providera, feature Folders. Czytaj tylko
  fragmentami (szukaj przez `grep`), nie w całości, chyba że zadanie
  dotyczy bezpośrednio tej migracji.
- [2026-07-12_audit-public-api-for-php-frontend.md](../2026-07-12_audit-public-api-for-php-frontend.md) —
  Audyt: czy `dba` nadaje się jako baza publicznego API dla frontendu PHP.
  Status: audyt zakończony, **nic nie zaimplementowano**, czeka na decyzję
  właściciela.

**Czytać gdy:** zadanie wprost dotyczy historii tej migracji albo
publicznego API dla PHP.

---

## Root-level dokumenty ogólne

**Opis:** Dokumenty na samym szczycie `documentation/`, nieprzypisane do
żadnej z powyższych kategorii.

- `documentation/README.md` — **przestarzałe** (opisuje strukturę
  `general/`/`features/` z projektu sprzed monorepo `chad`, wzmiankuje pliki
  które nie istnieją w tym repo, np. `general/SCREENS-ARCHITECTURE.md`).
  Ma teraz na górze wskaźnik do `documentation/ai-docs/begin_here/01_ai_start.md`.
- `documentation/nodejs-style.md` — styl kodu Node.js/TypeScript.
- `documentation/DataLibFeatures.md` — funkcje biblioteki danych (starszy
  dokument, sprawdź aktualność przed użyciem).
- `documentation/todo.txt` — luźna lista TODO, nieformalna.
- `documentation/claude/` — logi sesji AI (`26-07-10/session-log.md`).

---

## Duplikaty i przestarzała dokumentacja — znalezione podczas audytu 2026-07-13

Nie skonsolidowane w tym zadaniu (poza zakresem — to zadanie dotyczyło
przede wszystkim deploy + ten indeks). Zapisane tutaj, żeby następne zadanie
porządkowe miało gotową listę:

1. `documentation/features/*.md` vs `documentation/dashboard/<zakładka>/features/*.md`
   — ten sam temat w dwóch miejscach (Msg Todo, Msg Planner, Statuses,
   Forms, Folders, Auth). Rootowy `documentation/features/` wygląda na
   starszy/pre-reorganizację.
2. `documentation/bugs/*.md` vs `documentation/dashboard/<zakładka>/bugs/*.md`
   — analogicznie.
3. `documentation/README.md` — opisuje strukturę, która nie istnieje w tym
   repo (`general/SCREENS-ARCHITECTURE.md`, `general/TARGET-SYSTEM-ARCHITECTURE.md`,
   `general/SPRINT-PLAN-S1-S2.md`, konwencja tagowania obrazów
   `YY-MM-DD__HH-MM-SS` sprzeczna z faktyczną `YYMMDD_HHMMSS`).
4. `documentation/ai-docs/deploy/bash-scripts-structure.md` — flagowane
   wewnątrz jako częściowo przestarzałe (patrz plik).
5. `documentation/ai-docs/feature-documentation-rules.md` — poprawna co do
   treści wymaganych sekcji, ale podaje nieistniejącą ścieżkę
   `architecture/[projekt]/features/`.
