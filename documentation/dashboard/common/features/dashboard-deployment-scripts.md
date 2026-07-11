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

Oba mogą współistnieć na tym samym QNAP, ale lokalnie na Macu domyślnie
nachodzą na porty 12020/12024 (Blazor/API net-content-provider vs
dashboard local-mac-docker — potwierdzone realnym konfliktem portów podczas
weryfikacji 2026-07-11, patrz sekcja "Weryfikacja" niżej).

## `06_qnap_ssh` — SSH nad 04/05

Cienkie wrappery: łączą się SSH, `cd $QNAP_REPO_DIR && git pull --ff-only`,
i wołają realny skrypt z `04_qnap_test/` lub `05_qnap_prod/` — bez
duplikowania logiki deploymentu. Host/user/port/repo-dir/hasło pochodzą z
`.env.qnap` (root, gitignored), nigdy hardcoded w skryptach
(`bash-scripts/dashboard/06_qnap_ssh/lib.sh`).

`deploy_prod.sh` i `start_prod.sh` wymagają wpisania `PROD` do potwierdzenia
— to prawdziwy deployment produkcyjny, nie próba.

## Weryfikacja

**Zrobione i przechodzi (2026-07-11), lokalnie na Macu,
`03_local_mac_docker`, pełny cykl:** `02_build.sh` → `03_begin.sh` →
`05_status.sh` → `03_begin.sh` ponownie (idempotentny restart) →
`04_end.sh` → `06_deploy.sh`. Wszystkie 6 kroków przeszły z realnym
`docker compose` (nie tylko `config` syntax-check) — content-provider-api
zdrowe z realnymi danymi repo (`anyRepoFound:true`), dashboard odpowiada
HTTP, dane w wolumenach przetrwały restart.

Po drodze wcześniejsza próba (przed zwolnieniem miejsca na dysku)
odsłoniła i doprowadziła do naprawy trzech realnych bugów, nie tylko
problemu z dyskiem:

1. `packages/dashboard/lib/chad-dba/client.ts` i `packages/dba/src/client.ts`
   rzucały `"CONTENT_PROVIDER_API_URL environment variable is not set"`
   na poziomie modułu (import-time) — Next.js importuje te moduły podczas
   `next build`'s page-data collection, zanim docker-compose wstrzyknie
   zmienną w runtime, więc KAŻDY build padał niezależnie od realnej
   konfiguracji. Naprawa: odczyt zmiennej przeniesiony do wewnątrz
   funkcji (lazy), ten sam błąd/komunikat, tylko odroczony do faktycznego
   wywołania.
2. Healthcheck `content-provider-api` w obu plikach Compose używał
   `wget`, którego nie ma w obrazie `mcr.microsoft.com/dotnet/aspnet:8.0`
   (ani `curl`) — potwierdzone: `docker exec ... which wget` nic nie
   zwraca. Kontener był trwale "unhealthy", co blokowało `dashboard`'s
   `depends_on: condition: service_healthy`. `packages/net-content-provider`'s
   własne, sprawdzone skrypty też nie używają healthchecka w kontenerze —
   sprawdzają `/health` z hosta po `docker run`. Usunięto healthcheck,
   zmieniono `depends_on` na `condition: service_started`, realną bramkę
   zdrowia robi (niezmieniony) polling curl w `03_begin.sh`.
3. Wszystkie trzy `03_begin.sh` sprawdzały `docker compose ps --format
   json | grep -q '"Running":true'` żeby wykryć już działający stack —
   ale ta wersja Docker Compose (2.31.0) zwraca `"State":"running"`, nie
   `"Running":true`. Sprawdzenie nigdy nie trafiało, więc gałąź
   idempotentnego restartu (stop przez `04_end.sh` przed ponownym
   startem) nigdy się nie wykonywała. Naprawiono wzorzec grep,
   potwierdzono realnym testem że restart faktycznie się teraz wykonuje.

Nie zrobione: żaden test na realnym QNAP (brak SSH w tej sesji) —
`04_qnap_test`/`05_qnap_prod` nieprzetestowane end-to-end poza lokalną
walidacją składni Compose (`docker compose config` z `ENV_NAME=test` i
`ENV_NAME=prod`). Bugi 1 i 3 dotyczą też QNAP (ten sam kod) — naprawione
tam też, ale nie zweryfikowane realnym uruchomieniem na QNAP.
