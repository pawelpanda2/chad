# Story 79 — Input

**Note on this file's creation:** this Story folder was created retroactively, partway through the implementation, rather than as the very first action (a deviation from `ai-docs/begin_here/03_story-standard.md`'s own rule). Both inputs below are reproduced verbatim from the actual conversation.

## Input 1

Pracujesz w repozytorium pawelpanda2/chad.

To jest zadanie projektowo-implementacyjne. Najpierw wykonaj krótki, celowany audyt aktualnego stanu, następnie zaprojektuj i wdroż uproszczony, ale mocny mechanizm pełnej historii zmian cp_items.

Najważniejsza decyzja użytkownika

Użytkownik nie chce wielu dodatkowych kolekcji technicznych. Docelowo mechanizm historii ma używać wyłącznie:

cp_items — bieżący stan i źródło prawdy danych;

cp_history — jedyna kolekcja historii/audytu i źródło dla Dashboard History.

Nie dodawaj kolekcji typu:

cp_audit_events;

cp_mutation_counters;

cp_integrity_errors;

cp_history_projection;

cp_history_snapshots;

cp_history_projection_errors;

cp_history_rebuild_jobs;

nowych kolekcji checkpointów albo cache.

Obecne, niezależne outboxy pozostają bez zmian:

data_sync_outbox;

google_sheets_sync_outbox.

Nie są częścią historii. Nie usuwaj ich i nie łącz z cp_history.

Cel

Każda rzeczywista operacja na cp_items ma od początku tworzyć dokładnie jeden trwały wpis w cp_history.

Historia ma być:

kompletna od pierwszego seeda/importu;

jednoznacznie uporządkowana;

odporna na retry;

przypisana do użytkownika i repo;

powiązana z konkretną mutacją i requestem;

wystarczająca do audytu create/update/delete;

możliwa do sprawdzenia testami integralności;

zapisana atomowo razem ze zmianą cp_items.

Docelowy zapis:

Mongo transaction:
1. odczyt bieżącego cp_item
2. wyliczenie nowej wersji, diffu i hashy
3. insert/update/delete cp_items
4. insert jednego dokumentu cp_history
5. commit

Jeżeli którykolwiek krok zawiedzie, nie może zostać ani zmiana bez historii, ani historia bez zmiany.

Replica set i Change Streams

Replica set rs0 pozostaje potrzebny, ponieważ MongoDB wymaga go do transakcji wielodokumentowych/wielokolekcyjnych. Nie usuwaj konfiguracji replica set.

Change Stream nie ma już być głównym źródłem historii. Najpierw sprawdź, czy obecny history-worker nadal daje wartość jako dodatkowa diagnostyka. Preferencja użytkownika to minimalizm:

nie utrzymuj dwóch równoległych źródeł historii;

nie dodawaj nowej kolekcji tylko dla resume tokenu;

jeżeli worker bez dodatkowych kolekcji nie daje realnej wartości, zaproponuj jego usunięcie lub uproszczenie;

cp_history ma być jedynym źródłem audytu.

Audyt przed zmianami

Przeczytaj aktualną dokumentację startową repo i dokumentację historii. Zweryfikuj aktualny HEAD. Sprawdź szczególnie:

packages/dba/src/data-providers/mongo-cp-provider.ts;

packages/dba/src/data-commands.ts;

packages/dba/src/data-router.ts;

packages/dba/src/repo-context.ts;

packages/dba/src/cp-history.ts;

packages/history-worker/;

API create/update/delete Daily Tracker i Dates;

Story 72, 74 i 78;

obecne testy historii;

wszystkie miejsca zapisujące bezpośrednio do cp_items.

Przygotuj krótką listę wszystkich ścieżek zapisu do cp_items. Nie analizuj całego monorepo bez potrzeby.

Minimalne pola techniczne w cp_items

Dodaj:

_historyVersion: number
_lastMutationId: string
_lastActor?: {
  username: string
  repoGuid: string
}
_lastRequestId?: string

Zasady:

pierwszy insert ma _historyVersion: 1;

każdy update zwiększa wersję dokładnie o 1;

delete zapisuje w historii następną wersję;

_lastMutationId wiąże zmianę z cp_history;

_lastActor nie może być dziedziczony po poprzednim użytkowniku;

operacje systemowe muszą mieć jawnego aktora systemowego;

stare dane bez tych pól obsłuż wyłącznie kontrolowaną migracją/seedem, bez cichego zgadywania.

Model jedynej kolekcji cp_history

Każda operacja tworzy jeden dokument:

{
  _id: string,                    // mutationId
  mutationId: string,
  requestId: string | null,

  sourceCollection: "cp_items",
  sourceId: string,
  repoGuid: string,
  address: string,

  version: number,
  operationType: "insert" | "update" | "replace" | "delete",

  actor: {
    username: string,
    repoGuid: string,
    kind: "user" | "system" | "migration"
  },

  changedAt: Date,

  beforeHash: string | null,
  afterHash: string | null,

  changes: {
    config: Array<{
      op: "add" | "remove" | "replace",
      path: string,
      oldValue?: unknown,
      newValue?: unknown
    }>,
    body: unknown
  },

  afterSnapshot?: {
    config: unknown,
    body: string
  } | null,

  metadata: {
    endpoint?: string,
    commandKind?: string,
    environment?: string,
    seedRunId?: string
  }
}

Snapshoty bez osobnej kolekcji

insert zawsze zawiera pełny afterSnapshot;

delete zawiera pełny stan usuwanego dokumentu;

zwykły update przechowuje głównie diff;

opcjonalnie pełny afterSnapshot co N wersji, np. co 20;

N ma być stałą konfiguracyjną i mieć testy;

wszystko pozostaje w cp_history;

wykorzystaj obecny mechanizm diffu config/body, jeżeli jest poprawny.

Hashowanie i integralność

Wprowadź deterministyczny hash kanonicznej postaci {config, body}.

Wymagania:

stabilna kolejność kluczy;

pola techniczne nie mogą przypadkowo zmieniać hash wartości biznesowej;

beforeHash dla update/delete;

afterHash dla insert/update;

afterHash ostatniego eventu odpowiada bieżącemu cp_items;

beforeHash(version N) == afterHash(version N-1).

Nie dodawaj kolekcji błędów. Integrity checker ma zwracać raport i kod wyjścia.

Wspólna funkcja transakcyjna

Wszystkie operacje Mongo mają używać jednej wspólnej funkcji, np.:

executeCpMutationWithHistory(...)

Funkcja ma:

pobrać repoGuid, aktora i requestId z kontekstu;

rozpocząć sesję i transakcję;

odczytać bieżący dokument w tej samej sesji;

sprawdzić oczekiwaną wersję, jeśli przekazano;

wyliczyć version, diff, hashe i mutationId;

wykonać zmianę cp_items;

wstawić jeden event cp_history;

zatwierdzić transakcję;

dopiero po commit uruchomić istniejące enqueue do outboxów.

Nie przebudowuj outboxów w ramach tego zadania. Udokumentuj ich obecną nieatomową lukę, ale nie mieszaj jej z historią.

Idempotencja i współbieżność

retry z tym samym mutationId nie tworzy drugiej wersji;

_id w cp_history może być równy mutationId;

ponowne wykonanie po niepewnym wyniku transakcji sprawdza, czy event już istnieje;

drugi request zmieniający ten sam dokument dostaje nową wersję;

równoległe update'y nie mogą utworzyć tej samej wersji;

konflikt ma zakończyć się kontrolowanym retry albo konfliktem wersji, nie cichym nadpisaniem.

Delete

przed delete pobierz pełny dokument;

event ma poprawne repoGuid, address, actor, beforeHash;

event zawiera snapshot usuwanego dokumentu;

afterHash = null;

delete zwiększa wersję;

drugi delete nie tworzy fałszywego eventu;

Daily i Dates przechodzą przez ten sam wspólny mechanizm.

Seed historii od początku

Użytkownik dopuszcza ponowne przygotowanie danych, ponieważ pełny start jeszcze nie nastąpił.

Zaprojektuj kontrolowany proces:

backup obecnych danych;

zatrzymanie zapisów aplikacji;

wyczyszczenie historii wyłącznie w uzgodnionym zakresie;

seed/import wyłącznie przez DBA;

każdy tworzony cp_item dostaje event insert, version: 1;

po seedzie uruchom integrity checker;

dopiero potem przywróć normalne zapisy.

Nie wykonuj destrukcyjnego resetu PROD bez osobnej zgody.

test3 na QNAP TEST

Testy integracyjne i E2E mają działać na prawdziwym QNAP TEST z użytkownikiem test3.

Zasady:

wszystkie mutacje tylko w repo test3;

dane syntetyczne;

żadnego deleteMany({}), dropDatabase() ani globalnego czyszczenia;

cleanup tylko po repoGuid, sourceId, mutationId, seedRunId;

guard musi działać przed zapisem, nie po nim;

fixture ma rekoncyliować każdy oczekiwany rekord, a nie robić marker istnieje → pomiń wszystko;

nie dotykaj pawel_f, kamil_s ani innych użytkowników.

Indeksy cp_history

Dodaj tylko potrzebne indeksy:

{ sourceId: 1, version: 1 } unique
{ repoGuid: 1, changedAt: -1 }
{ address: 1, changedAt: -1 }
{ mutationId: 1 } unique // tylko jeśli mutationId nie jest _id

Nie dodawaj nadmiarowych indeksów bez uzasadnienia.

Dashboard History

Dostosuj odczyt tak, aby:

dla dokumentu sortował po version;

globalnie sortował po changedAt i stabilnym tie-breakerze;

pokazywał actor, operationType, address, version;

pokazywał diff config/body;

dla insert/delete pokazywał snapshot;

nie potrzebował cp_history_last_state;

nie opierał się na pamięci workera.

Nie przebudowuj całego UI poza zakresem koniecznym do nowego modelu.

Migracja starego mechanizmu

Sprawdź aktualne użycie:

cp_history;

cp_history_state;

cp_history_last_state;

history-worker;

backfill.mjs.

Docelowa preferencja:

zachować cp_history jako jedyną kolekcję historii;

usunąć zależność głównego audytu od cp_history_state;

usunąć cp_history_last_state;

usunąć albo uprościć history-worker, jeśli nie daje już realnej wartości;

nie utrzymywać starego i nowego mechanizmu równolegle bez konkretnego celu.

Najpierw testy, potem kod, potem TEST. PROD bez zgody jest zabroniony.

Testy obowiązkowe

Unit

kanonizacja i hash;

diff config/body;

event insert/update/delete;

wersjonowanie;

snapshot co N wersji;

idempotencja mutationId;

walidacja actor/repoGuid;

guard przed mutacją.

Integracyjne z prawdziwym Mongo rs0

Insert tworzy cp_items i dokładnie jeden cp_history, version 1, poprawne hashe.

Update tworzy dokładnie jeden event, zwiększa version o 1 i zachowuje hash-chain.

Delete usuwa cp_items, tworzy jeden event ze snapshotem i afterHash = null.

Wymuszony błąd insertu historii cofa zmianę cp_items.

Wymuszony błąd zmiany cp_items nie tworzy historii.

Ten sam mutationId dwa razy daje jeden event i jedną wersję.

Dwa równoległe update'y nie tworzą tej samej wersji.

Restart procesu nie wymaga shadow-state; kolejny update ma poprawny beforeHash i version.

Daily i Dates używają tego samego mechanizmu.

Integrity checker

Dodaj jedną komendę, np.:

pnpm test:cp-history:integrity

Ma sprawdzać dla wskazanego repo:

dokładnie jeden insert jako version 1;

wersje ciągłe 1..N;

brak duplikatów (sourceId, version);

beforeHash(N) == afterHash(N-1);

ostatni event odpowiada bieżącemu cp_items;

delete oznacza brak dokumentu;

brak eventów innego repo;

brak eventów bez actor/repoGuid/address;

poprawne snapshoty insert/delete;

zero niespójności.

E2E na test3

create → update → delete Daily Entry;

create → update → delete Date Entry;

sprawdzenie History UI po każdym kroku;

sprawdzenie version, actor, diff i snapshot delete;

sprawdzenie izolacji użytkownika;

pełny przebieg dwa razy bez ręcznego sprzątania.

Bezpieczeństwo i zakres

Nie wdrażaj PROD.

Możesz commitować i pushować.

Możesz wdrożyć TEST oficjalnymi skryptami repo.

Nie czyść globalnych kolekcji.

Nie modyfikuj danych innych użytkowników.

Nie dodawaj sekretów.

Nie twórz dodatkowych kolekcji „na przyszłość".

Każda nowa kolekcja poza cp_history wymaga zatrzymania pracy i wyraźnego uzasadnienia użytkownikowi. Domyślna decyzja: nie dodawać.

Nie komplikuj rozwiązania mikroserwisami, event busami ani dodatkowymi projectorami.

Oczekiwany rezultat

Mongo CHAD / baza chad
├── cp_items
├── cp_history
├── data_sync_outbox
└── google_sheets_sync_outbox

Dwie pierwsze kolekcje odpowiadają za dane i historię. Dwie pozostałe już istnieją i pozostają niezależnymi kolejkami synchronizacyjnymi.

Nie dodawaj żadnych nowych kolekcji historii.

Raport końcowy

Podaj tylko:

krótki opis wdrożonej architektury;

listę zmienionych plików;

wynik testów;

wynik integrity check;

commit SHA;

status deployu TEST;

wyraźną listę rzeczy niewykonanych.

Nie pokazuj ogromnego diffu ani nadmiarowego podsumowania.

## Input 2

Dodatkowa zmiana GUI — widok historii jako tabela i osobna strona szczegółów

Przebuduj obecną listę historii.

Usuń:

rozwijanie wpisów strzałką/accordionem;

paginację;

Page 1 of 1, 1–5 of 5, Previous, Next;

etykietę first event w obecnej formie;

pełny adres jako główną nazwę wpisu.

Zastąp listę tabelą zgodną wizualnie z istniejącymi tabelami Daily Tracker lub Statuses. Najpierw znajdź i wykorzystaj obecne wspólne komponenty/styl tabel.

Kolumny, dokładnie w tej kolejności:

Date — data i czas zmiany, domyślnie najnowsze wpisy pierwsze.

Operation — Created, Updated, Deleted.

Item — naturalna nazwa Itemu pochodząca z config CP. Najpierw ustal poprawne pole w aktualnym modelu; nie zgaduj. Dla starych eventów bez nazwy użyj kontrolowanego fallbacku, np. ostatniego segmentu adresu.

Nie dodawaj nadmiarowych kolumn bez realnej potrzeby.

Cały wiersz ma być klikalny. Kliknięcie:

nie rozwija wpisu;

przechodzi do osobnego route/widoku szczegółów;

używa jednoznacznego ID eventu;

umożliwia powrót przyciskiem Back i Back przeglądarki;

nie używa modala ani accordionu;

nie przyjmuje repoGuid z query/body, jeśli repo można ustalić z sesji.

Widok szczegółów ma pokazywać:

Date;

Operation;

Item name;

Address;

Actor;

Version;

zmiany config;

zmiany body;

snapshot dla Created i Deleted, jeśli dostępny;

jasną informację, gdy stary event nie ma pełnego before.

Wykorzystaj istniejący DashboardPageShell, nawigację Back/Forward i standard stylu repo.

U góry zachowaj combobox filtra operacji, ale zmień All operations na All. Opcje:

All

Created

Updated

Deleted

Filtr działa bez paginacji. Przycisk Refresh może pozostać.

Lista ma pokazywać wszystkie rekordy pasujące do filtra. Przy dużej liczbie wpisów użyj przewijanego kontenera tabeli, ale nie dodawaj paginacji bez zgody użytkownika.

Dodaj testy Playwright:

historia jest tabelą, nie accordionem;

brak Previous, Next, Page ... i licznika paginacji;

domyślna etykieta filtra to All;

filtrowanie Created/Updated/Deleted działa;

są kolumny Date, Operation, Item;

Item pokazuje nazwę z config CP, nie sam adres;

kliknięcie wiersza przechodzi do osobnego URL szczegółów;

szczegóły pokazują właściwy diff/snapshot;

Back wraca do tabeli;

mobile nie tworzy globalnego poziomego scrolla poza kontrolowanym kontenerem tabeli.

Nie zmieniaj innych tabel Daily Tracker/Statuses poza ewentualnym wykorzystaniem ich wspólnego komponentu lub stylu.
