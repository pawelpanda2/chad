# Dashboard — skrypty startowe (`bash-scripts/dashboard/`)

Status: aktualne, przetestowane end-to-end (2026-07-10).

## Cel

Jedna komenda do uruchomienia dashboardu lokalnie, bez pamiętania `pnpm`/`docker compose`/`tmuxinator`:

```bash
bash bash-scripts/dashboard/start.sh
```

## Co realnie uruchamia (i dlaczego)

Ustalone przez analizę kodu (nie zgadywanie): `packages/dashboard` **nie importuje MongoDB nigdzie w swoim kodzie** (zero `import ... from "mongodb"`, brak zależności `mongodb` w `package.json`) — to funkcjonalność przyszła (Folders/daily-habits/dates), jeszcze niezaimplementowana. Dlatego `start.sh` **celowo NIE uruchamia MongoDB**.

Realne zależności dashboardu dziś:
1. **`packages/dba` zbudowane** — dashboard importuje `dba` jako pakiet workspace; jeśli `dist/index.js` nie istnieje, `next dev` wywali się przy starcie. `start.sh` robi jednorazowy build przed startem sesji tmuxinator, potem tmuxinator przełącza `dba` w tryb `tsc --watch`.
2. **`packages/dashboard` (`next dev --turbopack`)** — właściwy proces dev.
3. **Content Provider API** (`.NET`, zewnętrzny wobec monorepo) — wiele route'ów API dashboardu (leads, statuses, msg-planner...) go wymaga. `start.sh` **tylko sprawdza dostępność** (`CONTENT_PROVIDER_API_URL` z `.env`) i wypisuje czytelne ostrzeżenie, jeśli nie odpowiada — **nie uruchamia go**, bo to osobny proces/serwis poza zakresem tego skryptu.

### Celowo NIE uruchamiane

- `contacts` (osobna aplikacja) — nie jest zależnością dashboardu.
- `beeper-sync`, `beeper-ws`, `beeper-oplog` — nie są jeszcze zmigrowane do monorepo i nie są zależnościami obecnego kodu dashboardu.
- MongoDB — obecny kod dashboardu go nie używa (patrz wyżej).
- Content Provider API — sprawdzane, nie startowane (patrz wyżej).
- `console` — osobny CLI, nie zależność dashboardu.

## Relacja z tmuxinator

`start.sh` uruchamia **scoped profil** `bash-scripts/dashboard/tmuxinator.dashboard.yml` (sesja `chad-dashboard`, 2 panele: `dba` watch + `dashboard` dev) — nie pełny root `.tmuxinator.yml` (sesja `chad`, dodatkowo Docker Mongo + `console`), żeby nie uruchamiać usług, których dashboard nie potrzebuje. Obie sesje mogą działać równolegle (różne nazwy).

Flaga tmuxinator do wskazania pliku configu to `-p <ścieżka>`, nie `-c` (błąd znaleziony i poprawiony wcześniej — `-c` nie istnieje w zainstalowanej wersji 3.4.1).

## Skrypty

| Skrypt | Działanie | Przetestowany |
|---|---|---|
| `start.sh` | Preflight → (build `dba` jeśli brak) → `tmuxinator start -p ...` | ✅ z roota i z `/tmp` |
| `stop.sh` | `tmux kill-session -t chad-dashboard` (tylko ta sesja) | ✅ |
| `restart.sh` | `stop.sh` + `start.sh "$@"` | ✅ |
| `status.sh` | Stan sesji tmux, czy port nasłuchuje, czy dashboard realnie odpowiada (curl), czy CP API dostępne | ✅ |
| `logs.sh` | Zrzut scrollbacku obu paneli (`tmux capture-pane`) bez potrzeby attach | ✅ |
| `build.sh` | Production build: `dba` → `dashboard`, w poprawnej kolejności | ✅ |

## Preflight checks (`start.sh`)

Sprawdza przed uruchomieniem: `pnpm`, `tmux`, `tmuxinator` zainstalowane; `packages/dashboard/.env` istnieje; `packages/{dba,console,dashboard}` istnieją; port (z `FRONTEND_PORT` w `.env`, domyślnie 3000) jest wolny. Przy braku czegokolwiek — czytelny komunikat z konkretną komendą naprawczą, nie surowy stack trace.

`node_modules` **nie jest instalowane automatycznie** — jeśli brakuje, skrypt każe uruchomić `--install` albo `pnpm install` ręcznie:

```bash
bash bash-scripts/dashboard/start.sh --install
```

## Port

Dev port brany z `FRONTEND_PORT` w `packages/dashboard/.env` (obecnie `12080`), eksportowany jako `PORT` (to jest zmienna, którą realnie czyta `next dev`). Wszystkie skrypty (`start`/`status`/`stop`) czytają ten sam `.env`, więc się nie rozjeżdżają.

## Zachowanie bez TTY

`tmuxinator start` na końcu robi `tmux attach`, co wymaga terminala. Gdy `start.sh` jest wywołany bez TTY (np. z innego skryptu, CI, agenta) — wykryte i naprawione podczas testów (błąd `open terminal failed: not a terminal`) — skrypt automatycznie używa `--no-attach` i wypisuje `tmux attach -t chad-dashboard` jako instrukcję. W normalnym terminalu użytkownika attach działa jak zwykle.

## Troubleshooting

- **"Port already in use"** → `bash bash-scripts/dashboard/status.sh` żeby zobaczyć co działa, potem `stop.sh`.
- **Content Provider API not reachable** → widoki niezależne od CP nadal działają; widoki zależne (leads, statuses, msg-planner) pokażą błąd. Uruchom CP API osobno.
- **`tmuxinator: command not found`** → `brew install tmuxinator` (wymaga Ruby, brew to załatwia).
- **Zmiana w `packages/dba` niewidoczna w dashboardzie** → sprawdź, czy panel "DBA (tsc --watch)" faktycznie przebudował (`bash bash-scripts/dashboard/logs.sh`); jeśli nie, `bash bash-scripts/dashboard/build.sh` i `restart.sh`.

## Testy wykonane (2026-07-10)

`pnpm install`, build `dba`, typecheck `console`, build `dashboard` — wszystkie ✅. `start.sh` z roota i z `/tmp` — ✅, identyczne zachowanie. Sesja tmux tworzy poprawne 2 panele z właściwymi tytułami i PID-ami. `curl http://localhost:12080` → `307` na `/login` (potwierdza, że to ten sam kod co produkcyjny dashboard). `status.sh`, `logs.sh`, `stop.sh`, `restart.sh`, `build.sh` — wszystkie uruchomione naprawdę, nie tylko sprawdzone jako istniejące pliki.
