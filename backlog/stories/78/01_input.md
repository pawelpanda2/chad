# Story 78 — Input

## Input 1

Prompt dla Cline — CHAD: historia, integralność danych, Daily Tracker, Dates, Google Sheets i trwały zestaw regresyjny

Rola i tryb pracy

Pracujesz w publicznym repozytorium CHAD:

pawelpanda2/chad

To jest zadanie implementacyjne, nie sam audit ani plan. Masz:

odtworzyć opisane błędy testami, które najpierw zawodzą;

znaleźć rzeczywiste przyczyny;

naprawić kod i konfigurację;

zbudować powtarzalne testy integracyjne oraz Playwright E2E;

uruchomić pełny zestaw regresyjny;

wdrożyć i sprawdzić wyłącznie środowisko TEST oficjalnymi skryptami, jeżeli lokalny zestaw przejdzie;

wykonać commit i push zmian; nie wdrażać PROD.

Działaj samodzielnie. Nie zatrzymuj się po przygotowaniu planu i nie pytaj o rutynowe zgody. Zatrzymaj się tylko przy realnym ryzyku utraty danych, braku pewnego ograniczenia operacji do repo użytkownika test3, konflikcie z cudzą pracą albo przed jakąkolwiek operacją na PROD.

Minimalizuj zużycie tokenów:

nie analizuj całego monorepo;

nie czytaj tych samych plików wielokrotnie;

nie generuj obszernych podsumowań w czacie;

nie pokazuj ogromnych git diff;

szczegóły zapisuj w Story;

na końcu podaj tylko krótki status, komendę pełnego testu, wynik i commit.

Obowiązkowa dokumentacja przed kodem

Aktualny punkt wejścia repo to ai-docs/begin_here/, a nie starsze ai-docs/start_here/.

Najpierw przeczytaj dokładnie, w tej kolejności:

ai-docs/begin_here/01_ai_start.md
ai-docs/begin_here/02_what-and-where.md
ai-docs/begin_here/03_story-standard.md
ai-docs/begin_here/05_endpoint-rules.md
ai-docs/begin_here/04_deployment-rules.md

Potem tylko dokumentację potrzebną do tego zadania:

ai-docs/history/ai-start.md
ai-docs/history/how-it-works.md
ai-docs/google-sheets/ai-start.md
ai-docs/google-sheets/architecture.md
human-docs/dashboard/forms/features/daily-tracker-dates.md
human-docs/dashboard/common/features/chad-user-data-isolation.md

Przeczytaj też bieżące Story powiązane z tym kodem, bez ponownego audytu całego repo:

backlog/stories/62/
backlog/stories/72/
backlog/stories/74/
backlog/stories/75/
backlog/stories/76/
backlog/stories/77/

Następnie utwórz nowe Story zgodnie z aktualnym standardem. Folder ma mieć kolejny numer i sześć plików:

01_input.md
02_plan.md
03_knowledge.md
04_todos.md
05_tasks_and_checklist.md
06_others_from_report.md

01_input.md ma zawierać pełny input użytkownika. 04_todos.md ma być pusty na końcu. 05_tasks_and_checklist.md ma zawierać tabelę Ai Status / Real Status oraz opis każdego tasku i realnych testów.

Stan repo, który trzeba najpierw potwierdzić na aktualnym HEAD

Poniższe ustalenia zostały sprawdzone w repo 2026-07-22. Zweryfikuj je celowanym odczytem, ponieważ HEAD mógł się zmienić:

docker-compose.qnap.test.yml uruchamia tylko Dashboard TEST i łączy go z tym samym prawdziwym chad-mongodb, którego używa PROD. TEST nie jest sandboxem i nie wolno czyścić globalnych kolekcji ani danych pawel_f/kamil_s.

chad-mongodb przechowuje cp_items, cp_history, cp_history_state i działa jako single-node replica set rs0 wyłącznie dla historii CHAD. Beeper ma osobny Mongo bez replica setu.

packages/history-worker/index.mjs jest realnym konsumentem Change Streams, lecz aktualne packages/dba/src/cp-history.test.ts zapisują testowe dokumenty bezpośrednio do cp_history, więc nie testują cp_items -> Change Stream -> history-worker -> cp_history.

Przy braku resume tokenu worker zaczyna obserwację „od teraz". packages/history-worker/backfill.mjs tworzy tylko oznaczony, syntetyczny snapshot aktualnego stanu dla Itemów bez historii; nie odtwarza prawdziwych wcześniejszych operacji.

packages/dashboard/app/api/google-sheets/info/route.ts uznaje stronę informacyjną za wyłączoną, gdy loadGoogleSheetsConfig().enabled === false.

docker-compose.qnap.test.yml celowo nie przekazuje GOOGLE_SHEETS_*, a production-guard.ts celowo blokuje zapis/sync poza CHAD_ENVIRONMENT=prod.

W efekcie History -> Google Sheets na TEST pokazuje Google Sheets sync is not enabled on this environment.. Naprawa nie może polegać na włączeniu realnej synchronizacji na TEST.

Daily Entry ma realny Mongo DELETE. Date Entry nie ma analogicznego endpointu/metody; jego przycisk „Delete" obecnie tylko zeruje pola przez PATCH, pozostawiając pusty rekord.

W tabelach row editor otwiera się przez Open Raw, potem kliknięcie wiersza i editLoca; dopiero w pełnym formularzu widoczny jest Delete z losowym słowem potwierdzającym.

Root i workspace nie mają obecnie jednego standardowego skryptu uruchamiającego unit + real Mongo integration + Playwright E2E. Istnieją liczne samouruchamiające się pliki *.test.ts, kompilowane przez tsc i odpalane jako JS.

Nie zakładaj, że opis jest przyczyną. Najpierw odtwórz każdy błąd testem.

Cel końcowy

Po zmianach jedna komenda ma deterministycznie uruchamiać pełną regresję Daily Tracker / Dates / History / Google Sheets na izolowanym środowisku:

pnpm test:regression:daily-dates

Komenda ma:

uruchomić testowy MongoDB zgodny z wersją docelową i single-node rs0;

poczekać na PRIMARY;

uruchomić prawdziwy history-worker;

poczekać na jednoznaczny sygnał, że Change Stream jest rzeczywiście otwarty;

uruchomić Dashboard z testową konfiguracją;

utworzyć/provisionować test3 i syntetyczne dane;

wykonać testy integracyjne;

wykonać Playwright E2E;

wykonać końcowy integrity check Mongo/history/fake Sheets;

zachować trace/screenshot/logi tylko przy błędzie;

posprzątać wyłącznie izolowany stack/volume testowy;

zwrócić kod wyjścia różny od zera przy każdej niespójności.

Dodaj też krótsze komendy:

pnpm test:unit
pnpm test:integration:daily-dates
pnpm test:e2e:daily-dates
pnpm test:regression:daily-dates

Jeżeli nazwy trzeba dopasować do aktualnego standardu repo, zachowaj sens i jedną łatwą do zapamiętania komendę pełną.

1. Izolowane środowisko testowe

1.1. Domyślnie nie używaj QNAP TEST do testów destrukcyjnych

QNAP TEST współdzieli realne dane z PROD. Dlatego pełny zestaw musi domyślnie działać lokalnie w izolowanym stacku, np. przez repozytoryjny docker-compose.e2e.yml albo równie deterministyczny mechanizm.

Wymagania stacku:

MongoDB w wersji zgodnej z realnym QNAP, preferencyjnie 4.4;

single-node replica set rs0;

osobna baza, np. chad_e2e, nigdy chad;

osobny tymczasowy volume;

prawdziwy packages/history-worker;

Dashboard z DBA_MONGO_ENABLED=true, DBA_CONTENT_PROVIDER_ENABLED=false;

testowy fake/stub Google Sheets, bez połączenia do prawdziwego Google;

healthchecki i limit czasu — brak nieskończonego oczekiwania.

Nie używaj mocka Mongo do testów Change Streams. Musi to być realny replica set.

1.2. QNAP TEST tylko jako osobny smoke test

Dodaj opt-in smoke test środowiska TEST, np.:

pnpm test:qnap-test:smoke:daily-dates

Ten test:

domyślnie jest read-only;

sprawdza login/test3, strony, API info, wersję obrazu i zdrowie history-worker;

może mutować dane tylko po jawnej zmiennej ALLOW_QNAP_TEST3_MUTATION=true;

przed mutacją musi potwierdzić, że użytkownik nazywa się dokładnie test3, jego repoGuid jest równy oczekiwanemu testowemu GUID i żaden adres nie wychodzi poza ^<TEST3_REPO_GUID>(/|$);

nigdy nie wykonuje deleteMany({}), dropDatabase(), drop() ani czyszczenia globalnego cp_history/cp_items;

nigdy nie dotyka repo pawel_f, kamil_s ani chad_admin, poza idempotentnym upewnieniem się, że wpis logowania test3 istnieje;

nigdy nie uruchamia PROD.

2. Deterministyczny użytkownik test3

Zbuduj idempotentny provisioner fixture dla test3.

2.1. Dane użytkownika

username: test3;

stabilny, jawnie testowy UUID repo zapisany w jednej stałej testowej;

hasło pobierane z env, np. E2E_TEST3_PASSWORD; nigdy nie commituj hasła ani realnego hasha;

wpis użytkownika w testowym chad_admin/users/users-list;

root repo test3 oraz minimalna struktura potrzebna przez aplikację;

wszystkie wartości datingowe muszą być syntetyczne, np. E2E Alice, E2E Tinder, https://example.invalid/....

Użytkownik pozwolił wzorować fixture na kamil_s i pawel_f, ale wolno kopiować wyłącznie schemat, nazwy pól, strukturę folderów i niesensytywne wartości konfiguracyjne. Nie kopiuj prywatnych raportów, rozmów, linków, kontaktów, nazw osób ani realnych danych datingowych.

2.2. Dwa etapy danych

Fixture ma rozróżniać:

Stan początkowy

Tworzony dopiero po potwierdzeniu gotowości Change Stream:

struktura views/daily;

struktura views/dates;

co najmniej 2 początkowe Daily Entries;

co najmniej 3 początkowe Date Entries, z czego kilka dla tego samego dnia, żeby zweryfikować kolumny AUTO;

wartości pozwalające policzyć oczekiwane PULLS AUTO, CLOSES AUTO, QUALITY DP AUTO, QUALITY C AUTO.

Operacje dalsze

create kolejnego Daily Entry;

update Daily Entry co najmniej dwa razy;

create kolejnego Date Entry;

update Date Entry;

delete Daily Entry;

real delete Date Entry po naprawie;

restart history-worker pomiędzy wybranymi operacjami;

zapis wykonany podczas zatrzymanego workera, potem restart i catch-up z resume tokenu;

ponowne wykonanie provisionera, które nie tworzy duplikatów.

Każda operacja ma mieć jednoznaczny marker E2E_RUN_ID, aby raport i integrity checker mogły wskazać dokładny rekord.

3. Naprawa historii pierwszych operacji

3.1. Najpierw test, który obecnie zawodzi

Dodaj prawdziwy test process-level/integration:

clean Mongo rs0
-> start history-worker with no cp_history_state
-> wait until Change Stream naprawdę jest otwarty
-> provision test3 through DBA/API
-> poll cp_history
-> assert that every expected initial insert was captured

Nie wolno w tym teście ręcznie wkładać dokumentów do cp_history.

Test ma wykazać, czy problemem jest:

seed uruchamiany przed workerem;

brak wiarygodnego readiness;

bezpośredni import do cp_items poza właściwą kolejnością;

utrata eventu między startem procesu i faktycznym otwarciem cursor/watch;

resume token/state;

backfill używany jako zamiennik prawdziwego eventu;

filtr/adres UI, przez który event istnieje w DB, ale nie jest widoczny;

sortowanie eventów o tym samym czasie;

inna przyczyna.

3.2. Wymagana własność po naprawie

Dla nowego konta provisionowanego po wejściu rozwiązania:

pierwsza operacja tworząca każdy Item ma prawdziwy operationType=insert z resume tokenu Change Stream;

event nie może być oznaczony backfilled:true;

sourceId, address, actor.repoGuid, actor.username zgadzają się z Itemem i test3;

pierwsza historia ma pełny stan potrzebny do rekonstrukcji;

kolejne update/delete mają poprawny stan before i after albo jawne, testowane oznaczenie ograniczenia;

żaden event nie znika po restarcie;

retry tego samego eventu nie tworzy duplikatu.

3.3. Readiness history-worker

Dodaj testowalny sygnał gotowości. Sam status: running zapisany przed itemsCol.watch() nie jest wystarczający.

Przykładowe rozwiązanie: rozszerzyć cp_history_state o watchOpenedAt/watchStatus: ready, ustawiane dopiero po realnym otwarciu cursor/watch. Orkiestrator E2E ma czekać na ten stan.

Nie przyjmuj rozwiązania „sleep 2 sekundy". Polling ma mieć timeout i komunikat diagnostyczny.

3.4. Restart i trwały stan „before"

Aktualny worker trzyma lastKnownState tylko w RAM. Dodaj test:

insert item
-> worker records insert
-> restart worker
-> update item
-> delete item
-> history still contains usable address/actor/before and correct order

Jeżeli test ujawni utratę danych before/address/actor po restarcie, napraw architekturę trwałym shadow state/snapshotem albo innym rozwiązaniem zgodnym z MongoDB 4.4. Nie bootstrapuj naiwnie całego cp_items jako „before", jeżeli prowadzi to do fałszywego diffu podczas catch-up. Trwały stan ma być aktualizowany wraz z przetwarzaniem eventów i odporny na retry.

3.5. Kolejność zdarzeń

changedAt oparty tylko na sekundach może nie dawać stabilnej kolejności wielu operacji. Integrity test ma wymusić deterministyczne sortowanie. Jeżeli obecny dokument historii nie przechowuje wystarczającej informacji, zapisz prawdziwe clusterTime/inkrement lub równoważny stabilny klucz kolejności i użyj go w DBA/API/UI.

Test ma wykonać kilka szybkich operacji w tej samej sekundzie i zawsze odtworzyć kolejność:

insert -> update 1 -> update 2 -> delete

4. Data consistency / integrity checks

Utwórz wspólny checker uruchamiany po integracji i po Playwright. Nie może tylko sprawdzać HTTP 200.

4.1. cp_items

Dla każdego Itemu należącego do test3 sprawdź:

_id === config.id;

config.address zaczyna się dokładnie od <TEST3_REPO_GUID> albo <TEST3_REPO_GUID>/;

unikalność config.address;

brak dwóch bezpośrednich dzieci o tej samej config.name;

każdy nierootowy Item ma istniejącego rodzica;

fizyczne segmenty potomków są numeryczne zgodnie z modelem;

created i modified istnieją i są parsowalne;

created <= modified;

create: created === modified dla kontrolowanego zegara/odpowiedniej tolerancji;

update nie zmienia created;

update przesuwa modified do przodu albo co najmniej nie cofa go, z uwzględnieniem sekundowej precyzji CP;

zwykły GET/read nie modyfikuje timestampów;

body zawiera wyłącznie oczekiwane klucze;

pola — AUTO nie są zapisane w YAML Daily Entry;

po realnym delete dokument nie istnieje.

4.2. cp_history

Dla każdego kontrolowanego sourceId:

pierwszy event jest insert;

dalsza sekwencja odpowiada wykonanym write'om;

nie ma dwóch dokumentów o tym samym resume tokenie;

sourceCollection === cp_items;

sourceId wskazuje właściwy Item/tombstone;

address jest poprawny także dla delete;

actor to test3 i właściwy repoGuid;

event należy do właściwego subtree Daily/Date;

changedAt/cluster order nie wyprzedza operacji ani nie cofa się;

cp_history_state ma zdrowy status, świeży heartbeat, resume token i brak nieoczekiwanego historyGapAt;

backfill jest jednoznacznie odróżniony od prawdziwego eventu;

replay historii od insertu do ostatniego eventu daje dokładnie aktualny config i body w cp_items albo tombstone po delete.

Dodaj funkcję replay używaną w testach, nie tylko zestaw luźnych countów.

4.3. Izolacja użytkowników

Dodaj drugiego całkowicie syntetycznego fixture-usera. Sprawdź, że:

test3 nie widzi jego Items;

nie widzi jego historii po ID ani po prefixie;

nie może PATCH/DELETE jego loca;

Google Sheets resolver nie zwraca jego spreadsheetId;

API ignoruje/odrzuca próby podania obcego repoGuid z query/body;

regex prefixu nie przecieka dla GUID będącego prefiksem innego GUID.

5. Google Sheets — spójność danych i bug strony na TEST

5.1. Rozdziel „informacje widoczne" od „sync może pisać"

Aktualny błąd wynika z używania GOOGLE_SHEETS_ENABLED jednocześnie jako:

pozwolenia na worker/outbox zapisujący do Google;

warunku pokazania linku/informacji w History -> Google Sheets.

Rozdziel te odpowiedzialności.

Wymagany rezultat na QNAP TEST:

History -> Google Sheets pokazuje link arkusza bieżącego użytkownika oraz skonfigurowane bezpieczne informacje potrzebne użytkownikowi;

nie pokazuje starego komunikatu Google Sheets sync is not enabled on this environment. tylko dlatego, że worker jest wyłączony;

UI może jawnie pokazać status Sync writes disabled on TEST, ale link/informacje nadal są dostępne;

GOOGLE_SHEETS_ENABLED na TEST pozostaje false;

production-guard.ts pozostaje aktywny i nadal blokuje enqueue oraz worker poza prawdziwym PROD;

TEST nie dostaje prywatnego klucza konta serwisowego, jeżeli nie jest potrzebny do samej strony info;

route nigdy nie zwraca prywatnego klucza;

mapowanie zawsze wynika z zalogowanego username, bez query/body fallbacku.

Preferowany model: osobna konfiguracja metadata/info, np. loadGoogleSheetsInfoConfig, która czyta mapę URL/ID i opcjonalne viewer credentials niezależnie od flagi workerowej. Nazwy env wybierz zgodnie z aktualną architekturą; nie duplikuj sekretów bez potrzeby.

Zaktualizuj .env*.example, Compose TEST/PROD i dokumentację, nie commitując realnych wartości.

5.2. Fake Google Sheets do testów

Pełny zestaw automatyczny nie może pisać do prawdziwych arkuszy. Wstrzyknij fake GoogleSheetsClient lub lokalny adapter, który zapisuje stan arkusza w pamięci/pliku testowym i udostępnia go integrity checkerowi.

Sprawdź dokładnie:

kolejność i nazwy kolumn odpowiadają DAILY_COLUMNS/DATE_COLUMNS oraz mapperowi;

Daily i Dates trafiają do właściwych tabów;

test3 trafia tylko do spreadsheetId test3;

create tworzy jedną linię;

retry/upsert nie tworzy duplikatu;

update zmienia tę samą linię po CHAD_RECORD_KEY;

delete ustawia uzgodniony status/tombstone bez przesunięcia innego rekordu;

backfill istniejących wpisów jest idempotentny;

PULLS AUTO, CLOSES AUTO, QUALITY DP AUTO, QUALITY C AUTO dokładnie zgadzają się z tym, co pokazuje Dashboard dla tych samych Dates;

liczba i wartości rekordów w fake Sheets zgadzają się z aktualnym stanem Dashboard/Mongo według jawnego kontraktu delete;

awaria fake Sheets nie blokuje zapisu do Mongo i pozostawia retryowalny outbox;

unmapped user nigdy nie dostaje arkusza innego użytkownika.

Opcjonalny realny Google smoke test może istnieć tylko za osobną flagą i wyłącznie dla dedykowanego testowego spreadsheetu. Nie może być częścią domyślnego zestawu ani dotykać realnych arkuszy pawel_f/kamil_s.

6. Forms/API — testy integracyjne

Napisz testy przez rzeczywiste publiczne funkcje DBA lub HTTP API, nie przez ręczne insertowanie końcowego stanu.

Daily Entry

POST bez auth -> 401;

POST bez DATE -> 400;

pierwszy create tworzy dokładnie jeden wpis;

dwa wpisy dla tej samej daty dostają poprawne, unikalne nazwy;

YAML po zapisie zgadza się z payloadem;

GET zwraca pola i poprawne AUTO;

PATCH aktualizuje ten sam loca, nie tworzy duplikatu;

PATCH usuwa wszystkie — AUTO przed persystencją;

cross-repo PATCH jest odrzucony;

DELETE usuwa dokładnie ten Item;

cross-repo DELETE jest odrzucony;

drugi DELETE zwraca jawny, kontrolowany wynik i niczego innego nie usuwa;

create/update/delete generują właściwe eventy historii i fake Sheets.

Date Entry

analogiczne POST/GET/PATCH;

dwa wpisy dla tej samej DATA są dozwolone i poprawnie wpływają na AUTO;

dodaj realne deleteDateEntry w DBA i DELETE /api/forms/date-entry, zgodne z Mongo-only runtime;

UI nie może nazywać zerowania pól „Delete";

po realnym delete rekord znika z cp_items, Dates, historii i dostaje właściwy stan w fake Sheets;

jeżeli Content Provider jest jedynym aktywnym backendem, zwróć jawny błąd zgodny z kontraktem Daily, nie pozorny sukces.

Nie dodawaj logiki Mongo bezpośrednio do Dashboard route. Operacja biznesowa ma przechodzić przez interfejs/warstwę DBA.

7. Playwright E2E

Dodaj Playwright i stabilne selektory (data-testid) tylko tam, gdzie semantyczne role/labels nie wystarczają. Testy nie mogą zależeć od przypadkowych klas CSS ani czasu setTimeout.

7.1. Login i start

zaloguj test3 przez prawdziwy formularz;

potwierdź username i brak dostępu do danych drugiego fixture-usera;

zbieraj console errors i failed network requests; nie ignoruj 4xx/5xx poza scenariuszami negatywnymi.

7.2. Daily Tracker

Forms -> Add Daily Entry.

Wypełnij wszystkie reprezentatywne pola i Save.

Poczekaj na odpowiedź API, nie na stały sleep.

Potwierdź nowy wiersz w Views -> Daily Tracker.

Potwierdź wartości AUTO wynikające z Dates.

Włącz Open Raw.

Kliknij właściwy wiersz i sprawdź editLoca oraz prefill formularza.

Zmień kilka pól i Save.

Potwierdź, że jest nadal jeden ten sam wiersz.

Otwórz History -> Daily Tracker i potwierdź insert/update oraz szczegóły diffu.

Wróć do pełnego edytora i przetestuj Delete.

7.3. Dates

Wykonaj analogicznie create, edit, History -> Dates oraz po naprawie realny delete. Po zmianie Date Entry wróć do Daily Tracker i potwierdź przeliczenie AUTO.

7.4. Bezpieczne usuwanie

Dla Daily i Dates osobno sprawdź:

w zwykłej tabeli nie ma bezpośredniego przycisku Delete;

Delete pojawia się dopiero po wejściu w edycję konkretnego wiersza;

otwarcie dialogu pokazuje jedno słowo z dozwolonej listy;

przy pustym input Delete jest disabled;

błędne słowo utrzymuje disabled i nie wysyła requestu DELETE;

słowo różniące się wielkością liter nie przechodzi, jeżeli kontrakt jest case-sensitive;

Cancel nie zmienia danych;

ponowne otwarcie losuje/ustawia poprawne słowo i resetuje input;

wpisanie dokładnego słowa aktywuje przycisk;

kliknięcie wysyła dokładnie jeden request;

po sukcesie wiersz znika, a historia i fake Sheets są zgodne;

test nie zakłada konkretnego wylosowanego słowa — odczytuje je z dialogu i przepisuje.

7.5. History

All Items pokazuje operacje test3 i nic obcego;

Daily Tracker filtruje tylko views/daily;

Dates filtruje tylko views/dates;

pierwsze operacje z initial seed są widoczne;

kolejność insert/update/delete jest deterministyczna;

restart strony nie zmienia kolejności;

szczegóły eventu zgadzają się z Mongo;

wpis backfill ma wyraźne oznaczenie syntetyczne, jeśli pojawia się w osobnym teście legacy;

worker status/history gap jest widoczny diagnostycznie albo możliwy do sprawdzenia API/test helperem.

7.6. History -> Google Sheets na TEST

Uruchom Dashboard w konfiguracji:

CHAD_ENVIRONMENT=test
GOOGLE_SHEETS_ENABLED=false
metadata/info dla test3 skonfigurowane
brak prywatnego klucza workerowego

Asercje:

strona nie pokazuje Google Sheets sync is not enabled on this environment. jako jedynej treści;

pokazuje username test3;

pokazuje wyłącznie link/ID arkusza test3;

nie pokazuje arkusza drugiego fixture-usera;

pokazuje jasny status, że zapis sync na TEST jest wyłączony;

próba save Daily/Date nie tworzy realnego Google requestu i production guard blokuje realny enqueue/worker zgodnie z kontraktem.

8. Testy samego history-worker

Refaktoruj worker tylko tyle, ile potrzebne do testowalności. Preferowane rozdzielenie:

bootstrap/process lifecycle
pure event -> history document mapping
persistent last-known state
change-stream runner

Nie zmieniaj zachowania poprzez skopiowanie logiki do testów. Test ma importować ten sam kod, którego używa proces.

Minimalny zestaw:

diff insert od pustego stanu;

update z poprawnym before/after;

delete z zachowanym address/actor/before;

first event po pustym state;

restart z trwałym shadow state;

duplicate resume token;

crash/retry między insert history a save resume token;

resumeAfter łapie write wykonany podczas downtime;

utracony resume token ustawia historyGapAt i nigdy nie udaje pełnej historii;

szybkie eventy mają stabilną kolejność;

signal readiness dopiero po otwarciu streamu;

SIGTERM zapisuje poprawny stopped state.

Nie wystarczy mock eventów. Co najmniej jeden test musi uruchamiać prawdziwy proces packages/history-worker przeciw realnemu rs0.

9. Wykorzystanie obecnych testów

Nie przepisuj wszystkich istniejących testów tylko dla estetyki. Zachowaj działające testy z:

packages/dba/src/data-providers/mongo-cp-provider.test.ts
packages/dba/src/cp-history.test.ts
packages/dba/src/google-sheets/*.test.ts
packages/dba/src/repo-access.test.ts
packages/dba/src/data-router.test.ts

Dodaj je do jednej komendy lub stopniowo przenieś tylko testy dotknięte tym Story do Vitest/Node test runnera. Wymagane jest:

jeden standardowy runner z czytelnym exit code;

brak zależności od realnej bazy chad;

brak pozostawiania testowych jobów w outboxie;

unikalne, izolowane dane per run;

timeouty;

logi kontenerów i Playwright trace przy porażce;

powtarzalność drugiego uruchomienia bez ręcznego czyszczenia.

Vitest + Playwright są preferowane dla TypeScript/Next.js. Dla procesu/rs0 użyj repo-controlled Compose albo Testcontainers, wybierając rozwiązanie stabilniejsze na Macu Apple Silicon i w GitHub Actions. Nie wprowadzaj dwóch równoległych sposobów uruchamiania tego samego stacku.

10. Acceptance matrix

Pełny zestaw ma automatycznie potwierdzić co najmniej:

Obszar | Scenariusz | Wymagany wynik
History start | worker bez resume tokenu, potem initial seed test3 | wszystkie prawdziwe inserty widoczne, bez backfill
History resume | write podczas zatrzymanego workera | event złapany po restarcie, bez duplikatu
History restart | update/delete po restarcie | poprawne address/actor/before/order
History gap | celowo nieważny token | jawny historyGapAt, brak fałszywej kompletności
cp_items create | nowy Daily/Date | id/address/timestamps/body poprawne
cp_items update | dwa update tego samego loca | created stałe, modified nie cofa się, brak duplikatu
Daily delete | dialog + poprawne słowo | realny delete, historia delete, sheet tombstone
Dates delete | dialog + poprawne słowo | realny delete, nie blank-row
Delete safety | złe słowo / Cancel | zero mutacji i zero DELETE requestu
Forms | create/edit Daily i Date | wartości round-trip dokładnie zgodne
AUTO | kilka Dates tego samego dnia | Dashboard i fake Sheets mają identyczne wyniki
Sheets info TEST | sync false, info configured | link/info widoczne, writes nadal zablokowane
Sheets isolation | dwóch fixture users | każdy ma wyłącznie swój spreadsheetId
Repo isolation | obcy ID/loca/prefix | 0 wycieku, 0 mutacji
Replay | historia vs cp_items | identyczny stan lub tombstone
Repeatability | dwa pełne uruchomienia | oba przechodzą bez ręcznego cleanupu

Każda pozycja ma mieć automatyczną asercję. Nie oznaczaj jej jako PASS na podstawie przeczytania kodu, typechecku ani HTTP 200.

11. Kolejność realizacji

git status --short; nie nadpisuj cudzych zmian.

Przeczytaj wskazaną dokumentację.

Utwórz nowe Story i zapisz input.

Zrób celowany audit wymienionych plików i aktualnych skryptów/package.json.

Dodaj minimalny izolowany test stack i runner.

Napisz failing tests reprodukujące:

brak pierwszych operacji;

brak realnego worker E2E;

błędną stronę Google Sheets na TEST;

pozorne Delete w Dates;

wymagane bezpieczeństwo losowego słowa.

Zapisz baseline wyników w Story.

Napraw przyczyny, nie objawy.

Uruchom unit/typecheck.

Uruchom real Mongo integration.

Uruchom Playwright.

Uruchom pełne pnpm test:regression:daily-dates dwa razy z rzędu.

Sprawdź brak sekretów, dumpów, trace'ów i testowych artefaktów w commicie.

Wykonaj commit.

Push branch/commit.

Wdróż tylko TEST oficjalnym skryptem projektu zgodnym z aktualną dokumentacją.

Wykonaj read-only QNAP TEST smoke, a mutacyjny tylko przy spełnieniu guardu test3.

Nie wykonuj promocji na PROD.

Uzupełnij 05_tasks_and_checklist.md; 04_todos.md zostaw puste.

12. Granice i zakazy

Nie wdrażaj PROD.

Nie włączaj prawdziwego Google Sheets sync na TEST.

Nie osłabiaj production-guard.ts.

Nie zapisuj prywatnego klucza, hasła, cookie ani tokenu w repo/logu/trace.

Nie kopiuj realnych danych użytkowników do fixture.

Nie czyść całego cp_items, cp_history, cp_history_state, outboxa ani chad_admin na współdzielonym QNAP.

Nie używaj git reset --hard, force-push ani usuwania nieznanych zmian.

Nie zastępuj testów integracyjnych mockiem Change Streams.

Nie twórz historii przez ręczne insertowanie do cp_history w głównym E2E.

Nie przedstawiaj backfillu jako prawdziwej historii utworzenia.

Nie omijaj DBA z Dashboardu.

Nie uznawaj build/typecheck za test działania.

Nie dodawaj stałych sleepów jako synchronizacji testów.

Nie zostawiaj test3 z danymi po lokalnym stacku; na QNAP cleanup może dotyczyć wyłącznie jawnie oznaczonych danych test3 i tylko po guardzie.

13. Oczekiwane artefakty

Po zakończeniu repo ma zawierać:

nowe Story;

ujednoliconą konfigurację test runnera;

izolowany Mongo rs0 E2E stack;

fixture/provisioner test3;

prawdziwe testy history-worker/Change Streams;

integrity checker cp_items <-> cp_history <-> Dashboard <-> fake Sheets;

Playwright E2E dla Daily, Dates, History, Google info i Delete confirmation;

realne Date delete w DBA/API/UI;

rozdzieloną konfigurację Google info vs Google write sync;

rootowe komendy testowe;

krótką dokumentację uruchamiania testów, najlepiej w ai-docs/tests/ lub aktualnym, zgodnym miejscu wskazanym przez indeks;

zaktualizowane przykładowe env/Compose bez sekretów;

commit i wynik TEST smoke.

14. Format końcowej odpowiedzi Cline

Nie twórz długiego raportu w czacie. Podaj tylko:

Story: <N>
Commit: <sha>
Full regression: PASS/FAIL — pnpm test:regression:daily-dates
TEST deploy: PASS/FAIL/NOT RUN
QNAP smoke: PASS/FAIL/NOT RUN
Najważniejsze nierozwiązane ryzyko: <jedno zdanie albo brak>

Pełne wyniki, taski, decyzje i dowody testów zapisz w Story.

## Input 2

Nie ma potrzeby tworzenia osobnego lokalnego stacku, jeżeli użytkownik test3 ma własny zakres danych i testy pilnują izolacji po repoGuid/repo context. Właśnie po to ma powstać test3: aby testować prawdziwe środowisko TEST, prawdziwy MongoDB, Change Streams, history-worker, Dashboard i Google Sheets.

Izolowane Mongo byłoby potrzebne tylko dla testów niszczących całą bazę, czyszczenia kolekcji lub restartowania Replica Set. Tego nie należy robić.

Poprawny zapis:

Pełny zestaw testów integracyjnych i E2E ma działać na środowisku QNAP TEST z użyciem dedykowanego użytkownika test3.

Dane test3 muszą być odseparowane od pawel_f, kamil_s i pozostałych użytkowników przez istniejący mechanizm repo context / repoGuid.

Testy mogą tworzyć, modyfikować i usuwać wyłącznie dane należące do test3. Nie wolno czyścić całych kolekcji, resetować Replica Set ani modyfikować danych innych użytkowników.

Każdy test powinien:

używać jednoznacznego prefiksu lub identyfikatora uruchomienia;
przygotować wymagane dane początkowe użytkownika test3;
sprawdzić cp_items, historię, Dashboard oraz Google Sheets;
posprzątać wyłącznie dane utworzone przez dane uruchomienie albo pozostawić deterministyczny stan bazowy;
być idempotentny i możliwy do wielokrotnego uruchamiania na TEST.

Osobne lokalne środowisko może pozostać opcjonalne dla szybkich testów developerskich, ale nie zastępuje testów na prawdziwym środowisku QNAP TEST.

## Input 3

`test3` credentials (username + password) were provided directly in chat.
**Redacted here on purpose** — per this Story's own §12 rule ("Nie zapisuj
prywatnego klucza, hasła, cookie ani tokenu w repo/logu/trace") and because
this file is committed to a public repo, the literal password is not
recorded in this file or any other committed file. It is used only as a
local, gitignored environment variable (`E2E_TEST3_PASSWORD`) for
provisioning/tests, never hardcoded in test code or committed config. (Note:
the same shared dev password already appears in one pre-existing committed
doc, `human-docs/dashboard/common/features/chad-user-data-isolation.md`
§8 — `pawel_f`/`kamil_s` login rows — this Story does not change that
pre-existing exposure, just avoids adding a new instance of it.)

## Input 4

to bylo bledne:
5.2. Fake Google Sheets do testów

Pełny zestaw automatyczny nie może pisać do prawdziwych arkuszy. Wstrzyknij fake GoogleSheetsClient lub lokalny adapter, który zapisuje stan arkusza w pamięci/pliku testowym i udostępnia go integrity checkerowi.

Sprawdź dokładnie:

kolejność i nazwy kolumn odpowiadają DAILY_COLUMNS/DATE_COLUMNS oraz mapperowi;

Daily i Dates trafiają do właściwych tabów;

test3 trafia tylko do spreadsheetId test3;

create tworzy jedną linię;

moze pisac do arkusza ale arkusza uzytkowniak test3:
https://docs.google.com/spreadsheets/d/1d_u_uRa0LILtksc25ATt--jh11mZDm7ABGyjAQuTdIc/edit?gid=0#gid=0
