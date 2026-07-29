# Story 91 — Input

## Input 1

rompt dla AI Codera — plugins/beeper-synch

1. Opis konkretnego zadania użytkownika

Pracujesz w aktualnym lokalnym repozytorium CHAD:

$repo_path

Aktualny publiczny HEAD zweryfikowany przed przygotowaniem tego promptu:

a04d493bfccb0a31845f7c29023fb2b4fab84f1f
fix(beeper): put Include/Exclude columns first; document GHCR deploy as default

Nie zakładaj jednak, że lokalny HEAD jest identyczny. Na początku sprawdź aktualny stan lokalnego repo.

1.1. Cel

Utwórz w głównym katalogu monorepo nowy folder:

plugins/

a w nim projekt:

plugins/beeper-synch/

Nazwa ma pozostać dokładnie:

beeper-synch

Ma to być plugin/aplikacja Node.js/TypeScript uruchamiana na Macu, której zadaniem jest synchronizacja danych z lokalnego Beeper Desktop do serwerowej bazy Beeper MongoDB na QNAP.

Plugin nie może duplikować istniejącej logiki. Ma korzystać przez workspace dependencies/references z istniejących pakietów w:

packages/

które rzeczywiście odpowiadają za aktualny flow Beeper, w szczególności za:

komunikację z Beeper Desktop;

odczyt kanałów, kontaktów, rozmów, wiadomości i załączników;

synchronizację inkrementalną;

zapis do Beeper MongoDB;

permissions Include/Exclude;

repo context i wybór właściwej bazy użytkownika;

ewentualny oplog/event stream;

retry, indeksy i stan synchronizacji.

Najpierw ustal aktualny podział odpowiedzialności. W publicznym repo potwierdzono istnienie m.in.:

packages/beeper-oplog/
bash-scripts/beeper/
.env.mac-beeper.example
ai-docs/beeper/
docker-compose.qnap.shared.yml

oraz wcześniejszych mechanizmów beeper-sync i beeper-ws. Nie zgaduj aktualnych nazw entrypointów ani nie twórz ich drugiej kopii.

1.2. Startup macOS

Utwórz:

bash-scripts/beeper-synch/

i przygotuj skrypty do automatycznego uruchamiania pluginu po zalogowaniu/startcie systemu macOS.

Jako wzorzec przeanalizuj projekt Content Provider znajdujący się w workspace użytkownika:

08_nodejs/content-provider/bash-scripts/04_mac_startup/

z plikami:

install-startup.sh
system-startup.sh
un-install-startup.sh

W CHAD mają powstać funkcjonalne odpowiedniki dla beeper-synch.

Skrypty Content Providera i beeper-synch muszą działać jednocześnie i nie mogą się ze sobą gryźć. Zapewnij własne, unikalne:

LaunchAgent label;

nazwę plist;

ścieżki stdout/stderr;

nazwę procesu/usługi;

lock/PID, jeśli istniejący standard ich wymaga;

working directory;

ścieżki runtime;

porty, jeśli plugin ich rzeczywiście potrzebuje.

Po implementacji zainstaluj startup na aktualnym Macu i realnie sprawdź działanie. Nie kończ na samym wygenerowaniu plików.

1.3. Osobna usługa w shared CHAD

Dodaj odpowiednią osobną usługę/kontener pod wspólnym stackiem CHAD na QNAP.

Najpierw ustal faktyczną architekturę. Dokumentacja repo wskazuje, że TEST i PROD współdzielą docker-compose.qnap.shared.yml, w którym działa m.in. beeper-mongodb. Nie zakładaj jednak, że pełny klient Beeper Desktop może działać na QNAP.

Rozdziel odpowiedzialności poprawnie:

część wymagająca lokalnego Beeper Desktop działa na Macu;

QNAP może zawierać wyłącznie część serwerową/odbiorczą/worker, która rzeczywiście może działać bez desktopowej aplikacji;

nie uruchamiaj dwóch konkurencyjnych writerów wykonujących ten sam sync;

nie udawaj healthcheckiem, że synchronizacja działa, jeśli proces nie ma dostępu do źródła.

Jeżeli aktualna architektura już pozwala Macowi zapisywać bezpośrednio do QNAP Mongo, nie dodawaj bez potrzeby fikcyjnego kontenera wykonującego tę samą pracę. W takim przypadku dodaj tylko rzeczywiście potrzebną usługę serwerową albo udokumentuj w Story, że kontener pełnego syncu byłby błędem architektonicznym, i zastosuj właściwy podział odpowiedzialności.

1.4. Oczekiwany rezultat

Doprowadź zadanie do końca:

folder plugins/beeper-synch;

właściwy projekt workspace;

użycie istniejących pakietów zamiast kopiowania logiki;

poprawny lokalny runtime;

skrypty startup macOS;

zainstalowany i działający LaunchAgent;

brak konfliktu ze startupem Content Providera;

poprawna rola/usługa po stronie shared CHAD;

testy;

aktualizacja Story;

commit;

push;

local Docker przed TEST;

opcjonalny deploy na TEST, jeżeli potrzebny do realnej weryfikacji;

bez deployu na PROD.

2. Zabezpieczenia przed podstawowymi błędami AI Codera

2.1. Minimalizacja tokenów bez pomijania wiedzy

Minimalizuj zużycie tokenów:

nie analizuj całego repo bez potrzeby;

nie wykonuj szerokiego audytu, jeśli znane są właściwe moduły;

nie czytaj tych samych dużych plików wielokrotnie;

nie powtarzaj audytów, backupów i testów już potwierdzonych w bieżącym Story lub raporcie;

wykorzystuj istniejące logi, checklisty, raporty i dokumentację;

czytaj tylko dokumentację i kod potrzebne do tego zadania;

ogranicz raporty pośrednie;

szczegóły zapisuj w Story, a nie powtarzaj ich w czacie;

nie twórz nowego planu, jeśli plan został już zatwierdzony;

nie pytaj o rutynowe zgody, jeśli działanie jest bezpieczne i mieści się w zakresie.

Oszczędzanie tokenów nie oznacza:

pomijania dokumentacji;

zgadywania ścieżek;

pomijania testów regresyjnych;

rezygnacji z backupu przy zmianach danych;

twierdzenia, że coś działa bez realnej weryfikacji.

2.2. Dokumentacja i standardy według specjalizacji

Najpierw przeczytaj aktualny punkt wejścia:

$repo_path/ai-docs/begin_here/01_ai_start.md
$repo_path/ai-docs/begin_here/02_what-and-where.md
$repo_path/ai-docs/begin_here/03_story-standard.md
$repo_path/ai-docs/begin_here/05_endpoint-rules.md
$repo_path/ai-docs/begin_here/04_deployment-rules.md

Nie zakładaj ai-docs/start_here/, README.md, CLAUDE.md ani AGENTS.md.

Następnie przeczytaj tylko właściwą dokumentację, w szczególności aktualne odpowiedniki:

ai-docs/beeper/
ai-docs/databases/red-rules.md
ai-docs/databases/ai-start.md
ai-docs/deploy/
ai-docs/bash-scripts/ lub wskazany przez indeks aktualny folder standardów skryptów

Przeczytaj również bieżące Story związane z Beeperem tylko wtedy, gdy indeks lub kod wskazuje ich bezpośrednią przydatność. Historyczne Story nie jest ważniejsze od aktualnego kodu.

Twarde fakty z aktualnego punktu wejścia:

CHAD używa PostgreSQL dla danych CHAD;

MongoDB pozostaje dla danych Beepera;

lokalny runtime normalnie łączy się z Server Mongo przez Tailscale;

offline readonly backup jest wyłącznie awaryjnym odczytem;

TEST i PROD współdzielą prawdziwe dane w shared stacku;

deploy TEST domyślnie odbywa się przez GHCR i oficjalny skrypt.

2.3. Celowana analiza aktualnego repozytorium

Przed zmianami:

git status --short
git log -5 --oneline

Następnie sprawdź:

aktualny workspace root i jego globs;

root package.json;

lockfile;

istniejące pakiety Beeper;

aktualne entrypointy beeper-sync, beeper-ws, beeper-oplog;

skrypty bash-scripts/beeper/;

.env.mac-beeper.example;

shared compose;

lokalny compose;

obecny model wyboru bazy beeper_<repoGuid>;

istniejące zabezpieczenie przed podwójną instancją;

istniejące healthchecki;

aktualne Story/checklisty.

Potwierdź realny runtime host, port, bazę, backend read i backend write. Nie opieraj się na etykiecie UI ani starym raporcie.

Nie kopiuj logiki z istniejącego pakietu do pluginu tylko dlatego, że łatwiej go uruchomić.

2.4. Najważniejsze testy regresyjne przed commitem

Reguła:

zmieniłeś dany obszar
→ uruchom testy regresyjne tego obszaru
→ dopiero po PASS wykonaj commit

Dla tego zadania wykonaj co najmniej:

install/build/typecheck pluginu;

testy dotkniętych pakietów Beeper;

test konfiguracji env;

smoke test połączenia z Beeper Desktop;

smoke test właściwej bazy Mongo;

test inkrementalnego syncu bez duplikatów;

test Include;

test Exclude;

test obu flag wyłączonych, jeśli aktualny kontrakt tak działa;

test restartu procesu;

test SIGINT i SIGTERM;

test retry/backoff po czasowym braku sieci;

test blokady drugiej instancji;

test instalacji LaunchAgent;

ponowny idempotentny install;

restart/reload LaunchAgent;

uninstall;

ponowny install;

potwierdzenie, że startup Content Providera nadal działa;

test healthchecku rzeczywistej usługi QNAP;

sprawdzenie, że deploy/usługa nie restartuje niepotrzebnie innych shared usług;

brak sekretów w repo i logach.

Każdy znaleziony bug otrzymuje test regresyjny.

Build lub typecheck bez realnego flow nie oznacza PASS całego zadania.

2.5. Bezpieczeństwo danych i migracji

nie wykonuj drop, deleteMany({}), truncate ani resetu wolumenów;

nie wykonuj nowej migracji danych bez potrzeby;

nie nadpisuj nowszych danych starszym snapshotem;

nie seeduj produkcyjnych użytkowników;

nie mutuj danych pawel_f, kamil_s ani chad_admin w ramach testów;

testowe mutacje wykonuj tylko na zatwierdzonym użytkowniku testowym, zgodnie z aktualną dokumentacją;

przed każdą konieczną mutacją istniejących danych wykonaj backup i przygotuj rollback;

nie commituj .env, credentiali, tokenów ani dumpów;

lokalny offline backup nie może stać się targetem zapisu pluginu.

2.6. Architektura i warstwa DBA

Zachowaj aktualny podział odpowiedzialności.

Jeżeli plugin wykonuje operacje biznesowe lub zapis wykorzystujący kontrakty DBA:

plugin / worker
→ publiczne API istniejącego pakietu
→ DBA/provider
→ Beeper MongoDB

Nie:

otwieraj drugiego bezpośredniego klienta Mongo, jeśli istniejący provider już obsługuje zapis;

kopiuj repo context;

omijaj permissions;

omijaj indeksów;

omijaj state/cursor;

implementuj drugiego parsera Beepera;

mieszaj kodu uruchomieniowego z właściwą logiką synchronizacji.

plugins/beeper-synch ma być cienkim runtime/orchestratorem. Wspólna logika pozostaje w packages/.

Jeżeli istniejący kod nie ma czystego publicznego kontraktu, wydziel go do właściwego pakietu i dopiero użyj w pluginie. Nie rozwiązuj tego importami z prywatnych plików src/... pomiędzy pakietami, jeśli standard workspace tego zabrania.

2.7. Izolacja użytkowników

właściwy użytkownik/repoGuid musi pochodzić z zatwierdzonej konfiguracji;

nie przyjmuj dowolnego repoGuid z niezaufanego requestu;

używaj aktualnego modelu baz beeper_<repoGuid>;

sprawdź cross-user isolation;

nie zapisuj danych jednego użytkownika do bazy drugiego;

nie stosuj globalnego fallbacku;

nie loguj prywatnych treści wiadomości;

logi diagnostyczne powinny używać identyfikatorów, countów i statusów.

2.8. Git i równoległa praca

Przed zmianami:

git status --short
git log -5 --oneline

Jeżeli ktoś pracuje równolegle:

nie cofaj jego zmian;

nie wykonuj git reset --hard;

nie rób force-push;

nie nadpisuj jego plików;

ogranicz zakres do własnego zadania;

przed commitem pobierz aktualny stan origin;

rozwiązuj tylko rzeczywiste konflikty;

nie commituj przypadkowych plików;

nie commituj build artifacts, logów, .env, dumpów, runtime plist ani PID.

Commity są dozwolone. Push jest dozwolony. Nie wdrażaj PROD.

2.9. Deployment

Kolejność:

lokalny kod
→ lokalne uruchomienie pluginu
→ local Docker / lokalne usługi
→ TEST
→ PROD tylko po osobnej zgodzie

Używaj wyłącznie oficjalnych skryptów.

Aktualny punkt wejścia wskazuje domyślny deploy dashboardu TEST przez:

bash-scripts/dashboard/08_registry_test/deploy.sh

Dla pluginu/shared usługi znajdź właściwy istniejący skrypt lub dodaj go zgodnie ze standardem bash-scripts. Nie wykonuj ręcznego ad-hoc wdrożenia, jeśli istnieje lub powinien istnieć oficjalny skrypt.

Deploy jednej usługi nie może restartować całego shared stacku bez potrzeby.

Po deployu wykonaj:

status;

logi;

healthcheck;

smoke test;

weryfikację, że TEST/PROD lub inne shared usługi nie zostały przypadkowo przerwane.

Nie wdrażaj PROD.

2.10. Autonomia

Działaj samodzielnie.

Nie pytaj o rutynowe zgody.

Nie zatrzymuj się po planie, analizie, stworzeniu Story, buildzie ani pierwszym błędzie.

Sam naprawiaj błędy i kontynuuj aż do kompletnego wyniku.

Zatrzymaj się tylko przy realnym ryzyku:

utraty danych;

braku backupu;

niepewnym rollbacku;

niejasnym source of truth;

konflikcie z równoległą pracą;

zmianie architektury poza zakresem;

operacji destrukcyjnej;

deployu PROD.

2.11. Uczciwość testów i raportu

Nie twierdź, że coś działa, jeżeli wykonano tylko:

analizę;

typecheck;

build;

unit test;

uruchomienie procesu bez sprawdzenia przepływu danych;

przygotowanie plist bez załadowania LaunchAgent;

stworzenie kontenera bez healthchecku;

test lokalny, gdy raport dotyczy TEST.

Rozróżniaj:

nieuruchomione
zablokowane
FAIL
PASS lokalnie
PASS na TEST
PASS na PROD

Raport końcowy ma być krótki i zawierać wyłącznie fakty.

2.12. Wznowienie pracy

Jeżeli odkryjesz istniejące Story lub niedokończoną implementację:

Wznów od pierwszego niewykonanego kroku.
Nie powtarzaj potwierdzonych audytów, backupów i testów.
Najpierw przeczytaj bieżące Story, checklistę oraz ostatni raport.

Nie zaczynaj całego zadania od zera.

3. Szczegółowy zakres implementacji

3.1. Workspace i struktura

Dodaj plugins/ do aktualnej konfiguracji workspace tylko wtedy, gdy nie jest już objęty istniejącym globem.

Minimalna struktura:

plugins/
└── beeper-synch/
    ├── package.json
    ├── tsconfig.json
    ├── src/
    │   └── ...
    ├── tests/
    │   └── ...
    └── README.md

Nie dodawaj monolitycznego index.ts, który kopiuje całą logikę syncu. Entry point ma tylko:

ładować i walidować config;

tworzyć zależności;

uruchamiać istniejący sync service;

obsługiwać lifecycle;

wystawiać health/status tylko wtedy, gdy jest potrzebny;

zamykać połączenia.

W package.json użyj workspace dependencies do realnie istniejących pakietów.

3.2. Konfiguracja

Rozszerz istniejący .env.mac-beeper.example albo dodaj celowany .env.example przy pluginie zgodnie z aktualnym standardem.

Nie duplikuj tych samych zmiennych w kilku miejscach bez potrzeby.

Waliduj minimum:

endpoint Beeper Desktop;

Mongo URI/host;

repoGuid lub stabilną tożsamość użytkownika;

nazwę bazy wynikową;

tryb działania;

poziom logów;

identyfikator instancji;

retry/backoff;

lock.

Nie wypisuj sekretów.

3.3. Lifecycle

Wymagania:

poprawny start;

idempotentne indeksy;

tylko jedna instancja;

graceful shutdown;

retry z ograniczonym backoffem;

brak tight loop;

czytelne kody wyjścia;

odróżnienie błędu źródła Beeper od błędu Mongo;

stan gotowości dopiero po rzeczywistym połączeniu.

3.4. LaunchAgent

W bash-scripts/beeper-synch/ dodaj:

install-startup.sh
system-startup.sh
un-install-startup.sh

Jeżeli standard repo przewiduje również:

status.sh
restart.sh
logs.sh

dodaj tylko brakujące potrzebne skrypty.

Wymagania:

set -euo pipefail;

idempotencja;

bezpieczne cytowanie ścieżek;

wsparcie dla ścieżek ze spacjami;

żadnego hardcodowania /Users/pawelfluder/..., poza dynamicznie wykrytą lokalną ścieżką;

własny LaunchAgent label;

własny plist;

własne logi;

poprawne launchctl bootstrap/bootout dla aktualnej wersji macOS lub zgodny istniejący wzorzec;

brak ingerencji w Content Provider;

po install realny status procesu;

uninstall usuwa tylko własną usługę.

3.5. Shared CHAD / QNAP

Przeanalizuj aktualny docker-compose.qnap.shared.yml.

Dodaj tylko usługę, która ma sens architektoniczny.

Jeżeli serwerowa część jest potrzebna:

własna nazwa usługi;

własny obraz/target;

brak sekretów w obrazie;

env z zatwierdzonego pliku;

restart policy;

realny healthcheck;

izolowana zależność od beeper-mongodb;

brak konfliktu z dashboardem i innymi workerami;

brak automatycznego restartu całego shared stacku.

Jeżeli pełny beeper-synch wymaga Beeper Desktop, Mac pozostaje źródłowym procesem. Kontener nie może symulować źródła.

3.6. Dokumentacja i Story

Zgodnie z aktualnym 03_story-standard.md:

sprawdź najwyższy numer Story;

utwórz kolejne Story, jeżeli zadanie nie ma już aktywnego Story;

zachowaj obowiązujące pliki i checklistę;

wpisz pełny input;

aktualizuj stan podczas pracy;

po zakończeniu pozostaw 04_todos.md puste;

zapisz rzeczywiste użyte pakiety, architekturę runtime i procedurę startupu.

Nie zatrzymuj się po utworzeniu Story.

4. Zakazy i granice

Nie wolno:

wdrażać PROD;

resetować wolumenów;

kasować danych;

tworzyć drugiej migracji bez uzasadnienia;

kopiować całego syncu do pluginu;

uruchamiać równoległych writerów;

commitować sekretów;

hardcodować ścieżki użytkownika;

zmieniać startupu Content Providera;

udawać działania kontenera bez Beeper Desktop;

omijać Include/Exclude;

pisać do offline readonly backup;

robić force-push;

wykonywać git reset --hard;

zatrzymywać się tylko dlatego, że trzeba stworzyć plan.

5. Weryfikacja

Przed uznaniem zadania za zakończone pokaż dowody:

Plugin jest widoczny dla workspace.

Workspace install przechodzi.

Build/typecheck przechodzi.

Plugin uruchamia istniejący sync service.

Właściwa baza użytkownika została potwierdzona.

Rzeczywisty incremental sync działa bez duplikatów.

Permissions są respektowane.

Druga instancja jest blokowana.

Retry działa po czasowym braku sieci.

Shutdown jest poprawny.

LaunchAgent został zainstalowany.

LaunchAgent działa po reloadzie.

Content Provider nadal działa niezależnie.

Uninstall usuwa tylko beeper-synch.

Rola QNAP/shared została realnie zweryfikowana.

Healthcheck sprawdza faktyczną gotowość.

Local Docker/test lokalny został wykonany przed TEST.

TEST, jeśli wykonany, działa.

PROD nie został ruszony.

Story i checklisty są aktualne.

6. Kryteria akceptacji

Zadanie jest zaakceptowane dopiero wtedy, gdy:

istnieje plugins/beeper-synch;

korzysta z istniejących pakietów workspace;

nie zawiera kopii właściwej logiki syncu;

działa ręcznie na Macu;

startup jest zainstalowany i działa;

nie koliduje z Content Providerem;

zachowuje izolację użytkowników;

zapisuje do właściwego Server Mongo;

respektuje aktualne permissions;

nie tworzy duplikatów;

ma poprawny lifecycle;

rola kontenera/shared jest architektonicznie prawdziwa;

testy przeszły;

zmiany są zacommitowane i wypchnięte;

PROD nie został wdrożony.

7. Format końcowego raportu

Podaj maksymalnie:

Story i ścieżkę.

Utworzone pliki/moduły.

Wykorzystane istniejące pakiety.

Status ręcznego syncu na Macu.

Status LaunchAgent.

Status niezależności od Content Providera.

Status usługi/kontenera QNAP.

Faktycznie uruchomione testy i wyniki.

Commit SHA i push.

Status deployu local/TEST/PROD.

Prawdziwe blokady lub niewykonane kroki.

Nie dodawaj szerokiego diffu, pełnego git status, listy wszystkich przeczytanych plików ani kolejnego planu.
