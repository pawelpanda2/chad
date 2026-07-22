# Story 80 — Input

## Input 1

Prompt dla Claude Code / Cline — CHAD: pełna migracja danych operacyjnych i historii do PostgreSQL, Mongo tylko dla Beepera

Pracujesz w repozytorium pawelpanda2/chad.

To jest zadanie implementacyjne. Najpierw wykonaj celowany audyt aktualnego HEAD po Story 79, potem przygotuj testy failure-first, zaimplementuj migrację, uruchom pełną regresję i build, wykonaj commit oraz push. Nie wdrażaj PROD. QNAP TEST wdrażaj tylko wtedy, gdy nie narusza to współdzielonych danych używanych przez działający PROD.

Działaj samodzielnie. Nie pytaj o rutynowe zgody. Zatrzymaj się przed destrukcyjną operacją na realnych danych, migracją współdzielonego środowiska albo deployem PROD.

Minimalizuj zużycie tokenów:

najpierw dokumentacja, potem celowany odczyt kodu;

nie analizuj całego monorepo;

nie pokazuj dużych diffów;

szczegóły zapisuj w nowym Story;

końcowy raport ma być krótki.

1. Ostateczna decyzja architektoniczna

Nie chcemy już dwóch Mongo ani architektury:

Mongo cp_items
→ Change Stream
→ history-worker
→ PostgreSQL cp_history

Docelowo cały CHAD ma być w PostgreSQL.

MongoDB pozostaje wyłącznie dla Beepera.

Docelowa architektura:

PostgreSQL — CHAD
├── cp_items
├── cp_history
├── cp_outbox_data_sync
├── cp_outbox_google_sheets_sync
├── cp_folder_child_counters   // tylko jeśli naprawdę konieczne
└── schema_migrations

MongoDB — Beeper
├── beeper_<userGuid>
└── wiadomości / kontakty / rozmowy

Preferowany wariant to brak cp_folder_child_counters; najpierw spróbuj zachować bezpieczną alokację dzieci bez osobnej tabeli, używając transakcji, unikalnego constraintu i retry.

Najważniejsze:

cp_items ma zostać przeniesione z Mongo do PostgreSQL;

historia ma być zapisywana atomowo w PostgreSQL;

Change Stream nie jest już potrzebny;

history-worker nie jest już potrzebny;

cp_history nie może być utrzymywane równolegle w Mongo;

Mongo CHAD ma zostać wycofane;

po migracji zostaje tylko Mongo dla Beepera.

2. Dlaczego PostgreSQL

PostgreSQL ma być źródłem prawdy dla CHAD, ponieważ:

cp_items i cp_history mogą być zapisane w jednej transakcji;

historia może powstawać przez trigger albo kontrolowaną funkcję SQL;

każda zmiana, także ręczny SQL, może być audytowana;

DELETE ma dostęp do pełnego OLD;

nie potrzeba Change Streamu, resume tokenu ani shadow-state;

outboxy mogą być zapisane atomowo z operacją biznesową;

odpada osobny Mongo replica set dla CHAD;

system ma mniej usług i mniej punktów awarii.

3. Docelowe tabele PostgreSQL

Baza:

chad

Minimalny model:

chad
├── cp_items
├── cp_history
├── cp_outbox_data_sync
├── cp_outbox_google_sheets_sync
└── schema_migrations

Nie dodawaj przyszłościowych tabel bez aktualnej potrzeby.

3.1 cp_items

Jedna tabela przechowująca jeden Item CP na jeden rekord.

Przykładowy model:

cp_items (
  id uuid primary key,
  repo_guid text not null,
  address text not null,
  name text not null,
  type text not null,
  config jsonb not null,
  body text not null,

  created_at timestamptz not null,
  modified_at timestamptz not null,

  last_mutation_id text,
  last_request_id text,
  last_actor_username text,
  last_actor_repo_guid text,
  last_actor_kind text,

  unique (repo_guid, address)
)

Dostosuj typ id do rzeczywistego formatu config.id. Nie zgaduj, czy wszystkie istniejące ID są UUID.

Zachowaj kontrakt:

jeden rekord PostgreSQL = jeden Item CP;

id == config.id;

address odpowiada config.address;

config pozostaje pełnym JSONB;

body pozostaje tekstem;

dzieci folderów są wyliczane po adresie;

unikalność nazwy pod parentem musi pozostać zgodna z obecnym kontraktem.

Dodaj indeksy:

unique (repo_guid, address);

(repo_guid, address text_pattern_ops) albo równoważny indeks dla prefix search;

(repo_guid, name);

ewentualnie GIN na config tylko jeśli istnieją realne zapytania JSONB.

Nie dodawaj indeksów bez konkretnego użycia.

3.2 cp_history

Historia append-only.

cp_history (
  id bigserial primary key,
  mutation_id text not null,
  request_id text,

  source_id text not null,
  repo_guid text not null,
  address text not null,
  item_name text,
  version integer not null,

  operation_type text not null
    check (operation_type in ('insert','update','delete')),

  actor_username text,
  actor_repo_guid text,
  actor_kind text not null
    check (actor_kind in ('user','system','migration','unknown')),

  changed_at timestamptz not null default now(),

  before_hash text,
  after_hash text,

  config_diff jsonb,
  body_diff jsonb,

  before_snapshot jsonb,
  after_snapshot jsonb,

  unique (mutation_id),
  unique (source_id, version)
)

Zasady:

insert: before_snapshot = null, pełny after_snapshot;

update: diff oraz opcjonalny pełny snapshot;

delete: pełny before_snapshot, after_snapshot = null;

wersja zwiększa się dokładnie o 1;

brak duplikatów;

historia immutable;

brak update/delete użytkowych rekordów historii.

Indeksy:

(repo_guid, changed_at desc);

(source_id, version desc);

(address, changed_at desc);

(operation_type, changed_at desc) tylko jeśli potrzebny filtrowi GUI.

3.3 Outboxy

Docelowe nazwy tabel:

cp_outbox_data_sync
cp_outbox_google_sheets_sync

Przenieś obecne Mongo kolekcje:

data_sync_outbox;

google_sheets_sync_outbox;

do PostgreSQL jako:

cp_outbox_data_sync;

cp_outbox_google_sheets_sync.

Zachowaj:

statusy;

retry/backoff;

idempotencję;

payloady;

locki;

crash recovery;

conflict handling;

kompatybilność z Content Providerem i Google Sheets.

Outboxy mają być zapisane atomowo z operacją cp_items, gdy dana operacja tego wymaga.

Dla workerów użyj bezpiecznego claimu:

SELECT ...
FOR UPDATE SKIP LOCKED

albo równoważnego mechanizmu.

Nie twórz równoległych outboxów w Mongo.

4. Historia ma być atomowa

Każda mutacja cp_items ma działać w jednej transakcji PostgreSQL:

BEGIN

1. ustaw actor/requestId/mutationId w transaction context
2. odczytaj bieżący cp_item
3. waliduj repo i expected state
4. insert/update/delete cp_items
5. utwórz dokładnie jeden cp_history
6. enqueue wymaganych outboxów
7. COMMIT

Jeśli którykolwiek krok zawiedzie:

brak zmiany cp_items;

brak wpisu historii;

brak częściowo utworzonego outboxa.

Nie dopuszczaj stanu:

dane bez historii;

historia bez danych;

outbox bez operacji;

operacja bez wymaganego outboxa.

5. Trigger czy kod aplikacyjny

Najpierw zaprojektuj i porównaj dwa warianty:

Wariant A — trigger PostgreSQL

Trigger AFTER INSERT OR UPDATE OR DELETE na cp_items zapisuje cp_history.

Zalety:

audytuje również ręczne SQL;

delete ma pełny OLD;

historia nie może być ominięta przez aplikację.

Wady:

actor/requestId/mutationId trzeba przekazać przez transaction-local settings;

diff/hash logic w PL/pgSQL może być trudniejsza do testowania.

Wariant B — wspólna funkcja/repository w aplikacji

Jedna funkcja TypeScript wykonuje dane + historię w transakcji.

Zalety:

łatwiejsze testy i współdzielenie hash/diff;

prostszy kod domenowy.

Wady:

bezpośredni SQL może ominąć historię.

Preferowany wariant:

trigger zapewnia minimalny, zawsze obecny audit;

aplikacja ustawia transaction-local metadata:

app.actor_username;

app.actor_repo_guid;

app.actor_kind;

app.request_id;

app.mutation_id;

funkcja triggera tworzy pełny event historii;

hash/diff może być wyliczany w SQL albo przez funkcję PostgreSQL.

Jeżeli pełny diff w triggerze byłby nadmiernie złożony:

przechowuj pełne before_snapshot i after_snapshot;

diff może być wyliczany przy odczycie albo asynchronicznie później;

nie poświęcaj niezawodności historii dla skomplikowanego diffu.

Priorytet:

pełna historia;

atomowość;

prostota;

dopiero optymalizacja rozmiaru.

6. Actor i metadane transakcji

Każda operacja aplikacyjna ustawia transaction-local context:

SET LOCAL app.actor_username = '...';
SET LOCAL app.actor_repo_guid = '...';
SET LOCAL app.actor_kind = 'user';
SET LOCAL app.request_id = '...';
SET LOCAL app.mutation_id = '...';

Trigger pobiera te wartości przez current_setting(..., true).

Dla ręcznego SQL bez contextu:

actor_kind = unknown;

mutation_id generowany po stronie DB;

historia nadal powstaje;

nie przypisuj poprzedniego aktora.

Dla systemowych migracji:

actor_kind = migration;

jawny migration id.

7. Wersjonowanie

Nie trzymaj _historyVersion w rekordzie jako technicznego pola wymagającego migracji wszystkich danych.

Wersję wyliczaj atomowo po stronie PostgreSQL.

Bezpieczny wariant:

SELECT COALESCE(MAX(version), 0) + 1
FROM cp_history
WHERE source_id = ...
FOR UPDATE

albo lepszy mechanizm bez wyścigu, np. advisory lock per source_id, lock bieżącego cp_items lub kontrolowana tabela stanu — ale nie dodawaj nowej tabeli tylko dla wersji, jeśli nie jest konieczna.

Wymagania:

brak dwóch eventów o tej samej wersji;

brak luk;

concurrency test;

unique(source_id, version) jako ostatnia linia obrony.

8. Migracja z Mongo do PostgreSQL

Przygotuj idempotentny, kontrolowany migrator.

Źródła Mongo:

cp_items;

data_sync_outbox;

google_sheets_sync_outbox;

cp_history Story 79, jeśli istnieje;

stare history collections, jeśli istnieją.

Cele PostgreSQL:

cp_items;

cp_history;

cp_outbox_data_sync;

cp_outbox_google_sheets_sync.

Migrator musi mieć:

--dry-run;

zakres po repoGuid;

możliwość pełnej migracji;

raport liczby rekordów;

wykrywanie duplikatów;

wykrywanie konfliktów po ID/address;

hash verification;

idempotencję;

brak globalnego delete;

niezerowy exit code przy błędzie;

checkpoint/progress;

możliwość wznowienia;

brak nadpisania różnych danych pod tym samym kluczem.

8.1 Migracja cp_items

Dla każdego dokumentu:

zachowaj id;

zachowaj cały config;

zachowaj body;

wyprowadź repo_guid, address, name, type;

zweryfikuj zgodność pól;

wykryj brakujące/niepoprawne dane;

nie poprawiaj danych po cichu.

8.2 Migracja historii

Story 79 mogła utworzyć cp_history w Mongo.

Nie wyrzucaj tej historii automatycznie.

Migrator:

przenosi istniejące eventy do PostgreSQL;

zachowuje mutationId, version, actor, hashes, diffy, snapshoty;

raportuje rekordy niezgodne z nowym schematem;

nie fabrykuje brakujących danych;

pozwala zacząć od czystego seeda tylko jawnie.

8.3 Migracja outboxów

Przenieś statusy i payloady 1:1.

Sprawdź:

wszystkie _id;

status;

attempts;

nextAttemptAt;

lockedAt/lockedBy;

completedAt;

lastError.

Po migracji worker ma kontynuować joby bez duplikacji.

8.4 Cutover

Przygotuj dokładną procedurę:

backup Mongo CHAD;

zatrzymaj zapisy Dashboard/DBA;

zatrzymaj outbox workers;

uruchom finalny migrator;

integrity check;

przełącz konfigurację DBA na PostgreSQL;

uruchom outbox workers PostgreSQL;

smoke test;

wznowienie aplikacji;

przez określony czas Mongo CHAD tylko read-only jako rollback source;

dopiero potem wycofanie Mongo CHAD.

Nie usuwaj Mongo CHAD od razu.

9. Warstwa DBA

Dodaj PostgresCpProvider implementujący te same interfejsy, których używa obecny Mongo provider.

Nie zmieniaj kontraktów wyższych warstw bez potrzeby.

Wymagania:

getItem;

getByNames;

getByNames2;

putItem;

createChild;

deleteItem;

listowanie dzieci;

prefix queries;

repo isolation;

exact duplicate-name behavior;

zgodność z Content Providerem.

Aktualny router DBA ma docelowo używać PostgreSQL jako primary.

Usuń zależność biznesowych funkcji CHAD od Mongo provider.

Mongo provider może pozostać tymczasowo tylko jako:

migracyjne źródło odczytu;

narzędzie rollback;

test porównawczy.

Nie utrzymuj go jako równoległego primary po cutover.

10. Alokacja adresów dzieci

PostgreSQL ma transakcje i constraints, więc nie potrzeba Mongo folder_child_counters.

Preferowany mechanizm:

transaction;

advisory lock po (repo_guid, parent_address) albo lock logiczny parenta;

odczyt bezpośrednich dzieci;

sprawdzenie istniejącej nazwy;

wyliczenie kolejnego numeru;

insert;

commit.

Testy:

ta sama nazwa równolegle → jeden Item;

różne nazwy równolegle → unikalne adresy;

brak luk wynikających z race;

retry po konflikcie;

brak dodatkowej tabeli counterów.

11. Dashboard History

Zachowaj GUI Story 79:

Lista:

tabela;

bez paginacji;

kolumny Date, Operation, Item;

filtr All, Created, Updated, Deleted;

Item z config.name;

kliknięcie wiersza otwiera osobną stronę.

Szczegóły:

/dashboard/history/entry/[id];

Date;

Operation;

Item;

Address;

Actor;

Version;

config diff;

body diff;

before/after snapshot;

Back działa.

DBA/API/UI mają czytać PostgreSQL.

Izolacja:

repoGuid wyłącznie z session/repo context;

entry-by-id dodatkowo filtruje po repo_guid;

test cross-user;

test prefix collision.

Nie przywracaj accordionu ani paginacji.

12. Outbox workers

Przepisz oba workery na PostgreSQL.

Claim jobów:

transakcja;

FOR UPDATE SKIP LOCKED;

status processing;

lock owner/time;

retry/backoff;

stale lock recovery;

idempotencja.

Zachowaj dotychczasowe zachowanie:

Content Provider follower;

Google Sheets sync;

conflict handling;

retry schedule;

crash recovery.

Dodaj test:

dwa workery nie pobierają tego samego joba;

crash po claim;

retry;

stale lock;

idempotent replay.

13. Docker i runtime

Local

Dodaj PostgreSQL 17 do docker-compose.local.yml.

Pełny lokalny stack:

PostgreSQL CHAD;

Dashboard;

DBA;

outbox worker data sync;

outbox worker Google Sheets;

Content Provider, jeśli wymagany;

Mongo Beeper tylko jeśli potrzebny do lokalnego testu Beepera.

Nie uruchamiaj Mongo CHAD po finalnym cutover.

Healthcheck PostgreSQL.

Persistent volume.

Sekrety przez env.

QNAP

Docelowo:

jeden PostgreSQL CHAD;

jeden Mongo Beeper;

bez Mongo CHAD;

bez history-worker;

bez Change Stream;

bez replica set wymaganego tylko dla CHAD.

Nie usuwaj replica set ani Mongo CHAD przed zakończeniem migracji i rollback window.

Nie wdrażaj PROD.

14. Integrity checker

Jedna komenda, np.:

pnpm test:cp-integrity

Sprawdza:

każdy cp_items.id == config.id;

address == config.address;

name == config.name;

repo_guid odpowiada address;

brak duplikatów address;

brak duplikatów nazw pod parentem;

wersje historii ciągłe;

hash-chain;

ostatni event odpowiada cp_items;

delete odpowiada brakowi Itemu;

outbox IDs/statusy poprawne;

brak osieroconych historii;

cross-repo isolation;

liczby po migracji zgadzają się z Mongo source;

brak danych CHAD zapisanych wyłącznie w starym Mongo po cutover.

Checker nie tworzy tabeli raportów. Stdout + exit code.

15. Testy obowiązkowe

Unit

mapowanie Mongo Item → PostgreSQL row;

mapowanie row → CpItem;

config/body hash;

snapshot/diff;

trigger metadata;

actor unknown;

wersjonowanie;

outbox mapping;

migration conflict detection.

Integration — real PostgreSQL

insert Item → cp_items + cp_history w jednej transakcji;

update → poprawny before/after/version;

delete → pełny OLD snapshot;

ręczny SQL → historia z actor unknown;

rollback historii → rollback Itemu;

rollback outboxa → rollback Itemu;

concurrency jednego Itemu;

concurrency createChild;

repo isolation;

outbox SKIP LOCKED;

retry/stale lock;

trigger nie tworzy duplikatu eventu;

migration idempotentna;

Mongo → PostgreSQL count/hash parity.

E2E test3

create/update/delete Daily;

create/update/delete Dates;

historia po każdym kroku;

filtry;

details route;

Item name;

Back;

cross-user isolation;

pełny flow dwa razy;

Google Sheets outbox;

Content Provider outbox.

Nie mutuj danych innych użytkowników.

16. Dokumentacja i Story

Przeczytaj:

aktualne dokumenty startowe;

Story 72, 74, 78, 79;

ai-docs/history/how-it-works.md;

dokumentację DBA;

deployment rules;

endpoint rules.

Utwórz kolejne Story w standardzie sześciu plików.

01_input.md — pełny input.05_tasks_and_checklist.md — Ai Status / Real Status.04_todos.md — puste na końcu.

Przepisz dokumentację:

PostgreSQL = source of truth CHAD;

Mongo = tylko Beeper;

historia = PostgreSQL trigger/transakcja;

brak Change Stream/history-worker;

Story 79 i plan PostgreSQL history-worker = rozwiązania zastąpione.

17. Kolejność pracy

Audyt wszystkich writerów i readerów cp_items.

Audyt outboxów.

Nowe Story.

Failure-first tests.

Schema i migrations PostgreSQL.

PostgresCpProvider.

Trigger/audit transaction.

PostgreSQL outboxy i workers.

Migrator Mongo → PostgreSQL.

Read side History na PostgreSQL.

Local cutover.

Testy dwa razy.

Dashboard production build.

Integrity checker.

Commit i push.

QNAP TEST tylko po bezpiecznym planie migracji.

Bez PROD deploy.

18. Zakazy

Nie wdrażaj PROD.

Nie usuwaj Mongo CHAD przed backupem i rollback window.

Nie utrzymuj dwóch primary.

Nie utrzymuj historii równolegle w Mongo i PostgreSQL.

Nie przywracaj Change Stream/history-worker.

Nie twórz nowych kolekcji CHAD w Mongo.

Nie migruj realnych danych bez dry-run i raportu.

Nie wykonuj globalnego delete/drop.

Nie commituj sekretów.

Nie zmieniaj GUI History na accordion/paginację.

Nie fabrykuj danych historycznych.

Nie łam istniejących kontraktów DBA bez konieczności.

19. Kryteria akceptacji

Docelowo:

PostgreSQL CHAD:
- cp_items
- cp_history
- cp_outbox_data_sync
- cp_outbox_google_sheets_sync
- schema_migrations

MongoDB:
- wyłącznie Beeper

Ponadto:

każda zmiana cp_items tworzy atomową historię;

ręczny SQL również tworzy historię;

delete ma pełny OLD snapshot;

outboxy są atomowe z operacją;

brak Change Stream/history-worker;

brak Mongo CHAD jako runtime dependency;

istniejący użytkownicy nie są blokowani;

GUI działa;

testy/build/integrity green;

migrator jest idempotentny;

commit i push wykonane;

PROD nietknięty.

20. Raport końcowy

Podaj tylko:

architekturę końcową;

schemat PostgreSQL;

wynik migracji lokalnej;

testy;

integrity;

build;

commit SHA;

push;

status QNAP TEST;

rzeczy niewykonane i blokady.

Bez wielkiego diffu i nadmiarowego podsumowania.

## Input 2

(Clarifying question asked back: Story 79, committed the same day as this request, already implemented atomic cp_items+cp_history writes, versioning, actor/hash-chain, and retired history-worker/Change-Stream — but on MongoDB with a replica set. Confirmed: still proceed with the full Mongo→PostgreSQL migration as specified, i.e. Story 79's mechanism is being superseded by moving the same guarantees onto PostgreSQL and retiring Mongo for CHAD entirely, keeping Mongo only for Beeper.)
