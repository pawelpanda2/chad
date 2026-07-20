# Story 74 — Input

## Input 1

Prompt dla Claude Code — QNAP MongoDB Replica Set + historia zmian CHAD + zakładka History

Pracujesz w monorepo `chad`.

Masz wykonać zadanie możliwie samodzielnie, długo i bez przerywania użytkownikowi pytaniami o rutynowe zgody. Użytkownik ponownie ma dostępne tokeny Claude i chce, abyś doprowadził pracę możliwie daleko w jednej sesji.

Nie zatrzymuj się po samym audycie ani po samym planie.

Najpierw sprawdź, czy istniejący QNAP udźwignie pojedynczy Replica Set MongoDB potrzebny do Change Streams i historii zmian. Jeżeli test zakończy się powodzeniem, od razu przejdź do implementacji systemu historii oraz zakładki `History` w Dashboardzie.

---

# 1. Główny cel

Celem końcowym jest stworzenie historii zmian danych CHAD opartej na MongoDB Change Streams.

Etapy:

```text
Etap A
Przetestować single-node Replica Set na istniejącym MongoDB na QNAP.

Etap B
Jeżeli test jest stabilny, uruchomić mechanizm rejestrowania historii zmian.

Etap C
Stworzyć w Dashboardzie zakładkę History.

Etap D
W History stworzyć menu działające i wyglądające podobnie do menu Views.

Etap E
Dodać pozycję Daily Tracker.

Etap F
Po kliknięciu Daily Tracker wyświetlać historię zmian danych Daily Trackera.
```

Nie twórz oddzielnego Mongo ani nowego kontenera wyłącznie na potrzeby testu.

Test ma dotyczyć istniejącego Mongo i istniejących baz, aby odpowiedzieć na realne pytanie:

```text
Czy QNAP udźwignie single-node Replica Set, Change Streams i zapis historii zmian,
gdy ten sam mongod obsługuje chad oraz beeper_<repoGuid>?
```

---

# 2. Znane środowisko

Aktualne środowisko:

```text
QNAP host: s12
CPU: Intel Celeron N5095
Architektura: x86_64
AVX: brak
Docker: QNAP Container Station / Docker
MongoDB: 4.4.30
Kontener Mongo: chad-mongodb
Port Mongo w kontenerze: 27017
Port hosta/Tailscale: 12040
Tailscale IP: 100.117.139.83
```

MongoDB 4.4 pozostaje wersją docelową dla tego QNAP.

Nie próbuj aktualizować MongoDB do wersji wymagającej AVX.

Obecna topologia:

```text
jeden kontener Mongo
jeden proces mongod
wiele baz danych
```

Przykładowe bazy:

```text
chad
beeper_<repoGuid>
admin
config
local
```

W `chad` istnieje między innymi:

```text
cp_items
cp_cache
```

Beeper używa osobnych baz per użytkownik:

```text
beeper_<repoGuid>
```

W każdej bazie Beepera kolekcje mają zwykłe nazwy:

```text
contacts
channels
messages
timeline_events
sync_state
beeper_events
merge_suggestions
```

Nie zmieniaj architektury Beeper per-user database.

---

# 3. Najważniejsze decyzje dotyczące historii

Historia zmian ma dotyczyć danych CHAD, przede wszystkim dokumentów z:

```text
chad.cp_items
```

Nie projektuj historii jako tekstowych diffów plików.

Docelowy model danych CP jest JSON-owy:

```json
{
  "address": "...",
  "fileName": "...",
  "body": {},
  "config": {}
}
```

Historia ma przechowywać zmiany pól i struktur JSON, szczególnie:

```text
body
config
```

Preferowana forma:

```text
JSON Patch
albo
czytelny strukturalny diff JSON
```

Nie zapisuj niepotrzebnie pełnej kopii całego dokumentu przy każdej drobnej zmianie, jeżeli można bezpiecznie zapisać patch.

Jednocześnie historia musi być możliwa do odczytania i odtworzenia.

Pełny `address` musi pozostać zgodny z adresem Content Providera, np.:

```text
8b603669-f8e6-4224-bd78-a474998995fa-04-02
```

Nie zamieniaj go na logiczną ścieżkę typu:

```text
views/reports/26-07-17
```

Nie dodawaj redundantnego `repositoryId`, jeżeli identyfikator repozytorium już wynika z `address`.

Mapowanie:

```text
address → konkretny widok/funkcja Dashboardu
```

powinno korzystać z istniejących mechanizmów lub danych administracyjnych projektu, a nie być powielane w każdym rekordzie historii bez potrzeby.

---

# 4. Dokumentacja przed kodem

Najpierw sprawdź aktualną strukturę repo.

W repo istnieje niedokończony rename:

```text
documentation/ → human-docs/
```

Jest to istniejąca praca użytkownika.

Nie próbuj:

- cofać rename;
- commitować całego rename;
- przenosić wszystkiego z powrotem;
- dodawać wszystkich usuniętych/untracked plików do commita;
- „naprawiać” tej sytuacji przy okazji.

Przeczytaj aktualne dokumenty wejściowe dla AI, w szczególności odpowiedniki:

```text
ai-docs/knowledge/01_ai_start.md
ai-docs/knowledge/02_what-and-where.md
ai-docs/knowledge/03_story-standard.md
ai-docs/knowledge/04_deployment-rules.md
```

Nie zakładaj, że nadrzędnymi dokumentami są `README.md`, `CLAUDE.md` albo `AGENTS.md`.

Przeczytaj też dokumentację dotyczącą:

```text
MongoDB
Content Provider
cp_items
cp_cache
Change Streams
Beeper per-user databases
user isolation
Views
Daily Tracker
Dashboard navigation
Stories
deploymentu QNAP TEST
```

Jeżeli historia pliku w `human-docs/` jest niewidoczna, sprawdź poprzednią ścieżkę pod `documentation/`.

---

# 5. Przejrzyj skrypty deploymentu

Przejrzyj cały:

```text
bash-scripts/
```

Szczególnie dokładnie sprawdź:

```text
08_registry_test/deploy.sh
```

Użytkownik wskazuje ten deployment jako najszybszy.

Jeżeli dokładna ścieżka lub nazwa zmieniła się w repo, znajdź rzeczywisty odpowiednik.

Nie zgaduj.

Sprawdź, czy skrypt:

- pobiera właściwy obraz;
- używa właściwego środowiska TEST;
- zachowuje wolumen Mongo;
- nie wykonuje `down -v`;
- nie usuwa danych;
- restartuje tylko wymagane usługi;
- streamuje logi;
- nadaje się do szybkiego wdrożenia zmian na QNAP TEST.

Jeżeli jest bezpieczny i zgodny z dokumentacją, użyj go zamiast ręcznego, chaotycznego deploymentu.

---

# 6. Dostęp przez SSH

Możesz użyć SSH do QNAP.

Najpierw znajdź istniejące skrypty i konfiguracje SSH w repo, np. odpowiedniki:

```text
06_qnap_test_ssh
07_qnap_prod_ssh
```

Nie twórz nowych połączeń i nowych metod deploymentu, jeżeli repo ma już poprawne helpery.

Przez SSH możesz:

- sprawdzić stan hosta;
- sprawdzić kontenery;
- wykonać backup;
- zmienić konfigurację Mongo;
- zrestartować istniejący kontener Mongo;
- wykonać `rs.initiate()`;
- uruchomić test Change Streams;
- zebrać metryki;
- uruchomić deployment TEST;
- sprawdzić logi.

Nie wykonuj nieuzgodnionego deploymentu Dashboardu PROD.

---

# 7. Tryb autonomiczny

Użytkownik udziela zgody na wykonanie całego zadania od audytu do działającej zakładki History na TEST.

Nie pytaj osobno o zgodę na:

- odczyt dokumentacji;
- analizę kodu;
- utworzenie Story;
- lokalne zmiany kodu;
- uruchomienie typecheck/build/test;
- backup Mongo;
- przygotowanie keyfile;
- modyfikację konfiguracji Replica Set;
- kontrolowany restart istniejącego `chad-mongodb`;
- `rs.initiate()`;
- testowe zapisy w tymczasowej kolekcji;
- utworzenie kolekcji historii;
- implementację backendu historii;
- implementację UI History;
- deployment na QNAP TEST;
- testy użytkowników na TEST;
- poprawki błędów wykrytych podczas testu.

Nie zatrzymuj się po każdym etapie z pytaniem „czy kontynuować?”.

Po zakończeniu jednego etapu przechodź automatycznie do następnego.

Zatrzymaj się tylko wtedy, gdy:

1. backup nie działa;
2. nie można ustalić aktywnego wolumenu Mongo;
3. istnieje ryzyko uruchomienia pustej bazy;
4. wykryjesz niespójność albo uszkodzenie danych;
5. rollback nie jest przygotowany;
6. kontener Mongo nie osiąga PRIMARY;
7. QNAP staje się niestabilny;
8. wymagane byłoby usunięcie danych;
9. wymagane byłoby wdrożenie PROD;
10. wykryjesz konflikt z inną aktywną pracą użytkownika, którego nie można bezpiecznie ominąć.

W pozostałych przypadkach działaj dalej.

---

# 8. Preflight Mongo i QNAP

Przed zmianą zapisz baseline.

## Host

Sprawdź:

```text
uptime
load average
CPU
RAM available
swap
dysk
I/O
```

Jeżeli dostępne, użyj:

```bash
free -m
df -h
uptime
top
vmstat
iostat
```

Nie zakładaj dostępności wszystkich narzędzi.

## Kontener

Sprawdź:

```bash
docker ps --filter name=chad-mongodb
docker inspect chad-mongodb
docker logs --tail 300 chad-mongodb
docker stats --no-stream chad-mongodb
```

Nie publikuj sekretów z `docker inspect`.

## Mongo

Sprawdź:

```javascript
db.version()
db.adminCommand({ getParameter: 1, featureCompatibilityVersion: 1 })
db.adminCommand({ listDatabases: 1 })
db.serverStatus()
```

Zapisz liczby dokumentów przed zmianą:

```text
chad.cp_items
chad.cp_cache
każda kolekcja w beeper_<repoGuid>
```

Nie odczytuj ani nie loguj prywatnej treści wiadomości i kontaktów.

---

# 9. Backup i rollback

Przed zmianą użyj istniejącego:

```text
bash-scripts/mongo/backup.sh
```

Backup ma objąć cały serwer Mongo.

Potwierdź:

- exit code;
- timestamp;
- ścieżkę;
- rozmiar;
- listę baz;
- że backup znajduje się poza aktywnym katalogiem danych;
- że nie jest pusty.

Przygotuj rollback przed uruchomieniem Replica Set:

```text
1. przywrócić poprzedni compose/config;
2. usunąć --replSet lub replSetName z konfiguracji;
3. zachować ten sam wolumen danych;
4. zrestartować ten sam kontener;
5. zweryfikować liczby dokumentów;
6. użyć restore tylko przy realnej utracie czytelności danych.
```

Nie wykonuj:

```text
docker compose down -v
docker volume rm
db.dropDatabase()
rm -rf na katalogu danych
```

---

# 10. Single-node Replica Set

Nazwa Replica Set:

```text
rs0
```

Preferowany członek:

```text
chad-mongodb:27017
```

Przykładowa konfiguracja:

```javascript
{
  _id: "rs0",
  members: [
    {
      _id: 0,
      host: "chad-mongodb:27017"
    }
  ]
}
```

Zachowaj:

- ten sam kontener;
- ten sam katalog danych;
- ten sam port hosta `12040`;
- istniejących użytkowników;
- istniejące hasła;
- istniejące bazy;
- istniejące indeksy.

Mongo z autoryzacją powinno mieć trwały keyfile.

Keyfile:

- wygeneruj bezpiecznie;
- nie commituj;
- nie loguj treści;
- zapisz na trwałym wolumenie QNAP;
- zamontuj read-only;
- ustaw właściwe uprawnienia.

Po restarcie wykonaj idempotentną inicjalizację:

```text
jeżeli rs0 już działa → nie inicjalizuj ponownie
jeżeli --replSet działa, ale brak configu → rs.initiate()
jeżeli istnieje inna konfiguracja → zatrzymaj się
```

Zweryfikuj:

```javascript
rs.status()
rs.conf()
db.hello()
db.isMaster()
rs.printReplicationInfo()
```

Stan końcowy:

```text
PRIMARY
```

---

# 11. Oplog

Ustaw lub zweryfikuj rozsądny rozmiar oploga.

Na start można przyjąć:

```text
1024 MB
```

o ile audit nie wskazuje lepszej wartości.

Pamiętaj:

```text
oplog jest wspólny dla wszystkich baz na tym mongod
```

Zapis wiadomości Beepera zużywa oplog nawet wtedy, gdy historia będzie śledzić tylko `chad.cp_items`.

Zbierz:

```javascript
db.getSiblingDB("local").oplog.rs.stats()
rs.printReplicationInfo()
```

Policz realne okno oploga:

```text
pierwszy timestamp
ostatni timestamp
czas okna
tempo rotacji
```

---

# 12. Test Change Streams

Utwórz diagnostyczny skrypt Node.js.

Nie testuj na prawdziwym `cp_items`.

Użyj:

```text
chad.__replica_set_probe
```

Test:

1. otwórz `watch()`;
2. insert;
3. odbierz insert;
4. update;
5. odbierz update;
6. delete;
7. odbierz delete;
8. zapisz resume token;
9. zamknij stream;
10. wykonaj kolejny zapis;
11. otwórz stream z `resumeAfter`;
12. potwierdź wznowienie;
13. usuń kolekcję testową.

Zmierz:

```text
czas otwarcia streamu
latencję insert
latencję update
latencję delete
czy resumeAfter działa
```

---

# 13. Ocena wydajności QNAP

Porównaj stan przed i po Replica Set.

Zbierz:

```text
CPU
load average
RAM
swap
I/O
docker stats
Mongo connections
WiredTiger cache
opcounters
network bytes
restart count
oplog size
oplog window
```

Testuj:

```text
idle
normalny Dashboard
krótkie kontrolowane zapisy
aktywny Change Stream
```

Nie wykonuj agresywnego benchmarku.

Przerwij obciążenie, jeżeli wystąpi:

```text
CPU stale > 85%
OOM
gwałtowny wzrost swap
Mongo traci PRIMARY
WiredTiger panic
dashboard przestaje odpowiadać
I/O pozostaje stale nasycone
```

Jeżeli QNAP jest stabilny, uznaj Etap A za zaliczony i automatycznie przejdź do implementacji historii.

---

# 14. Architektura historii

Po udanym teście Replica Set zaprojektuj mechanizm historii zmian dla:

```text
chad.cp_items
```

Preferowane komponenty:

```text
history worker
change stream
kolekcja historii
resume token / checkpoint
API historii
UI History
```

Proponowane kolekcje:

```text
cp_history
cp_history_state
```

Możesz zastosować inne nazwy, jeżeli repo ma istniejącą konwencję. Najpierw sprawdź dokumentację i kod.

## `cp_history`

Przykładowy rekord:

```json
{
  "_id": "...",
  "sourceCollection": "cp_items",
  "sourceId": "...",
  "address": "8b603669-f8e6-4224-bd78-a474998995fa-04-02",
  "fileName": "body",
  "operationType": "update",
  "changedAt": "2026-07-19T12:34:56.000Z",
  "actor": {
    "username": "pawel_f",
    "repoGuid": "..."
  },
  "patch": {
    "body": [],
    "config": []
  },
  "beforeHash": "...",
  "afterHash": "...",
  "metadata": {
    "source": "change-stream",
    "view": "daily-tracker"
  }
}
```

To jest przykład, nie sztywny wymóg.

Najpierw dopasuj model do rzeczywistego `cp_items`.

## `cp_history_state`

Powinna przechowywać:

```text
resume token
timestamp ostatniego zdarzenia
status workera
ostatni błąd
ostatni heartbeat
```

Worker po restarcie powinien wznowić obserwację.

Nie może tracić historii po normalnym restarcie Dashboardu albo Mongo.

---

# 15. Ustalenie użytkownika wykonującego zmianę

Change Stream sam z siebie może nie znać użytkownika aplikacji, który wykonał zapis.

Sprawdź istniejącą ścieżkę zapisu:

```text
Dashboard
→ API
→ DBA
→ MongoCpProvider
→ cp_items
```

Zaprojektuj bezpieczny sposób zachowania autora zmiany.

Preferencja:

- zapisująca warstwa aplikacji przekazuje kontekst użytkownika;
- dokument lub osobna kolejka zapisuje krótkotrwałe metadata operacji;
- worker historii łączy zdarzenie Change Stream z kontekstem;
- brak autora nie może blokować historii;
- wtedy wpis ma `actor: system/unknown`.

Nie dodawaj `ownerRepoGuid` jako modelu izolacji Beepera.

To jest osobny problem.

Dla historii CHAD repo/użytkownik może być częścią metadanych audytowych, jeżeli jest potrzebny do prezentacji.

---

# 16. Generowanie diffu

Dla `update`:

- pobierz stan przed zmianą, jeżeli mechanizm go zapewnia;
- pobierz stan po zmianie;
- wylicz strukturalny diff dla `body` i `config`;
- pomijaj pola techniczne, które powodują szum;
- nie zapisuj sekretów;
- nie zapisuj dużych binarnych treści;
- zachowaj informację o dodaniu/usunięciu/zmianie wartości.

Dla `insert`:

```text
record created
```

Możesz zachować początkowy snapshot lub patch od pustego dokumentu.

Dla `delete`:

```text
record deleted
```

Historia powinna pozwolić zobaczyć ostatni znany stan lub przynajmniej istotne pola usuniętego dokumentu.

Sprawdź możliwości MongoDB 4.4 i drivera.

Jeżeli pre-image nie jest wspierany tak jak w nowych Mongo, nie udawaj, że jest.

W takim przypadku zaimplementuj historię w sposób kompatybilny z MongoDB 4.4, np.:

- aplikacyjny zapis historii przed/po operacji;
- cache ostatniego stanu;
- pełny dokument z change stream dla insert/replace;
- pobranie aktualnego dokumentu po update;
- połączenie Change Stream z kontrolowanym mechanizmem zapisu w DBA.

Najważniejsze: rozwiązanie ma rzeczywiście działać na MongoDB 4.4.

---

# 17. Worker historii

Zdecyduj na podstawie repo, gdzie worker powinien działać.

Możliwe warianty:

```text
osobny package history-worker
część DBA
osobny proces Node
```

Preferowany jest niezależny proces, jeżeli dzięki temu:

- restart Dashboardu nie zatrzymuje historii;
- błędy UI nie zatrzymują Change Stream;
- można niezależnie monitorować health;
- resume token jest trwały.

Nie twórz niepotrzebnie ciężkiej infrastruktury.

Worker powinien:

```text
startować automatycznie
logować status
mieć graceful shutdown
mieć retry z backoff
zapisywać resume token
nie duplikować wpisów
mieć idempotency key
wykrywać utracony resume token
raportować błąd
```

Jeżeli resume token wypadnie poza okno oploga:

- zapisz jasny błąd;
- nie twórz fałszywej historii;
- uruchom kontrolowaną procedurę ponownego startu od bieżącego czasu;
- oznacz lukę w historii;
- pokaż warning w logach i ewentualnie Dev Panelu.

---

# 18. API historii

Dodaj API zgodne z architekturą Dashboard → DBA.

Nie łącz Dashboardu bezpośrednio z Mongo.

Przykładowe możliwości API:

```text
lista wpisów historii
filtrowanie po address
filtrowanie po fileName
filtrowanie po view
filtrowanie po użytkowniku
filtrowanie po zakresie dat
paginacja
szczegóły wpisu
```

Dla Daily Tracker API musi umożliwić pobranie wyłącznie historii związanej z Daily Trackerem.

Nie pobieraj całej historii do przeglądarki.

Użyj paginacji po stronie serwera.

Nie ufaj `repoGuid` z query/body.

Korzystaj z istniejącej sesji i repo-context.

Izolacja użytkownika ma być zgodna z resztą CHAD.

---

# 19. Zakładka History

Dodaj nową główną zakładkę:

```text
History
```

Ma być dostępna w Dashboardzie zgodnie z istniejącą konwencją nawigacji.

Nie twórz UI od zera, jeżeli istnieją komponenty używane przez:

```text
Views
Forms
NavGroup
DashboardPageShell
```

Zakładka History ma wyglądać spójnie z resztą aplikacji.

## Menu

Wewnątrz `History` stwórz menu podobne do menu w `Views`.

Na start ma zawierać:

```text
Daily Tracker
```

Architektura menu ma pozwolić później łatwo dodać:

```text
Reports
Statuses
Leads
Msg Todo
Msg Planner
inne widoki
```

Nie implementuj wszystkich przyszłych pozycji, ale nie hardkoduj struktury tak, aby obsługiwała tylko Daily Tracker.

## Routing

Preferowany czytelny routing, zgodny z istniejącym Dashboardem, np.:

```text
/dashboard/history
/dashboard/history?view=daily-tracker
```

albo istniejąca konwencja projektu.

Nie wprowadzaj nowego stylu routingu bez potrzeby.

---

# 20. Widok historii Daily Tracker

Po kliknięciu:

```text
History → Daily Tracker
```

użytkownik ma zobaczyć historię zmian Daily Trackera.

Minimum:

```text
data i czas
użytkownik/aktor
typ operacji
adres
zmienione pola
krótki opis zmiany
przycisk/akcja Details
```

Szczegóły powinny pokazywać:

```text
wartość przed
wartość po
JSON patch lub czytelny diff
body
config
```

UI nie może wyświetlać nieczytelnego surowego JSON jako jedynej formy.

Może mieć:

```text
widok czytelny
opcjonalny Raw JSON
```

Warto rozważyć grupowanie:

```text
dzisiaj
wczoraj
konkretna data
```

oraz filtry:

```text
data od/do
rodzaj operacji
użytkownik
wyszukiwanie
```

Najpierw zrób działające minimum, potem dopracuj UX bez zatrzymywania się po zgodę.

---

# 21. Jak rozpoznać Daily Tracker

Nie zgaduj jego `address`.

Znajdź istniejący kod i mapowanie Daily Trackera.

Sprawdź:

```text
Views routing
tracker page
MongoCpProvider queries
address mapping
chad_admin
view config
existing Daily Tracker documentation
```

Historia Daily Trackera musi być filtrowana po realnym identyfikatorze danych.

Nie filtruj wyłącznie po etykiecie UI, jeżeli nie jest trwałym identyfikatorem.

Jeżeli Daily Tracker składa się z wielu dokumentów `cp_items`, uwzględnij wszystkie wymagane adresy/typy.

Udokumentuj regułę mapowania.

---

# 22. Testy backendu

Dodaj testy zgodne z konwencją repo.

Sprawdź istniejące testy DBA, szczególnie real-Mongo, hand-rolled test runner, jeżeli nadal jest obowiązującym standardem.

Testy mają obejmować:

1. insert `cp_item` tworzy wpis historii;
2. update `body` tworzy patch;
3. update `config` tworzy patch;
4. zmiana wielu pól;
5. delete tworzy wpis;
6. resume po restarcie workera;
7. brak duplikatów po retry;
8. izolacja użytkownika;
9. filtr Daily Tracker;
10. paginacja;
11. brak wycieku innych danych;
12. utrata/niepoprawny resume token;
13. reconnect po chwilowej niedostępności Mongo;
14. zgodność z MongoDB 4.4.

Nie testuj na realnym `chad`.

Użyj testowej bazy.

---

# 23. Testy UI

Sprawdź lokalnie:

```text
History pojawia się w menu
History otwiera stronę
Daily Tracker pojawia się w submenu
kliknięcie Daily Tracker pobiera historię
loading
empty state
error state
pagination
details
mobile
desktop
dark mode
```

Sprawdź układ zgodnie z zasadami Dashboardu:

```text
brak globalnego scrolla
wewnętrzny scroll w panelu
DashboardPageShell
spójne odstępy
menu mobilne
```

Nie twórz pustych kart ani niepotrzebnych paneli.

---

# 24. Deployment TEST

Po przejściu testów lokalnych wykonaj QNAP TEST.

Preferuj najszybszą wspieraną ścieżkę:

```text
08_registry_test/deploy.sh
```

Wykonaj:

```text
build
typecheck
test
deploy TEST
status
logs
smoke test
```

Nie wdrażaj PROD.

Na TEST sprawdź co najmniej:

```text
pawel_f
kamil_s
History
Daily Tracker
istniejące Views
Beeper isolation
Leads
Statuses
Reports
```

Utwórz kontrolowaną zmianę testową w Daily Trackerze na TEST i potwierdź:

```text
zmiana zapisana
Change Stream odebrał zmianę
wpis pojawił się w cp_history
API zwróciło wpis
History → Daily Tracker wyświetliło zmianę
autor i data są poprawne
diff jest czytelny
```

Po teście przywróć testową wartość, jeżeli to konieczne, i potwierdź, że również ta zmiana jest widoczna jako osobny wpis historii.

---

# 25. Obserwowalność

Dodaj minimalne logi workera:

```text
startup
connected
PRIMARY available
watch opened
event received
history persisted
resume token persisted
retry
fatal error
graceful shutdown
```

Nie loguj pełnego `body`, danych kontaktów ani sekretów.

Dodaj health/status możliwy do sprawdzenia przez skrypt lub endpoint.

Warto pokazać:

```text
worker running
last event time
last resume token time
last error
history queue lag
```

Jeżeli istnieje Dev Panel Errors/Requests, rozważ integrację błędów workera, ale nie blokuj głównego zadania nadmiernym rozbudowaniem.

---

# 26. Story i dokumentacja

Ustal następny wolny numer Story.

Nie zgaduj numeru.

Utwórz:

```text
01_input.md
02_plan.md
03_knowledge.md
04_todos.md
05_report.md
06_propositions.md
```

Story ma objąć:

```text
Replica Set test
Change Streams
history architecture
history worker
History UI
Daily Tracker history
TEST deployment
performance findings
```

Na koniec:

- `04_todos.md` powinno pokazywać rzeczywisty stan;
- ukończone zadania oznacz jako zakończone;
- niewykonane PROD przenieś do dalszych kroków;
- `05_report.md` ma zawierać pełny raport;
- `06_propositions.md` ma zawierać propozycje przyszłych rozszerzeń.

Dodaj dokumentację dla AI i człowieka dotyczącą:

```text
jak działa rs0
jak działa oplog
jak działa history worker
gdzie jest resume token
jak dodać nowy typ widoku do History
jak Daily Tracker mapuje się na cp_items
jak uruchomić test
jak wykonać rollback
```

Nie commituj całego rename dokumentacji.

---

# 27. Commitowanie

Najpierw sprawdź:

```bash
git status --short
```

Nie dodawaj przypadkowych zmian użytkownika.

Commit ma obejmować wyłącznie pliki związane z zadaniem.

Nie commituj:

```text
.env
haseł
keyfile
backupów
dumpów
logów prywatnych danych
całego documentation → human-docs rename
```

Możesz robić logiczne commity, np.:

```text
feat(mongo): enable single-node replica set
feat(history): add cp history worker
feat(dashboard): add History Daily Tracker view
docs(story): document replica set and history
```

Nie wykonuj `git reset --hard`.

Nie usuwaj obcych zmian.

---

# 28. Kryteria końcowego sukcesu

Zadanie jest zakończone na poziomie TEST, gdy:

1. `chad-mongodb` działa jako `rs0`;
2. node jest stabilnym PRIMARY;
3. istniejące dane nie zostały utracone;
4. counts przed i po są zgodne;
5. Change Streams działają;
6. resume token działa;
7. QNAP pozostaje stabilny;
8. historia zapisuje zmiany `cp_items`;
9. restart workera nie gubi historii;
10. działa API historii;
11. istnieje zakładka History;
12. menu History działa jak menu Views;
13. istnieje pozycja Daily Tracker;
14. kliknięcie pokazuje historię Daily Trackera;
15. diff `body/config` jest czytelny;
16. izolacja użytkowników działa;
17. QNAP TEST przeszedł smoke test;
18. nie wdrożono PROD;
19. dokumentacja jest kompletna;
20. rollback jest opisany i możliwy.

---

# 29. Raport końcowy

Nie przerywaj długim raportem w połowie pracy.

Na końcu podaj użytkownikowi krótko:

```text
- co zostało wykonane;
- czy Replica Set działa;
- czy QNAP jest stabilny;
- czy History → Daily Tracker działa na TEST;
- jakie testy przeszły;
- czego świadomie nie wykonano;
- czy potrzebna jest osobna zgoda na PROD.
```

Pełne szczegóły zapisz w Story.

Raport musi zawierać:

```text
Mongo version
FCV
rs0 status
member host
oplog size
oplog window
CPU/RAM/I/O before/after
backup path
downtime
counts before/after
Change Stream latency
resumeAfter result
history worker status
number of history records generated in test
History UI result
Daily Tracker result
pawel_f result
kamil_s result
TEST deployment result
rollback readiness
```

---

# 30. Najważniejsze polecenie

Działaj możliwie długo i samodzielnie.

Nie zatrzymuj się po planie.

Nie pytaj o rutynowe zgody.

Przechodź automatycznie:

```text
dokumentacja
→ audit
→ backup
→ Replica Set
→ pomiar
→ Change Streams
→ historia
→ API
→ zakładka History
→ menu jak Views
→ Daily Tracker
→ testy
→ deploy QNAP TEST
→ smoke test
→ raport
```

Zatrzymaj się przed PROD albo przy realnym ryzyku utraty danych.

Najważniejszy oczekiwany efekt użytkownika:

```text
Na stronie CHAD istnieje zakładka History.
W niej jest menu podobne do Views.
Po wybraniu Daily Tracker użytkownik widzi rzeczywistą historię zmian Daily Trackera,
zarejestrowaną przez mechanizm oparty na MongoDB Replica Set i Change Streams.
```
