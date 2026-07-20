# Shared QNAP services: one MongoDB + one Content Provider for TEST and PROD

Status: wdrożone i zweryfikowane na realnym QNAP (s12, `100.117.139.83`),
2026-07-11.

## 1. Problem poprzedniej architektury

Do 2026-07-11 QNAP TEST i QNAP PROD były uruchamiane z jednego pliku
`docker-compose.qnap.yml`, ale **każde środowisko miało własne, osobne
MongoDB i własny, osobny Content Provider**:
`chad-mongodb-test`/`chad-mongodb-prod`,
`chad-content-provider-api-test`/`chad-content-provider-api-prod`, każdy z
osobnym bind mountem danych Mongo (`chad-{test,prod}/mongodb/db`).

To nie odpowiadało rzeczywistemu wymaganiu biznesowemu: **TEST nie jest
izolowanym środowiskiem danych** — ma być alternatywnym/testowym interfejsem
do dokładnie tych samych, prawdziwych danych co PROD, używanym do
weryfikacji wyglądu, layoutu, scrollbarów, edytorów, formularzy i
responsywności bez ryzyka dla dostępności PROD. Zmiana danych wykonana przez
dashboard TEST ma być widoczna również w PROD.

Dodatkowo, w trakcie analizy odkryto, że faktyczny "PROD" na portach
12030/12034 wcale nie był tą samą aplikacją co TEST — to był osobny, starszy
deployment (`personal-dashboard-prod` + `content-provider-api-prod`,
niepowiązany z tym monorepo, czytający z **`/share/cp_1`**, nie
`/share/Dropbox`, danymi w SQLite przez Prisma). Właściciel potwierdził, że
ten stary system jest nieaktualny/hobbistyczny i może zostać zastąpiony.
`/share/cp_1` jest przestarzałą ścieżką i **nie jest już używana nigdzie w
tej architekturze**.

## 2. Decyzja architektoniczna

Jedno wspólne MongoDB i jeden wspólny Content Provider dla obu środowisk;
osobne kontenery tylko dla dashboardu:

```
dashboard TEST (chad-dashboard-test, port 12020)
    │
    ├──► chad-content-provider-api (port 12024) ──► /share/Dropbox (36 repo)
    └──► chad-mongodb (wewnętrznie, brak portu hosta)

dashboard PROD (chad-dashboard-prod, port 12030)
    │
    ├──► chad-content-provider-api (TEN SAM kontener, port 12024)
    └──► chad-mongodb (TEN SAM kontener)
```

## 3. Podział compose

| Plik | Serwisy | Uruchamiany przez |
|---|---|---|
| `docker-compose.qnap.shared.yml` | `mongodb` (`chad-mongodb`), `content-provider-api` (`chad-content-provider-api`) | `bash-scripts/dashboard/00_qnap_shared/*.sh` |
| `docker-compose.qnap.test.yml` | `dashboard` (`chad-dashboard-test`) | `bash-scripts/dashboard/04_qnap_test/*.sh` |
| `docker-compose.qnap.prod.yml` | `dashboard` (`chad-dashboard-prod`) | `bash-scripts/dashboard/05_qnap_prod/*.sh` |

Trzy osobne projekty Compose (`-p chad-shared`/`chad-test`/`chad-prod`),
połączone jedną **zewnętrzną** siecią Docker `chad-shared` (tworzoną
idempotentnie przez `ensure_docker_network()` w `bash-scripts/common/lib.sh`).
Pełny opis konwencji skryptów (`build`/`restart`/`end`/`status`/`deploy`,
`require_shared_services_healthy` preflight, DNS przez `container_name`
zamiast nazwy serwisu) w
`documentation/ai-docs/deploy/dashboard-deployment-scripts.md`.

## 4. Sieć, mounty, porty (bez sekretów)

**Sieć:** `chad-shared` (external, bridge).

**Nazwy kontenerów:** `chad-mongodb`, `chad-content-provider-api`,
`chad-dashboard-test`, `chad-dashboard-prod`.

**Mounty:**

| Kontener | Bind mount |
|---|---|
| `chad-mongodb` | `$QNAP_CONTAINER_DATA_PATH/chad-shared/mongodb/db:/data/db`, `.../configdb:/data/configdb`, `.../backups:/backups` — `$QNAP_CONTAINER_DATA_PATH` MUST resolve onto the real data volume, not `/share` itself (a 16MB tmpfs on this QNAP); see [qnap-data-path.md](qnap-data-path.md) for the incident and the validation `03_re-start.sh` now runs before every start |
| `chad-content-provider-api` | `/share/Dropbox:/data/repos:rw` (potwierdzone: `repoCount:36`), `.runtime/shared/content-provider/appsettings.json:/app/appsettings.json:ro` |
| `chad-dashboard-test` | named volume `chad-dashboard-qnap-test-data:/app/data` (SQLite Prisma, per-dashboard, nie Mongo) |
| `chad-dashboard-prod` | named volume `chad-dashboard-qnap-prod-data:/app/data` (osobny od test — świadomie, to lokalna baza sesji dashboardu, nie "prawdziwe dane" biznesowe) |

**Porty:**

| Usługa | Port |
|---|---|
| Content Provider API | `12024` (publikowany na host) |
| MongoDB | brak publikowanego portu hosta — tylko `chad-mongodb:27017` wewnątrz sieci `chad-shared` |
| Dashboard TEST | `12020` |
| Dashboard PROD | `12030` |

**Connection string (bez sekretów):** dashboardy łączą się z Content
Providerem przez `CONTENT_PROVIDER_API_URL=http://chad-content-provider-api:12024`
(container_name, nie nazwa serwisu — patrz uzasadnienie w
`dashboard-deployment-scripts.md`, sekcja "DNS między osobnymi projektami
Compose"). MongoDB: standalone z auth
(`MONGO_INITDB_ROOT_USERNAME`/`PASSWORD` z `.env.qnap`), **bez** replica set,
**bez** `--keyFile`, **bez** `replicaSet=rs0` w connection stringu — patrz
`documentation/ai-docs/deploy/2026-07-10_mongodb-replica-set-migration-plan.md`
(replica set pozostaje nieużywany, gated za osobną zgodą).

Na dzień wdrożenia (2026-07-11) `packages/dashboard`/`packages/dba` **jeszcze
nie konsumują MongoDB w kodzie** — Mongo jest infrastrukturą przygotowaną pod
przyszłe feature'y (`content_provider_files`, `Folders`, `daily habits`,
`dates` — patrz `documentation/ai-docs/26-07-10_cline_prompt_mongodb_qnap_folders_v3.md`).
Obie bazy danych, gdy zaczną być używane, mają wskazywać na tę samą nazwę
bazy w tym samym `chad-mongodb` — nie ma dziś osobnego kodu do zweryfikowania
tego twierdzenia poza samą infrastrukturą (jeden kontener, jedna sieć).

## 5. Procedura deploy

```bash
# Shared (mongo + content-provider-api) — bezpośrednio na QNAP przez SSH,
# bez dedykowanego wrappera (świadoma decyzja, Story 63): SSH na QNAP, potem
bash bash-scripts/dashboard/00_qnap_shared/06_deploy.sh   # dotyka OBU dashboardów naraz

# TEST — jedyne środowisko, które buduje; nie restartuje shared;
# ma Git preflight (ostrzega o niezacommitowanych/niewypchniętych zmianach)
bash bash-scripts/dashboard/06_qnap_test_ssh/06_deploy.sh

# PROD — nigdy nie buduje. Promuje dokładnie obraz zweryfikowany na TEST,
# wymaga wpisania PROD:
bash bash-scripts/dashboard/07_qnap_prod_ssh/06_last_from_test.sh
```

Każdy `03_re-start.sh` dla TEST/PROD wywołuje `require_shared_services_healthy`
przed startem i **odmawia uruchomienia**, jeśli shared nie działa/nie jest
zdrowy — zamiast próbować go naprawić samodzielnie.

## 6. Procedura promocji obrazu TEST → PROD

**Status (Story 63, 2026-07-16/17): jawna operacja
`07_qnap_prod_ssh/06_last_from_test.sh`, zastępuje wcześniejszą "domyślną"
promocję przez współdzielony plik tagu.** Pełny standard:
[image-tagging-standard.md](../bash-scripts/image-tagging-standard.md). Skrót:

- `04_qnap_test/02_build.sh` jest teraz **jedynym** miejscem, gdzie
  `chad-dashboard` jest budowany (`05_qnap_prod/02_build.sh` zostało
  usunięte w Story 63 — PROD nie może już budować niezależnie, nawet
  ręcznie: `docker-compose.qnap.prod.yml` nie ma sekcji `build:`). Po
  udanym buildzie zapisuje znacznik czasowy do `.image-tag.chad-dashboard.env`
  (gitignored, na hoście QNAP) oraz git SHA jako OCI label na obrazie.
- `03_re-start.sh` w obu katalogach **odmawia startu**, jeśli ten plik nie
  istnieje albo jest pusty — nigdy nie ma fallbacku do `chad-dashboard:latest`.
- Promocja "sprawdzonego" obrazu TEST na PROD = **bez rebuildu**, przez
  jawną operację, nie przez poleganie na tym, że oba środowiska czytają ten
  sam plik:

```bash
# 1) zbuduj i uruchom TEST
bash bash-scripts/dashboard/06_qnap_test_ssh/06_deploy.sh

# 2) wypromuj DOKŁADNIE ten obraz na PROD — pokazuje tag/image ID/git SHA
#    TEST i aktualny obraz PROD, prosi o potwierdzenie (PROD), nie buduje nic
bash bash-scripts/dashboard/07_qnap_prod_ssh/06_last_from_test.sh
```

Po tym `docker inspect chad-dashboard-test`/`chad-dashboard-prod` pokazują
identyczny `Image` (ten sam tag, ten sam ID) — `06_last_from_test.sh`
potwierdza to jawnie na końcu, nie zakłada sukcesu.

## 7. Procedura rollbacku

- Dashboard TEST/PROD: `06_qnap_test_ssh/04_end.sh`/`07_qnap_prod_ssh/04_end.sh`
  (`docker compose down --remove-orphans`, nigdy `-v`) — dane dashboardu
  (SQLite) i obrazy zostają. Retag poprzedniego znacznika czasowego jako
  bieżący i ponowny `03_re-start.sh`.
- Shared: `00_qnap_shared/04_end.sh` (bezpośrednio na QNAP, patrz sekcja 5) —
  **zatrzymuje backend dla OBU dashboardów naraz**. Dane Mongo (bind mount)
  i repo pliki (`/share/Dropbox`, poza kontenerem) przetrwają.
- Backup logiczny Mongo: `MONGO_CONTAINER_NAME=chad-mongodb bash
  bash-scripts/mongo/backup.sh` (mongodump do `.../mongodb/backups`, na tym
  samym trwałym bind moуncie).
- Legacy `personal-dashboard-prod`/`content-provider-api-prod` (zastąpione):
  `docker inspect` przed usunięciem zapisany w
  `.runtime/backups/2026-07-11_legacy-prod/docker-inspect.json` na QNAP
  (gitignored). Wolumen `personal-dashboard-qnap-prod-data` i katalog
  `/share/cp_1` **nie zostały skasowane** — pozostają na dysku jako
  nieużywany, ale odzyskiwalny stan, gdyby ktoś chciał do niego wrócić
  (nieprawdopodobne, potwierdzone jako nieważny system hobbistyczny).

## 8. Ostrzeżenie o wspólnych danych

**TEST nie jest sandboxem.** Dashboard TEST i PROD czytają/zapisują do tego
samego Content Providera (`/share/Dropbox`) i — gdy Mongo zacznie być
konsumowane — tego samego MongoDB. Zmiana danych w TEST jest natychmiast
widoczna w PROD. TEST służy wyłącznie do:
- weryfikacji, czy wygląd/layout dashboardu się nie zepsuł,
- sprawdzania scrollbarów, edytorów, formularzy, responsywności,
- testowania integracji dashboardu z Content Providerem/Mongo,

**nie** do eksperymentowania z danymi testowymi bez konsekwencji dla PROD.

## 9. Wyniki faktycznych testów (2026-07-11, realny QNAP)

| Test | Wynik |
|---|---|
| `docker ps -a` po deployu | dokładnie 4 kontenery `chad-*`: `chad-mongodb`, `chad-content-provider-api`, `chad-dashboard-test`, `chad-dashboard-prod` — brak duplikatu Mongo/CP |
| `chad-mongodb` health | `healthy` (uwierzytelniony ping, standalone, bez replica set) |
| `chad-content-provider-api` `/health` | `{"status":"ok","repoCount":36,"anyRepoFound":true}` — dane z `/share/Dropbox` |
| Mount `chad-content-provider-api` | `/share/Dropbox -> /data/repos` (potwierdzone `docker inspect`, NIE `/share/cp_1`) |
| Mount `chad-mongodb` | `/share/ContainerData/chad-shared/mongodb/{db,configdb,backups}` |
| `chad-dashboard-test` i `chad-dashboard-prod` — `CONTENT_PROVIDER_API_URL` | identyczna wartość u obu: `http://chad-content-provider-api:12024` |
| `chad-dashboard-test` i `chad-dashboard-prod` — sieć | oba na `chad-shared` |
| HTTP `chad-dashboard-test` (12020) | `307` (redirect do `/login`, aplikacja odpowiada) |
| HTTP `chad-dashboard-prod` (12030) | `307` (redirect do `/login`, aplikacja odpowiada) |
| Deploy TEST (`begin_test.sh`) | nie restartował `chad-mongodb`/`chad-content-provider-api` (potwierdzone: brak "Creating/Starting" tych kontenerów w logu) |
| Deploy PROD (`begin_prod.sh`) | jw. |
| Legacy `personal-dashboard-prod`/`content-provider-api-prod` | zatrzymane i usunięte, dane na dysku (`personal-dashboard-qnap-prod-data`, `/share/cp_1`) nienaruszone |
| Stary stack `chad-test` (osobne mongo/CP na środowisko) | usunięty przez `docker compose down --remove-orphans` (dane na bind moуncie `chad-test/mongodb/db` nienaruszone, ale porzucone — było puste: 0 aplikacyjnych baz) |

**Aktualizacja 2026-07-13:** powyższy wiersz "Mount `chad-mongodb`" odzwierciedla
stan z 2026-07-11 (`QNAP_CONTAINER_DATA_PATH=/share/ContainerData`) —
zachowany jako historyczny zapis testu. Ten konkretny katalog okazał się leżeć
na 16MB tmpfs (`/share` samo w sobie), co spowodowało crash-loop
`chad-mongodb` (`WT_PANIC: No space left on device`). Naprawione zmianą
`QNAP_CONTAINER_DATA_PATH` na `/share/CACHEDEV1_DATA/ContainerData` (prawdziwy
wolumen 4.5TB) — pełny opis incydentu, przyczyny i skryptowej walidacji, która
teraz to wykrywa przed startem: [qnap-data-path.md](qnap-data-path.md).

## 10a. Troubleshooting — `DirectoryNotFoundException` dla ścieżki repo/GUID

Objaw: Dashboard zwraca błąd typu (przez `PostByNames`/`ReadManyWorker`):

```
DirectoryNotFoundException: Could not find a part of the path
'/data/repos/repos/<guid>'.
```

**Podwójny segment `repos/repos` (albo `repos2/repos`) jest ZAMIERZONY, nie
błędem** — `CP_REPOS_HOST_PATH`/`CP_REPOS_HOST_PATH_2` (`.env.qnap`) to
korzenie kont Dropbox (`/share/Dropbox/pawelpanda2`,
`/share/Dropbox/kamilgame042`), zamontowane odpowiednio jako `/data/repos`/
`/data/repos2` — każdy z własnym podfolderem `repos/` w środku (Story 68,
`GuidGroupsHelper` w `packages/net-content-provider` nie dodaje już `repos`
samodzielnie, więc musi być w skonfigurowanej ścieżce). Nie "napraw" tego
usuwając segment z configu.

Zanim założysz stały bug w kodzie/konfiguracji albo zrestartujesz
`chad-content-provider-api` "na wszelki wypadek" (restart dotyka OBU
środowisk naraz, patrz sekcja 8), zweryfikuj przez SSH na żywym hoście:

```bash
# 1) Czy /health w ogóle widzi oba korzenie repo jako dostępne
curl -s http://100.117.139.83:12024/health
# oczekiwane: obie ścieżki w "pathDiagnostics" mają "exists":true, "accessible":true

# 2) Czy konkretny GUID faktycznie istnieje na dysku (nie w configu/kodzie)
ssh <user>@100.117.139.83 "ls /share/Dropbox/pawelpanda2/repos | grep <guid>"
ssh <user>@100.117.139.83 "ls /share/Dropbox/kamilgame042/repos | grep <guid>"
```

Jeśli `/health` raportuje oba korzenie jako dostępne, ale konkretny GUID
akurat nie był widoczny w momencie błędu — najbardziej prawdopodobna
przyczyna to **opóźnienie synchronizacji Dropbox** (folder jeszcze nie
zmaterializował się fizycznie na QNAP w chwili żądania z Dashboardu), nie
stały problem. Zweryfikowane 2026-07-18: folder istniał na dysku i
`/health` raportował go poprawnie zaledwie chwilę po zgłoszonym błędzie,
bez żadnej zmiany configu/kodu/restartu. Jeśli błąd **utrzymuje się**
mimo że `ls` na hoście potwierdza istnienie folderu — to dopiero wtedy
sygnał do głębszej diagnozy (a nie zgadywania z pamięci dokumentacji).

## 10. Znane ograniczenia / co zostało do decyzji

- ~~Promocja obrazu TEST→PROD jest ręczna (retag), bez dedykowanego skryptu~~
  — **zrobione 2026-07-13**: `02_build.sh`/`03_re-start.sh` zapisują i czytają
  wspólny plik ze znacznikiem release'u, bez `:latest`, bez ponownego builda
  przy promocji. Patrz sekcja 6 i [image-tagging-standard.md](../bash-scripts/image-tagging-standard.md).
- MongoDB nie jest jeszcze konsumowane przez kod dashboardu/`dba` — "wspólna
  baza danych" jest dziś prawdą infrastrukturalną (jeden kontener), nie
  jeszcze zweryfikowaną w działającym feature'rze aplikacyjnym.
- Stare Docker networks (`chad-test_default`,
  `personal-dashboard-qnap-{test,prod}-network`) i wolumen
  `personal-dashboard-qnap-prod-data`/katalog `/share/cp_1` pozostały na
  QNAP jako nieużywane resztki — świadomie nieusunięte (nie były w zakresie
  tego zadania, dane nie są kasowane bez wyraźnej potrzeby).
- Replica set MongoDB pozostaje niewdrożony — patrz
  `documentation/ai-docs/deploy/2026-07-10_mongodb-replica-set-migration-plan.md`.
- Brak zautomatyzowanego dyskretnego oznaczenia "TEST UI — LIVE DATA" w
  samym UI dashboardu — to zmiana w kodzie frontendu, świadomie pominięta w
  tym zadaniu (zakres: architektura deploymentu, nie UI), do rozważenia jako
  osobne, mniejsze zadanie.
