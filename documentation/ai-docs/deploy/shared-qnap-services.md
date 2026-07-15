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
Pełny opis konwencji skryptów (`build`/`re-start`/`end`/`status`/`deploy`,
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
# Shared (mongo + content-provider-api) — dotyka OBU dashboardów naraz
bash bash-scripts/dashboard/06_qnap_ssh/deploy_shared.sh   # wymaga wpisania SHARED

# TEST — nie restartuje shared
bash bash-scripts/dashboard/06_qnap_ssh/deploy_test.sh

# PROD — nie restartuje shared, wymaga wpisania PROD
bash bash-scripts/dashboard/06_qnap_ssh/deploy_prod.sh
```

Każdy `re-start.sh` dla TEST/PROD wywołuje `require_shared_services_healthy`
przed startem i **odmawia uruchomienia**, jeśli shared nie działa/nie jest
zdrowy — zamiast próbować go naprawić samodzielnie.

## 6. Procedura promocji obrazu TEST → PROD

**Status (2026-07-13): zautomatyzowane przez skrypty, bez `:latest`.** Pełny
standard: [image-tagging-standard.md](image-tagging-standard.md). Skrót:

- `04_qnap_test/02_build.sh` i `05_qnap_prod/02_build.sh` budują dokładnie ten
  sam obraz `chad-dashboard` (identyczny Dockerfile/context/target) i po
  udanym buildzie zapisują znacznik czasowy do jednego, wspólnego pliku
  `.image-tag.chad-dashboard.env` (gitignored, na hoście QNAP).
- `03_re-start.sh` w obu katalogach **odmawia startu**, jeśli ten plik nie
  istnieje albo jest pusty — nigdy nie ma fallbacku do `chad-dashboard:latest`
  (własne obrazy CHAD w ogóle nie dostają już tagu `latest`).
- Promocja "sprawdzonego" obrazu TEST na PROD = **bez rebuildu**, po prostu:

```bash
# 1) zbuduj i uruchom TEST (albo tylko zbuduj, jeśli chcesz najpierw sprawdzić)
bash bash-scripts/dashboard/06_qnap_ssh/deploy_test.sh

# 2) wypromuj DOKŁADNIE ten sam obraz na PROD — czyta ten sam zapisany tag,
#    nie buduje nic ponownie
bash bash-scripts/dashboard/06_qnap_ssh/begin_prod.sh   # wymaga wpisania PROD
```

Po tym `docker inspect chad-dashboard-test`/`chad-dashboard-prod` pokazują
identyczny `Image` (ten sam tag, ten sam ID).

## 7. Procedura rollbacku

- Dashboard TEST/PROD: `end_test.sh`/`end_prod.sh` (`docker compose down
  --remove-orphans`, nigdy `-v`) — dane dashboardu (SQLite) i obrazy
  zostają. Retag poprzedniego znacznika czasowego jako `:latest` i ponowny
  `re-start`.
- Shared: `end_shared.sh` — **zatrzymuje backend dla OBU dashboardów
  naraz**, wymaga wpisania `SHARED`. Dane Mongo (bind mount) i repo pliki
  (`/share/Dropbox`, poza kontenerem) przetrwają.
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

## 10. Znane ograniczenia / co zostało do decyzji

- ~~Promocja obrazu TEST→PROD jest ręczna (retag), bez dedykowanego skryptu~~
  — **zrobione 2026-07-13**: `02_build.sh`/`03_re-start.sh` zapisują i czytają
  wspólny plik ze znacznikiem release'u, bez `:latest`, bez ponownego builda
  przy promocji. Patrz sekcja 6 i [image-tagging-standard.md](image-tagging-standard.md).
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
