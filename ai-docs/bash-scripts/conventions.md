# bash-scripts/ — ogólny standard (niezależny od konkretnej aplikacji)

Status: utworzone 2026-07-19. Wydzielone z `ai-docs/deploy/dashboard-deployment-scripts.md`,
gdzie ten wzorzec był opisany razem z CHAD-owymi specyfikami (QNAP, GHCR,
MongoDB) — tutaj sam wzorzec, bez tego kontekstu. Konkretne zastosowanie w
tym repo: `ai-docs/deploy/`.

## 1. Struktura katalogów

```
bash-scripts/
├── common/
│   └── lib.sh              # współdzielone funkcje — sekcja 6
└── dashboard/
    └── <NN_środowisko>/     # jeden katalog na środowisko/tryb pracy
        ├── config.sh         # (albo 01_config.sh — sekcja 3) stałe niesekretne
        └── ...                # pełna rodzina albo 2 pliki, patrz sekcja 3
```

**Nazwa środowiska = `<NN>_<opisowa_nazwa>`**, np. `04_qnap_test`,
`05_qnap_prod`, `08_registry_test`. Prefiks liczbowy to tylko kolejność
sortowania/czytelności w `ls` — nie koduje slotu operacji (to robią numery
WEWNĄTRZ każdego katalogu, sekcja 2).

## 2. Kontrakt numeracji operacji (globalny, ten sam we WSZYSTKICH katalogach środowisk)

| Slot | Znaczenie | Nigdy nie robi |
|---|---|---|
| `01_config.sh` | przygotowanie/wygenerowanie konfiguracji środowiska — **tylko `source`owany, nigdy uruchamiany bezpośrednio** | — |
| `02_build.sh` | budowanie obrazu Docker lub artefaktu (np. `pnpm build`) | uruchamiania kontenerów, zatrzymywania działającego środowiska, usuwania danych |
| `03_re-start.sh` | start jeśli nie działa, albo restart z już zbudowanego obrazu/artefaktu | **nigdy nie buduje** |
| `04_end.sh` | zatrzymanie środowiska (tylko zasoby własne tego środowiska) | usuwania wolumenów/obrazów, `-v`, `system prune` |
| `05_status.sh` | stan + healthchecki | zmiany stanu |
| `06_deploy.sh` | pełny deployment = typowo `02_build`→`03_re-start`→`05_status`, wołane, nie duplikowane | duplikowania logiki innych skryptów |
| `07_logs.sh` | podgląd logów | — |

**Zasady:**
- **Luki są celowe.** Jeśli środowisko nie potrzebuje danej operacji, jej
  numer po prostu nie występuje w tym katalogu — reszta numeracji się NIE
  przesuwa. Przykład realny z tego repo: `05_qnap_prod/` nie ma
  `02_build.sh`/`06_deploy.sh` wcale, bo PROD nigdy nie buduje własnego
  obrazu — jedyna droga, żeby dostał nową wersję, to promocja obrazu z TEST.
- Numer identyfikuje **rodzaj operacji w całym repo**, nie tylko kolejność
  plików w jednym katalogu.
- Narzędzia czysto techniczne, które nie są jedną z powyższych operacji
  (np. ręczne zwalnianie zajętego portu) dostają numer **poza** zakresem
  `01`-`07` — konwencja `9x_*` (przykład realny: `03_local_mac_docker/90_port-kill.sh`).
- Zawsze `ls bash-scripts/dashboard/<środowisko>/` zamiast zakładać, które
  pliki istnieją z pamięci — nie każde środowisko ma wszystkie siedem.

## 3. Kiedy pełna rodzina 7 plików, a kiedy 2 pliki (`config.sh` + `deploy.sh`)

**Domyślnie zaczynaj od najprostszej struktury, która realnie rozwiązuje
problem — nie buduj z góry pełnej rodziny "na zapas".**

- Jeśli środowisko ma **realnie osobne, niezależnie wywoływane operacje**
  (np. ktoś chce zbudować bez restartu, albo sprawdzić status bez
  deployowania) — użyj pełnej numerowanej rodziny z sekcji 2. Przykład:
  `04_qnap_test/` — build na QNAP i restart to realnie osobne kroki, ktoś
  może chcieć zrobić samo jedno albo drugie.
- Jeśli środowisko ma **jeden sensowny punkt wejścia** (nikt nigdy nie
  chce jednego kroku bez drugiego) — użyj tylko `config.sh` + `deploy.sh`.
  Przykład realny z tego repo: `08_registry_test/` i `09_registry_prod/`
  (build lokalny + push do GHCR + SSH pull+restart+status na QNAP — jeden
  ciągły flow, więc jeden `deploy.sh`, zamiast pierwotnie zaimplementowanej
  pełnej rodziny 5 plików, która okazała się warstwami bez korzyści). Jeśli
  później pojawi się realna potrzeba osobnego kroku (np. rollback bez
  rebuildu), dodaj wtedy konkretny plik/argument — nie z góry.

## 4. Sekrety vs konfiguracja — rozdzielone, zawsze

- **Sekrety (tokeny, hasła, klucze API) żyją WYŁĄCZNIE w plikach `.env*`**
  (gitignored, per-host: `.env.local` na Macu, `.env.qnap` na QNAP — dwie
  osobne kopie, nie jeden współdzielony plik). Każdy `.env*` ma
  odpowiadający, **commitowany** `.env*.example` z samymi placeholderami
  (`change_me`).
- **Pozostała konfiguracja — zwłaszcza stałe potrzebne temu konkretnemu
  środowisku (porty, nazwy obrazów/projektów, adresy rejestrów) — żyje w
  `01_config.sh`/`config.sh` tego katalogu**, nie w `.env*` i nie
  hardkodowana wprost w innych skryptach.

## 5. Standard tagowania obrazów

Pełny opis: [image-tagging-standard.md](image-tagging-standard.md). Skrót:
własne obrazy nigdy `:latest`; jeden tag na build (`YYMMDD_HHMMSS`, jeśli
budowany przez rejestr: `-<short-git-sha>` dodatkowo); zapis do
gitignored `.image-tag.<obraz>.env` TYLKO po udanym buildzie; `03_re-start.sh`
twardo failuje bez tego pliku; `05_status.sh`/`04_end.sh` czytają łagodniej
(placeholder `"none"` zamiast twardego błędu).

## 6. `bash-scripts/common/lib.sh` — co ma zawierać

Jeden plik ze wspólnymi funkcjami, `source`owany (nigdy uruchamiany), zero
duplikacji logiki między skryptami środowisk. W tym repo zawiera m.in.:

- `log_info/log_ok/log_warn/log_error`, `command_exists`, `require_command`,
  `require_file`.
- `port_in_use`, `ensure_port_available`, `kill_process_on_port` — zawsze
  najpierw sprawdzają, czy port zajmuje kontener Docker (i wtedy
  zatrzymują/usuwają TYLKO ten kontener), dopiero potem zwykły proces
  (SIGTERM → odczekaj → SIGKILL jeśli nadal żyje). Nigdy szerokiego
  `docker system prune`/`pkill`/`killall`.
- `write_image_tag`/`require_image_tag`/`image_tag_for_readonly` — sekcja 5.
- `load_qnap_ssh_config`, `run_remote`, `run_remote_capture`,
  `run_remote_script` — sekcja 8.
- `git_deploy_preflight` — sekcja 7.
- `ghcr_*` — helpery specyficzne dla GHCR (przykład tego, jak
  środowisko-specyficzna logika może żyć w `lib.sh`, jeśli jest
  współdzielona przez więcej niż jedno środowisko rejestru).

## 7. Git preflight — dla KAŻDEJ operacji, która buduje z lokalnego kodu źródłowego

Jeśli jakiś skrypt (typowo `deploy.sh`/`06_deploy.sh` środowiska, które
faktycznie buduje) uruchamia build z aktualnego stanu repo — PRZED
połączeniem/buildem sprawdź:

1. **Branch + upstream.** Detached HEAD → błąd. Brak skonfigurowanego
   upstreamu → błąd.
2. **Niezacommitowane zmiany** — `git status --porcelain --ignore-submodules`
   (flaga `--ignore-submodules` jest ważna: submoduł regularnie pokazuje się
   jako zmieniony przez sam fakt różnicy commitów, bez żadnych realnych
   zmian — bez tej flagi preflight fałszywie alarmuje niemal zawsze).
3. **Lokalne commity niewypchnięte** (`git rev-list --count upstream..HEAD`).
4. **Brak nowych commitów na zdalnym** (porównanie lokalnego `HEAD` z tym,
   co faktycznie jest wdrożone na docelowym hoście przez dodatkowe
   read-only SSH).

**Każde z powyższych pytań ma trzy opcje, nie dwie:**

| Opcja | Znaczenie |
|---|---|
| `y`/`Y` | wykonaj zalecaną akcję (commit / push / kontynuuj) i idź dalej |
| `N` (domyślne przy commit/no-new-commits) lub puste | przerwij cały deployment |
| `d`/`D` | **pomiń zalecaną akcję i mimo to zakończ CAŁY preflight sukcesem od razu** — deployment ruszy z tym, co już jest na zdalnym, bez dalszych pytań. Świadomy skrót "wiem, jest ostrzeżenie, chcę mimo to wdrożyć teraz" — inny przypadek niż `y`, które faktycznie wykonuje commit/push. |

Tryb `--non-interactive`: niezacommitowane zmiany i brak push = twardy
błąd, zero pytań. Brak nowych commitów na zdalnym w tym trybie to tylko
informacja, nie błąd.

Implementacja: `git_deploy_preflight` w `bash-scripts/common/lib.sh`.

## 8. SSH — dla zdalnych środowisk

- **Brak `-tt`** w komendach automatyzacji — `-tt` przez `sshpass` w
  środowisku nieinteraktywnym może zawiesić się w nieskończoność po
  zakończeniu zdalnej komendy (potwierdzony realny problem). Zwykłe `ssh`
  (bez `-t`) nadal streamuje output live dla człowieka.
- **`ServerAliveInterval`/`ServerAliveCountMax` hojne** (w tym repo: 10s ×
  12 = 120s tolerancji, podniesione z 5s × 3 po realnym incydencie) — zbyt
  krótki keepalive zrywa połączenie w środku długiej, cichej operacji z
  komunikatem OpenSSH `Timeout, server <host> not responding.`, bez
  informacji, czy zdalna strona faktycznie skończyła.
- **Dla operacji długich i cichych** (np. build trwający kilka-kilkanaście
  minut) — mechanizm detached/polled zamiast polegania na samym większym
  timeout: zdalna komenda odpięta (`nohup`/`disown`, output do pliku logu),
  lokalna strona łączy się ponownie co kilka-kilkanaście sekund krótkimi
  połączeniami. Nieudana próba połączenia podczas pollingu = "spróbuj
  ponownie", nigdy "zadanie padło" — o sukcesie/porażce decyduje WYŁĄCZNIE
  realny kod wyjścia zapisany przez zdalne zadanie.
- **Komenda zdalna z zagnieżdżonymi pojedynczymi cudzysłowami** (typowo `cd
  '$REPO_DIR' && ...` sklejane w kolejny heredoc/string) — zakoduj w
  base64 zamiast ręcznie escapować. Prostsze i odporne na dowolną treść.
- **Inna architektura hosta docelowego niż maszyny budującej** (w tym
  repo: Apple Silicon Mac buduje, QNAP jest x86_64) — zawsze jawnie ustaw
  `--platform` przy `docker build`, nigdy nie polegaj na domyślnej
  architekturze maszyny budującej (realny incydent: obraz zbudowany bez
  `--platform` na arm64 Macu crash-loopował na QNAP z `exec format error`).
- **Docker CLI na zdalnym hoście może mieć nietypowy `$HOME`** — np. QNAP-owy
  Container Station wrapper (`/lib/container-station/ld-wrapper.sh`)
  nadpisuje `$HOME` na katalog, który może nie istnieć/nie być zapisywalny
  dla usera SSH, przez co `docker login` failuje z mylącym błędem. Ustaw
  `DOCKER_CONFIG` jawnie na zapisywalny katalog (np. `$REPO_ROOT/.runtime/
  docker-config`), ale **tylko dla zdalnej strony** — narzucenie tego
  samego globalnie zepsuło lokalny build na Macu (Docker Desktop rozwiązuje
  swój socket przez kontekst, którego metadane żyją w realnym `~/.docker`).

## 9. Konwencja pisania każdego skryptu

```bash
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/config.sh"   # albo 01_config.sh
```

Każdy skrypt wylicza `REPO_ROOT` z własnego położenia (`BASH_SOURCE`),
**nigdy z `$PWD`** — działa identycznie niezależnie od katalogu, z którego
zostanie wywołany.

**Funkcja, która ma zwracać wartość do przechwycenia przez `$(...)`,
kieruje CAŁY swój diagnostyczny output (`log_info`/`docker build`/`docker
push`/itd.) na `>&2`, a jedyną linią na stdout jest ostateczna wartość.**
Realny bug w tym repo: `docker push` (w przeciwieństwie do `docker
build`/BuildKit, które już idzie na stderr) domyślnie pisze postęp na
stdout — brak `>&2` przy tym jednym wywołaniu zanieczyściło przechwytywany
tag całym logiem pusha.

## 10. Nazewnictwo

- Operacja startowa/restartowa nazywa się **`restart`** (nie `begin`,
  `start`, `re-start`). Operacja zatrzymująca nazywa się **`end`** (nie
  `stop`). Historia zmian nazewnictwa w tym repo:
  [bash-scripts-structure.md](bash-scripts-structure.md).
- Jedna nazwa w całym repo dla tej samej operacji.

## 11. Zasady bezpieczeństwa (zawsze)

- Nigdy `docker compose down -v`, `docker system prune`, ręczne usuwanie
  danych/wolumenów bez wyraźnej potrzeby.
- `04_end.sh` usuwa **wyłącznie** zasoby własnego środowiska/projektu —
  jeśli jakiś zasób jest współdzielony między środowiskami, ostrzega o tym
  w logu zamiast cicho go zatrzymywać.
- Operacje na środowisku produkcyjnym wymagają jawnego, wpisanego
  potwierdzenia (np. wpisania słowa `PROD`), nie samego `[y/N]`.
- Port zajęty przez coś spoza Dockera → nie zabijaj automatycznie, wypisz
  PID/nazwę procesu i przerwij.
