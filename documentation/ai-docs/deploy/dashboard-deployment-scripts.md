# Dashboard stack deployment — docker-compose (`bash-scripts/dashboard/00,03-06`)

Status: przebudowane 2026-07-11 na architekturę **shared/test/prod** — jedno
wspólne MongoDB i jeden wspólny Content Provider dla QNAP TEST i QNAP PROD,
osobne kontenery tylko dla dashboardu. Zweryfikowane end-to-end na realnym
QNAP (patrz sekcja "Weryfikacja" niżej).

## Czym to jest

TEST i PROD na QNAP to **dwa osobne dashboardy wskazujące na dokładnie te
same, prawdziwe dane** — jedno wspólne MongoDB (`chad-mongodb`) i jeden
wspólny Content Provider (`chad-content-provider-api`), czytający z
`/share/Dropbox`. TEST **nie jest** izolowanym środowiskiem danych ani
sandboxem — to alternatywny/testowy interfejs do tych samych, prawdziwych
danych, używany do weryfikacji wyglądu, layoutu, scrollbarów, edytorów,
formularzy i integracji dashboardu bez ryzyka dla dostępności PROD. Zmiana
danych wykonana przez dashboard TEST jest widoczna również w PROD.

Struktura katalogów (potwierdzona `ls bash-scripts/dashboard/`, 2026-07-13):

```
bash-scripts/dashboard/
├── 00_qnap_shared/        # docker-compose.qnap.shared.yml (mongo + content-provider-api, wspólne dla TEST i PROD)
├── 02_local_mac_tmux/     # tmux/pnpm, BEZ Dockera — NIESCOMMITOWANE w trakcie tej sesji (patrz niżej)
├── 03_local_mac_docker/   # docker-compose.local.yml (mongo+CP+dashboard razem, tylko lokalnie)
├── 04_qnap_test/          # docker-compose.qnap.test.yml (TYLKO dashboard TEST)
├── 05_qnap_prod/          # docker-compose.qnap.prod.yml (TYLKO dashboard PROD, wymaga osobnej zgody na realny deploy)
└── 06_qnap_ssh/           # cienkie wrappery SSH nad 00_qnap_shared / 04_qnap_test / 05_qnap_prod
```

Każdy z `00_qnap_shared`, `03_local_mac_docker`, `04_qnap_test`, `05_qnap_prod`
ma identyczny zestaw 6 plików: `01_config.sh`, `02_build.sh`, `03_re-start.sh`,
`04_end.sh`, `05_status.sh`, `06_deploy.sh`. Konwencja nazw skryptów w TEJ
rodzinie (Docker Compose) to **build / re-start / end / status / deploy** —
nigdy `start_*`/`stop_*`. Uzasadnienie historyczne (2026-07-10):
`start.sh`/`status.sh`/`stop.sh` wszystkie zaczynały się na literę `s`, co
psuło autouzupełnianie w terminalu (`bash s<TAB>` niejednoznaczne) — stąd
`b`egin / `e`nd / `s`tatus, jednoznaczne skróty. **Zmiana (2026-07-14,
poprawka Story 54): `begin.sh` → `re-start.sh` w całej tej rodzinie** —
patrz sekcja "Niespójność nazewnictwa" niżej dla pełnego kontekstu i
aktualnego stanu po tej zmianie.

**Wyjątek (2026-07-14): `03_local_mac_docker` ma 7 plików, nie 6.** Dodano
`01_port_kill.sh` (patrz niżej), więc pozostałe przesunęły się o jeden numer:
`02_config.sh`, `03_build.sh`, `04_re-start.sh`, `05_end.sh`, `06_status.sh`,
`07_deploy.sh`. `00_qnap_shared`/`04_qnap_test`/`05_qnap_prod` NIE zostały
tknięte — nadal mają dokładnie 6 plików w oryginalnej numeracji `01`-`06`
opisanej wyżej. To drugi udokumentowany wyjątek od wspólnej numeracji obok
`02_local_mac_tmux`'s `01_build.sh`/`02_start.sh` (patrz
dashboard-start-scripts.md) — sprawdzaj zawsze `ls` realnego katalogu, nie
zakładaj numeracji z pamięci.

### `01_port_kill.sh` — automatyczne zwalnianie zajętego portu

CLI: `./01_port_kill.sh <port>`. Cienki wrapper nad `kill_process_on_port()`
z `bash-scripts/common/lib.sh` (logika żyje tam, nie duplikowana tutaj) —
obsługuje oba przypadki: port zajęty przez kontener Docker (zatrzymuje +
usuwa TYLKO ten kontener) albo przez zwykły proces (SIGTERM, odczekanie,
ponowna weryfikacja, SIGKILL dopiero gdy nadal żyje). Zero interaktywnych
pytań — wywoływany automatycznie. Nigdy nie dotyka niczego niezwiązanego z
podanym portem (brak `docker system prune`, brak `pkill`/`killall`).

`04_re-start.sh` wywołuje go automatycznie dla każdego portu z `REQUIRED_PORTS`
(zbudowanego z `DASHBOARD_PORT`/`CONTENT_PROVIDER_API_PORT`/`MONGODB_PORT` w
`02_config.sh` — nigdy nie hardkoduje numerów portów samo) PRZED próbą startu,
zamiast (jak wcześniej) twardo kończyć się błędem `ensure_port_available`
("Not killing it automatically — stop it yourself"). Po zwolnieniu portów
`04_re-start.sh` wywołuje `ensure_port_available` ponownie jako końcową
weryfikację, dopiero potem `docker compose up -d`. `07_deploy.sh` (build →
re-start → status) tej logiki nie duplikuje — dziedziczy ją przez wywołanie
`04_re-start.sh`.

Lokalny `docker-compose.local.yml` (`03_local_mac_docker`) łączy mongo + CP +
dashboard w jednym pliku, bo lokalnie nie ma potrzeby rozdzielać TEST/PROD —
ten podział dotyczy wyłącznie QNAP.

### Niespójność nazewnictwa: `re-start/end` (Docker) vs `start/end` (tmux) vs `begin_*` (SSH wrappery)

**Stan do 2026-07-14:** cała rodzina skryptów opartych o Docker Compose
(`00_qnap_shared`, `03_local_mac_docker`, `04_qnap_test`, `05_qnap_prod`)
używała konsekwentnie **`begin`/`end`** (nigdy `start`/`stop`) —
udokumentowane od 2026-07-10 (patrz akapit wyżej).

**Zmiana 2026-07-14 (poprawka Story 54):** na wyraźną prośbę użytkownika,
wszystkie skrypty nazwane dokładnie `begin.sh` albo `<NN>_begin.sh` w całym
repo zostały przemianowane na `re-start.sh`/`<NN>_re-start.sh` — sześć
plików: `00_qnap_shared/03_re-start.sh` (dawniej `03_begin.sh`),
`03_local_mac_docker/04_re-start.sh` (dawniej `04_begin.sh`),
`04_qnap_test/03_re-start.sh` (dawniej `03_begin.sh`),
`05_qnap_prod/03_re-start.sh` (dawniej `03_begin.sh`),
`bash-scripts/beeper/02_re-start.sh` (dawniej `02_begin.sh`), oraz
root-level `re-start.sh` (dawniej `begin.sh`).
Wszystkie wewnętrzne odwołania (inne skrypty, `docker-compose.*.yml`,
`.gitignore`, `.env.qnap.example`, dokumentacja) zostały zaktualizowane w tym
samym zadaniu. `end.sh`/`status.sh`/`build.sh`/`deploy.sh`/`config.sh` w
żadnym katalogu **nie zostały** zmienione — poprawka dotyczyła wyłącznie
plików nazwanych `begin.sh`.

**Świadomie NIE przemianowane (inny wzorzec nazwy, nie dosłowne
`begin.sh`):**
- `06_qnap_ssh/begin_shared.sh` / `begin_test.sh` / `begin_prod.sh` —
  zostają pod starą nazwą (`begin_*.sh`, nie `begin.sh`), ale ich
  wewnętrzne wywołania zostały zaktualizowane, żeby wołać nowe
  `NN_re-start.sh` na docelowym środowisku. Skutek: użytkownik nadal woła
  `bash bash-scripts/dashboard/06_qnap_ssh/begin_prod.sh`, ale ten skrypt
  teraz uruchamia zdalnie `05_qnap_prod/03_re-start.sh`, nie
  (jak wcześniej) `03_begin.sh`.
- `packages/net-content-provider/03_scripts/qnap/begin_qnap_test.sh` —
  inny, niezależny system (patrz sekcja "Różnica względem
  `packages/net-content-provider/...`" niżej), w trakcie przepisywania —
  nietknięty.

Osobny, niepowiązany z Dockerem system — lokalne środowisko dev oparte o
`tmux`/`tmuxinator` (bez kontenerów, do jednoczesnego uruchamiania `dba`
watch + `next dev` + Content Provider w panelach terminala) — ma inną,
udokumentowaną historię: `git log` pokazuje, że `begin.sh`/`stop.sh` zostały
najpierw zmienione na `begin.sh`/`end.sh` (2026-07-10, ten sam powód co
wyżej), a NASTĘPNIE (commit `c21233e`, ten sam dzień) świadomie
przemianowane z powrotem na `01_build.sh`/`02_start.sh`/`03_end.sh` w samym
`02_local_mac/`, z uzasadnieniem: *"build" i "begin" oba zaczynały się na tę
samą literę, myląco w listingu katalogu* — inny problem niż oryginalny (tam
kolidowały trzy nazwy zaczynające się na `s`; tu dwie zaczynające się na `b`).
Wewnętrzny plik tej rodziny nadal nazywa się `02_start.sh` (nie zmieniony w
poprawce 2026-07-14 — nie pasuje do wzorca `begin.sh`), tylko **root-level
wrapper** (`begin.sh` → `re-start.sh`, patrz `dashboard-start-scripts.md`)
został objęty poprawką.

Stan katalogu: `02_local_mac/` został usunięty (2026-07-13), a w jego
miejsce powstał `02_local_mac_tmux/` z tym samym wzorcem
`01_build.sh`/`02_start.sh`/`03_end.sh`/`04_status.sh`/`05_logs.sh` — teraz
w pełni scommitowany.

**Wniosek (aktualny, 2026-07-14):** konwencja nazw nadal NIE jest w pełni
jednolita w całym repo, ale z innym kształtem niespójności niż wcześniej —
Docker-owa rodzina per-środowisko (`00_qnap_shared`/`03_local_mac_docker`/
`04_qnap_test`/`05_qnap_prod`) i root-level wrapper używają teraz
`re-start`/`end`, `06_qnap_ssh`'s wrappery nadal używają `begin_*`/`end_*`
(inny, celowo nieprzemianowany wzorzec — patrz wyżej), a lokalny tmux-owy
dev-flow (`02_local_mac_tmux`) nadal używa `start`/`end` (z innym, osobnym
uzasadnieniem historycznym). Jeśli planujesz dalej ujednolicać nazewnictwo
(np. `begin_*.sh` → `re-start_*.sh` w `06_qnap_ssh`, albo `start`→`re-start`
w `02_local_mac_tmux`), zrób to jako osobne, świadome zadanie — patrz
`documentation/stories/54/06_others_from_report.md`.

## Dlaczego shared/test/prod, a nie jeden plik na środowisko

Do 2026-07-11 istniał jeden `docker-compose.qnap.yml` z mongo+CP+dashboard,
uruchamiany dwukrotnie (raz jako `chad-test`, raz jako `chad-prod`) —
**każde środowisko miało własne, osobne MongoDB i własny, osobny Content
Provider** (`chad-mongodb-test`/`chad-mongodb-prod`,
`chad-content-provider-api-test`/`-prod`), mimo że oba czytały ten sam
`/share/Dropbox`. To nie spełniało wymagania biznesowego: TEST ma być
alternatywnym UI do **tych samych** prawdziwych danych, nie osobnym zestawem
danych.

Przebudowano na trzy pliki:

- `docker-compose.qnap.shared.yml` — MongoDB (`chad-mongodb`) +
  Content Provider API (`chad-content-provider-api`). Uruchamiane/zatrzymywane
  **tylko** przez `00_qnap_shared/*.sh`.
- `docker-compose.qnap.test.yml` — tylko `dashboard` (`chad-dashboard-test`).
- `docker-compose.qnap.prod.yml` — tylko `dashboard` (`chad-dashboard-prod`).

Wszystkie trzy są osobnymi projektami Compose (`-p chad-shared` /
`chad-test` / `chad-prod`), połączonymi przez jedną **zewnętrzną** sieć
Docker `chad-shared` (tworzoną idempotentnie przez `ensure_docker_network`
w `bash-scripts/common/lib.sh`, wywoływaną z `00_qnap_shared/03_re-start.sh`).

### DNS między osobnymi projektami Compose — container_name, nie service name

Compose service-name DNS resolution (np. `http://content-provider-api:12024`)
działa tylko **w obrębie tego samego projektu Compose**. Skoro dashboard
TEST/PROD i shared są teraz osobnymi projektami na wspólnej zewnętrznej
sieci, dashboard musi łączyć się z Content Providerem po jego
**`container_name`**, nie nazwie serwisu:

```
CONTENT_PROVIDER_API_URL=http://chad-content-provider-api:12024
```

(wcześniej, gdy oba serwisy żyły w jednym pliku compose, działało
`http://content-provider-api:12024` — nazwa serwisu). To samo dotyczyłoby
Mongo (`chad-mongodb:27017`), gdyby/gdy dashboard zacznie łączyć się z Mongo
bezpośrednio — na dziś (2026-07-11) dashboard/`dba` jeszcze nie konsumują
MongoDB w kodzie, Mongo jest czystą infrastrukturą przygotowaną pod
przyszłe feature'y (patrz `documentation/ai-docs/
26-07-10_cline_prompt_mongodb_qnap_folders_v3.md`).

### `01_config.sh` — stałe środowiska

Poza `COMPOSE_PROJECT_NAME`/`ENV_NAME`/portami, `01_config.sh` zawiera też
pełną konfigurację modułów, które mają własny plik konfiguracyjny. Każdy
pozostały skrypt zaczyna od `source "$SCRIPT_DIR/01_config.sh"`.

### Content Provider — appsettings.json generowany z `00_qnap_shared/01_config.sh`

Content Provider (`packages/net-content-provider`) nie ma własnego `.env`.
Jego appsettings.json jest zapisany tekstowo (heredoc) jako
`CONTENT_PROVIDER_APPSETTINGS_JSON` w `00_qnap_shared/01_config.sh` (jedno
miejsce teraz, bo jest jeden wspólny Content Provider — wcześniej ten sam
tekst był zduplikowany w `04_qnap_test`/`05_qnap_prod`). Funkcja
`write_content_provider_appsettings()` zapisuje ten tekst do
`.runtime/shared/content-provider/appsettings.json` (gitignored, nigdy
source of truth) tuż przed `docker compose up` — `00_qnap_shared/03_re-start.sh`
woła ją zawsze na początku. Docker Compose montuje wygenerowany plik jako
`/app/appsettings.json:ro`. Zmiana konfiguracji Content Providera = ponowne
`00_qnap_shared/03_re-start.sh` (odtworzenie kontenera), nie rebuild obrazu.

`04_qnap_test`/`05_qnap_prod` już NIE generują appsettings.json — nie mają
własnego Content Providera.

### Ścieżka danych Content Providera: `/share/Dropbox`, NIE `/share/cp_1`

`/share/cp_1` był bind mountem **starego, nieaktualnego** deploymentu
(`content-provider-api-prod`, poza tym monorepo, zastąpionego tą
architekturą 2026-07-11). Aktualna, poprawna ścieżka danych to
`/share/Dropbox` (`CP_REPOS_HOST_PATH` w `.env.qnap`) — potwierdzone
realnie: `repoCount: 36`. Jeśli gdziekolwiek pojawi się `/share/cp_1`,
traktuj to jako pozostałość po starym deploymencie, nie jako aktualne
źródło danych.

### Porty — NIE w `.env`

`.env.local`/`.env.qnap` zawierają wyłącznie rzeczy zależne od środowiska
(hosty, ścieżki, użytkownicy, hasła, klucze API, katalogi danych, Dropbox,
QNAP, MongoDB credentials) — nigdy porty. Porty są wpisane bezpośrednio w
skryptach każdego katalogu:

| Środowisko | Katalog | Port |
|---|---|---|
| SHARED | `00_qnap_shared/01_config.sh` | Content Provider API: `12024` (publikowany na host) |
| SHARED | `00_qnap_shared/01_config.sh` | MongoDB: **brak publikowanego portu hosta** — tylko wewnętrzna sieć `chad-shared` (`chad-mongodb:27017`) |
| TEST | `04_qnap_test/01_config.sh` | Dashboard: `12020` |
| PROD | `05_qnap_prod/01_config.sh` | Dashboard: `12030` |

`04_qnap_test`/`05_qnap_prod` nadal mają `CONTENT_PROVIDER_API_PORT=12024`
zdefiniowany — ale wyłącznie jako **odczyt**, do preflightowego sprawdzenia
zdrowia shared przed startem dashboardu (`require_shared_services_healthy`),
nigdy do uruchamiania/zatrzymywania/budowania Content Providera.

## `require_shared_services_healthy` — preflight test/prod → shared

Ponieważ shared, TEST i PROD to trzy osobne projekty Compose, `depends_on`
między nimi nie działa. Zamiast tego `bash-scripts/common/lib.sh` ma funkcję
`require_shared_services_healthy <cp_port>`, wywoływaną z
`04_qnap_test/03_re-start.sh` i `05_qnap_prod/03_re-start.sh` PRZED
`docker compose up`:

1. sprawdza, czy sieć `chad-shared` istnieje,
2. sprawdza `docker inspect chad-mongodb` → `State.Health.Status == healthy`,
3. sprawdza, że kontener `chad-content-provider-api` działa,
4. sprawdza `curl http://localhost:12024/health`.

Jeśli którykolwiek krok zawiedzie, dashboard **odmawia startu** z czytelnym
błędem wskazującym `bash bash-scripts/dashboard/00_qnap_shared/03_re-start.sh`.
Dashboard TEST/PROD nigdy sam nie uruchamia/nie naprawia shared.

## Zasady działania skryptów deploymentowych

### `02_build.sh`

Służy **wyłącznie** do budowania nowych obrazów Docker.

- `00_qnap_shared/02_build.sh` buduje tylko `chad-content-provider-api`
  (jedyny serwis z `build:` w `docker-compose.qnap.shared.yml` — mongo to
  gotowy obraz `mongo:4.4`).
- `04_qnap_test/02_build.sh` / `05_qnap_prod/02_build.sh` budują tylko
  `chad-dashboard`.

Nie może:
- uruchamiać kontenerów,
- zatrzymywać działającego środowiska,
- wykonywać `docker compose up`,
- usuwać wolumenów ani danych.

**Aktualizacja 2026-07-13:** każdy build tworzy obraz z **jednym** tagiem —
znacznikiem czasowym `YYMMDD_HHMMSS`. Własne obrazy CHAD (`chad-dashboard`,
`chad-content-provider-api`) **nigdy nie dostają tagu `latest`**. Celowo bez
nazwy środowiska/architektury w tagu — środowisko jest rozróżniane przez
nazwę projektu Compose, porty i nazwy kontenerów. Po udanym buildzie skrypt
zapisuje ten tag do gitignored pliku `.image-tag.<image>.env` w rootcie repo —
pełny standard i uzasadnienie: [image-tagging-standard.md](image-tagging-standard.md).

### `03_re-start.sh`

Służy **wyłącznie** do uruchamiania już zbudowanych obrazów. Nie buduje.

`00_qnap_shared/03_re-start.sh` (zaktualizowane 2026-07-13):
1. `require_image_tag` dla `chad-content-provider-api` — **odmawia startu**
   bez zapisanego tagu, nigdy fallback do `latest`.
2. `require_data_path_writable` na `$QNAP_CONTAINER_DATA_PATH/chad-shared/mongodb`
   — odmawia startu, jeśli ścieżka jest niezapisywalna albo ma za mało wolnego
   miejsca (tripwire na tmpfs); tworzy brakujące podkatalogi `db`/`configdb`/`backups`.
   Pełny opis: [qnap-data-path.md](qnap-data-path.md).
3. `ensure_docker_network chad-shared` (idempotentne).
4. `write_content_provider_appsettings`.
5. Jeśli już działa: `04_end.sh`, potem start od nowa.
6. Preflight portu `12024` (`ensure_port_available`).
7. `docker compose up -d`.
8. Czeka na `chad-mongodb` `healthy` i `content-provider-api` `/health`
   (`anyRepoFound:true`).

`04_qnap_test/03_re-start.sh` / `05_qnap_prod/03_re-start.sh` (zaktualizowane 2026-07-13):
1. `require_shared_services_healthy` — **odmawia startu**, jeśli shared nie
   działa.
2. `require_image_tag` dla `chad-dashboard` — **odmawia startu** bez
   zapisanego tagu, nigdy fallback do `latest`. TEST i PROD czytają ten sam
   plik, więc uruchamiają dokładnie ten sam obraz.
3. Jeśli dashboard już działa: `04_end.sh`, potem start od nowa.
4. Preflight portu dashboardu.
5. `docker compose up -d`.
6. Czeka na odpowiedź HTTP dashboardu.

Żaden z tych skryptów nigdy nie używa `docker compose down -v`, `docker
system prune`, ani szerokiego usuwania obrazów/kontenerów — i nigdy nie
dotyka innego środowiska (każdy jest zakresowany `-p <compose-project-name>`).
**`04_qnap_test`/`05_qnap_prod` nigdy nie restartują shared** — tylko je
sprawdzają.

#### Automatyczne czyszczenie konfliktów portów

Przed `docker compose up -d`, `03_re-start.sh` sprawdza porty przez
`ensure_port_available()` (`bash-scripts/common/lib.sh`) — automatycznie
zatrzymuje i usuwa TYLKO kontener Dockera, który faktycznie publikuje
wymagany port, nigdy szerokie czyszczenie. Jeśli port zajmuje proces spoza
Dockera, skrypt pokazuje jego PID/nazwę i przerywa start.

### `04_end.sh`

Zatrzymuje i usuwa **wyłącznie** kontenery/sieć/zasoby tymczasowe należące do
danego projektu Compose: `docker compose -p <project> down --remove-orphans`.
Nigdy `-v`. Nigdy nie usuwa obrazów.

`00_qnap_shared/04_end.sh` zatrzymuje MongoDB + Content Provider **używane
przez OBA dashboardy** — ostrzega o tym w logach. `04_qnap_test/04_end.sh` /
`05_qnap_prod/04_end.sh` zatrzymują wyłącznie swój dashboard.

### `06_deploy.sh`

Pełny deployment nowej wersji: `02_build.sh` → `03_re-start.sh` → `05_status.sh`.

### `05_status.sh`

Pokazuje `docker compose ps` + health checki dla danego projektu. Nie
zmienia stanu środowiska. `00_qnap_shared/05_status.sh` pokazuje sieć +
Mongo health + CP health. `04_qnap_test`/`05_qnap_prod`'s `05_status.sh`
pokazują tylko swój dashboard i wskazują na
`00_qnap_shared/05_status.sh` dla statusu shared.

## `06_qnap_ssh` — SSH nad 00/04/05

Cienkie wrappery: łączą się SSH, `cd $QNAP_REPO_DIR && git pull --ff-only`,
i wołają realny skrypt z `00_qnap_shared/`, `04_qnap_test/` lub
`05_qnap_prod/` — bez duplikowania logiki deploymentu. Host/user/port/
repo-dir/hasło pochodzą z `.env.qnap` (root, gitignored).

- `begin_shared.sh` / `end_shared.sh` / `deploy_shared.sh` — wymagają
  wpisania `SHARED` do potwierdzenia (dotyczą OBU dashboardów naraz).
- `status_shared.sh` — read-only, bez potwierdzenia.
- `begin_test.sh` / `end_test.sh` / `deploy_test.sh` / `status_test.sh` —
  bez potwierdzenia (TEST, choć współdzieli dane z PROD, jest bezpieczny do
  restartu — restart dashboardu nie dotyka danych).
- `begin_prod.sh` / `deploy_prod.sh` — wymagają wpisania `PROD`.
- `end_prod.sh` / `status_prod.sh` — bez potwierdzenia (zatrzymanie/odczyt
  zawsze bezpieczne, odwracalne).

Nazewnictwo: `begin_*`/`end_*`/`status_*`/`deploy_*` — **nigdy**
`start_*`/`stop_*` (dawne `start_test.sh`/`start_prod.sh` przemianowane na
`begin_test.sh`/`begin_prod.sh` 2026-07-11).

## Różnica względem `packages/net-content-provider/03_scripts/qnap/*.sh`

To DWA NIEZALEŻNE systemy, celowo:
- `packages/net-content-provider/03_scripts/qnap/*.sh` — samodzielny
  content-provider-api + Blazor GUI, bez mongo, bez dashboardu, sterowany
  plain `docker run` (nie Compose). Pozostaje nietknięty przez tę pracę.
- `bash-scripts/dashboard/{00,03,04,05}_*` (ten dokument) — stack dashboardu
  + wspólne mongo/CP, sterowany docker-compose.

## Weryfikacja

**Zrobione i przechodzi (2026-07-11), na realnym QNAP (s12,
`100.117.139.83`):** migracja z jednego pliku compose (osobne mongo/CP na
środowisko) na shared/test/prod. `00_qnap_shared/03_begin.sh` →
`04_qnap_test/03_begin.sh` → `05_qnap_prod/03_begin.sh` (nazwy z tamtej
daty — te skrypty od 2026-07-14 nazywają się `03_re-start.sh`, patrz
sekcja "Niespójność nazewnictwa" wyżej), wraz z pełną
weryfikacją: `chad-mongodb` healthy, `chad-content-provider-api`
`/health` → `anyRepoFound:true` (36 repo z `/share/Dropbox`), oba
dashboardy (`chad-dashboard-test:12020`, `chad-dashboard-prod:12030`)
odpowiadają HTTP i wskazują na dokładnie ten sam `chad-mongodb` +
`chad-content-provider-api`. Legacy `personal-dashboard-prod` +
`content-provider-api-prod` (stary, niepowiązany deployment na `/share/cp_1`,
zastąpiony tą architekturą) zatrzymane. Pełne wyniki:
`documentation/ai-docs/deploy/shared-qnap-services.md`.
