# Release-readiness audit — READY FOR BOSS

Data: 2026-07-29 (dokończenie audytu z 2026-07-28). Zakres: sekrety Gmail,
session/auth signing na żywo, storage QNAP, backup/restore Postgres+Mongo,
snapshoty, offsite, flakowość 1_3, pełny 4-filarowy audit, live smoke test.

Commit wejściowy: `03d848f`. Commit końcowy: patrz sekcja Git poniżej.

## 1. Secrets (Gmail viewer account)

`GOOGLE_VIEWER_USERNAME`/`GOOGLE_VIEWER_PASSWORD` (dane wejściowe do
`packages/dba/scripts/provision-google-viewer-secrets.mjs`) nadal
**niedostępne** — sprawdzone wyczerpująco (lokalnie i na żywym QNAP:
`.env.qnap`, `.env.server1.test`, `.env.server1.prod`, zmienne środowiskowe,
macOS keychain) — nigdzie nie istnieją. Nigdy nie zgadywane/wymyślane.

**Doprecyzowanie względem poprzedniego audytu** (odkryte przez żywe,
read-only sprawdzenie `/api/google-sheets/info` dla każdego eligible
usera): per-repo `secrets` item **już istnieje** dla `pawel_f` (admin) i
`test3` — ten sam viewer email skonfigurowany dla obu. Tylko `test2` go nie
ma. Źródło prawdy (per-repo `secrets` item) działa poprawnie tam, gdzie
istnieje — provisioning-script jest gotowy, ale nadal wymaga tych samych
dwóch zmiennych, żeby dociągnąć `test2` do tego samego stanu.

| user | role | eligible | secretsItemExists (info endpoint) | result |
|---|---|---|---|---|
| pawel_f | admin | tak | tak (`kamilgame042@gmail.com`) | PASS (już istniało) |
| test3 | user (test) | tak | tak (`kamilgame042@gmail.com`) | PASS (już istniało) |
| test2 | user (test) | tak | nie | **BLOCKED — brak GOOGLE_VIEWER_USERNAME/GOOGLE_VIEWER_PASSWORD** |

Source of truth: potwierdzone kodem (`info`/`reveal-password` routes czytają
per-repo item, env tylko jako fallback), reveal-password wymaga reauth
(sekcja 2 dalej — na żywo zweryfikowane po deployu).

## 2. Session/auth signing (P0, na żywo)

**SESSION_SIGNING_SECRET**: wygenerowany kryptograficznie losowo
(`openssl rand -hex 32`, wyłącznie server-side na QNAP, nigdy nie
wypisany), dopisany wyłącznie do `.env.qnap` na QNAP (backup pliku zrobiony
przed zmianą). Zdeployowany na QNAP TEST.

**Realna luka znaleziona i naprawiona**: `middleware.ts` sprawdzał tylko
*obecność* cookie, nigdy podpisu — `session-token.ts` przepisany na Web
Crypto (`crypto.subtle`, działa identycznie w Edge i Node runtime), middleware
teraz woła `verifySessionToken()` naprawdę.

Zweryfikowane na żywo (curl przeciw `100.117.139.83:12020` + unit testy):

| check | wynik |
|---|---|
| login działa | PASS (test3, pawel_f) |
| session cookie podpisana (3-częściowy `repoGuid:issuedAt:hmac`) | PASS |
| zmiana cookie (flip 1 znaku HMAC) → odrzucenie | PASS (401 NOT_AUTHENTICATED) |
| cookie wygasa (unit test, 8 dni w przeszłości, prawidłowy podpis) | PASS |
| Secure/SameSite/HttpOnly | HttpOnly+SameSite=Lax zawsze; Secure celowo `false` na TEST (dostęp też przez zwykły HTTP port, zgodnie z istniejącym kodowym komentarzem — nie zmieniane) |
| middleware waliduje podpis, nie tylko obecność | PASS (naprawione, Web Crypto, edge-compatible) |
| `/api/admin/users` bez admina → 403 | **realna luka znaleziona i naprawiona** — brak było JAKIEGOKOLWIEK auth-checku (test3 dostawał 200 z pełną listą email userów); teraz 403 dla non-admin, 200 dla pawel_f (admin) |

Test regresyjny `session-signing-configured.test.mjs` — failuje jeśli
serwer wraca do unsigned 2-częściowego formatu; potwierdzone że failował
przed deployem, PASS po. Unit test `session-token.test.ts` (5 assertions:
sign/verify, tamper sygnatury, tamper repoGuid, expiry, malformed) — 5/5
PASS.

## 3. Storage QNAP — migracja fizyczna do `cp_1` wykonana

**Doprecyzowanie po ponownej weryfikacji**: pierwotna ocena ("już
poprawnie skonfigurowane, migracja niepotrzebna") była technicznie
prawdziwa co do *wolumenu* (dane były już na `cachedev1`, tym samym co
`cp_1`), ale nie spełniała dosłownego wymagania: dane miały fizycznie
leżeć **pod `/share/cp_1`**, nie tylko na tym samym wolumenie co `cp_1`.
Wykonano rzeczywistą migrację ścieżki.

Zweryfikowane ponownie na żywo (`df -h`, `mount`, `cat /proc/mounts`,
`ls -la /share`, `docker inspect`):

| | |
|---|---|
| realny wolumen | `/dev/mapper/cachedev1` → `/share/CACHEDEV1_DATA`, ext4, 4.5 TB, 2.7 TB wolne |
| `CACHEDEV1_DATA` | punkt montowania realnego wolumenu blokowego (Pool 1 / DataVol1) |
| `cp_1` | zwykły QNAP Shared Folder (symlink `/share/cp_1` → `CACHEDEV1_DATA/cp_1`), ten sam mechanizm co `Dropbox`/`homes`/`Public`; NIE osobny wolumen |
| kolizja w `cp_1` | brak — katalog `chad-data` nie istniał, utworzony od zera obok istniejących `repos/`, `.streams`, `@Recycle` (legacy `personal-dashboard-prod`) |

**Stara ścieżka**: `/share/CACHEDEV1_DATA/ContainerData/chad-shared/{postgres,beeper-mongodb}/{db,configdb,backups}`
**Nowa ścieżka**: `/share/cp_1/chad-data/chad-shared/{postgres,beeper-mongodb}/{db,configdb,backups}`

**Wykonane kroki**: świeży `pg_dump -Fc` + `mongodump --archive --gzip`
tuż przed stopem → zatrzymano `chad-dashboard-test`, `chad-dashboard-prod`,
`chad-postgres`, `beeper-mongodb` (`04_end.sh`, bez `-v`) → cold-copy przez
pomocniczy kontener root (`cp -a`, zachowuje UID/GID/permission bits
dokładnie — zweryfikowano `stat` przed/po identyczne: `700` dla
`postgres/db`, `755` dla `beeper-mongodb/db`) → naprawiono właściciela
katalogów-rodziców (mkdir w kontenerze root utworzył je jako
`admin:administrators` zamiast `pawelfluder:everyone` jak oryginał — bez
tej poprawki `chad-shared` odmawiał startu: "Data directory is not
writable") → `.env.qnap`: `QNAP_CONTAINER_DATA_PATH=/share/cp_1/chad-data`
(kopia `.env.qnap` przed zmianą zachowana) → `docker-compose.qnap.shared.yml`
nie wymagał zmiany kodu (już czyta ścieżkę z tej zmiennej — tylko komentarz
dokumentujący datę/powód dodany) → start shared stack, TEST, **PROD**
(restart PROD wymagał jawnej zgody użytkownika — zablokowany przez
Claude Code auto-mode classifier jako action dotykająca PROD, mimo że to
tylko restart istniejącego kontenera, nie deploy nowego kodu; zgoda
uzyskana, wykonano).

**Weryfikacja integralności — 1:1, zero strat**: policzono
cp_items/cp_history/cp_outbox_data_sync/cp_outbox_google_sheets_sync/
schema_migrations zarówno z restore świeżego dumpa sprzed stopu, jak i z
żywej bazy na nowej ścieżce po starcie — **identyczne w każdej kolumnie**
(832/1033/0/116/1 oba razy). Mongo: lista collections + county
(`beeper_events=59, channels=171, contacts=153, messages=3648,
sync_state=337, timeline_events=0`) identyczne przed i po.

**Stara lokalizacja** (`.../ContainerData/chad-shared/{postgres,beeper-mongodb}`)
pozostawiona nietknięta jako rollback copy, `chmod -R a-w` (zweryfikowano:
`touch` w tym katalogu → `Permission denied`) — nadal czytelna, ale
niezapisywalna.

**Live smoke test po migracji** (TEST i PROD): login (`test3`@TEST,
`pawel_f`@PROD) — PASS; Google Sheets info (oba) — PASS; History read
(`pawel_f`@PROD, read-only) — PASS; admin RBAC (`pawel_f`@PROD) — PASS;
Beeper TCP (`beeper-mongodb:27017` z obu kontenerów dashboardu) — PASS.

Migracja: **PASS** (wykonana fizycznie, zweryfikowana bez utraty danych,
rollback copy zabezpieczona read-only).

## 4. Backup Postgres + Beeper Mongo

Nowe skrypty (`bash-scripts/postgres/{backup,restore}.sh`,
`bash-scripts/mongo/{backup-archive,restore-archive}.sh`) — `docker exec`
do żywego kontenera, tmp-plik + atomic rename, sha256 checksum, manifest
JSON, GFS retention (14 daily / 8 weekly / 12 monthly — miejsce pozwala),
mkdir-based lock (chroni przed równoległym uruchomieniem), exit code,
zero sekretów w logu.

**Uruchomione naprawdę na QNAP** (nie tylko istnienie skryptu):

| | Postgres | Beeper Mongo |
|---|---|---|
| backup wykonany | `chad-2026-07-29T14-47-28Z.dump` | `beeper-2026-07-29T14-47-42Z.archive.gz` |
| tool | `pg_dump -Fc` (docker exec) | `mongodump --archive --gzip` (docker exec) |
| zawartość | cp_items=831, cp_history=995, cp_outbox_data_sync=0, cp_outbox_google_sheets_sync=75, schema_migrations=1 | beeper_21d11bdc-... (pawel_f): messages=3648, contacts=153, channels=171, sync_state=337, beeper_events=59; beeper_8b603669-... (kamil_s): wszystko 0 (znany pusty realny stan) |
| checksum | sha256, w manifest.json | sha256, w manifest.json |
| retention | zastosowany, przetestowany | zastosowany, przetestowany |

**Scheduler**: wpisy cron dodane do `/etc/config/crontab` na QNAP (Postgres
02:00, Beeper Mongo 02:15 UTC daily) — plik jest source-of-truth i
persystentny (przetrwa restart). **Live aktywacja przed najbliższym
rebootem QNAP nie została zweryfikowana** — nieuprzywilejowany user SSH nie
ma prawa przeładować `crond` (`/usr/bin/crontab`: "must be suid",
`/etc/init.d/crond.sh reload` → "Permission denied" tworząc plik tymczasowy
w `/etc/config/`). MANUAL ACTION: albo restart QNAP raz, albo zapisanie
czegokolwiek w QTS Control Panel → Task Scheduler (co wywoła ten sam
reload z uprawnieniami roota), albo podanie danych administratora QTS.

## 5. Restore drill (Postgres + Mongo) — **PASS**

Wykonane na disposable kontenerach (`chad-postgres-restore-drill`,
`beeper-mongodb-restore-drill`), nigdy nie połączone z żywym workerem,
usunięte po teście.

**Postgres**: `pg_restore` z realnego dumpa z sekcji 4 → baza
`restore_drill`. Porównanie liczności z żywą bazą: cp_items 831/831,
cp_history 995/995, cp_outbox_data_sync 0/0, cp_outbox_google_sheets_sync
75/75, schema_migrations 1/1 — **wszystkie identyczne**. Próbka 3 losowych
rekordów `cp_items` — identyczne id/name/type między live i restored.

**Mongo**: `mongorestore --archive --gzip` z realnego dumpa → disposable
kontener. "4368 document(s) restored successfully, 0 failed" (zgadza się z
sumą kolekcji pawel_f + 0 kamil_s). Lista baz identyczna z żywą. Próbka
jednego dokumentu `messages` (ten sam `_id`) — identyczna treść
(`channelID`, `timestamp`) między live i restored.

Backup bez restore drill = FAIL (zgodnie z regułą) — tu restore drill
wykonany naprawdę, więc: **PASS**.

## 6. Snapshoty QNAP — MANUAL ACTION REQUIRED

`qcli_volumesnapshot`/`qcli_snapshotvault` istnieją, ale każda operacja
mutująca wymaga sesji `qcli -l user=... pw=...` — konto SSH nie ma
prawidłowego hasła do tego API (próba z tym samym kontem = "Authentication
fail"; nie zgadywano dalej, zgodnie z zakazem). `ContainerData` to zwykły
podkatalog na wolumenie, nie osobny "Shared Folder" QNAP, więc snapshot
możliwy tylko na poziomie całego wolumenu (Pool 1 / DataVol1) — obejmie też
`cp_1` i inne dane na tym wolumenie, ale to bezpieczne (szerszy zakres, nie
kolizja).

**Instrukcja dla użytkownika** (QTS web GUI):
1. Control Panel → Storage & Snapshots → wybierz Pool 1 / DataVol1.
2. Snapshot Manager → Schedule → nowy harmonogram.
3. Proponowane (miejsce pozwala — 2.7 TB wolne): co 6h / 7 dni, daily / 30
   dni, weekly / 8 tygodni.
4. Reserved snapshot space: ~20-25% (wolumen ma dużo zapasu).

Status: **MANUAL ACTION REQUIRED** (nie oznaczone jako PASS — tylko
instrukcja przygotowana, zgodnie z zasadą sekcji 9). Snapshot nie zastępuje
logical backup (ten już PASS, sekcja 4).

## 7. Offsite backup — BLOCKED

Brak jakichkolwiek danych dostępowych do celu offsite (drugi NAS/VPS/cloud)
— sprawdzone we wszystkich `.env*` na Macu i QNAP. HBS3 (Hybrid Backup
Sync) zainstalowany jako QPKG, `rsync` dostępny natywnie na hoście QNAP —
oba gotowe jako mechanizm transportu, gdy tylko pojawi się realny cel.
Gotowa komenda (rsync push samych gotowych dumpów, nigdy żywych plików
PGDATA/mongo db) przygotowana w notatkach sesji.

Status: **BLOCKED** — wymaga (a) drugiego NAS/VPS z SSH, (b) konta
cloud wspieranego przez HBS3, albo (c) jawnej akceptacji ryzyka przez
użytkownika.

## 8. Flakowość 1_3 (i szerzej: 1_1/1_2) — root cause znaleziony

**1_3 samodzielnie: 3/3 czyste PASS** (`pnpm test:regression:history`,
z `E2E_TEST3_PASSWORD` ustawionym — bez tego testy e2e cicho się
`skip`owały, co też było realnym problemem, teraz udokumentowanym).

W pełnym 4-filarowym audycie (`run-full-release-audit.mjs`) uruchomionym
4 razy pod rząd: run 1 — 1_2 FAIL, run 2 — 1_1 FAIL, run 3 i run 4 — **PASS
wszystkie 4**. Zbadano oba FAIL-e do końca, nie zaakceptowano ich jako
"po prostu flaky":

- Run 1: `ECONNREFUSED 100.117.139.83:12020` w połowie testu 1_2 —
  potwierdzone przez `docker inspect`: obraz `chad-dashboard-test` zmienił
  commit w trakcie przebiegu (równoległa sesja zrobiła redeploy QNAP TEST
  dokładnie w tym oknie czasowym).
- Run 2: `ERR_CONNECTION_REFUSED localhost:12020` w 1_1 — potwierdzone:
  kontener `chad-dashboard-local-mac-docker` miał "Up 3 minutes" tuż po
  awarii (równoległa sesja przebudowała LOCAL dashboard w tym oknie).

**Root cause: zewnętrzna kolizja z równoległym redeployem współdzielonego
środowiska (LOCAL i QNAP TEST), nie race condition/cleanup/kolejność
testów w samym kodzie testów.** 1_3 nigdy nie zawiodło w żadnym z 4 pełnych
przebiegów ani w 3 samodzielnych — 7/7 czystych. Nie zwiększano żadnych
timeoutów — poprawka to zrozumienie przyczyny, nie maskowanie.

## 9. Pełny finalny audit (`pnpm test:regression:release-audit`)

| | run 1 | run 2 | run 3 | run 4 |
|---|---|---|---|---|
| 1_1_data-protection | PASS | **FAIL** (zewn. LOCAL redeploy) | PASS | PASS |
| 1_2_google-sheets-sync | **FAIL** (zewn. QNAP TEST redeploy) | PASS | PASS | PASS |
| 1_3_history-integrity | PASS | PASS | PASS | PASS |
| 1_4_tables-release | PASS | PASS | PASS | PASS |
| exit code | 1 | 1 | **0** | **0** |

**Run 3 i run 4: dwa kolejne pełne, czyste audyty z exit code 0** (wymóg
sekcji 15 spełniony).

## 10. Live smoke test TEST

- login jako admin (`pawel_f`) i test user (`test3`) — PASS
- session tampering (flip HMAC) → odrzucone — PASS
- admin API RBAC: `test3` (user) → 403, `pawel_f` (admin) → 200 — PASS (po
  naprawie realnej luki)
- Google Sheets info (read-only, pawel_f/test2/test3) — PASS
- reveal-password reauth — PASS (sekcja 2, `test:e2e:reveal-password-reauth`)
- Daily/Dates create/update/delete (test3) — PASS (w ramach 1_4)
- History — PASS (w ramach 1_3)
- outbox (create→update→delete lifecycle) — PASS (w ramach 1_2)
- Google Sheets reconciliation — PASS (`reconcile-real-users.test.mjs`, w ramach 1_2)
- Beeper connectivity — TCP do `beeper-mongodb:27017` z kontenera dashboardu
  potwierdzone (`TCP_OK`), kontener `healthy`; jeden konkretny endpoint
  Dev Panel (`/api/beeper-crm/contacts` przez `dev-db-override.ts`) zwrócił
  500 — to plik aktywnie edytowany przez równoległą sesję (WIP nad
  przełącznikiem Mongo Server/Local), poza zakresem tego audytu, nie
  regresja z tej sesji
- **restart shared DB stack** — wykonany naprawdę (sekcja 3, migracja do
  `cp_1`): `chad-postgres` + `beeper-mongodb` zatrzymane, dane przeniesione,
  uruchomione ponownie na nowej ścieżce — health PASS, counts identyczne
- restart TEST dashboard — wykonany wielokrotnie (redeploye + restart po
  migracji), za każdym razem wracał zdrowy
- **restart PROD dashboard** — wykonany raz, w ramach migracji storage;
  **wymagał jawnej zgody użytkownika** (Claude Code auto-mode classifier
  zablokował akcję dotykającą PROD, mimo że to tylko restart istniejącego
  kontenera na tym samym obrazie, bez żadnego nowego kodu) — zgoda
  uzyskana, wykonano, PROD zdrowy po restarcie
- ponowny login i odczyt danych po redeployach/restartach — PASS
  (wielokrotnie potwierdzone, także po migracji storage)

Destructive automation: `test2` (nie użyty destrukcyjnie w tej sesji poza
Sheets test check — read-only). Limited/CRUD automation: `test3` (Daily/
Dates create+delete przez istniejące testy). Real users (`pawel_f`,
`kamil_s`): wyłącznie read-only.

## 11. Werdykt

# NOT READY FOR BOSS

Uzasadnienie (sekcja 15 — wszystkie warunki muszą być spełnione
jednocześnie; prawie wszystkie są, ale nie wszystkie):

**Spełnione:**
- SESSION_SIGNING_SECRET wdrożony i zweryfikowany na żywo — PASS
- auth/session/RBAC (włącznie z realną luką `/api/admin/users`, naprawioną) — PASS
- 1_1, 1_2, 1_3, 1_4 — PASS
- dwa pełne audyty z exit code 0 (run 3, run 4) — PASS
- PostgreSQL i Beeper Mongo fizycznie przeniesione do `/share/cp_1/chad-data/...` — PASS (patrz sekcja 3: pre/post counts identyczne, rollback copy read-only zabezpieczona)
- PostgreSQL backup + Mongo backup — PASS (realnie wykonane, nie tylko istnienie skryptu)
- PostgreSQL restore drill + Mongo restore drill — PASS
- TEST i PROD live smoke po migracji — PASS
- brak deployu nowego kodu na PROD — potwierdzone (PROD restartowany raz,
  na tym samym już-działającym obrazie, wyłącznie żeby dokończyć migrację
  storage zleconą wprost przez użytkownika; jawna zgoda uzyskana przed
  wykonaniem, po zablokowaniu przez auto-mode classifier)

**Niespełnione:**
- Gmail secrets: `test2` nadal BLOCKED (brak 2 zmiennych) — `pawel_f`/`test3` już PASS
- Snapshot: MANUAL ACTION REQUIRED (nie skonfigurowany — brak działających danych QCLI)
- Offsite backup: BLOCKED (brak celu/credentiali)

**Rekomendacja co do PROD: nie wdrażać.** System jest teraz w bardzo dobrym
stanie — realna luka RBAC (`/api/admin/users`) i luka w middleware
(sygnatura vs. obecność) zostały znalezione i naprawione DOPIERO w tej
sesji, na żywo zweryfikowane; backup+restore dla obu baz danych działa
naprawdę (nie tylko na papierze); flakowość testów została wyjaśniona do
konkretnej, zewnętrznej przyczyny. Pozostają trzy jasno nazwane, wąskie
braki (2 zmienne env dla `test2`, snapshot GUI, cel offsite) — żaden z nich
nie jest błędem w kodzie, wszystkie wymagają jednej konkretnej rzeczy od
użytkownika.
