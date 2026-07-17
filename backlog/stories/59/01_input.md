# Story 59 — Input

## Input 1

ok wszystko dizała teraz zacznij planowac jak zintegrowac to do mongo content providera i zintegrowac package do repo chad
uzupelnij to story ze to bylo samo gui
a stworz nowe story z nowym numerem gdzie opiszesz taski i plan potrzebny do wcielenia tych packegow do repo chad

## Input 2

Story 59 jest zatwierdzona do realizacji, z jedną korektą:

Jedna wspólna instancja MongoDB nie oznacza jednej logicznej bazy.

Na razie zachowaj:

- database `chad` dla danych CHAD i przyszłego Content Providera,
- database `beeper` dla contacts, messages, channels, timeline_events itd.

Obie bazy mają działać w tym samym kontenerze MongoDB.

Nie przenoś danych Beepera do database `chad`, jeżeli nie ma konkretnej
technicznej potrzeby. Zachowanie nazwy `beeper` minimalizuje zmiany i ryzyko.

Rozpocznij

## Input 3

ak — możesz pozwolić mu wykonać --apply, bo target jest lokalny, pusty i dry-run nie wykazał konfliktów.

Ale najpierw niech poprawi lub wyjaśni jedną rzecz w raporcie. Na końcu napisał:

4358 source docs across 7 collections, 0 already present, 0 would be inserted.

To jest sprzeczne z wcześniejszymi liniami, z których wynika:

152 + 170 + 3644 + 336 + 56 = 4358 dokumentów do wstawienia

Czyli końcowe podsumowanie powinno mówić:

4358 would be inserted

a nie 0 would be inserted.

Wklej mu:

Tak, możesz wykonać `--apply`, ale wyłącznie do lokalnej bazy docelowej:

mongodb://...@localhost:27017/beeper

Nie dotykaj QNAP.

Najpierw popraw albo wyjaśnij błąd w podsumowaniu dry-run:

szczegółowe linie pokazują łącznie 4358 dokumentów do wstawienia,
ale ostatnia linia mówi:

0 would be inserted

To jest sprzeczne. Napraw licznik podsumowania w migratorze i uruchom dry-run
jeszcze raz.

Jeżeli ponowny raport pokaże:

- source: 4358
- target existing: 0
- to insert: 4358
- conflicts: 0

to wykonaj `--apply` do lokalnej bazy `beeper`.

Po migracji obowiązkowo:

1. pokaż counts dla każdej kolekcji source vs target;
2. potwierdź, że target ma dokładnie:
   - contacts: 152
   - channels: 170
   - messages: 3644
   - sync_state: 336
   - beeper_events: 56
   - timeline_events: 0
   - merge_suggestions: 0
3. uruchom dashboard przeciw lokalnej bazie docelowej;
4. sprawdź contacts list, detail, inbox, search i merge suggestions;
5. przetestuj jeden bezpieczny write-path;
6. nie usuwaj ani nie modyfikuj source Mongo;
7. nie przechodź jeszcze do QNAP.

## Input 4

Nowe zadanie: doprowadź lokalną integrację Beeper CRM w repo `chad` do stanu całkowicie niezależnego od starego repo `contacts`.

## Cel

Lokalnie wszystko ma już działać wyłącznie z repo:

/Users/pawelfluder/03_synch/01_files_programming/08_nodejs/chad

Po zakończeniu:

- dane Beepera są przemigrowane do lokalnego MongoDB uruchamianego przez `chad`;
- dashboard `chad` czyta wyłącznie z lokalnego MongoDB `chad`;
- `beeper-sync` i `beeper-ws` są uruchamiane z pakietów znajdujących się w `chad`;
- żaden runtime nie zależy od kodu, `.env`, skryptów ani procesów uruchamianych ze starego repo `contacts`;
- stare repo `contacts` pozostaje tylko jako źródło referencyjne i backup danych.

Nie dotykaj jeszcze QNAP.

## Stan wejściowy

Dry-run migracji przeszedł:

source:
- Mongo starego `contacts`
- localhost:27018
- database `beeper`

target:
- lokalny Mongo uruchamiany przez `chad`
- localhost:27017
- database `beeper`

Źródło zawiera:

- contacts: 152
- channels: 170
- messages: 3644
- timeline_events: 0
- sync_state: 336
- beeper_events: 56
- merge_suggestions: 0

Target był pusty.

## Etap 1 — popraw migrator

Najpierw popraw błąd podsumowania dry-run:

szczegółowe liczniki pokazywały 4358 dokumentów do wstawienia,
ale ostatnia linia błędnie pokazywała `0 would be inserted`.

Po poprawce uruchom dry-run ponownie i potwierdź:

- source docs: 4358
- already present: 0
- to insert: 4358
- conflicts: 0

## Etap 2 — lokalna migracja danych

Po poprawnym dry-run wykonaj `--apply` wyłącznie do lokalnego targetu:

localhost:27017
database: beeper

Nie dotykaj QNAP.

Migracja ma być:

- insert-only;
- bez usuwania source;
- bez modyfikowania source;
- idempotentna;
- z odtworzeniem wymaganych indeksów.

Po migracji pokaż counts source vs target dla każdej kolekcji.

Target ma zawierać dokładnie:

- contacts: 152
- channels: 170
- messages: 3644
- timeline_events: 0
- sync_state: 336
- beeper_events: 56
- merge_suggestions: 0

Następnie uruchom migrator ponownie w dry-run i potwierdź:

- 4358 already present;
- 0 to insert;
- 0 conflicts.

## Etap 3 — usuń runtime dependency na `contacts`

Przeszukaj cały `chad` pod kątem zależności od starego repo.

Usuń aktywne odwołania do:

- ścieżek prowadzących do `/.../contacts`;
- `contacts/.env`;
- Mongo na porcie 27018;
- starego dashboardu SvelteKit;
- skryptów uruchamianych ze starego repo;
- importów lub subprocessów wskazujących na stare repo.

Nie usuwaj dokumentacji historycznej bez potrzeby.

Runtime `chad` ma korzystać z:

- rootowego `.env.local`;
- opcjonalnie `.env.mac-beeper` dla Mac-only Beeper Desktop;
- lokalnego Mongo `chad` na porcie 27017;
- database `beeper`.

Nie hardcoduj credentials.

## Etap 4 — konfiguracja lokalnego runtime

Ustal jednoznacznie konfigurację:

### MongoDB

Lokalny Mongo uruchamiany przez `chad`:

- host z perspektywy hosta Mac: `localhost`;
- port: `27017`;
- database: `beeper`;
- credentials z `.env.local`.

### Dashboard

Dashboard uruchamiany lokalnie z `chad` ma czytać dane Beeper CRM przez:

dashboard
→ packages/dba
→ local chad Mongo
→ database `beeper`

Dashboard nie może łączyć się bezpośrednio z Mongo.

### beeper-sync i beeper-ws

Uruchamiane z:

- `packages/beeper-sync`;
- `packages/beeper-ws`;

w repo `chad`.

Mają używać:

- lokalnego Beeper Desktop na Mac;
- lokalnego Mongo `chad`;
- database `beeper`.

Ich konfiguracja ma pochodzić z konfiguracji `chad`, nie ze starego repo.

## Etap 5 — skrypty lokalne

Doprowadź istniejące skrypty w:

bash-scripts/beeper/

do stanu, w którym można lokalnie uruchomić wszystko z repo `chad`.

Oczekiwane funkcje:

- `01_config.sh`
- `02_begin.sh`
- `03_end.sh`
- `04_status.sh`
- `05_sync.sh`

lub zgodnie z aktualnym standardem repo, jeżeli nazwy już są inne.

`begin.sh` ma:

- sprawdzić wymagane pliki;
- sprawdzić, czy Mongo `chad` działa;
- sprawdzić, czy Beeper Desktop API/WS odpowiada;
- uruchomić `beeper-ws`;
- nie uruchamiać automatycznie pełnego historycznego syncu;
- nie używać starego repo `contacts`.

`status.sh` ma pokazać:

- Mongo connection;
- database `beeper`;
- counts podstawowych kolekcji;
- stan `beeper-ws`;
- dostępność Beeper Desktop;
- ostatni błąd, jeśli występuje;
- bez wypisywania sekretów.

`05_sync.sh` ma uruchamiać incremental sync, nie force sync, chyba że użytkownik jawnie poda flagę.

## Etap 6 — runtime verification

Uruchom lokalnie cały wymagany stack z repo `chad`.

Przetestuj:

### Dane

- contacts count;
- channels count;
- messages count;
- sync_state count;
- beeper_events count.

### Dashboard

- lista kontaktów;
- szczegóły kontaktu;
- inbox;
- search;
- merge suggestions;
- odświeżenie strony;
- empty states;
- błędy API.

### Write paths

Na lokalnej przemigrowanej bazie przetestuj bezpiecznie:

- edycję pola profilu;
- dodanie tagu;
- usunięcie tagu;
- dodanie timeline event;
- usunięcie timeline event.

Nie wykonuj merge prawdziwych kontaktów bez przygotowania kontrolowanych danych testowych.

Każdą zmianę testową odwróć po teście albo wykonaj na jednoznacznie oznaczonym rekordzie testowym.

### beeper-sync

Uruchom incremental sync.

Sprawdź:

- użycie przemigrowanego `sync_state`;
- brak pełnego ponownego importu;
- brak duplikatów;
- counts przed i po;
- nowe rekordy tylko wtedy, gdy faktycznie pojawiły się nowe dane.

### beeper-ws

Uruchom go przez skrypt `chad`.

Sprawdź:

- połączenie do Beeper Desktop;
- połączenie do lokalnego Mongo `chad`;
- zapis nowego zdarzenia lub przynajmniej poprawne utrzymanie połączenia;
- brak odwołań do starego repo.

## Etap 7 — wyłączenie starego runtime

Po potwierdzeniu, że `chad` działa samodzielnie:

- zatrzymaj stare procesy `beeper-ws` i `beeper-sync` uruchomione z repo `contacts`, jeśli nadal działają;
- nie usuwaj starego Mongo;
- nie usuwaj starego repo;
- zostaw je jako read-only backup/reference;
- nie uruchamiaj już starego dashboardu jako część normalnego workflow.

Najpierw pokaż, które procesy chcesz zatrzymać.

Nie zatrzymuj niczego niezwiązanego z `contacts`.

## Etap 8 — dokumentacja

Zaktualizuj Story 59 i dokumentację Beeper.

Opisz:

- finalny lokalny runtime;
- source i target migracji;
- counts;
- indeksy;
- konfigurację;
- skrypty;
- przepływ danych;
- sposób uruchomienia;
- sposób incremental sync;
- sposób zatrzymania;
- znane ograniczenia;
- fakt, że QNAP nie został jeszcze ruszony.

Story 59 checklist ma odzwierciedlać realny stan wykonania.

## Warunki zakończenia

Zadanie jest zakończone lokalnie dopiero wtedy, gdy:

1. dane są w lokalnym Mongo `chad`;
2. ponowny dry-run pokazuje 0 do migracji;
3. dashboard `chad` czyta z lokalnego Mongo `chad`;
4. podstawowe widoki działają runtime;
5. write paths działają i zapis pozostaje po reloadzie;
6. `beeper-sync` działa z pakietu `chad`;
7. `beeper-ws` działa z pakietu `chad`;
8. żaden runtime nie zależy od repo `contacts`;
9. stare repo i Mongo pozostają nienaruszone jako backup;
10. dokumentacja jest aktualna.

Na końcu pokaż:

- finalne counts source i target;
- listę indeksów;
- używane procesy;
- używane porty;
- finalne env files bez sekretów;
- wynik testów UI;
- wynik testów write;
- wynik incremental sync;
- wynik beeper-ws;
- znalezione i usunięte zależności od `contacts`;
- dokładne komendy do lokalnego start/stop/status;
- listę commitów.

Nie przechodź jeszcze do QNAP TEST ani PROD.

## Input 5

Dobrze. Lokalną migrację uznaję za zakończoną warunkowo.

Otworzę ręcznie Beeper Desktop.

Po jego uruchomieniu wykonaj tylko:

1. bash bash-scripts/beeper/05_sync.sh
2. bash bash-scripts/beeper/02_re-start.sh
3. bash bash-scripts/beeper/04_status.sh

Następnie sprawdź:

- czy incremental sync użył istniejącego sync_state;
- ile dokumentów było przed i po;
- czy nie powstały duplikaty;
- czy beeper-ws utrzymuje połączenie;
- czy nowy event trafia do lokalnego Mongo chad;
- czy dashboard pokazuje nową wiadomość/event po refreshu albo SSE.

Nie wykonuj force sync.
Nie dotykaj QNAP.
Nie wprowadzaj nowych zmian architektonicznych.

Po tym zaktualizuj Story 59 i podaj finalny raport lokalnej integracji.

Po przejściu tego testu możesz uznać, że lokalny chad całkowicie przejął funkcjonalność starego contacts.
