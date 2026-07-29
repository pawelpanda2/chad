# Story 92 — Input

## Input 1

Prompt dla AI Codera — follow-up po Story 91: cleanup, oficjalny startup, lokalny readonly mirror Mongo i pełna weryfikacja kontaktów

1. Opis konkretnego zadania użytkownika

Pracujesz w aktualnym lokalnym repozytorium CHAD:

$repo_path

Publiczne repozytorium:

pawelpanda2/chad

Punkt odniesienia sprawdzony przed przygotowaniem tego promptu:

f33259b97bc40de0b64fdf9254ac92898b4d1ccd
feat(beeper): add plugins/beeper-synch Mac supervisor + macOS LaunchAgent startup

Story 91 znajduje się w:

backlog/stories/91/

Nie zakładaj, że lokalny HEAD nadal jest dokładnie taki sam. Najpierw sprawdź aktualny branch, HEAD, working tree, aktualną dokumentację oraz ewentualne nowsze Story.

To jest follow-up po ukończonym Story 91. Nie przepisuj historii Story 91 i nie zmieniaj jego raportu tak, jakby opisane tam zdarzenia nie wystąpiły. Jeżeli nie istnieje już aktywne Story obejmujące ten follow-up, utwórz kolejne zgodnie z aktualnym standardem.

1.1. Cel końcowy

Doprowadź bieżący system Beeper do następującego, jednoznacznego stanu:

Beeper Desktop na Macu
→ plugins/beeper-synch
→ packages/beeper-ws + packages/beeper-sync
→ Server Beeper Mongo na QNAP przez Tailscale

Równolegle:

Server Beeper Mongo na QNAP
→ jednokierunkowe odświeżanie co 5 minut
→ Local Mongo na Macu
→ awaryjny, wyłącznie readonly odczyt w lokalnym Dashboardzie

Oraz:

lokalny Dashboard, tryb Server Mongo
→ realne dane QNAP przez Tailscale

lokalny Dashboard, tryb Local Mongo — read only
→ ostatnia poprawnie zsynchronizowana lokalna kopia

QNAP TEST Dashboard
→ te same realne dane Beeper Mongo

Na końcu użytkownik ma zobaczyć wszystkie swoje kontakty:

w lokalnym Dashboardzie pracującym domyślnie na Server Mongo przez Tailscale;

w QNAP TEST;

dodatkowo w lokalnym awaryjnym Local Mongo — read only, po potwierdzonym odświeżeniu kopii.

Nie wystarczy pokazać, że proces lub kontener działa. Potwierdź rzeczywiste dane, liczbę kontaktów, właściwego użytkownika, właściwą bazę oraz wynik w UI/API.

1.2. Najważniejsza korekta interpretacji Story 91

Nie cofaj automatycznie zmiany .env.mac-beeper z Story 91.

W systemie są dwie różne odpowiedzialności:

A. Procesy zapisujące dane Beepera

plugins/beeper-synch
packages/beeper-ws
packages/beeper-sync

Te procesy są writerami/importerami. Ich poprawnym domyślnym targetem jest:

Server Beeper Mongo na QNAP przez Tailscale

Nie powinny zapisywać do awaryjnej lokalnej kopii readonly.

B. Lokalny Dashboard odczytujący dane

Lokalny Dashboard ma dwie ręcznie wybierane opcje w Dev Panelu:

Server Mongo
Local Mongo — read only

Domyślnie, bez zapisanej świadomej decyzji użytkownika, ma być:

Server Mongo

czyli bezpośredni odczyt i normalne operacje przez Tailscale z QNAP.

Local Mongo — read only jest tylko awaryjną kopią na brak internetu/Tailscale/QNAP. Nie jest źródłem prawdy, nie jest targetem Beeper syncu i nie może przyjmować zmian biznesowych z Dashboardu.

Dlatego ustal faktyczny problem zamiast przyjmować, że sam QNAP URI w .env.mac-beeper jest błędem. Błędem byłoby pomieszanie:

URI writerów/importerów;

URI lokalnego awaryjnego mirrora;

wyboru źródła w Dev Panelu.

Zachowaj wyraźne rozdzielenie tych trzech rzeczy. Jeżeli nazwy env są dziś mylące, uporządkuj je kompatybilnie i bez łamania istniejących pakietów. Nie wykonuj niepotrzebnej masowej zmiany nazw tylko dla estetyki.

1.3. Cleanup pozostałości i błędnych lokalnych rzeczy

Przed uruchomieniem docelowego rozwiązania wykonaj celowany audyt lokalnego runtime.

Sprawdź co najmniej:

git status --short
git log -5 --oneline

launchctl list | grep -Ei 'beeper|chad|content-provider'
ps aux | grep -Ei 'beeper-synch|beeper-ws|beeper-sync' | grep -v grep
pgrep -fl 'beeper-synch|beeper-ws|beeper-sync' || true

find "$HOME/Library/LaunchAgents" -maxdepth 1 -type f \
  \( -iname '*beeper*' -o -iname '*chad*' -o -iname '*content-provider*' \) \
  -print

find .runtime -maxdepth 3 -type f 2>/dev/null | sort
docker ps -a --format '{{.Names}}\t{{.Status}}\t{{.Image}}'
docker volume ls
crontab -l 2>/dev/null || true

Sprawdź również:

stare ręcznie uruchomione instancje beeper-ws lub beeper-sync;

drugi/konkurencyjny supervisor;

stare LaunchAgents i pliki plist;

stare cron jobs;

martwe PID/lock files;

stare tymczasowe logi;

stare preference files Dev Panelu;

nieaktualne placeholdery change_me;

stare URI do nieistniejącego chad-mongodb;

stare URI wskazujące niewłaściwy port lub niewłaściwe credentials;

osierocone procesy dzieci po testach;

nieużywane lokalne kontenery tylko wtedy, gdy ich rola została jednoznacznie zastąpiona.

Usuń wyłącznie pozostałości potwierdzone jako obsolete.

Nie usuwaj

Bez osobnej, jednoznacznej potrzeby i dowodu nie usuwaj:

lokalnego kontenera/wolumenu Mongo potrzebnego jako readonly mirror;

aktualnego com.chad.beeper-synch;

com.content-provider.startup;

packages/beeper-ws;

packages/beeper-sync;

ręcznych skryptów diagnostycznych, które nadal mają realną funkcję;

starej wspólnej bazy beeper, jeśli nadal pełni rolę historycznego backupu;

dumpów i backupów;

danych pawel_f, kamil_s lub innych użytkowników;

czegokolwiek tylko dlatego, że nazwa wygląda staro.

Przed usunięciem każdej większej pozostałości zapisz w Story:

element
dlaczego obsolete
co go zastąpiło
jak potwierdzono brak aktywnych callerów
czy usunięcie dotyka danych

Nie rób szerokiego docker system prune, docker volume prune, rm -rf .runtime ani podobnego niekontrolowanego czyszczenia.

1.4. Uruchomienie wyłącznie oficjalnymi skryptami

Po cleanupie nie uruchamiaj docelowego pluginu ręcznie przez:

node dist/index.js
pnpm --filter beeper-synch start
nohup ...
&

Ręczne uruchomienie jest dozwolone tylko jako krótki test developerski przed instalacją. Docelowy stan musi zostać osiągnięty oficjalnymi skryptami:

bash-scripts/beeper-synch/install-startup.sh
bash-scripts/beeper-synch/system-startup.sh
bash-scripts/beeper-synch/un-install-startup.sh
bash-scripts/beeper-synch/status.sh
bash-scripts/beeper-synch/restart.sh
bash-scripts/beeper-synch/logs.sh

Wykonaj realnie:

zatrzymanie/usunięcie starej instalacji pluginu przez oficjalny un-install-startup.sh;

usunięcie tylko potwierdzonych stale locks/orphan processes;

build/typecheck/test;

instalację przez oficjalny install-startup.sh;

restart przez oficjalny restart.sh;

status przez oficjalny status.sh;

logi przez oficjalny logs.sh;

potwierdzenie jednej instancji;

potwierdzenie braku konfliktu z Content Providerem;

pozostawienie LaunchAgenta zainstalowanego i uruchomionego.

Nie generuj ręcznie alternatywnego plist obok oficjalnego skryptu.

Jeżeli aktualne skrypty są błędne, napraw je, dodaj test/regresję, a następnie użyj ich ponownie. Nie omijaj błędu ręczną komendą jako rozwiązaniem końcowym.

1.5. Lokalny Beeper Mongo mirror — wymagany model

Lokalne Mongo ma być awaryjną, jednokierunkową kopią danych z QNAP:

QNAP Server Beeper Mongo
→ Local Beeper Mongo

Nigdy odwrotnie.

Wymagania

Co 5 minut sprawdź, czy Server Beeper Mongo jest osiągalny.

Sprawdź, czy od ostatniego poprawnego odświeżenia zaszły zmiany.

Jeżeli nie ma zmian, nie wykonuj ciężkiego restore bez potrzeby.

Jeżeli są zmiany, pobierz je do lokalnego mirrora.

Uwzględnij:

inserty;

aktualizacje;

soft-delete;

realne usunięcia, jeśli występują;

indeksy;

wszystkie kolekcje potrzebne GUI;

właściwą bazę beeper_<repoGuid>.

Po synchronizacji porównaj counts i istotne invariants.

Zapisz status:

ostatnie sprawdzenie;

ostatnia poprawna aktualizacja;

source;

target;

baza użytkownika;

zmienione kolekcje;

counts;

wynik;

ostatni błąd;

snapshot age.

Gdy QNAP/Tailscale jest niedostępny:

zachowaj ostatnią poprawną lokalną kopię;

nie czyść lokalnych danych;

nie nadpisuj ich pustym wynikiem;

nie oznaczaj nieudanej próby jako sukces;

plugin ma nadal działać i spróbować ponownie po następnym interwale.

Synchronizacje nie mogą się nakładać.

Mechanizm ma być idempotentny.

Nie loguj sekretów ani treści prywatnych wiadomości.

Brak Change Streams

Nie zakładaj Change Streams ani replica setu na beeper-mongodb, jeżeli aktualny runtime nadal jest standalone.

Najpierw zbadaj:

rozmiar baz i kolekcji;

istniejące timestampy/watermarki;

czy wszystkie zmiany i delete da się wykryć inkrementalnie;

dostępność mongodump/mongorestore;

aktualny local Mongo;

aktualne indeksy;

czy istnieje już bezpieczny skrypt sync/backup.

Wybierz najprostszy mechanizm, który nie gubi delete/update.

Jeżeli bezpieczny pełny snapshot co 5 minut jest wystarczająco lekki dla aktualnego rozmiaru danych, może być lepszy od pozornie inkrementalnego mechanizmu, który pomija usunięcia. Nie zakładaj tego jednak bez pomiaru.

Preferowany model bezpieczeństwa:

server reachable
→ przygotuj lokalny staging/snapshot
→ zweryfikuj
→ dopiero potem zastąp ostatnią poprawną kopię

Nie pozostawiaj lokalnego mirrora w połowie restore po błędzie.

Gdzie uruchamiać harmonogram

Najpierw sprawdź aktualną architekturę.

Preferuj jedno z dwóch rozwiązań:

A. plugins/beeper-synch harmonogramuje cienki, dedykowany moduł/skrypt mirror refresh;

albo

B. osobny, oficjalnie zarządzany proces, jeżeli izolacja lifecycle jest rzeczywiście potrzebna.

Nie dodawaj crona i drugiego LaunchAgenta bez potrzeby. Jeżeli istniejący beeper-synch już działa stale i ma scheduler, preferuj użycie tego supervisor/runtime, ale nie wciskaj całej logiki dump/restore do index.ts. Wydziel testowalny moduł albo wywołuj oficjalny skrypt.

1.6. Lokalny mirror musi być naprawdę readonly dla Dashboardu

Nie wystarczy nazwać opcję Local Mongo.

Zweryfikuj wszystkie mutujące ścieżki Beeper GUI/DBA, m.in.:

profile;

tags;

Include/Exclude;

merge;

timeline events;

delete/update;

ewentualne inne PATCH/POST/DELETE;

każde bezpośrednie wywołanie kolekcji.

Gdy lokalny Dashboard ma aktywne:

Local Mongo — read only

każda operacja biznesowa INSERT/UPDATE/DELETE musi być zablokowana w warstwie DBA/provider, nie tylko przyciskiem UI.

Mechanizm techniczny odświeżający mirror może mieć osobne, minimalne uprawnienia do lokalnego Mongo. Dashboard powinien łączyć się lokalnym użytkownikiem tylko do odczytu, jeżeli obecna infrastruktura pozwala to zrobić bez nadmiernej komplikacji. Niezależnie od credentials musi istnieć twardy guard aplikacyjny.

Dla mutacji zwracaj czytelny kontrolowany błąd, np. HTTP 409/403 zgodnie z istniejącym standardem projektu, z informacją że aktywny jest awaryjny Local Mongo read-only.

Nie blokuj normalnych zapisów, gdy wybrane jest:

Server Mongo

1.7. Dev Panel — poprawny i jednoznaczny wybór źródła

Aktualny lokalny Dev Panel ma pozostać miejscem ręcznego wyboru źródła Beeper Mongo.

Wymagany model:

MongoDB (Beeper CRM)

ACTIVE
- Beeper data source
- Mode
- Host
- Port
- Database
- Read access
- Write access
- Connection status
- contacts count
- messages count
- last checked
- local mirror last successful sync
- local mirror age/status

CHANGE OPTIONS
- Server Mongo
- Local Mongo — read only

Nie dodawaj trzeciej opcji.

Zachowanie

brak zapisanej preferencji → Server Mongo;

Server Mongo → QNAP beeper-mongodb przez Tailscale;

Local Mongo — read only → lokalny mirror;

brak automatycznego, cichego failover;

przełączenie jest jawne;

opcja local ma ostrzeżenie, że dane mogą być nieaktualne i zapisy są zablokowane;

jeżeli lokalny mirror nie istnieje lub jest niespójny, nie pozwalaj przełączyć źródła bez czytelnego błędu;

zapisane świadome ustawienie użytkownika może pozostać po restarcie, ale musi być wyraźnie widoczne;

sam beeper-synch nadal zapisuje na QNAP niezależnie od źródła odczytu ustawionego w Dev Panelu.

Nie mieszaj MONGODB_URI, BEEPER_MONGODB_URI i konfiguracji .env.mac-beeper. Potwierdź dla każdego procesu, który URI faktycznie czyta.

1.8. Wszystkie kontakty — diagnoza przed migracją

Użytkownik chce finalnie widzieć wszystkie swoje kontakty w lokalnym Dashboardzie przez Tailscale oraz na TEST.

Nie zakładaj od razu, że trzeba migrować dane.

Najpierw sprawdź:

właściwy użytkownik i repoGuid;

właściwa baza beeper_<repoGuid>;

bezpośredni count w Server Beeper Mongo;

count lokalnego mirrora;

API lokalnego Dashboardu w Server Mongo;

UI lokalnego Dashboardu;

API QNAP TEST;

UI QNAP TEST;

filters/pagination;

Permissions view z filtrem pokazującym wszystkie kontakty;

include/exclude migration;

czy UI pokazuje pusty wynik przez błędny URI, port, credentials, repo context lub filtr.

Dla listy wszystkich kontaktów użyj widoku/endpointu, który rzeczywiście obejmuje:

Include
Exclude
oba false

Nie uznawaj filtrowanej listy Permission za pełny count wszystkich kontaktów.

Jeżeli dane istnieją na QNAP, ale UI ich nie pokazuje

Napraw read path/config/filter/pagination. Nie wykonuj ponownej migracji.

Jeżeli QNAP per-user database rzeczywiście jest niekompletna

Ustal kanoniczne źródło brakujących kontaktów, np.:

poprzednia per-user lokalna baza;

stara wspólna baza beeper;

backup Story 73/76;

inne potwierdzone źródło.

Przed zapisem:

backup QNAP per-user database;

read-only audit counts/IDs;

dry-run;

raport insert/update/conflict;

potwierdzenie izolacji użytkownika;

dopiero potem idempotentne apply;

nigdy drop;

nigdy deleteMany({});

nigdy nadpisywanie nowszego rekordu starszym bez jawnej reguły;

po apply pełna weryfikacja counts, indeksów i referencji.

Użytkownik chce migracji brakujących własnych danych, ale nie daje zgody na kasowanie albo reset całej bazy.

1.9. Realne uruchomienie Beeper Desktop i smoke test

Sprawdź, czy Beeper Desktop jest uruchomiony.

Nie zgaduj nazwy aplikacji. Odszukaj ją lokalnie, np. przez /Applications, mdfind lub istniejące skrypty health-check.

Jeżeli jest zainstalowana, uruchom ją standardową komendą macOS open -a z poprawną nazwą, poczekaj na gotowość REST/WS i użyj istniejącego:

bash-scripts/beeper/health-check-desktop.sh

albo aktualnego oficjalnego odpowiednika.

Następnie:

uruchom/restartuj plugin oficjalnym skryptem;

poczekaj na co najmniej jeden pełny incremental interval;

sprawdź status.json;

sprawdź logi;

potwierdź brak drugiej instancji;

potwierdź brak duplikatów;

potwierdź Include;

potwierdź Exclude;

potwierdź oba false = metadata only, jeżeli to nadal obowiązujący kontrakt;

potwierdź wzrost/zgodność counts;

potwierdź lokalny mirror po następnym refreshu.

Jeżeli Beeper Desktop nie może zostać uruchomiony automatycznie z realnego powodu, nie raportuj PASS. Podaj dokładny BLOCKED i jedno konkretne działanie wymagane od użytkownika.

1.10. Lokalny Dashboard i TEST

Lokalnie

Obowiązkowa kolejność:

kod
→ testy jednostkowe
→ oficjalny plugin startup
→ local Docker przez oficjalne skrypty
→ logowanie
→ Dev Panel: Server Mongo
→ Beeper Contacts
→ Local Mongo — read only
→ Beeper Contacts

Nie przechodź do TEST, dopóki lokalna wersja nie działa.

TEST

TEST i PROD mogą współdzielić realny beeper-mongodb, ale TEST ma własny Dashboard runtime. Zweryfikuj to z aktualnym compose i dokumentacją.

Jeżeli zmieniono kod Dashboardu/API/DBA używany na TEST:

bash-scripts/dashboard/08_registry_test/deploy.sh

jest domyślną oficjalną ścieżką deployu TEST, o ile aktualna dokumentacja nadal to potwierdza.

Jeżeli zmiany są wyłącznie Mac-only i TEST nie potrzebuje nowego obrazu, nie wykonuj fikcyjnego deployu. Mimo tego zaloguj się do aktualnego TEST i potwierdź wszystkie kontakty.

Nie wdrażaj PROD.

1.11. Oczekiwany rezultat

Po zakończeniu:

obsolete lokalne leftovers są usunięte po audycie;

nie działa żaden konkurencyjny stary proces;

com.chad.beeper-synch jest zainstalowany oficjalnym skryptem;

plugin działa jako dokładnie jedna instancja;

Content Provider LaunchAgent jest nietknięty;

plugin zapisuje do Server Beeper Mongo na QNAP;

lokalny Mongo mirror jest odświeżany co 5 minut;

mirror nie traci ostatniej poprawnej kopii po błędzie sieci;

lokalny Dashboard domyślnie używa Server Mongo;

Dev Panel pozwala ręcznie przełączyć się na Local Mongo read-only;

wszystkie Beeper mutation paths są blokowane w local readonly mode;

wszystkie kontakty użytkownika są widoczne lokalnie przez Tailscale;

wszystkie kontakty użytkownika są widoczne na TEST;

lokalny mirror ma zgodny count;

pełny live sync został sprawdzony z uruchomionym Beeper Desktop;

Story i dokumentacja są aktualne;

commit i push wykonane;

PROD nietknięty.

2. Zabezpieczenia przed podstawowymi błędami AI Codera

2.1. Minimalizacja tokenów bez pomijania wiedzy

Minimalizuj zużycie tokenów:

nie analizuj całego repo bez potrzeby;

nie wykonuj szerokiego audytu, jeśli znane są właściwe moduły;

nie czytaj tych samych dużych plików wielokrotnie;

nie powtarzaj audytów, backupów i testów już potwierdzonych w Story 91;

zacznij od raportu i checklist Story 91;

wykorzystuj istniejące logi, status files, checklisty i dokumentację;

czytaj tylko dokumentację i kod potrzebne do tego follow-upu;

ogranicz raporty pośrednie;

szczegóły zapisuj w bieżącym Story;

nie twórz drugiego planu, jeśli bieżące Story ma zatwierdzony plan;

nie pytaj o rutynowe zgody, jeśli działanie jest bezpieczne i mieści się w zakresie;

nie wykonuj zbędnych podsumowań, pełnych diffów i wielokrotnych git status.

Oszczędzanie tokenów nie oznacza:

pomijania dokumentacji;

zgadywania aktualnej architektury;

pomijania backupu przed migracją;

pomijania testów;

udawania PASS;

usuwania leftovers bez audytu;

przyjmowania, że każda lokalna rzecz jest obsolete.

2.2. Dokumentacja i standardy według specjalizacji

Najpierw przeczytaj aktualny punkt wejścia dokumentacji repo.

Aktualnie był to:

ai-docs/begin_here/01_ai_start.md
ai-docs/begin_here/02_what-and-where.md
ai-docs/begin_here/03_story-standard.md
ai-docs/begin_here/05_endpoint-rules.md
ai-docs/begin_here/04_deployment-rules.md

Nie zakładaj, że ścieżki nadal są identyczne. Użytkownik zlecił reorganizację ai-docs, w tym osobne specjalizacje:

plugin-beeper-synch
gui-beeper

Dlatego sprawdź aktualne drzewo:

find ai-docs -maxdepth 3 -type f | sort

i użyj bieżących folderów specjalizacji.

Obowiązkowo przeczytaj aktualne dokumenty dotyczące:

pluginu Beeper sync;

GUI Beeper;

databases/red rules;

local/server source selection;

bash scripts;

deployment;

testów;

Story 91;

ewentualnego aktywnego follow-up Story.

Nie zakładaj README.md, CLAUDE.md ani AGENTS.md jako nadrzędnej dokumentacji, dopóki repo tego nie wskaże.

2.3. Celowana analiza aktualnego repozytorium

Przed zmianami:

git status --short
git log -5 --oneline

Następnie sprawdź wyłącznie właściwe obszary:

plugins/beeper-synch/**
packages/beeper-ws/**
packages/beeper-sync/**
packages/dba/src/mongo.ts
packages/dba/src/dev-db-override.ts
packages/dba/src/beeper-crm.ts
packages/dashboard/components/dev-panel/**
packages/dashboard/app/api/dev-settings/**
packages/dashboard/app/api/beeper-crm/**
packages/dashboard/app/(dashboard)/dashboard/beeper/**
bash-scripts/beeper/**
bash-scripts/beeper-synch/**
bash-scripts/mongo/**
docker-compose.local.yml
docker-compose.qnap.shared.yml
.env.mac-beeper.example
.env.local.example
backlog/stories/91/**
tests/**

Sprawdź rzeczywisty runtime:

procesy;

LaunchAgents;

local Docker;

Server Mongo;

Local Mongo;

preference file;

status file;

counts;

current source Dev Panelu.

Nie opieraj diagnozy na samym labelu UI albo wpisie env. Potwierdź faktyczny host, port, bazę i uprawnienia.

2.4. Najważniejsze testy regresyjne przed commitem

Reguła:

zmieniłeś obszar
→ uruchom jego testy
→ dopiero po PASS wykonaj commit

Obowiązkowo wykonaj co najmniej:

Plugin

pnpm --filter beeper-synch typecheck;

pnpm --filter beeper-synch build;

pnpm --filter beeper-synch test;

single-instance lock;

SIGINT;

SIGTERM;

backoff;

Mongo preflight success;

Mongo preflight failure bez niszczenia danych;

scheduler bez overlapping runs;

mirror check co 5 minut;

mirror no-change;

mirror changed;

server unreachable;

interrupted refresh;

last-good snapshot preservation;

status file.

LaunchAgent i cleanup

official uninstall;

official install;

official restart;

official status;

official logs;

dokładnie jeden proces;

brak orphan children;

brak konfliktu z Content Provider LaunchAgent;

restart po crashu;

idempotentny reinstall.

Local readonly

domyślny Server Mongo;

przełączenie Server → Local;

przełączenie Local → Server;

persistence świadomego wyboru;

local unavailable;

local stale;

local consistent;

wszystkie read routes działają;

wszystkie mutation routes są blokowane;

background mirror writer nadal może odświeżać lokalną kopię;

brak zapisu local → server.

Izolacja

właściwe beeper_<repoGuid>;

brak cross-user;

brak globalnego fallbacku;

brak dostępu do bazy innego użytkownika;

testy nie mutują pawel_f/kamil_s, poza jawnie autoryzowaną, backupowaną migracją brakujących danych.

Dane i UI

direct QNAP counts;

local mirror counts;

local Dashboard API, Server mode;

local Dashboard UI, Server mode;

local Dashboard API, Local read-only mode;

local Dashboard UI, Local read-only mode;

QNAP TEST API;

QNAP TEST UI;

pełna lista kontaktów, nie tylko jedna strona;

Permissions filter All;

brak duplikatów;

Include/Exclude;

oba false metadata-only;

poprawne indeksy.

Repo

właściwy filar testów zgodnie z ai-docs/tests/ai-start.md;

git diff --check;

brak sekretów;

brak .env w commit;

brak runtime files;

brak plist użytkownika w commit, poza szablonem generowanym przez skrypt, jeśli repo go przewiduje.

Każdy znaleziony bug otrzymuje test regresyjny.

SKIPPED/BLOCKED nie jest PASS.

2.5. Bezpieczeństwo danych i migracji

nie wykonuj drop;

nie wykonuj deleteMany({}) na realnej bazie;

nie resetuj wolumenów;

nie używaj docker volume rm;

nie wykonuj restore do source;

local mirror jest targetem jednokierunkowym;

nie nadpisuj nowszych danych starszymi;

nie czyść local mirror po błędzie;

nie traktuj pustej odpowiedzi z niedostępnego serwera jako poprawnego snapshotu;

przed realną migracją brakujących kontaktów wykonaj backup;

dry-run przed apply;

migracja ma być idempotentna;

zachowaj _id i relacje, jeżeli źródło jest Mongo;

sprawdź konflikty;

nie seeduj sztucznych kontaktów do realnego użytkownika;

nie loguj danych wiadomości ani sekretów.

Jeżeli nie da się przygotować bezpiecznego rollbacku, zatrzymaj wyłącznie część mutującą dane i kontynuuj wszystkie niezależne zadania.

2.6. Architektura i warstwa DBA

Zachowaj przepływ:

Dashboard/UI
→ cienkie API routes
→ packages/dba
→ Beeper Mongo provider/connection

Dashboard route nie może otwierać własnego klienta Mongo.

Readonly guard ma być w warstwie, której nie da się ominąć innym route'em. Sam disabled button nie wystarcza.

Plugin ma pozostać cienkim supervisorem/orchestratorem:

plugins/beeper-synch
→ packages/beeper-ws
→ packages/beeper-sync
→ dedykowany moduł/skrypt local mirror refresh

Nie kopiuj:

parsera Beepera;

permission logic;

sync-state logic;

dedup logic;

owner-db logic;

DBA business logic.

Jeżeli wspólny kontrakt wymaga wydzielenia do właściwego package, zrób to zamiast importować prywatne src/... innego pakietu wbrew workspace standardowi.

2.7. Izolacja użytkowników

Dashboard bierze repoGuid wyłącznie z sesji/repo context;

proces Mac bez sesji używa jawnego, walidowanego owner repoGuid;

baza to beeper_<repoGuid>;

local mirror zachowuje ten sam model;

nie twórz jednej wspólnej lokalnej bazy dla wszystkich;

nie przyjmuj repoGuid z niezaufanego query/body;

nie stosuj fallbacku do pawel_f;

nie kopiuj danych pawel_f do kamil_s;

nie raportuj pełnego multi-user supportu, jeżeli testowano tylko jednego użytkownika;

odczyt prawdziwego użytkownika jest dozwolony do weryfikacji;

mutacja prawdziwych danych tylko w zakresie jawnie potrzebnej, backupowanej migracji braków.

2.8. Git i równoległa praca

Przed zmianami:

git status --short
git log -5 --oneline

Jeżeli inny agent pracuje równolegle:

nie cofaj jego zmian;

nie wykonuj git reset --hard;

nie rób force-push;

nie nadpisuj jego plików;

ogranicz zakres;

przed commitem pobierz aktualny origin;

rozwiązuj tylko rzeczywiste konflikty;

nie commituj przypadkowych plików;

nie commituj .env, PID, status.json, logów, plist z $HOME, dumpów ani backupów.

Commity są dozwolone. Push jest dozwolony.

2.9. Deployment

Kolejność:

lokalny kod
→ testy
→ plugin oficjalnym skryptem
→ local Docker oficjalnym skryptem
→ pełna lokalna weryfikacja
→ TEST, tylko jeżeli potrzebny nowy obraz
→ PROD wyłącznie po osobnej zgodzie

Nie omijaj local Docker.

Dla TEST użyj aktualnego oficjalnego skryptu. Według stanu przed tym zadaniem domyślnie był to:

bash-scripts/dashboard/08_registry_test/deploy.sh

Najpierw potwierdź aktualną dokumentację.

Jeżeli nie zmieniono żadnego artefaktu działającego na TEST, nie wykonuj zbędnego deployu tylko po to, by napisać „deployed". Nadal wykonaj realny smoke test istniejącego TEST.

Nie wdrażaj PROD.

2.10. Autonomia

Działaj samodzielnie.

Nie pytaj o rutynowe zgody.

Nie zatrzymuj się po planie, audycie, cleanupie, buildzie albo pierwszym błędzie.

Sam:

uruchom Beeper Desktop, jeśli jest zainstalowany;

napraw skrypty;

zainstaluj LaunchAgent;

uruchom local Docker;

przełącz Dev Panel;

wykonaj weryfikację;

napraw znalezione regresje;

kontynuuj do kompletnego wyniku.

Zatrzymaj się tylko przy realnym ryzyku:

utraty danych;

braku backupu;

niepewnym rollbacku;

niejasnym source of truth;

konflikcie równoległej pracy;

operacji destrukcyjnej;

deployu PROD;

fizycznej niemożliwości uruchomienia Beeper Desktop.

2.11. Uczciwość testów i raportu

Nie twierdź, że działa, jeżeli wykonano tylko:

build;

unit tests;

Mongo ping;

launchctl list;

count jednej kolekcji;

API bez UI;

UI bez porównania z DB;

Local Mongo bez testu write block;

TEST bez zalogowania;

sync bez Beeper Desktop;

snapshot bez porównania counts;

migrację bez dry-run/backup.

Rozróżniaj:

NOT RUN
BLOCKED
FAIL
PASS LOCAL
PASS LOCAL READONLY
PASS TEST
PASS PROD

PROD ma pozostać NOT RUN.

2.12. Wznowienie pracy

Najpierw przeczytaj:

backlog/stories/91/03_knowledge.md
backlog/stories/91/04_todos.md
backlog/stories/91/05_tasks_and_checklist.md
backlog/stories/91/06_others_from_report.md

Nie powtarzaj testów Story 91, które są nadal miarodajne i nie dotyczą zmienionego kodu.

Jeżeli istnieje już nowe aktywne Story dla tego follow-upu:

Wznów od pierwszego niewykonanego kroku.
Nie twórz drugiego Story.
Nie powtarzaj potwierdzonych audytów.

3. Szczegółowy sposób wykonania

3.1. Story

Jeżeli nie ma aktywnego Story:

znajdź najwyższy numer;

utwórz kolejne;

pełny input w 01_input.md;

plan w 02_plan.md;

potwierdzone fakty w 03_knowledge.md;

bieżące TODO w 04_todos.md;

pełne taski i checklista w 05_tasks_and_checklist.md;

follow-upy tylko w 06_others_from_report.md;

na końcu 04_todos.md ma być puste.

3.2. Najpierw audyt, potem cleanup

Przygotuj tabelę:

element | current role | obsolete? | action | evidence | data risk

Nie usuwaj niczego bez wpisu i dowodu.

3.3. Uporządkowanie konfiguracji

Przygotuj mapę:

process
env file
env variable
default source
effective URI
read/write

Minimum:

beeper-synch
beeper-ws
beeper-sync
local Dashboard Server Mongo
local Dashboard Local Mongo
QNAP TEST Dashboard
mirror refresher source
mirror refresher target

W Story zapisz URI wyłącznie z redakcją credentials.

3.4. Status local mirrora

Dodaj trwały, gitignored status, np. pod:

.runtime/beeper-synch/

albo zgodnie z aktualnym runtime standardem.

Status ma być dostępny dla:

oficjalnego status.sh;

Dev Panelu;

testów;

raportu.

Nie twórz dwóch niezależnych plików statusu z rozbieżnymi danymi.

3.5. Oficjalne skrypty

Jeżeli mirror jest częścią pluginu, aktualne oficjalne skrypty beeper-synch mają zarządzać całym lifecycle.

Jeżeli wymaga osobnego procesu, utwórz osobne oficjalne skrypty tylko po udokumentowaniu, dlaczego jeden LaunchAgent nie wystarcza.

3.6. Migracja/weryfikacja kontaktów

Zapisz tabelę:

source/reader | repoGuid | database | contacts | channels | messages | result

Minimum:

QNAP direct;

local mirror direct;

local API Server mode;

local UI Server mode;

local API Local mode;

local UI Local mode;

TEST API;

TEST UI.

Dla UI nie polegaj wyłącznie na liczniku pierwszej strony. Zweryfikuj pełną paginację albo endpoint total count.

3.7. Dokumentacja

Zaktualizuj aktualne specjalizacje:

plugin Beeper sync;

GUI Beeper;

databases;

bash scripts;

tests;

Dev Panel;

Story.

Usuń nieaktualne zdanie, że lokalne Mongo jest domyślnym writer targetem.

Jednocześnie jasno opisz, że lokalne Mongo nadal istnieje jako readonly mirror.

4. Zakazy i granice

Nie wolno:

cofać .env.mac-beeper na local writer bez analizy;

kierować beeper-sync do readonly mirrora;

automatycznie failoverować write path na local;

synchronizować local → QNAP;

uruchamiać dwóch writerów;

dodawać zbędnego QNAP sync container;

usuwać local Mongo volume;

usuwać com.content-provider.startup;

usuwać starej bazy backupowej bez zgody;

wykonywać drop;

wykonywać deleteMany({}) na realnych danych;

wykonywać globalnego Docker prune;

używać ręcznego procesu jako finalnego runtime;

wdrażać PROD;

robić force-push;

wykonywać git reset --hard;

raportować BLOCKED jako PASS.

5. Weryfikacja końcowa

Przed DONE potwierdź:

Cleanup audit zapisany.

Obsolete leftovers usunięte.

Potrzebny local Mongo zachowany.

Oficjalny uninstall wykonany.

Oficjalny install wykonany.

Oficjalny restart wykonany.

Oficjalny status wykonany.

Oficjalne logs sprawdzone.

Dokładnie jeden beeper-synch.

Brak orphan beeper-ws/beeper-sync.

Content Provider LaunchAgent bez zmian.

Beeper Desktop osiągalny.

Plugin ready.

Incremental sync wykonany.

Brak duplikatów.

Permissions respektowane.

QNAP jest writer targetem.

Mirror sprawdza QNAP co 5 minut.

No-change path działa.

Change path działa.

Network-failure path zachowuje last good.

Local mirror counts zgodne.

Local readonly blokuje wszystkie mutacje.

Server mode pozwala na normalne operacje.

Brak silent failover.

Local Dashboard Server mode pokazuje wszystkie kontakty.

TEST pokazuje wszystkie kontakty.

Local mirror mode pokazuje wszystkie kontakty.

API i UI zgadzają się z direct DB count.

Właściwy repoGuid i baza.

Brak cross-user.

Testy PASS.

Story domknięte.

Commit wykonany.

Push wykonany.

PROD nietknięty.

6. Kryteria akceptacji

Zadanie jest zakończone dopiero, gdy:

domyślna architektura to Server Mongo przez Tailscale;

local Mongo jest zachowany jako działający readonly mirror;

mirror odświeża się co 5 minut;

plugin jest zarządzany wyłącznie oficjalnymi skryptami;

LaunchAgent jest zainstalowany i działa;

cleanup nie usunął potrzebnych danych/usług;

wszystkie kontakty są widoczne lokalnie i na TEST;

local mirror ma zgodne dane;

pełny live smoke test nie jest BLOCKED;

testy przeszły;

commit i push istnieją;

PROD nie został wdrożony.

7. Format końcowego raportu

Podaj maksymalnie:

Story i ścieżka.

Co usunięto jako obsolete.

Co zachowano i dlaczego.

Efektywne źródła:

plugin writer;

local Dashboard Server;

local Dashboard Local readonly;

TEST.

Status oficjalnego LaunchAgenta.

Status Beeper Desktop.

Status incremental syncu.

Status mirrora 5-minutowego.

Tabela counts: QNAP / local mirror / local UI / TEST UI.

Status readonly guard.

Testy i wyniki.

Commit SHA i push.

Deploy LOCAL/TEST/PROD.

Prawdziwe blokady.

Nie dodawaj pełnego diffu, pełnego git status, listy wszystkich przeczytanych plików ani kolejnego planu.
