# Dashboard stack deployment — docker-compose (`bash-scripts/dashboard/`)

Status: aktualne (Story 70, 2026-07-17) — dodany **równoległy** mechanizm
GHCR: build+push z Maca lub GitHub Actions, QNAP `docker pull`uje i
restartuje (patrz sekcja "Registry flow (GHCR) — Story 70" niżej), przez
NOWE katalogi `09_registry_prod`/`08_registry_test`. To jest opcja
dodatkowa, nie zamiennik — `04_qnap_test/{02_build,06_deploy}.sh` i
`06_qnap_test_ssh/06_deploy.sh` (build na QNAP) działają dokładnie tak jak
przed Story 70, bez zmian, i pozostają w pełni poprawną drogą deploymentu
TEST. Wybór między "buduj na QNAP" (`04_qnap_test`/`06_qnap_test_ssh`) a
"buduj przez GHCR" (`08_registry_test`) należy do użytkownika. Poprzedni
stan (Story 63, 2026-07-16/17): jeden stały, globalny kontrakt numeracji
operacji dla wszystkich środowisk, `restart` (bez myślnika) jako jedyna
nazwa dla tej operacji w całym repo, `06_qnap_ssh` zastąpiony przez dwa
katalogi (`06_qnap_test_ssh`/`07_qnap_prod_ssh`), PROD bez własnego
builda/deploya —
wciąż aktualne, tylko TEST-owy build (dawniej na QNAP) przeniósł się poza
QNAP. Historia wcześniejszych zmian (architektura shared/test/prod z
2026-07-11, rename `begin`→`re-start` z 2026-07-14) — patrz "Historia
zmian" na końcu tego dokumentu.

## Czym to jest

TEST i PROD na QNAP to **dwa osobne dashboardy wskazujące na dokładnie te
same, prawdziwe dane** — jedno wspólne MongoDB (`chad-mongodb`). TEST **nie
jest** izolowanym środowiskiem danych ani sandboxem — to alternatywny/testowy
interfejs do tych samych, prawdziwych danych, używany do weryfikacji
wyglądu, layoutu, scrollbarów, edytorów, formularzy i integracji dashboardu
bez ryzyka dla dostępności PROD. Zmiana danych wykonana przez dashboard
TEST jest widoczna również w PROD.

**Content Provider (Story 72, 2026-07-19):** `chad-content-provider-api`
(.NET) został usunięty z deploymentu — Mongo (`MongoCpProvider`) jest
jedynym aktywnym backendem w czasie działania
(`DBA_CONTENT_PROVIDER_ENABLED=false`, `DBA_PRIMARY_BACKEND=mongo`). Kod
adaptera (`NetFileCpProvider`) i submoduł `packages/net-content-provider`
pozostają nietknięte — to zmiana wyłącznie w deploymencie, odwracalna przez
ponowne dodanie serwisu do `docker-compose.qnap.shared.yml` (patrz tego
pliku nagłówek) i przywrócenie flag. Sekcje poniżej, które opisują
`content-provider-api` jako część `00_qnap_shared`, opisują stan
historyczny (przed Story 72) — zachowane dla kontekstu architektonicznego i
jako dokumentacja ścieżki powrotu, patrz "Historia zmian" na końcu.

## Kontrakt numeracji operacji (globalny, obowiązujący we wszystkich katalogach)

| Slot | Weryfikacja | Znaczenie |
|---|---|---|
| `01_config` | sourced, nigdy uruchamiany bezpośrednio | przygotowanie/wygenerowanie konfiguracji danego środowiska |
| `02_build` | | budowanie obrazu Docker lub artefaktu (np. `pnpm build`) |
| `03_restart` | | uruchomienie środowiska jeśli nie działa, albo restart z już zbudowanego obrazu/artefaktu; **nigdy nie buduje** |
| `04_end` | | zatrzymanie środowiska |
| `05_status` | | stan + podstawowe healthchecki, nigdy nie zmienia stanu |
| `06_deploy` | | pełny deployment nowej wersji wg kontraktu danego środowiska (typowo `02_build`→`03_restart`→`05_status`) |
| `07_logs` | | podgląd logów |

**Luki są celowe.** Numer identyfikuje rodzaj operacji w całym repozytorium,
nie tylko kolejność plików w jednym katalogu — jeśli dane środowisko nie
potrzebuje jakiejś operacji, jej numer po prostu nie występuje (nic się nie
przesuwa). Przykład: `05_qnap_prod` nie ma `02_build`/`06_deploy` wcale
(patrz niżej, dlaczego).

Narzędzia czysto techniczne, które nie są jedną z siedmiu operacji powyżej
(np. ręczne zwalnianie portu), dostają numer **poza** zakresem `01`-`07` —
konwencja `9x_*` (patrz `03_local_mac_docker/90_port-kill.sh` niżej) — żeby
nie kolidowały z żadnym przyszłym slotem.

**Zawsze sprawdzaj `ls bash-scripts/dashboard/<katalog>/` zamiast zakładać
numerację z pamięci** — nie każdy katalog ma wszystkie siedem plików.

## Struktura katalogów (potwierdzona `ls`, Story 70)

```
bash-scripts/dashboard/
├── 00_qnap_shared/        # docker-compose.qnap.shared.yml (mongo, wspólne dla TEST i PROD — content-provider-api usunięty, Story 72) — działa NA QNAP, bez SSH-wrapperów (patrz niżej)
├── 02_local_mac_tmux/     # tmux/pnpm, BEZ Dockera (lokalny dev flow, osobny od tej pracy — patrz jego własna dokumentacja)
├── 03_local_mac_docker/   # docker-compose.local.yml (mongo+dashboard razem, tylko lokalnie — content-provider-api usunięty, Story 72)
├── 04_qnap_test/          # docker-compose.qnap.test.yml (TYLKO dashboard TEST) — build na QNAP (02_build.sh/06_deploy.sh), BEZ ZMIAN od Story 63, nadal w pełni działający wariant
├── 05_qnap_prod/          # docker-compose.qnap.prod.yml (TYLKO dashboard PROD) — bez build/deploy od Story 63, nadal tak
├── 06_qnap_test_ssh/      # cienkie wrappery SSH nad 04_qnap_test (build na QNAP), BEZ ZMIAN od Story 63
├── 07_qnap_prod_ssh/      # cienkie wrappery SSH nad 05_qnap_prod — plus 06_last_from_test.sh (Story 63, promuje przez współdzielony lokalny cache Dockera), BEZ ZMIAN
├── 08_registry_test/      # (NOWY, Story 70, RÓWNOLEGŁY wariant) pełny deployment TEST przez GHCR — 02_build.sh buduje+pushuje LOKALNIE (Mac), 03_restart.sh pulluje na QNAP i restartuje
└── 09_registry_prod/      # (NOWY, Story 70, RÓWNOLEGŁY wariant) promocja PROD przez GHCR — 06_last_from_test.sh pobiera dokładnie obraz TEST z rejestru PO DIGEŚCIE
```

**Story 70 jest w całości addytywna.** `04_qnap_test`, `05_qnap_prod`,
`06_qnap_test_ssh`, `07_qnap_prod_ssh` nie zostały zmienione w żaden
sposób — build na QNAP (`04_qnap_test/02_build.sh`/`06_deploy.sh`,
`06_qnap_test_ssh/06_deploy.sh`) nadal działa dokładnie tak jak wcześniej.
`09_registry_prod`/`08_registry_test` to nowa, RÓWNOLEGŁA droga — wybór
między nimi a starą drogą należy do użytkownika za każdym razem, kiedy
deployuje.

### `00_qnap_shared/` — 6 plików: `01_config`, `02_build`, `03_restart`, `04_end`, `05_status`, `06_deploy`

### `02_local_mac_tmux/` — 6 plików (slot `06`/deploy celowo pusty): `01_config`, `02_build`, `03_restart`, `04_end`, `05_status`, `07_logs` — patrz `dashboard-start-scripts.md` dla pełnego opisu tego dev-flow.

### `03_local_mac_docker/` — 7 plików: `01_config`, `02_build`, `03_restart`, `04_end`, `05_status`, `06_deploy`, plus `90_port-kill.sh` (poza zakresem slotów — patrz niżej).

#### `90_port-kill.sh` — ręczne/automatyczne zwalnianie zajętego portu

CLI: `./90_port-kill.sh <port>`. Cienki wrapper nad `kill_process_on_port()`
z `bash-scripts/common/lib.sh` (logika żyje tam, nie duplikowana tutaj) —
obsługuje oba przypadki: port zajęty przez kontener Docker (zatrzymuje +
usuwa TYLKO ten kontener) albo przez zwykły proces (SIGTERM, odczekanie,
ponowna weryfikacja, SIGKILL dopiero gdy nadal żyje). Zero interaktywnych
pytań — wywoływany automatycznie. Nigdy nie dotyka niczego niezwiązanego z
podanym portem (brak `docker system prune`, brak `pkill`/`killall`).

`03_restart.sh` wywołuje go automatycznie dla każdego portu z
`REQUIRED_PORTS` (zbudowanego z `DASHBOARD_PORT`/`CONTENT_PROVIDER_API_PORT`/
`MONGODB_PORT` w `01_config.sh` — nigdy nie hardkoduje numerów portów samo)
PRZED próbą startu. Po zwolnieniu portów `03_restart.sh` wywołuje
`ensure_port_available` ponownie jako końcową weryfikację, dopiero potem
`docker compose up -d`. `06_deploy.sh` (build → restart → status) tej
logiki nie duplikuje — dziedziczy ją przez wywołanie `03_restart.sh`.

**Numeracja `9x` (Story 63):** wcześniej ten skrypt zajmował slot `01`,
przesuwając całą resztę katalogu o jeden numer. Skoro to narzędzie
techniczne (nie jedna z siedmiu standardowych operacji), przeniesiony poza
zakres slotów — reszta katalogu wróciła do tej samej numeracji co pozostałe
środowiska.

Lokalny `docker-compose.local.yml` (`03_local_mac_docker`) łączy mongo + CP +
dashboard w jednym pliku, bo lokalnie nie ma potrzeby rozdzielać TEST/PROD —
ten podział dotyczy wyłącznie QNAP.

### `04_qnap_test/` — 6 plików: `01_config`, `02_build`, `03_restart`, `04_end`, `05_status`, `06_deploy`.

**Bez zmian od Story 63.** `02_build.sh` nadal buduje `chad-dashboard` NA
QNAP (jak zawsze) i zapisuje git SHA jako OCI label; `06_deploy.sh` nadal
robi `02_build.sh` → `03_restart.sh` → `05_status.sh`. To pozostaje w pełni
poprawna droga deploymentu TEST. Od Story 70 istnieje też równoległa,
opcjonalna droga bez buildu na QNAP — `08_registry_test/03_restart.sh`
woła zdalnie *ten sam, niezmieniony* `03_restart.sh` z tego katalogu, tyle
że po `docker pull` zamiast po `docker compose build` — patrz sekcja
"Registry flow (GHCR)" niżej.

### `05_qnap_prod/` — 4 pliki: `01_config`, `03_restart`, `04_end`, `05_status`. **Bez `02_build`, bez `06_deploy`.**

**Decyzja architektoniczna (Story 63):** PROD nigdy nie buduje własnego
obrazu i nigdy nie deployuje niezależnie. Przed Story 63 `05_qnap_prod`
miał własny `02_build.sh` zdolny zbudować nowy obraz `chad-dashboard`
niezależnie od TEST — to był realny, niezamierzony sposób ominięcia
promocji TEST→PROD (oba `02_build.sh` pisały do tego samego,
współdzielonego pliku tagu, więc nic nie broniło komuś uruchomienia buildu
bezpośrednio z PROD). Story 63 usunęła tę możliwość **strukturalnie**, nie
tylko proceduralnie: `05_qnap_prod/02_build.sh` i `06_deploy.sh` zostały
usunięte, a `docker-compose.qnap.prod.yml` nie ma już sekcji `build:` wcale
— nawet ręczne `docker compose build` przeciw temu plikowi nie zadziała
(brak kontekstu budowania). Jedyna droga, żeby PROD dostał nową wersję, to
`07_qnap_prod_ssh/06_last_from_test.sh` (patrz niżej) — promocja
dokładnie tego obrazu, który już działa i został zweryfikowany na TEST.

## Dlaczego shared/test/prod, a nie jeden plik na środowisko

Do 2026-07-11 istniał jeden `docker-compose.qnap.yml` z mongo+CP+dashboard,
uruchamiany dwukrotnie (raz jako `chad-test`, raz jako `chad-prod`) —
**każde środowisko miało własne, osobne MongoDB i własny, osobny Content
Provider**, mimo że oba czytały ten sam `/share/Dropbox`. To nie spełniało
wymagania biznesowego: TEST ma być alternatywnym UI do **tych samych**
prawdziwych danych, nie osobnym zestawem danych.

Przebudowano na trzy pliki:

- `docker-compose.qnap.shared.yml` — MongoDB (`chad-mongodb`) +
  Content Provider API (`chad-content-provider-api`). Uruchamiane/zatrzymywane
  **tylko** przez `00_qnap_shared/*.sh` — bezpośrednio na QNAP, bez SSH
  wrapperów (patrz "00_qnap_shared — ocena" niżej).
- `docker-compose.qnap.test.yml` — tylko `dashboard` (`chad-dashboard-test`).
- `docker-compose.qnap.prod.yml` — tylko `dashboard` (`chad-dashboard-prod`), bez `build:`.

Wszystkie trzy są osobnymi projektami Compose (`-p chad-shared` /
`chad-test` / `chad-prod`), połączonymi przez jedną **zewnętrzną** sieć
Docker `chad-shared` (tworzoną idempotentnie przez `ensure_docker_network`
w `bash-scripts/common/lib.sh`, wywoływaną z `00_qnap_shared/03_restart.sh`).

## `00_qnap_shared` — ocena konieczności (Story 63 audyt)

**Wniosek: potrzebny, zostaje.** Dowody z audytu:
- **Kto go wywołuje:** `04_qnap_test/03_restart.sh` i `05_qnap_prod/03_restart.sh`
  wywołują `require_shared_services_healthy()` przed startem i **odmawiają
  uruchomienia**, jeśli shared nie jest zdrowy — obie zależą od niego
  strukturalnie.
- **Czy współdzielenie jest realne:** tak, zweryfikowane na prawdziwym QNAP
  (2026-07-11, patrz sekcja "Weryfikacja" i `shared-qnap-services.md`) —
  jeden `chad-mongodb`, jeden `chad-content-provider-api`, oba dashboardy
  wskazują na te same kontenery.
- **Czy dałoby się to przenieść bez duplikacji:** nie w prosty sposób —
  to osobny projekt Compose (`-p chad-shared`), połączony z TEST/PROD
  wyłącznie przez zewnętrzną sieć Docker; przeniesienie do `04_qnap_test`
  albo `05_qnap_prod` uczyniłoby jedno z nich właścicielem infrastruktury,
  od której zależy drugie — gorsze rozwiązanie, nie prostsze.
- **Świadoma decyzja (Story 63, Input 3 §2):** brak dedykowanego katalogu
  SSH (`08_qnap_shared_ssh`) — zarządzanie shared odbywa się bezpośrednio
  przez SSH + `00_qnap_shared/*.sh` na hoście QNAP, bez cienkiego wrappera
  z Maca. Jeśli to się kiedyś zmieni, byłaby to osobna, świadoma decyzja.

### DNS między osobnymi projektami Compose — container_name, nie service name

Compose service-name DNS resolution (np. `http://content-provider-api:12024`)
działa tylko **w obrębie tego samego projektu Compose**. Dashboard łączy się
z Content Providerem po jego **`container_name`**:

```
CONTENT_PROVIDER_API_URL=http://chad-content-provider-api:12024
```

### `01_config.sh` — stałe środowiska

Poza `COMPOSE_PROJECT_NAME`/`ENV_NAME`/portami, `01_config.sh` zawiera też
pełną konfigurację modułów, które mają własny plik konfiguracyjny. Każdy
pozostały skrypt zaczyna od `source "$SCRIPT_DIR/01_config.sh"`.

### Content Provider — appsettings.json generowany z `00_qnap_shared/01_config.sh`

Content Provider (`packages/net-content-provider`) nie ma własnego `.env`.
Jego appsettings.json jest zapisany tekstowo (heredoc) jako
`CONTENT_PROVIDER_APPSETTINGS_JSON` w `00_qnap_shared/01_config.sh`. Funkcja
`write_content_provider_appsettings()` zapisuje ten tekst do
`.runtime/shared/content-provider/appsettings.json` (gitignored) tuż przed
`docker compose up` — `00_qnap_shared/03_restart.sh` woła ją zawsze na
początku. Zmiana konfiguracji Content Providera = ponowne
`00_qnap_shared/03_restart.sh` (odtworzenie kontenera), nie rebuild obrazu.

`04_qnap_test`/`05_qnap_prod` nie generują appsettings.json — nie mają
własnego Content Providera.

### Ścieżka danych Content Providera: `/share/Dropbox`, NIE `/share/cp_1`

`/share/cp_1` był bind mountem starego, zastąpionego deploymentu. Aktualna
ścieżka to `/share/Dropbox` (`CP_REPOS_HOST_PATH` w `.env.qnap`).

### Porty — NIE w `.env`

| Środowisko | Katalog | Port |
|---|---|---|
| SHARED | `00_qnap_shared/01_config.sh` | Content Provider API: `12024` (publikowany na host) |
| SHARED | `docker-compose.qnap.shared.yml` | MongoDB: `chad-mongodb:27017` na sieci `chad-shared` ORAZ (od 2026-07-19) opublikowany na porcie hosta `12040` — dostępny przez Tailscale (`100.117.139.83:12040`), np. z MongoDB Compass. 12040 = pierwszy wolny slot za zakresami TEST (`12020-12029`)/PROD (`12030-12039`), nie natywny port kontenera (`27017`) |
| TEST | `04_qnap_test/01_config.sh` | Dashboard: `12020` |
| PROD | `05_qnap_prod/01_config.sh` | Dashboard: `12030` |

`04_qnap_test`/`05_qnap_prod` mają `CONTENT_PROVIDER_API_PORT=12024`
zdefiniowany wyłącznie jako **odczyt**, do preflightowego sprawdzenia
zdrowia shared (`require_shared_services_healthy`).

## `require_shared_services_healthy` — preflight test/prod → shared

`bash-scripts/common/lib.sh`'s `require_shared_services_healthy <cp_port>`,
wywoływana z `04_qnap_test/03_restart.sh` i `05_qnap_prod/03_restart.sh`
PRZED `docker compose up`:

1. sprawdza, czy sieć `chad-shared` istnieje,
2. sprawdza `docker inspect chad-mongodb` → `State.Health.Status == healthy`,
3. sprawdza, że kontener `chad-content-provider-api` działa,
4. sprawdza `curl http://localhost:12024/health`.

Jeśli którykolwiek krok zawiedzie, dashboard **odmawia startu** z czytelnym
błędem wskazującym `bash bash-scripts/dashboard/00_qnap_shared/03_restart.sh`.
Dashboard TEST/PROD nigdy sam nie uruchamia/nie naprawia shared.

## Zasady działania skryptów deploymentowych

### `02_build.sh` (istnieje tylko w `00_qnap_shared/` i `04_qnap_test/`)

Służy **wyłącznie** do budowania nowych obrazów Docker. Nie może:
uruchamiać kontenerów, zatrzymywać działającego środowiska, wykonywać
`docker compose up`, usuwać wolumenów ani danych.

- `00_qnap_shared/02_build.sh` buduje tylko `chad-content-provider-api`.
- `04_qnap_test/02_build.sh` buduje `chad-dashboard` — **jedyne miejsce w
  repo, które to robi** (Story 63 usunęła `05_qnap_prod/02_build.sh`).

Każdy build tworzy obraz z **jednym** tagiem — znacznikiem czasowym
`YYMMDD_HHMMSS`. Własne obrazy CHAD nigdy nie dostają tagu `latest`. Po
udanym buildzie skrypt zapisuje ten tag do gitignored pliku
`.image-tag.<image>.env` w rootcie repo — pełny standard:
[image-tagging-standard.md](image-tagging-standard.md). Od Story 63,
`04_qnap_test/02_build.sh` zapisuje też SHA aktualnego commita jako OCI
label na obrazie (`org.opencontainers.image.revision`) — czytane przez
`07_qnap_prod_ssh/06_last_from_test.sh` przed promocją na PROD.

### `03_restart.sh`

Służy **wyłącznie** do uruchamiania już zbudowanych obrazów. Nie buduje.

`00_qnap_shared/03_restart.sh`:
1. `require_image_tag` dla `chad-content-provider-api` — odmawia startu
   bez zapisanego tagu.
2. `require_data_path_writable` na
   `$QNAP_CONTAINER_DATA_PATH/chad-shared/mongodb` — patrz
   [qnap-data-path.md](qnap-data-path.md).
3. `ensure_docker_network chad-shared`.
4. `write_content_provider_appsettings`.
5. Jeśli już działa: `04_end.sh`, potem start od nowa.
6. Preflight portu `12024`.
7. `docker compose up -d`.
8. Czeka na `chad-mongodb` `healthy` i `content-provider-api` `/health`
   (`anyRepoFound:true`).

`04_qnap_test/03_restart.sh` / `05_qnap_prod/03_restart.sh`:
1. `require_shared_services_healthy` — odmawia startu, jeśli shared nie
   działa.
2. `require_image_tag` dla `chad-dashboard` — odmawia startu bez zapisanego
   tagu. TEST i PROD czytają ten sam plik, więc uruchamiają dokładnie ten
   sam obraz.
3. Jeśli dashboard już działa: `04_end.sh`, potem start od nowa.
4. Preflight portu dashboardu.
5. `docker compose up -d`.
6. Czeka na odpowiedź HTTP dashboardu.

Żaden z tych skryptów nigdy nie używa `docker compose down -v`, `docker
system prune`, ani szerokiego usuwania obrazów/kontenerów. **`04_qnap_test`/
`05_qnap_prod` nigdy nie restartują shared** — tylko je sprawdzają.

### `04_end.sh`

Zatrzymuje i usuwa **wyłącznie** kontenery/sieć/zasoby tymczasowe należące do
danego projektu Compose: `docker compose -p <project> down --remove-orphans`.
Nigdy `-v`. Nigdy nie usuwa obrazów.

`00_qnap_shared/04_end.sh` zatrzymuje MongoDB + Content Provider **używane
przez OBA dashboardy** — ostrzega o tym w logach. `04_qnap_test/04_end.sh` /
`05_qnap_prod/04_end.sh` zatrzymują wyłącznie swój dashboard.

### `06_deploy.sh` (istnieje tylko w `00_qnap_shared/` i `04_qnap_test/`)

Pełny deployment nowej wersji: `02_build.sh` → `03_restart.sh` →
`05_status.sh`. **Nie istnieje w `05_qnap_prod/`** — PROD deployuje
wyłącznie przez `07_qnap_prod_ssh/06_last_from_test.sh` (promocja, nie
build).

### `05_status.sh`

Pokazuje `docker compose ps` + health checki. Nie zmienia stanu środowiska.

## `06_qnap_test_ssh/` i `07_qnap_prod_ssh/` — SSH nad TEST/PROD (Story 63)

Zastępują dawny, pojedynczy `06_qnap_ssh/` — TEST i PROD mają teraz osobny
kontrakt SSH, bo mają osobny kontrakt deploymentu (TEST buduje, PROD tylko
promuje). Oba katalogi sourcują `bash-scripts/common/lib.sh` bezpośrednio
(sekcja "SSH / QNAP-remote-deploy helpers") — nie ma osobnego `lib.sh` w
żadnym z nich, ani osobnej trzeciej biblioteki. Cienkie wrappery: łączą się
SSH, `cd $QNAP_REPO_DIR && git pull --ff-only`, i wołają realny skrypt z
`04_qnap_test/`/`05_qnap_prod/` — bez duplikowania logiki deploymentu.
Host/user/port/repo-dir/hasło pochodzą z `.env.qnap` (root, gitignored).

### `06_qnap_test_ssh/` — `03_restart.sh`, `04_end.sh`, `05_status.sh`, `06_deploy.sh`

Wszystkie bez potwierdzenia (TEST, choć współdzieli dane z PROD, jest
bezpieczny do restartu/zatrzymania — nie dotyka danych). `06_deploy.sh` jest
jedyną operacją w całym repo objętą Git preflight (patrz niżej) — jedyna,
która buduje nowy obraz z aktualnego lokalnego kodu.

### `07_qnap_prod_ssh/` — `03_restart.sh`, `04_end.sh`, `05_status.sh`, `06_last_from_test.sh`

**Bez `02_build`/`06_deploy`** — nie mogą istnieć, bo PROD nie buduje.
`03_restart.sh` wymaga wpisania `PROD`. `04_end.sh`/`05_status.sh` — bez
potwierdzenia (zatrzymanie/odczyt zawsze bezpieczne, odwracalne).
`06_last_from_test.sh` (jedyna operacja wdrożeniowa PROD, patrz niżej)
wymaga wpisania `PROD`.

### Git preflight — tylko `06_qnap_test_ssh/06_deploy.sh`

Zapobiega wdrożeniu nieaktualnej wersji: sprawdza root repo, branch,
detached HEAD, `git status --porcelain --ignore-submodules`, upstream,
niewypchnięte commity — PRZED połączeniem SSH. Niezacommitowane zmiany →
pokazuje `git status --short --ignore-submodules`, ostrzega, pyta o commit
(domyślnie N, przerywa jeśli odmowa). Ahead względem upstreamu → pyta o
push (domyślnie Y). Brak nowych commitów na zdalnym (porównanie lokalnego
HEAD ze zdalnym przez dodatkowe, read-only SSH) → ostrzega, pyta czy
kontynuować (domyślnie N). Tryb `--non-interactive`: niezacommitowane
zmiany i brak push = błąd, zero pytań. Logika żyje w
`bash-scripts/common/lib.sh` (`git_deploy_preflight`), nie duplikowana.
**Nie dotyczy** `03_restart.sh` (nie buduje) ani `06_last_from_test.sh`
(PROD nigdy nie buduje z lokalnego kodu — dla PROD odpowiednikiem
przejrzystości jest wyświetlenie promowanego obrazu przed potwierdzeniem,
patrz niżej).

**`--ignore-submodules` (2026-07-18):** `packages/net-content-provider`
jest gitowym submodułem; bez tej flagi zwykły `git status --porcelain`
pokazywał go jako " M packages/net-content-provider" praktycznie zawsze
(wskaźnik commita submoduła różni się od tego, co ma zapisane index repo
nadrzędnego, nawet bez żadnych realnych, niezacommitowanych zmian w
żadnym z obu repo) — co wywoływało pytanie o commit dla nieistniejącego
problemu przy niemal każdym deploymencie. Preflight interesuje się tylko
realnymi zmianami w samym repo `chad`, nie stanem submoduła.

**Każde z trzech pytań preflightu ma trzy opcje, `[y/N/d]` lub
`[Y/n/d]` (2026-07-18):**

| Opcja | Znaczenie |
|---|---|
| `y`/`Y` | wykonaj zalecaną akcję (commit / push / kontynuuj mimo braku nowych commitów) i idź dalej |
| `N`/puste (zależnie od domyślnej) | przerwij cały deployment |
| `d`/`D` | **pomiń zalecaną akcję i mimo to zakończ preflight sukcesem** — deployment ruszy z tym, co aktualnie jest na `origin` (niezacommitowane/niewypchnięte lokalne zmiany NIE zostaną wdrożone), bez dalszych pytań |

`d` to świadomy skrót dla sytuacji "wiem, że jest ostrzeżenie, chcę mimo to
wdrożyć to, co już jest na zdalnym" — inny przypadek niż `y` przy pierwszych
dwóch pytaniach, które faktycznie wykonują commit/push przed kontynuacją.

### Odporność `06_deploy.sh` na zerwane połączenie SSH podczas długiego builda (Story 66)

Realny incydent: długi `next build` na QNAP zostawił hosta zbyt
zajętego/wygłodzonego CPU-wise, żeby odpowiedzieć na keepalive SSH w czasie
— klient ssh poddał się własnym, wbudowanym komunikatem OpenSSH
`Timeout, server <host> not responding.` w połowie buildu, bez żadnej
informacji, czy zdalna strona faktycznie skończyła.

Naprawa jest architektoniczna, nie tylko większy timeout:
`06_qnap_test_ssh/06_deploy.sh` uruchamia faktyczny
`04_qnap_test/06_deploy.sh` **odpięty (detached)** na hoście QNAP
(`nohup`, `disown`, bez kontrolującego terminala, output przekierowany do
pliku logu pod `$QNAP_REPO_DIR/.runtime/remote-jobs/`) — zamiast trzymać go
przywiązanym do jednej, długo żyjącej sesji SSH. Lokalna strona
(`run_remote_job_with_progress` w `bash-scripts/common/lib.sh`) łączy się
ponownie co kilka-kilkanaście sekund (krótkie, tanie połączenia) żeby
pokazać nowy fragment logu i sprawdzić, czy zadanie się zakończyło —
nieudana próba połączenia w trakcie pollingu jest traktowana jako
"nadal działa, spróbuj ponownie", nigdy jako porażka zadania. O
sukcesie/porażce decyduje wyłącznie realny kod wyjścia zapisany przez
zdalne zadanie po zakończeniu, nigdy sam fakt, że któreś połączenie SSH się
powiodło lub nie.

Dodatkowo: bazowy `SSH_OPTS`'s `ServerAliveInterval`/`ServerAliveCountMax`
podniesiony z 5s×3 (15s tolerancji) na 10s×12 (120s) dla wszystkich
operacji — obrona w głębi, na wypadek gdyby host był chwilowo wolny
(np. podczas normalnego 60-sekundowego oczekiwania na healthcheck w
`03_restart.sh`), nie tylko podczas samego builda.

### Promocja obrazu TEST → PROD: `06_last_from_test.sh`

PROD nigdy nie buduje — dostaje dokładnie ten obraz, który już działa i
został zweryfikowany na TEST. Kontrakt:

1. Odczytuje obraz **aktualnie uruchomiony** na `chad-dashboard-test`
   (`docker inspect --format '{{.Image}}'`, nie tylko plik tagu — na
   wypadek dryfu).
2. Czyta jego tag, image ID, i git SHA (label
   `org.opencontainers.image.revision`, zapisany przy buildzie TEST).
3. Sprawdza, że ten obraz istnieje lokalnie na QNAP.
4. Pokazuje użytkownikowi: tag TEST, image ID TEST, SHA TEST, aktualny
   obraz PROD (co zostanie zastąpione).
5. Pyta o potwierdzenie (wpisanie `PROD`).
6. Zapisuje `.image-tag.chad-dashboard.env` na wartość z TEST (ten sam
   plik, który TEST już zapisał — to zapis, nie nowy mechanizm, ale
   jawny, potwierdzony krok zamiast domyślnego współdzielenia pliku).
7. Nigdy nie wykonuje `docker build`/`docker compose build`.
8. `05_qnap_prod/03_restart.sh`, potem `05_qnap_prod/05_status.sh`.
9. Na końcu potwierdza (`docker inspect`), że TEST i PROD wskazują na ten
   sam image ID — jawnie drukuje sukces/porażkę.

Jeśli obraz TEST nie da się jednoznacznie ustalić albo nie istnieje lokalnie
— przerywa, nie zgaduje.

## Registry flow (GHCR) — Story 70: opcjonalna, RÓWNOLEGŁA droga bez builda na QNAP

**To jest dodatkowa opcja, nie zamiennik.** Story 70 jest w całości
addytywna — `04_qnap_test/{02_build,06_deploy}.sh`,
`06_qnap_test_ssh/06_deploy.sh` i `docker-compose.qnap.test.yml` (wraz z
jego sekcją `build:`) pozostają dokładnie takie jak w Story 63, bez zmiany
zachowania. Poniższy przepływ to nowa, osobna droga, uruchamiana wyłącznie
przez `08_registry_test/06_deploy.sh`/`09_registry_prod/06_last_from_test.sh`
— nigdy automatycznie, nigdy jako podmiana starej drogi:

```
Mac (08_registry_test/02_build.sh) LUB GitHub Actions (workflow_dispatch)
    → docker build + tag <timestamp>-<short-git-sha> + OCI label revision
    → docker push do ghcr.io/pawelpanda2/chad-dashboard
    → 08_registry_test/03_restart.sh: SSH → docker login (read-only token)
      → docker pull → docker tag (na lokalną nazwę chad-dashboard:<tag>,
      dokładnie tę, której 04_qnap_test/03_restart.sh już oczekuje)
      → zapis .image-tag.chad-dashboard.env → 04_qnap_test/03_restart.sh
      (BEZ ZMIAN, dokładnie ten sam plik co dla starej drogi budowania na
      QNAP) → 04_qnap_test/05_status.sh (BEZ ZMIAN)
```

`docker-compose.qnap.test.yml` **nadal ma** sekcję `build:` (Story 70 jej
nie usunęła) — `04_qnap_test/02_build.sh` może nadal budować na QNAP
dokładnie jak wcześniej. `08_registry_test`'s droga po prostu z tej sekcji
nie korzysta (pull + retag zastępuje wynik, jaki dałby lokalny build), nie
usuwając możliwości budowania na QNAP dla kogoś, kto woli starą drogę.

### Obraz i tagi

- **Nazwa obrazu:** `ghcr.io/pawelpanda2/chad-dashboard` — `pawelpanda2` to
  faktyczny właściciel tego repo na GitHubie (`git remote -v`), potwierdzone
  przed implementacją, nie zgadywane; `chad-dashboard` to ta sama nazwa
  lokalna używana wszędzie od zawsze.
- **Format tagu:** `<YYMMDD_HHMMSS>-<short-git-sha>`, np.
  `260717_143022-abc1234` — niezmienny, nigdy `latest`
  (`bash-scripts/common/lib.sh`'s `ghcr_generate_tag()`).
- **Digest:** GHCR generuje go automatycznie przy pushu; nie jest osobno
  przechowywany — czytany na żądanie przez `docker image inspect -f
  '{{index .RepoDigests 0}}'` (patrz `ghcr_pull_and_retag`/
  `09_registry_prod/06_last_from_test.sh`). Promocja na PROD pobiera
  jawnie po tym digeście, nie tylko po tagu.
- **`.image-tag.chad-dashboard.env`** — ten sam kanoniczny plik z Story 63,
  bez zmian; zapisywany przez `04_qnap_test/02_build.sh` (po buildzie na
  QNAP, stara droga, bez zmian) ALBO przez `08_registry_test/03_restart.sh`
  (po pullu z GHCR, nowa droga) — który ostatnio zapisał, ten wygrywa,
  dokładnie tak jak dwa źródła zapisu tego samego pliku już działały wcześniej.

### Sekcja GHCR w `bash-scripts/common/lib.sh`

Wspólna logika, używana przez `08_registry_test` i `09_registry_prod` (nie
duplikowana): `ghcr_image_ref`, `ghcr_docker_login` (zawsze
`--password-stdin`, token nigdy nie trafia do logów ani argumentów CLI),
`ghcr_generate_tag`, `ghcr_build_tag_push` (build lokalny + push, tylko po
udanym buildzie), `ghcr_pull_and_retag` (pull + retag na lokalną,
compose-kompatybilną nazwę).

### `08_registry_test/` — pełny deployment TEST przez GHCR

| Plik | Gdzie działa | Co robi |
|---|---|---|
| `01_config.sh` | — | stałe: `GHCR_REGISTRY`/`GHCR_OWNER`/`GHCR_IMAGE` (niesekretne) |
| `02_build.sh` | **lokalnie (Mac)** | build + tag + push do GHCR; wymaga `.env.local`'s `GHCR_PUSH_USERNAME`/`GHCR_PUSH_TOKEN` |
| `03_restart.sh` | SSH → QNAP | login (read token) + pull + retag lokalny + zapis tagu + woła `04_qnap_test/03_restart.sh` |
| `04_end.sh` / `05_status.sh` | SSH → QNAP | cienki passthrough do `04_qnap_test/{04_end,05_status}.sh` (identyczne jak `06_qnap_test_ssh`'s) |
| `06_deploy.sh` | lokalnie + SSH | git preflight → `02_build.sh` → `03_restart.sh` → `05_status.sh` — nowy główny punkt wejścia, zastępuje rolę `06_qnap_test_ssh/06_deploy.sh` |

Brak `07_logs.sh` — `04_qnap_test` go nie ma, nie ma czego owijać.

### `09_registry_prod/` — promocja PROD przez GHCR

| Plik | Gdzie działa | Co robi |
|---|---|---|
| `01_config.sh` | — | te same stałe co `08_registry_test/01_config.sh` (jeden obraz, dwie kopie stałych — ten sam wzorzec co `04_qnap_test`/`05_qnap_prod`) |
| `03_restart.sh` / `04_end.sh` / `05_status.sh` | SSH → QNAP | identyczne jak `07_qnap_prod_ssh`'s (wymagają `PROD` tam gdzie tamte też wymagały) |
| `06_last_from_test.sh` | SSH → QNAP | **jedyna operacja wdrożeniowa PROD** — pobiera tag/digest/SHA z TEST, pokazuje, pyta `PROD`, pulluje z GHCR PO DIGEŚCIE, retaguje lokalnie na tag TEST, restart, status, weryfikacja shared+TEST+zgodności image ID |

**Bez `02_build.sh`/`06_deploy.sh`** — PROD nigdy nie buduje, tak jak od
Story 63.

**Uwaga:** `07_qnap_prod_ssh/06_last_from_test.sh` (Story 63) nadal działa
i nie została tknięta — polega na współdzielonym lokalnym cache Dockera
(TEST i PROD na tym samym hoście), nie na jawnym pullu z rejestru.
`09_registry_prod/06_last_from_test.sh` jest bardziej rygorystycznym,
GHCR-natywnym następcą (jawna weryfikacja przez digest) — oba bezpieczne,
`09_registry_prod` jest zalecaną drogą na przyszłość.

### Sekrety GHCR

Dwa **osobne, oba faktycznie utworzone** tokeny GitHub (Personal Access
Token, classic), nigdy ten sam:

| Zmienna | Plik | Zakres | Użycie |
|---|---|---|---|
| `GHCR_PUSH_USERNAME`/`GHCR_PUSH_TOKEN` | `.env.local` (Mac) | `write:packages` **tylko** | `08_registry_test/02_build.sh` |
| `GHCR_READ_USERNAME`/`GHCR_READ_TOKEN` | `.env.qnap` (QNAP) | `read:packages` **tylko** | `08_registry_test/03_restart.sh`, `09_registry_prod/06_last_from_test.sh` |

**Posiadanie tylko `GHCR_PUSH_TOKEN` NIE wystarcza, żeby przetestować cały
przepływ** — pozwoli zbudować i wypchnąć obraz z Maca (`02_build.sh`), ale
`03_restart.sh` (pull na QNAP) i tak się nie uda, dopóki `GHCR_READ_TOKEN`
nie istnieje w `.env.qnap` **na samym QNAP-ie** (nie w lokalnym `.env.qnap`
na Macu — to dwie osobne kopie tego pliku, per-host, tak jak
`.image-tag.*.env`). Mimo że `write:packages` technicznie implikuje też
odczyt, token push **nigdy** nie trafia na QNAP — to świadoma granica
minimalnych uprawnień (host, który tylko konsumuje obrazy, nie powinien
móc ich nadpisywać), nie przeoczenie. Sprawdzenie, czy oba tokeny faktycznie
istnieją (bez wypisywania ich wartości):

```bash
grep -E "^GHCR_PUSH_(USERNAME|TOKEN)=" .env.local              # lokalnie, Mac
ssh <user>@<qnap-host> 'grep -E "^GHCR_READ_(USERNAME|TOKEN)=" <QNAP_REPO_DIR>/.env.qnap'
```

Utworzenie: https://github.com/settings/tokens → "Generate new token
(classic)" → zaznacz **wyłącznie** odpowiedni scope → wygeneruj → wklej do
`.env.local`/`.env.qnap` (NIE do `.env.local.example`/`.env.qnap.example` —
te zawierają tylko `change_me`). GitHub Actions nie potrzebuje żadnego z
tych tokenów — używa automatycznego `GITHUB_TOKEN`, ograniczonego przez
workflow'a własny blok `permissions: packages: write`.

### Zasada ogólna: sekrety w `.env*`, reszta konfiguracji w `01_config.sh`

**Sekrety (tokeny, hasła, klucze API) żyją WYŁĄCZNIE w plikach `.env*`**
(`.env.local`, `.env.qnap` — gitignored, per-host). **Pozostała
konfiguracja — zwłaszcza stałe potrzebne modułom zależnym danego
środowiska (nazwy obrazów, rejestr, porty, nazwy projektów Compose) — żyje
w `01_config.sh` tego katalogu środowiskowego**, nie w `.env*` i nie
hardkodowana wprost w skryptach `02_*`-`07_*`. Przykład tego podziału:
`GHCR_REGISTRY`/`GHCR_OWNER`/`GHCR_IMAGE` (nazwa rejestru/obrazu — niesekretne,
w `09_registry_prod/01_config.sh` i `08_registry_test/01_config.sh`) obok
`GHCR_PUSH_TOKEN`/`GHCR_READ_TOKEN` (sekretne, w `.env.local`/`.env.qnap`) —
ten sam wzorzec co porty (`01_config.sh`) i hasła Mongo (`.env.qnap`). Nowy
skrypt/moduł powinien trzymać się tego podziału zamiast wymyślać trzecie
miejsce na konfigurację.

### GitHub Actions

`.github/workflows/build-dashboard-image.yml` — **tylko
`workflow_dispatch`**, nigdy automatycznie na `push` (zgodnie z tą samą
zasadą "deploy jest świadomą akcją", co reszta tego dokumentu). Buduje,
taguje (`ghcr_generate_tag`, ten sam kod co lokalny build), ustawia OCI
label, pushuje, pokazuje digest. Nigdy nie SSHuje na QNAP, nigdy nie
deployuje — to zawsze osobny, świadomy krok z Maca.

### Rollback

Do poprzedniego, wcześniej wypchniętego tagu:

```bash
bash bash-scripts/dashboard/08_registry_test/03_restart.sh <poprzedni-tag>
```

(pull tego konkretnego tagu z GHCR, retag, restart — bez żadnego builda).
Dla PROD: `09_registry_prod/06_last_from_test.sh` zawsze promuje to, co
TEST aktualnie uruchamia — żeby cofnąć PROD, najpierw cofnij TEST
powyższą komendą, potem uruchom promocję ponownie.

## Różnica względem `packages/net-content-provider/03_scripts/qnap/*.sh`

To DWA NIEZALEŻNE systemy, celowo:
- `packages/net-content-provider/03_scripts/qnap/*.sh` — samodzielny
  content-provider-api + Blazor GUI, bez mongo, bez dashboardu, sterowany
  plain `docker run` (nie Compose). Pozostaje nietknięty przez tę pracę.
- `bash-scripts/dashboard/{00,03,04,05}_*` (ten dokument) — stack dashboardu
  + wspólne mongo/CP, sterowany docker-compose.

## Historia zmian

**2026-07-19 — Story 72: `content-provider-api` usunięty z deploymentu.**
Skoro Mongo (`MongoCpProvider`) w pełni odczytuje/zapisuje dane CP
(`chad.cp_items`), .NET Content Provider przestał być uruchamiany:
`DBA_CONTENT_PROVIDER_ENABLED=false`/`DBA_PRIMARY_BACKEND=mongo` wszędzie,
serwis `content-provider-api` usunięty z `docker-compose.local.yml`,
`docker-compose.qnap.shared.yml`; `CONTENT_PROVIDER_API_URL` i port `12024`
usunięte z `docker-compose.qnap.test.yml`/`.prod.yml`;
`require_shared_services_healthy()` (w `bash-scripts/common/lib.sh`) sprawdza
teraz tylko `chad-mongodb`; `00_qnap_shared/02_build.sh` jest no-opem (nic
już nie buduje); appsettings-generation (`write_content_provider_appsettings`)
i `content_provider_image_tag_file()` usunięte z `lib.sh`/`01_config.sh` (bez
callerów). **Kod adaptera (`NetFileCpProvider`, `packages/dba`) i submoduł
`packages/net-content-provider` pozostają nietknięte** — to zmiana
wyłącznie w warstwie deploymentu, w pełni odwracalna (przywróć serwis w
compose + flagi). Sekcje tego dokumentu opisujące `content-provider-api`
jako aktywną część `00_qnap_shared`/`03_local_mac_docker` (DNS przez
`container_name`, appsettings.json, port `12024`, kroki `require_shared_
services_healthy`, co buduje `02_build.sh`) opisują stan **sprzed** tej
zmiany — zachowane jako dokumentacja architektury i ścieżki powrotu, nie
jako aktualny stan. `02_local_mac_tmux` (osobny, nie-Dockerowy dev-flow) nie
był częścią zakresu Story 72 i nadal może uruchamiać CP lokalnie przez
`bash-scripts/content-provider/run-content-provider-if-needed.sh` — patrz
`dashboard-start-scripts.md`.

**2026-07-17/18 — Story 70: dodana RÓWNOLEGŁA droga budowania
`chad-dashboard` przez GHCR, opcjonalna.** Nowe katalogi `08_registry_test/`
(pełny deployment TEST: build+push lokalnie/CI, potem pull+restart na
QNAP) i `09_registry_prod/` (promocja PROD przez GHCR, po digeście) —
alternatywa dla, nie zamiennik, budowania na QNAP. Motywacja: budowanie
Next.js na słabym QNAP-owym CPU jest kosztowne i (patrz Story 66) może
powodować zrywanie połączeń SSH przez wygasający keepalive przy bardzo
długich buildach — GHCR to opcjonalny sposób tego uniknąć, dla kogoś kto
go woli. **Story 70 jest w całości addytywna** (poprawka 2026-07-18, po
pierwotnej, zbyt inwazyjnej wersji): `04_qnap_test/{02_build,06_deploy}.sh`,
`06_qnap_test_ssh/06_deploy.sh` i `docker-compose.qnap.test.yml`'s sekcja
`build:` NIE zostały zmienione — stara droga budowania na QNAP działa
dokładnie tak jak w Story 63/66. Pełny opis: sekcja "Registry flow (GHCR)"
wyżej, `backlog/stories/70/`.

**2026-07-11 — architektura shared/test/prod.** Migracja z jednego pliku
compose (osobne mongo/CP na środowisko) na shared/test/prod, zweryfikowana
na realnym QNAP (s12, `100.117.139.83`): `chad-mongodb` healthy,
`chad-content-provider-api` `/health` → `anyRepoFound:true` (36 repo z
`/share/Dropbox`), oba dashboardy odpowiadają HTTP i wskazują na te same
kontenery shared. Legacy `personal-dashboard-prod` +
`content-provider-api-prod` (stary, niepowiązany deployment na
`/share/cp_1`) zatrzymane. Pełne wyniki: `shared-qnap-services.md`.

**2026-07-10 do 2026-07-14 — historia nazewnictwa `begin`/`start`.**
Skrypty tej rodziny nazywały się pierwotnie `start.sh`/`stop.sh`, zmienione
na `begin.sh`/`end.sh` 2026-07-10 (autouzupełnianie `b`/`e`/`s` zamiast
kolidującego `s`/`s`/`s`). Poprawka Story 54 (2026-07-14) przemianowała
wszystkie dosłowne `begin.sh`/`<NN>_begin.sh` na `re-start.sh`/
`<NN>_re-start.sh` w całym repo — z jednym świadomym wyjątkiem: dawny
`06_qnap_ssh/begin_{shared,test,prod}.sh` (inny wzorzec nazwy,
`begin_*.sh`, nie `begin.sh`) pozostał pod starą nazwą aż do Story 63,
która usunęła cały ten katalog na rzecz `06_qnap_test_ssh`/
`07_qnap_prod_ssh`. Lokalny tmux dev-flow (`02_local_mac_tmux`) miał przez
ten okres osobną, nieujednoliconą historię (`start`/`end`) — ujednolicona
dopiero w Story 63 (patrz `dashboard-start-scripts.md`).

**2026-07-16/17 — Story 63: ujednolicenie na `restart`, podział SSH,
PROD bez builda.** Ostatnia poprawka nazewnictwa: `re-start` → `restart`
(bez myślnika) wszędzie w rodzinie Docker Compose i w tmux dev-flow;
`06_qnap_ssh` zastąpiony przez `06_qnap_test_ssh`/`07_qnap_prod_ssh`;
`05_qnap_prod` stracił `02_build.sh`/`06_deploy.sh` na rzecz jedynej
operacji wdrożeniowej PROD, `07_qnap_prod_ssh/06_last_from_test.sh`; dodany
Git preflight dla `06_qnap_test_ssh/06_deploy.sh`; dodany git-SHA OCI label
na obrazie TEST. Pełny opis decyzji: `backlog/stories/63/`.
