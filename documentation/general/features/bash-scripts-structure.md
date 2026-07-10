# Struktura `bash-scripts/`

Status: aktualne (2026-07-10). Katalog był wcześniej nazwany `03_scripts` — zmieniono nazwę i zaktualizowano wszystkie aktywne odwołania (root `package.json`, `.tmuxinator.yml`, `docker-compose*.yml`, własna dokumentacja). Pre-istniejące, historyczne odwołania do starego `03_scripts/nodejs/...` w `documentation/nodejs-style.md`, `packages/console/README.md` oraz w `packages/dashboard/03_scripts/` (osobny, wewnętrzny katalog skryptów odziedziczony z dawnego, samodzielnego repo `chad-dashbord` — opisuje inny, stary sposób deployu przez SSH/QNAP) zostały celowo pozostawione bez zmian — to dokumentacja historyczna dotycząca innej, starej struktury, nie części nowego `bash-scripts`.

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
│   ├── start.sh              # główne wejście: uruchamia dashboard + wymagane usługi
│   ├── stop.sh
│   ├── restart.sh
│   ├── status.sh
│   ├── logs.sh
│   ├── build.sh
│   └── tmuxinator.dashboard.yml  # profil tmuxinator scoped tylko do dashboardu
└── dev.sh                    # pełny stack (wszystkie packages) przez root .tmuxinator.yml
```

Nie utworzono pustych folderów `beeper/`, `docker/`, `qnap/` sugerowanych jako opcja — nie ma tam jeszcze żadnej realnej zawartości (moduły beeper nie są zmigrowane, docker/qnap są już pokryte przez pliki `docker-compose.*.yml` w rootcie). Foldery zostaną dodane, gdy będzie w nich co trzymać.

## Konwencja pisania skryptów

Każdy skrypt w `bash-scripts/` musi wyliczać root repo z własnego położenia, nigdy z `$PWD`:

```bash
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
```

Dzięki temu każdy skrypt działa identycznie niezależnie od katalogu, z którego został wywołany (`bash bash-scripts/dashboard/start.sh` z roota, `bash /pełna/ścieżka/start.sh` z `/tmp`, itd. — obie formy przetestowane).

## `bash-scripts/common/lib.sh`

Zawiera: `log_info/log_ok/log_warn/log_error` (kolorowe, no-op gdy nie-tty), `command_exists`, `port_in_use`, `require_command`, `require_file`. Nowe skrypty powinny z tego korzystać zamiast duplikować sprawdzenia.
