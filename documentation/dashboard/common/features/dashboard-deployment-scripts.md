# Dashboard stack deployment — docker-compose (`bash-scripts/dashboard/03-06`)

Status: struktura + kontrakt skryptów ustalone 2026-07-11, niezweryfikowane
jeszcze end-to-end na realnym QNAP (tylko lokalnie na Macu, patrz sekcja
"Weryfikacja" niżej).

## Czym to jest

Pełny stack dashboardu (mongo + content-provider-api + dashboard frontend)
sterowany **docker-compose**, w tej samej konwencji `build/start/end/deploy/
status` co już wcześniej sprawdzona w
`packages/net-content-provider/03_scripts/qnap/*.sh` (osobny, niezależny
system — patrz niżej "Różnica względem net-content-provider").

Struktura katalogów:

```
bash-scripts/dashboard/
├── 02_local_mac/          # tmux/pnpm, BEZ Dockera (istniejące, nie-Compose)
├── 03_local_mac_docker/   # docker-compose.local.yml
├── 04_qnap_test/          # docker-compose.qnap.yml (ENV_NAME=test)
├── 05_qnap_prod/          # docker-compose.qnap.yml (ENV_NAME=prod, wymaga osobnej zgody na realny deploy)
└── 06_qnap_ssh/           # cienkie wrappery SSH nad 04_qnap_test / 05_qnap_prod
```

Każdy z `03_local_mac_docker`, `04_qnap_test`, `05_qnap_prod` ma identyczny
zestaw 5 skryptów: `01_build.sh`, `02_start.sh`, `03_end.sh`, `04_deploy.sh`,
`05_status.sh`.

### Tylko dwa pliki Compose, nie cztery

Celowo **jeden** `docker-compose.qnap.yml` dla TEST i PROD (nie osobne
`docker-compose.qnap-test.yml`/`docker-compose.qnap-prod.yml`), i **jeden**
`docker-compose.local.yml` dla local-mac-docker. TEST/PROD różni WYŁĄCZNIE
to, który skrypt (`04_qnap_test/*.sh` vs `05_qnap_prod/*.sh`) uruchamia ten
sam plik — każdy z nich ma na sztywno wpisane w sobie (nie w osobnym pliku
konfiguracyjnym, nie przez parametr z linii poleceń przekazywany przez
człowieka) `COMPOSE_PROJECT_NAME`, `ENV_NAME` (`test`/`prod` — steruje
`container_name`/nazwami wolumenów w `docker-compose.qnap.yml` przez
interpolację `${ENV_NAME}`) oraz porty (`DASHBOARD_PORT`,
`CONTENT_PROVIDER_API_PORT`, `MONGODB_PORT`), i `export`uje je tuż przed
wywołaniem `docker compose`. To jedyny sposób, żeby jeden plik Compose
obsłużył dwa środowiska — ale wartości same w sobie żyją w skryptach, nie w
`.env.qnap` ani w osobnym pliku config.

### Porty — NIE w `.env`

`.env.local`/`.env.qnap` zawierają wyłącznie rzeczy zależne od środowiska
(hosty, ścieżki, użytkownicy, hasła, klucze API, katalogi danych, Dropbox,
QNAP, MongoDB credentials) — nigdy porty TEST/PROD. Porty są wpisane
bezpośrednio w skryptach każdego katalogu (`04_qnap_test/*.sh` ma porty
TEST, `05_qnap_prod/*.sh` ma porty PROD).

## Zasady działania skryptów deploymentowych

### `01_build.sh`

Służy **wyłącznie** do budowania nowych obrazów Docker.

Nie może:
- uruchamiać kontenerów,
- zatrzymywać działającego środowiska,
- wykonywać `docker compose up`,
- usuwać wolumenów ani danych.

Każdy build tworzy obrazy z dwoma tagami:
- `latest`
- tag czasowy w formacie `YYMMDD_HHMMSS` (np. `260511_041130`)

Przykład: `chad-dashboard:latest`, `chad-dashboard:260511_041130`.

**Celowo bez** nazwy środowiska/architektury w tagu (`_test`, `_prod`, `_mac`,
`_linux`) — środowisko jest rozróżniane przez nazwę projektu Compose
(`chad-local` / `chad-test` / `chad-prod`), porty, nazwy kontenerów i katalog
skryptów, nie przez tag obrazu. To celowo inaczej niż
`packages/net-content-provider/03_scripts/qnap/build_qnap_test.sh`, który
taguje `_mac`/`_linux` — tam to ma sens (binarka .NET, realne ryzyko
niekompatybilności architektury przy emulacji cross-platform); dla obrazu
Next.js budowanego z wymuszoną platformą `linux/amd64` (przez Docker Desktop
na Macu i natywnie na QNAP) taki suffix nie jest potrzebny. Jeśli
`content-provider-api` (też .NET, budowany też w tym stacku) kiedyś sprawi
problem cross-arch, tag można rozszerzyć wtedy — nie teraz, żeby nie
komplikować bez potwierdzonej potrzeby.

### `02_start.sh`

Służy **wyłącznie** do uruchamiania już zbudowanych obrazów. Nie buduje.

Przed startem sprawdza, czy stack już działa
(`docker compose ps --format json | grep '"Running":true'`). Jeśli tak:
1. woła `03_end.sh` (zatrzymuje i usuwa kontenery przez `docker compose down
   --remove-orphans` — bez `-v`, bind mounty/named volumes/dane zostają),
2. dopiero potem `docker compose up -d`.

Nigdy nie używa `docker compose down -v`, `docker system prune`, ani
szerokiego usuwania obrazów/kontenerów — i nigdy nie dotyka drugiego
środowiska (każdy skrypt jest zakresowany `-p <compose-project-name>`).

Po starcie sprawdza healthcheck `content-provider-api` (`/health`,
`anyRepoFound:true`) i odpowiedź HTTP dashboardu.

### `03_end.sh`

Zatrzymuje i usuwa **wyłącznie** kontenery/sieć/zasoby tymczasowe należące do
danego projektu Compose: `docker compose -p <project> down --remove-orphans`.
Nigdy `-v` (dane Mongo/dashboardu muszą przetrwać). Nigdy nie usuwa obrazów —
zostają dostępne do ponownego `02_start.sh`.

### `04_deploy.sh`

Pełny deployment nowej wersji: `01_build.sh` → `02_start.sh` → `05_status.sh`.
Nie woła osobno `03_end.sh` — `02_start.sh` sam wykrywa działający stack i
robi to za niego.

### `05_status.sh`

Pokazuje `docker compose ps`, sprawdza healthcheck content-provider-api,
sprawdza odpowiedź HTTP dashboardu. Nie zmienia stanu środowiska.

## Różnica względem `packages/net-content-provider/03_scripts/qnap/*.sh`

To DWA NIEZALEŻNE systemy, celowo:
- `packages/net-content-provider/03_scripts/qnap/*.sh` — samodzielny
  content-provider-api + Blazor GUI, bez mongo, bez dashboardu, sterowany
  plain `docker run` (nie Compose). Pozostaje nietknięty przez tę pracę.
- `bash-scripts/dashboard/{03,04,05}_*` (ten dokument) — pełny stack
  dashboardu (mongo + content-provider-api + dashboard frontend), sterowany
  docker-compose.

Oba mogą współistnieć na tym samym QNAP, ale domyślnie nachodzą na port 12020
(Blazor net-content-provider vs dashboard test na 12025 — patrz
`.env.qnap.example` dla dokładnych portów).

## `06_qnap_ssh` — SSH nad 04/05

Cienkie wrappery: łączą się SSH, `cd $QNAP_REPO_DIR && git pull --ff-only`,
i wołają realny skrypt z `04_qnap_test/` lub `05_qnap_prod/` — bez
duplikowania logiki deploymentu. Host/user/port/repo-dir/hasło pochodzą z
`.env.qnap` (root, gitignored), nigdy hardcoded w skryptach
(`bash-scripts/dashboard/06_qnap_ssh/lib.sh`).

`deploy_prod.sh` i `start_prod.sh` wymagają wpisania `PROD` do potwierdzenia
— to prawdziwy deployment produkcyjny, nie próba.

## Weryfikacja

Zrobione: `docker compose config` syntax-check na obu `docker-compose.*.yml`
(`local.yml`, `qnap.yml` — dla `qnap.yml` sprawdzone z `ENV_NAME=test` i
`ENV_NAME=prod` osobno) przeszedł.

**Zablokowane 2026-07-11**: realny `01_build.sh` (local-mac-docker) doszedł
do etapu `pnpm --filter dashboard exec prisma generate` (czyli: `dba` się
zbudowało, `pnpm install` w kontekście całego monorepo zadziałało — Bug 1 z
poprzedniej sekcji faktycznie naprawiony), ale przerwał się na błędzie
BuildKit `error committing ...: write /var/lib/docker/buildkit/metadata_v2.db:
input/output error`. Przyczyna: dysk Maca był praktycznie pełny (56MB wolne
z 460GB, `df -h /` pokazywał 100% capacity) — to problem środowiska
(miejsce na dysku), nie bug w Dockerfile/skryptach. Nie próbowano żadnego
czyszczenia (`docker system prune` itp.) bez wyraźnej zgody użytkownika.
Realny end-to-end test (`01_build.sh` → `02_start.sh` → idempotentny
restart → `03_end.sh` z zachowaniem danych) do powtórzenia po zwolnieniu
miejsca na dysku.

Nie zrobione: żaden test na realnym QNAP (brak SSH w tej sesji) —
`04_qnap_test`/`05_qnap_prod` nieprzetestowane end-to-end poza lokalną
walidacją składni Compose.
