# Story 81 — Input

## Input 1

Pracujesz w repozytorium pawelpanda2/chad.

Aktualny HEAD zawiera Story 80, commit:

1e7486824c86255f5bc0e3efa300c8326f25dfe2

Story 80 lokalnie wdrożyła PostgreSQL jako backend CHAD:

cp_items;

cp_history;

cp_outbox_data_sync;

cp_outbox_google_sheets_sync;

schema_migrations;

PostgresCpProvider;

trigger-based history;

migrator Mongo → PostgreSQL;

integrity checker;

backend dispatchery Mongo/Postgres.

QNAP nadal działa na Mongo i nie został przełączony. Twoim zadaniem jest teraz bezpiecznie przełączyć QNAP TEST na PostgreSQL i domknąć brakujące elementy Story 80, bez wdrażania PROD.

1. Zasady nadrzędne

Nie wdrażaj PROD.

Nie zmieniaj PROD na PostgreSQL.

Nie usuwaj Mongo CHAD.

Nie kasuj żadnych realnych danych.

Nie wykonuj globalnego drop, deleteMany({}), TRUNCATE ani DROP DATABASE.

Nie restartuj całego chad-shared, jeśli można uruchomić wyłącznie PostgreSQL.

Nie zatrzymuj chad-mongodb ani beeper-mongodb.

Nie wykonuj pełnego 03_re-start.sh dla shared stacku.

Uruchom PostgreSQL selektywnie przez docker compose up -d postgres.

TEST może zostać przełączony na PostgreSQL.

PROD ma pozostać na Mongo do osobnego Story/okna produkcyjnego.

Nie pozwól, aby TEST i PROD zapisywały różne dane do dwóch backendów bez jawnej izolacji.

2. Najpierw zweryfikuj aktualny stan

Przed zmianami:

przeczytaj aktualne dokumenty startowe repo;

przeczytaj:

backlog/stories/80/;

ai-docs/history/how-it-works.md;

dokumentację deployu QNAP;

konfigurację TEST/PROD/shared;

sprawdź aktualny HEAD i brak lokalnych niecommitowanych zmian;

sprawdź skrypty:

bash-scripts/dashboard/00_qnap_shared/;

bash-scripts/dashboard/04_qnap_test/;

bash-scripts/dashboard/06_qnap_test_ssh/;

sprawdź docker-compose.qnap.shared.yml;

sprawdź env QNAP TEST i shared bez wypisywania sekretów;

ustal:

gdzie działa PostgreSQL;

jaki ma volume;

jaki port wewnętrzny/zewnętrzny;

czy TEST dashboard może połączyć się po sieci chad-shared;

czy POSTGRES_URI wskazuje właściwy host;

czy TEST ma osobny env od PROD;

czy przełączenie TEST nie zmieni env PROD.

Nie opieraj się na założeniach.

3. Utwórz Story 81

Utwórz pełne Story:

backlog/stories/81/
├── 01_input.md
├── 02_plan.md
├── 03_knowledge.md
├── 04_todos.md
├── 05_tasks_and_checklist.md
└── 06_others_from_report.md

W 05_tasks_and_checklist.md:

Ai Status;

Real Status;

prawdziwe komendy i wyniki;

bez PASS bez uruchomienia.

04_todos.md ma być puste na końcu.

4. Uruchom PostgreSQL na QNAP bez restartu Mongo

Nie używaj pełnego shared restartu.

Wykonaj selektywnie:

docker compose \
  -p <shared-project> \
  --env-file <shared-env> \
  -f docker-compose.qnap.shared.yml \
  up -d postgres

Przed tym:

zweryfikuj QNAP_CONTAINER_DATA_PATH;

utwórz tylko katalogi PostgreSQL;

sprawdź, że path nie wskazuje na tmpfs;

sprawdź prawa zapisu i wolne miejsce;

nie modyfikuj katalogów Mongo.

Po starcie:

healthcheck;

pg_isready;

logi;

restart samego kontenera PostgreSQL;

potwierdzenie trwałości danych;

potwierdzenie, że chad-mongodb i beeper-mongodb nie zostały zrestartowane.

Jeżeli potrzeba, dodaj osobne skrypty:

bash-scripts/dashboard/00_qnap_shared/07_postgres_up.sh
bash-scripts/dashboard/00_qnap_shared/08_postgres_status.sh
bash-scripts/dashboard/00_qnap_shared/09_postgres_logs.sh

5. Migracje PostgreSQL na QNAP

Uruchom packages/dba/scripts/apply-postgres-migrations.mjs.

Wymagania:

idempotentność;

poprawne POSTGRES_URI;

brak sekretów w logach;

tabela schema_migrations;

ponowne uruchomienie = no-op;

potwierdzenie tabel:

cp_items;

cp_history;

cp_outbox_data_sync;

cp_outbox_google_sheets_sync;

schema_migrations.

Zweryfikuj triggery:

cp_items_write_history;

blokady UPDATE/DELETE na cp_history.

6. Izolowany cutover TEST

TEST i PROD współdzielą obecnie Mongo. Preferowany wariant:

PostgreSQL QNAP zawiera tylko dane test3;

TEST po przełączeniu może pracować tylko na test3;

mutacje innych użytkowników na TEST mają być blokowane czytelnym komunikatem środowiskowym;

PROD pozostaje na Mongo;

nie migruj pawel_f, kamil_s ani innych użytkowników.

Nie wolno dopuścić do dywergencji realnych repo między TEST PostgreSQL i PROD Mongo.

7. Migracja/reseed test3

Przed migracją:

ustal dokładny repoGuid;

guard przed każdą mutacją;

dry-run migratora tylko dla test3;

pokaż liczbę cp_items, cp_history, obu outboxów;

sprawdź konflikty i legacy history;

nie fabrykuj brakujących danych.

Następnie migracja tylko test3.

Po migracji:

integrity checker;

parity Mongo/PostgreSQL;

porównanie hash;

brak rekordów innych repo;

trigger działa przy nowych mutacjach.

Jeżeli test3 jest niespójny, wykonaj kontrolowany reseed tylko tego repo:

backup/export;

cleanup po dokładnym repoGuid;

seed przez DBA/Postgres provider;

bez globalnego czyszczenia;

historia od insertu.

8. Przełącz tylko QNAP TEST

W rzeczywistym env TEST ustaw odpowiednie flagi po audycie kodu, docelowo:

DBA_POSTGRES_ENABLED=true
DBA_PRIMARY_BACKEND=postgres
DBA_MONGO_ENABLED=false
POSTGRES_URI=<shared postgres URI>

Nie zmieniaj env PROD.

Zweryfikuj:

TEST łączy się z PostgreSQL;

PROD nadal z Mongo;

TEST i PROD mają oddzielne flagi;

TEST nie mutuje innych repo niż test3;

Beeper nadal korzysta ze swojego Mongo;

Google Sheets sync czyta PostgreSQL outbox;

Content Provider follower czyta PostgreSQL outbox.

Restartuj tylko dashboard TEST.

9. Domknij data-sync outbox worker

data-outbox-worker.ts nadal nie jest podpięty do działającego procesu. Dokończ to.

Wymagania:

osobny proces/usługa;

backend dispatcher;

na TEST czyta cp_outbox_data_sync z PostgreSQL;

retry/backoff;

stale-lock recovery;

graceful shutdown;

health/readiness;

logi bez sekretów;

jedna aktywna instancja;

brak równoległego claimu tego samego joba;

zgodność z Content Provider follower.

Dodaj do local i QNAP TEST runtime.

Nie uruchamiaj PostgreSQL worker-a dla PROD, dopóki PROD pozostaje na Mongo.

10. Google Sheets worker

Zweryfikuj:

czy działa na TEST;

czy po cutoverze czyta PostgreSQL;

czy test3 ma prawidłowy Sheet;

czy retry/statusy działają.

Nie zapisuj do arkuszy innych użytkowników.

11. Testy QNAP TEST

Smoke

login test3;

HTTP 200;

Daily;

Dates;

History;

brak błędów pool;

PostgreSQL health green.

Integracyjne test3

create/update/delete Daily;

create/update/delete Date;

każdy krok = dokładnie jeden event cp_history;

ciągłe wersje;

poprawny actor;

snapshot delete;

hash-chain;

Dashboard widzi dane;

Content Provider outbox działa;

Google Sheets outbox działa;

retry po kontrolowanym błędzie;

brak mutacji innych repo.

Playwright

tabela History;

brak paginacji;

filtry All/Created/Updated/Deleted;

kliknięcie wiersza;

details;

Back;

Item name;

izolacja repo.

Brak sekretu E2E = nie oznaczaj PASS.

12. Integrity

Uruchom:

pnpm test:cp-postgres-integrity -- --repoGuid=<test3-guid>

Wymagany wynik:

zero błędów;

brak duplikatów;

ciągłe wersje;

zgodność last event ↔ cp_items;

delete ↔ brak itemu;

brak stale locks;

poprawna izolacja.

Porównaj:

liczby Mongo/PostgreSQL;

eventy;

outboxy;

hashe, nie tylko county.

13. Rollback TEST

Przygotuj procedurę:

zatrzymaj TEST;

ustaw TEST z powrotem na Mongo;

restart tylko TEST;

smoke test;

PostgreSQL zostaje do analizy.

Po udanym E2E pozostaw TEST na PostgreSQL.

14. Dokumentacja

Zaktualizuj:

ai-docs/history/how-it-works.md;

dokumentację DBA;

QNAP shared;

TEST deployment;

Story 80 jako częściowe;

Story 81 jako realny TEST cutover.

Dokumentacja ma mówić:

LOCAL: PostgreSQL
QNAP TEST: PostgreSQL
QNAP PROD: Mongo (tymczasowo)
Beeper: osobny Mongo

15. Commit i push

Możesz:

commitować;

pushować do main;

deployować TEST;

uruchamiać PostgreSQL selektywnie.

Nie możesz:

deployować PROD;

restartować PROD;

przełączać PROD;

usuwać Mongo CHAD;

migrować innych repo.

16. Kryteria akceptacji

DONE tylko gdy:

PostgreSQL działa na QNAP;

migracje zastosowane;

test3 zmigrowany/reseedowany;

QNAP TEST używa PostgreSQL;

PROD nadal używa Mongo;

TEST nie mutuje innych repo;

data-sync outbox worker działa;

Google Sheets outbox działa;

History UI działa;

testy test3 zielone;

integrity zielony;

restart TEST i PostgreSQL zachowują dane;

Mongo/Beeper nieprzerwane;

rollback opisany;

commit i push wykonane.

17. Raport końcowy

Podaj tylko:

commit SHA;

status PostgreSQL QNAP;

czy TEST jest na PostgreSQL;

czy PROD pozostał na Mongo;

wynik migracji test3;

wynik integrity;

wynik Daily/Dates;

wynik Playwright;

status data-sync worker;

status Google Sheets worker;

potwierdzenie braku restartu Mongo/Beeper;

rzeczy niewykonane i blokady.

Bez ogromnego diffu i nadmiarowego podsumowania.

## Input 2

(Clarifying question asked back: QNAP's checked-out git working tree and both running dashboard images — TEST and PROD — are on commit 6eeb9b5, "feat(story-78)", three Stories behind main; they still run the old Change-Stream/history-worker mechanism, not Story 79's transactional Mongo history nor any Story 80 Postgres code. Cutting TEST to Postgres requires first deploying current main to TEST — a normal build+restart, but one that also puts Story 79's never-before-verified-on-QNAP transactional history mechanism into real use on TEST for the first time. Confirmed: deploy main to TEST first, then continue with the Postgres cutover as planned.)
