# Dashboard — skrypty startowe (`bash-scripts/dashboard/` + root wrappery)

Status: aktualne, przetestowane end-to-end z realnym Content Providerem (2026-07-10).

## Cel

Jedna komenda z roota repo, bez pamiętania `pnpm`/`docker compose`/`tmuxinator`:

```bash
bash begin.sh
```

## Nazewnictwo (2026-07-10)

`start.sh`/`stop.sh` zmienione na `begin.sh`/`end.sh` — `start`/`status`/`stop` wszystkie zaczynały się na `s`, co psuło autouzupełnianie (`bash s<TAB>` było niejednoznaczne). Teraz: `b`egin / `e`nd / `s`tatus — jednoznaczne.

## Trzy procesy

1. **`dba`** (`tsc --watch`) — dashboard importuje `dba` jako pakiet workspace; `begin.sh` robi jednorazowy build przed startem, jeśli `dist/` nie istnieje.
2. **`dashboard`** (`next dev --turbopack`).
3. **Content Provider API** — **realnie sprawdzane I uruchamiane, jeśli nie działa** (zmiana z poprzedniej wersji, która tylko ostrzegała). Używa **prawdziwego, istniejącego skryptu** z `packages/net-content-provider/03_scripts/03_local-mac_docker/02_run_api_charp.sh` (Docker) — nie wymyślonej alternatywy.

### Celowo NIE uruchamiane

`contacts`, `beeper-sync`, `beeper-ws`, `beeper-oplog`, MongoDB, `console` — nie są zależnościami obecnego kodu dashboardu (zweryfikowane analizą kodu, nie zgadywaniem).

## Content Provider: skąd się bierze (2026-07-10 — zmiana architektury)

Do 2026-07-10 Content Provider był zewnętrznym sibling-repo (`../content-provider`, poza monorepo `chad`), wskazywanym opcjonalnym env `CONTENT_PROVIDER_REPO_PATH`. **To się zmieniło**: całe repo `content-provider` (nie tylko .NET — także Blazor, Aspire, próba Next.js, pluginy, eksperymenty TypeScript) zostało dołączone jako **Git subtree** pod:

```txt
packages/net-content-provider
```

Komenda użyta (repo źródłowe: `git@github.com:pawelpanda2/contentprovider.git`, branch `main`, historia zaszłości nieistotna):

```bash
git subtree add --prefix=packages/net-content-provider git@github.com:pawelpanda2/contentprovider.git main --squash
```

Wewnętrzna struktura `net-content-provider` **nie została zreorganizowana** — `api_charp/`, `front_blazor/`, `aspire/`, `front_nextjs/`, `plugin_charp/`, `plugin_nodejs/`, `typescript/`, `typescript_runner/`, `03_scripts/`, `04_dockerfiles/`, `architecture/` zostały zachowane 1:1. **Nie jest** traktowane jako pojedynczy pakiet pnpm — `pnpm-workspace.yaml` (`packages/*`, jeden poziom) go nie łapie, bo nie ma własnego `package.json` w rootcie; zweryfikowane (`pnpm install` nadal pokazuje tylko 4 workspace projects: root + dba + console + dashboard).

Równolegle powstał **`packages/content-provider`** — minimalny szkielet TypeScript/Node (przyszły następca), **nie** kopiujący kodu z `net-content-provider/typescript`/`typescript_runner`/`front_nextjs` (celowo — nie sprawdzono, czy ten kod jest aktualny względem dzisiejszej architektury). Zawiera tylko `package.json`, `tsconfig.json`, `src/types.ts` (model kompatybilności już ustalony w `26-07-10_cline_prompt_mongodb_qnap_folders_v3.md`), README z jasnym zaznaczeniem, że to nie jest jeszcze produkcyjny zamiennik.

`run-content-provider-if-needed.sh` domyślnie wskazuje na `$REPO_ROOT/packages/net-content-provider` (nie na hardcoded ścieżkę użytkownika) — override wciąż możliwy przez `CONTENT_PROVIDER_REPO_PATH` na wypadek wyjątków.

### Ważne odkrycie z testów: brakujący `.env`

`net-content-provider/.env` był gitignored w oryginalnym repo, więc **nie** trafił do subtree (subtree operuje na trackowanej historii git, nie na plikach roboczych). Skrypt `02_run_api_charp.sh` daje czytelny błąd z dokładną komendą naprawczą (`cp .env.local-mac.docker.example .env`). Do testów skopiowano realny `.env` z oryginalnego, wciąż istniejącego standalone repo (ta sama konfiguracja lokalna, `CONTENT_PROVIDER_STORAGE_HOST=/tmp/cp_repos` — bezpieczna, testowa ścieżka, nie produkcyjny Dropbox).

## Ownership tracking (kluczowe dla `end.sh`)

`end.sh` **nie może** zatrzymać Content Providera, który działał już przed `begin.sh` — to śledzone jawnie, nie zgadywane po porcie:

- `run-content-provider-if-needed.sh` sprawdza health **przed** startem czegokolwiek.
- Jeśli API już działa → **nic nie uruchamia**, nie zapisuje ownership. `end.sh` go nie tknie.
- Jeśli API nie działa → uruchamia przez `02_run_api_charp.sh`, zapisuje nazwę kontenera do `.tmp/dashboard/content-provider.owned` (gitignored).
- `end.sh` czyta ten plik: jeśli istnieje → `docker stop` + `docker rm` **tego konkretnego** kontenera, potem usuwa marker. Jeśli nie istnieje → zostawia Content Provider w spokoju, niezależnie od tego czy działa.
- Nigdy `killall`, szerokiego `pkill` ani zabijania po nazwie procesu — tylko `docker stop`/`docker rm` na jawnie zapisanej nazwie kontenera.

## Flow `begin.sh`

```txt
preflight checks (pnpm, tmux, tmuxinator, .env, packages, port wolny, sesja nie istnieje)
    ↓
build dba (jeśli brak dist/)
    ↓
run-content-provider-if-needed.sh --wait-only   (blokujące: check → conditional start → wait for health)
    ↓
tmuxinator start (3 panele: dba, dashboard, content-provider)
```

Krok CP jest **blokujący i synchroniczny, uruchamiany przed** interaktywną sesją tmuxinator — bo gdy tmuxinator raz „attachuje” terminal, kontrola nie wraca do `begin.sh` aż do detach, więc "poczekaj na health, potem uznaj start za zakończony" musi się zdarzyć wcześniej. Ten sam skrypt uruchamia się też wewnątrz panelu `content-provider` (bez `--wait-only`) — bezpiecznie, bo sprawdza health najpierw i nie duplikuje startu; drugi raz po prostu przechodzi do `docker logs -f`.

## Skrypty

| Skrypt | Działanie | Przetestowany |
|---|---|---|
| `begin.sh` | Preflight → build dba → ensure CP (start jeśli trzeba, czekaj na health) → tmuxinator (3 panele) | ✅ z roota, z `/tmp`, z CP działającym i niedziałającym |
| `end.sh` | Zatrzymuje sesję tmux; CP tylko jeśli `.tmp/dashboard/content-provider.owned` istnieje | ✅ oba przypadki (owned / nie-owned) |
| `restart.sh` | `end.sh` + `begin.sh "$@"` | ✅ |
| `status.sh` | Stan sesji, port, czy dashboard odpowiada, CP health + ownership | ✅ |
| `logs.sh` | Zrzut scrollbacku wszystkich 3 paneli | ✅ |
| `build.sh` | Production build: `dba` → `dashboard` | ✅ |
| `run-content-provider-if-needed.sh` | Idempotentny check/start/wait dla CP; `--wait-only` dla wywołania synchronicznego | ✅ |

## Root wrappery

```bash
bash begin.sh
bash end.sh
bash status.sh
```

Cienkie (kilka linii), tylko `exec` do właściwego skryptu w `bash-scripts/dashboard/` — bez duplikowania logiki. Działają z dowolnego katalogu.

## Testy wykonane (2026-07-10) — wszystkie realnie uruchomione

1. `bash begin.sh` z roota — ✅
2. `bash status.sh` z roota — ✅
3. Ponowne `bash begin.sh` przy działającej sesji — czytelny błąd, exit 1 — ✅
4. Komunikat wskazuje `status.sh`/`end.sh` (nie stare nazwy) — ✅
5. `bash end.sh` — ✅
6. Port `12080` zwolniony po `end.sh` — ✅
7. `bash begin.sh` przy CP uruchomionym ręcznie (zewnętrznie) — nie tworzy duplikatu kontenera (`docker ps` pokazuje 1, nie 2) — ✅
8. `bash end.sh` nie zatrzymuje zewnętrznie uruchomionego CP (health check po `end.sh` nadal `200 ok`) — ✅
9. `bash begin.sh` przy wyłączonym CP — uruchamia go realnie przez `02_run_api_charp.sh`, czeka na health, dopiero potem startuje tmuxinator — ✅
10. `bash end.sh` zatrzymuje i usuwa kontener uruchomiony przez tę sesję (`docker ps` po `end.sh` — kontener zniknął) — ✅
11. Wrapper `status.sh` z `/tmp` — ✅

## Troubleshooting

- **"Port already in use" / "session already running"** → `bash status.sh`, potem `bash end.sh`.
- **Content Provider nie startuje** → sprawdź `packages/net-content-provider/.env` istnieje (gitignored, nie ma go automatycznie po subtree — skopiuj z `.env.local-mac.docker.example` albo z działającej wcześniej konfiguracji lokalnej). Sprawdź `docker images | grep cp_webapi` — potrzebny wcześniej zbudowany obraz (`01_image_api_charp.sh`, jeśli brak).
- **Nie wiem, czy `end.sh` zatrzyma mój ręcznie uruchomiony CP** → nie zatrzyma, chyba że `.tmp/dashboard/content-provider.owned` istnieje (sprawdź `bash status.sh` — pokaże "started by this session" albo "running independently").
- **`tmuxinator: command not found`** → `brew install tmuxinator`.
