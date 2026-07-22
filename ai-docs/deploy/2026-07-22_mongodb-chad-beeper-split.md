# MongoDB — fizyczne rozdzielenie CHAD / Beeper (Story 76)

Status: **infrastruktura i kod przygotowane, NIE wdrożone na realnym QNAP.
Migracja danych NIE została wykonana.** Uzupełnia `backlog/stories/76/`
(plan, decyzje, checklisty) i `2026-07-10_mongodb-replica-set-migration-plan.md`
(replica set dla `chad-mongodb`, wciąż aktualny, niezmieniony przez tę
Story).

## 1. Stan przed tą zmianą

Jeden kontener `chad-mongodb` (`mongo:4.4`, replica set `rs0`) hostował
fizycznie DWA logicznie niezależne obszary:

- baza `chad` — `cp_items`/`cp_history`/`cp_history_state`/
  `google_sheets_sync_outbox`,
- bazy `beeper_<repoGuid>` — po jednej na użytkownika CHAD (Story 73).

Jeden proces `mongod`, jeden oplog, jeden wolumen, jedne credentiale dla
obu obszarów — potwierdzone wprost w kodzie i konfiguracji (audyt w
`backlog/stories/76/`).

## 2. Decyzja użytkownika (2026-07-22)

`beeper-mongodb` ma być **zwykłym standalone MongoDB — bez replica setu,
bez Change Streams, na zawsze** — trwałość danych przez okresowy
`mongodump`, nie przez oplog/change streams. Świadomie zaakceptowany
kompromis: `beeper-crm.ts`'s live-update (SSE) degraduje z natychmiastowego
push (change stream) do pollingu co 5s — już zaimplementowane
(`packages/dba/src/beeper-crm.ts`, `packages/beeper-oplog/index.mjs` —
oba przepisane na polling, zero zależności od `db.watch()`).

## 3. Co zostało zaimplementowane w tej sesji (kod/konfiguracja, NIE wdrożone)

- **Nowy serwis `beeper-mongodb`** w `docker-compose.qnap.shared.yml` —
  `mongo:4.4`, standalone (`mongod --bind_ip_all`, bez `--replSet`/
  `--keyFile`), własny wolumen
  (`$QNAP_CONTAINER_DATA_PATH/chad-shared/beeper-mongodb/{db,configdb,backups}`),
  własny healthcheck, port hosta `12041` (Tailscale, analogicznie do
  `chad-mongodb`'s `12040`).
- **Osobne credentiale** — `BEEPER_MONGO_ROOT_USERNAME`/`_PASSWORD`
  (`.env.qnap.example`), least-privilege (skompromitowany dostęp do
  Beepera nie daje dostępu do `cp_items`).
- **`BEEPER_MONGODB_URI` przełączone** w `docker-compose.qnap.test.yml` i
  `docker-compose.qnap.prod.yml` na nowy kontener (`beeper-mongodb:27017`,
  nowe credentiale) — kod (`packages/dba/src/mongo.ts`) nie wymagał zmian,
  zgodnie z wcześniejszą analizą w `02_plan.md` §6.
- **Healthcheck/preflight** — `bash-scripts/dashboard/00_qnap_shared/03_re-start.sh`
  tworzy wolumen + czeka na zdrowy stan `beeper-mongodb` (analogicznie do
  `chad-mongodb`); `require_shared_services_healthy()`
  (`bash-scripts/common/lib.sh`) i `05_status.sh` też sprawdzają oba
  kontenery.
- **Backup** — `bash-scripts/mongo/backup.sh` już był sparametryzowany
  (`MONGO_CONTAINER_NAME`) — działa dla `beeper-mongodb` bez zmian w
  skrypcie, tylko innym zestawem zmiennych credentiali (patrz komentarz w
  `docker-compose.qnap.shared.yml`).
- **Skrypt migracji** — `bash-scripts/mongo/migrate-beeper-mongo-split.sh`
  (dump z `chad-mongodb` → most przez wolumeny hosta → restore do
  `beeper-mongodb` → weryfikacja liczby dokumentów per kolekcja).
  **Domyślnie dry-run** — wymaga jawnej flagi `--execute`, żeby cokolwiek
  faktycznie zrobić. **NIE URUCHOMIONY** przeciwko realnym danym QNAP.

## 4. Co NIE zostało zrobione

- Realna migracja danych na QNAP (dump/restore/weryfikacja) —
  **wymaga osobnej, jawnej zgody użytkownika**, zgodnie z bezpośrednim
  poleceniem tej Story.
- Cutover — restart TEST/PROD z nowym `BEEPER_MONGODB_URI`, realny smoke
  test (Beeper CRM, prawdziwy użytkownik, prawdziwe dane).
- Rollback plan poza "stare dane w `chad-mongodb` zostają nietknięte" —
  nie napisano formalnej procedury rollbacku (przełączenie
  `BEEPER_MONGODB_URI` z powrotem na `chad-mongodb:27017` i redeploy jest
  mechanicznie odwracalne, ale nie zostało to opisane krok-po-kroku ani
  przetestowane).
- Przeniesienie `history-worker` do procesu Dashboard (Story 76 §4) — **poza
  zakresem tej konkretnej sesji roboczej**, `packages/history-worker/`
  nadal istnieje jako osobny kontener, bez zmian.
- Usunięcie `beeper_*` z `chad-mongodb` — celowo, jako rollback safety net
  (Story 76's własne wymaganie: nigdy nie dopuścić do uruchomienia
  aplikacji na pustej bazie).

## 5. Kolejność wykonania (gdy padnie zgoda na realną migrację)

1. `bash bash-scripts/dashboard/00_qnap_shared/03_re-start.sh` — podnosi
   `beeper-mongodb` obok istniejącego `chad-mongodb` (oba kontenery
   działają równolegle, `chad-mongodb` nietknięty).
2. `bash bash-scripts/mongo/migrate-beeper-mongo-split.sh` (bez
   `--execute`) — dry run, potwierdza listę baz do migracji.
3. Ten sam skrypt z `--execute` — realny dump/restore/weryfikacja.
4. Ręczna weryfikacja liczników się zgadza (skrypt sam to robi, ale warto
   potwierdzić niezależnie przed dalszymi krokami).
5. Redeploy TEST (`bash-scripts/dashboard/04_qnap_test/*.sh`) — obraz już
   ma nowy `BEEPER_MONGODB_URI` wpisany w `docker-compose.qnap.test.yml`.
6. Realny smoke test na TEST — otworzyć Beeper CRM jako prawdziwy
   użytkownik, potwierdzić że kontakty/wiadomości się zgadzają.
7. Dopiero po potwierdzeniu — redeploy PROD.
8. `chad-mongodb`'s `beeper_*` bazy zostają nietknięte przez co najmniej
   jeden pełny cykl deployu.

## 6. Testy

Brak automatycznych testów dla samej infrastruktury (docker-compose,
bash) — to nie jest kod TypeScript objęty istniejącym test runnerem.
Weryfikacja jest w pełni manualna, opisana w §5 powyżej, i musi zostać
wykonana przy realnym uruchomieniu, nie założona.
