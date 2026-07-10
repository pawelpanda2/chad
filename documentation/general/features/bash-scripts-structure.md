# Struktura `bash-scripts/`

Status: aktualne (2026-07-11).

**Aktualizacja 2026-07-11**: `packages/dashboard/03_scripts/nodejs/` (stary,
odziedziczony z samodzielnego repo `chad-dashbord` katalog SSH/Docker-QNAP
deployu, opisany w poprzednim akapicie jako "celowo pozostawiony") **został
usunięty** — w pełni zastąpiony przez `bash-scripts/dashboard/{02_local_mac,
03_local_mac_docker,04_qnap_test,05_qnap_prod,06_qnap_ssh}/`. Zobacz
[dashboard-deployment-scripts.md](../../dashboard/common/features/dashboard-deployment-scripts.md)
dla pełnego kontraktu tych skryptów (build/start/end/deploy/status) i
[dashboard-start-scripts.md](../../dashboard/common/features/dashboard-start-scripts.md)
dla `02_local_mac` (tmux/pnpm, bez Dockera).

Status: aktualne (2026-07-10). Katalog był wcześniej nazwany `03_scripts` — zmieniono nazwę i zaktualizowano wszystkie aktywne odwołania (root `package.json`, `.tmuxinator.yml`, `docker-compose*.yml`, własna dokumentacja). Pre-istniejące, historyczne odwołania do starego `03_scripts/nodejs/...` w `documentation/nodejs-style.md`, `packages/console/README.md` dotyczą innej, starej struktury i pozostają bez zmian jako dokumentacja historyczna.

Główne skrypty dashboardu przemianowano (2026-07-10): `start.sh` → `begin.sh`, `stop.sh` → `end.sh`. **Dalsza zmiana (2026-07-11)**: w `02_local_mac/` te same skrypty mają teraz numeryczne prefiksy i `begin.sh` → `02_start.sh` (żeby `01_build.sh`/`02_start.sh` nie zaczynały się od tej samej litery) — patrz dashboard-deployment-scripts.md.

## Struktura

```txt
bash-scripts/
├── common/
│   └── lib.sh              # współdzielone funkcje pomocnicze (kolory, sprawdzanie komend/portów/plików)
├── mongo/
│   ├── backup.sh
│   ├── restore.sh
│   ├── health-check-mac.sh # Mac -> MongoDB@QNAP przez Tailscale
│   ├── rs-init.js           # idempotentna inicjalizacja replica set
│   └── backups/             # lokalne backupy (gitignored poza .gitkeep)
├── dashboard/
│   ├── begin.sh                            # główne wejście: uruchamia dashboard + dba watch + Content Provider
│   ├── end.sh                               # zatrzymuje to, co begin.sh uruchomił
│   ├── restart.sh                            # end.sh + begin.sh
│   ├── status.sh
│   ├── logs.sh
│   ├── build.sh
│   ├── run-content-provider-if-needed.sh      # idempotentny start/health-check Content Providera + ownership tracking
│   └── tmuxinator.dashboard.yml               # profil tmuxinator scoped do dashboardu (3 panele)
└── dev.sh                    # pełny stack (wszystkie packages) przez root .tmuxinator.yml
```

Nie utworzono pustych folderów `beeper/`, `docker/`, `qnap/` sugerowanych jako opcja — nie ma tam jeszcze żadnej realnej zawartości. Foldery zostaną dodane, gdy będzie w nich co trzymać.

## Root-level wrappery

Żeby nie trzeba było wchodzić do `bash-scripts/dashboard/`, w rootcie repo istnieją cienkie wrappery:

```bash
bash begin.sh     # = bash bash-scripts/dashboard/begin.sh
bash end.sh       # = bash bash-scripts/dashboard/end.sh
bash status.sh    # = bash bash-scripts/dashboard/status.sh
```

Każdy wrapper tylko wylicza swój własny katalog i wywołuje (`exec`) właściwy skrypt — żadna logika nie jest duplikowana. Działają z dowolnego katalogu.

## Konwencja pisania skryptów

Każdy skrypt w `bash-scripts/` musi wyliczać root repo z własnego położenia, nigdy z `$PWD`:

```bash
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
```

Dzięki temu każdy skrypt działa identycznie niezależnie od katalogu, z którego został wywołany — przetestowane dla `begin.sh`/`status.sh`/`end.sh` zarówno z roota, jak i z `/tmp`.

## `bash-scripts/common/lib.sh`

Zawiera: `log_info/log_ok/log_warn/log_error` (kolorowe, no-op gdy nie-tty), `command_exists`, `port_in_use`, `require_command`, `require_file`. Nowe skrypty powinny z tego korzystać zamiast duplikować sprawdzenia.
