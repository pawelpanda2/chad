# Deploy docs — od czego zacząć

Status: utworzone 2026-07-18. Ten dokument jest **wyłącznie indeksem
kolejności czytania** dla `ai-docs/deploy/` — nie opisuje żadnego standardu
sam w sobie. Analogiczny do `ai-docs/begin_here/01_ai_start.md`, ale
scoped do tematu deploymentu/skryptów. Jeśli pracujesz nad czymkolwiek w
`bash-scripts/dashboard/`, `docker-compose.qnap.*.yml`, `.github/workflows/`
lub odpalasz jakikolwiek deploy — przeczytaj ten plik PRZED czymkolwiek
innym w tym katalogu.

## 0. Zanim zaczniesz — dwa błędy, które już się zdarzyły

**Nie zgaduj z pamięci/dokumentacji, kiedy możesz sprawdzić żywy stan.**
Dokumentacja bywa aktualizowana z opóźnieniem względem realnego QNAP.
Zawsze, gdy odpowiedź ma znaczenie dla decyzji (nie tylko dla ogólnego
zrozumienia): `ls bash-scripts/dashboard/<katalog>/` zamiast zakładać
numerację, i realny `docker ps`/SSH na QNAP zamiast zakładać architekturę
z opisu. Przykład z 2026-07-18: health-check Content Providera i `docker ps`
na żywym hoście rozstrzygnęły w 30 sekund coś, co inaczej wymagałoby
zgadywania.

**"Obraz jest współdzielony" ≠ "kontener jest współdzielony" — to dwie
różne rzeczy w tym repo, dla dwóch różnych usług:**

| | Co jest jedno/wspólne | Co jest osobne |
|---|---|---|
| **Content Provider** (`chad-content-provider-api`) | Jeden, dosłownie ten sam **kontener**, używany przez TEST i PROD naraz (`docker ps` pokaże dokładnie jeden wiersz) | — nic, to jedna usługa dla obu środowisk. Restart tego kontenera (`00_qnap_shared/03_restart.sh`) dotyka OBU środowisk naraz. |
| **Dashboard** (`chad-dashboard`) | Jeden **obraz** (ten sam tag/image ID) — TEST buduje/pobiera go, PROD tylko go promuje, nigdy nie buduje własnego | Dwa **osobne kontenery**: `chad-dashboard-test` i `chad-dashboard-prod`, osobne restarty, osobne porty (`12020`/`12030`) |

Szczegóły: [shared-qnap-services.md](shared-qnap-services.md) (Content
Provider — jeden kontener) i [image-tagging-standard.md](image-tagging-standard.md)
(Dashboard — jeden obraz, dwa kontenery, promocja bez rebuildu).

## 1. Kolejność czytania

1. **[dashboard-deployment-scripts.md](dashboard-deployment-scripts.md)** —
   GŁÓWNY, autorytatywny dokument. Kontrakt numeracji operacji, struktura
   wszystkich katalogów `bash-scripts/dashboard/*`, git preflight, Story 66
   (odporność SSH na długi build), Story 70 (równoległa droga GHCR). Zacznij
   tutaj zawsze — reszta to szczegóły/uzupełnienia do tego dokumentu.
2. **[image-tagging-standard.md](image-tagging-standard.md)** — jak
   faktycznie działa `IMAGE_TAG` (dlaczego nigdy `:latest`, plik
   `.image-tag.<image>.env`, jak PROD promuje obraz TEST bez rebuildu).
   Czytaj przed zmianą czegokolwiek związanego z buildem/restartem/promocją.
3. **[shared-qnap-services.md](shared-qnap-services.md)** — architektura
   jednego MongoDB + jednego Content Providera dla TEST i PROD, realne
   wyniki testów na QNAP, mounty, porty. Czytaj przed zmianą czegokolwiek w
   `00_qnap_shared/` albo przy diagnozowaniu błędów Content Providera
   (patrz sekcja "Troubleshooting" tego dokumentu).
4. **[qnap-data-path.md](qnap-data-path.md)** — wąski, ale ważny incydent:
   `QNAP_CONTAINER_DATA_PATH` wskazujący na 16MB tmpfs zamiast prawdziwego
   wolumenu. Czytaj, jeśli MongoDB crash-looping albo zmieniasz ścieżki
   danych.
5. **[dashboard-start-scripts.md](dashboard-start-scripts.md)** — LOKALNY
   dev-flow bez Dockera (tmux/pnpm, `02_local_mac_tmux/`). Osobny temat od
   QNAP/Docker — czytaj tylko jeśli pracujesz nad lokalnym dev-flow, nie
   nad deploymentem.

## 2. Dokumenty historyczne / jednorazowe decyzje (czytaj tylko jeśli potrzebujesz kontekstu)

- **[bash-scripts-structure.md](bash-scripts-structure.md)** — jawnie
  oznaczone jako **PRZESTARZAŁE** (własny nagłówek pliku). Opisuje strukturę
  sprzed podziału na numerowane pod-katalogi. Zachowane wyłącznie jako zapis
  historyczny uzasadnienia nazewnictwa (`begin`/`end` zamiast `start`/`stop`).
  **Nie używaj go jako źródła prawdy o aktualnej strukturze** — do tego służy
  dokument 1 powyżej.
- **[2026-07-10_decision-beeper-mac-qnap-architecture.md](2026-07-10_decision-beeper-mac-qnap-architecture.md)**
  — decyzja architektoniczna Beeper (Mac) ↔ MongoDB (QNAP), środowiska
  test/prod. Kontekst dla Beepera, nie dla samego Dashboard/Content Provider
  deploymentu.
- **[2026-07-10_mongodb-replica-set-migration-plan.md](2026-07-10_mongodb-replica-set-migration-plan.md)**
  — plan migracji na replica set MongoDB, **przygotowany, ale NIE wdrożony**.
  Dziś MongoDB działa jako standalone (bez replica set) — patrz
  `shared-qnap-services.md` §4. Czytaj tylko jeśli faktycznie wdrażasz
  replica set.

## 2a. Zasada ogólna: sekrety w `.env*`, reszta konfiguracji w `01_config.sh`

Sekrety (tokeny, hasła, klucze API) żyją WYŁĄCZNIE w `.env*` (gitignored,
per-host: `.env.local` na Macu, `.env.qnap` na QNAP — dwie osobne kopie,
nie jeden współdzielony plik). Pozostała konfiguracja, zwłaszcza stałe
potrzebne modułom zależnym danego środowiska (nazwy obrazów, rejestr,
porty, nazwy projektów Compose), żyje w `01_config.sh` tego katalogu —
nigdy hardkodowana wprost w `02_*`-`07_*`. Pełny przykład podziału (GHCR):
`dashboard-deployment-scripts.md`, sekcja "Zasada ogólna: sekrety w
`.env*`...".

## 3. Częste nieporozumienia (żeby nie powtarzać tych samych pytań/błędów)

- **Sekcja 0 powyżej** (obraz vs kontener) — najczęstsze źródło błędnej
  diagnozy przy zgłoszeniach typu "coś nie działa w Content Providerze/
  Dashboardzie po deployu".
- **Git preflight `06_qnap_test_ssh/06_deploy.sh` ignoruje submoduły
  (`--ignore-submodules`)** — `packages/net-content-provider` jest gitowym
  submodułem; jego wskaźnik commita regularnie pokazuje się jako
  " M packages/net-content-provider" pod zwykłym `git status --porcelain`
  nawet przy zerowych realnych zmianach. Preflight (`git_deploy_preflight`
  w `bash-scripts/common/lib.sh`) świadomie to ignoruje od 2026-07-18 —
  jeśli widzisz realne, niezacommitowane zmiany w preflight, to nie submoduł
  jest ich źródłem.
- **Preflight ma trzecią opcję `[y/N/d]` na każdym pytaniu** — `d` = "wdróż
  mimo ostrzeżenia", pomija zalecaną akcję (commit/push) i od razu kończy
  cały preflight sukcesem. Nie to samo co `y` przy pierwszych dwóch pytaniach
  (`y` wykonuje zalecaną akcję, `d` ją pomija) — patrz
  `dashboard-deployment-scripts.md`, sekcja "Git preflight".
- **Podwójny segment `repos/repos` w ścieżce Content Providera
  (`/data/repos/repos/<guid>`) jest ZAMIERZONY, nie błędem** — `CP_REPOS_HOST_PATH`/
  `CP_REPOS_HOST_PATH_2` to korzenie kont Dropbox (`.../pawelpanda2`,
  `.../kamilgame042`), każdy z własnym podfolderem `repos/` w środku (Story
  68). Jeśli konkretny GUID/folder nie jest znajdowany mimo że
  `/health` Content Providera raportuje `anyRepoFound:true` i oba
  `pathDiagnostics` jako `accessible:true` — sprawdź NAJPIERW przez SSH,
  czy folder faktycznie istnieje na dysku (`ls /share/Dropbox/<konto>/repos/
  | grep <guid>`), zanim założysz stały bug w kodzie/cache. Częsta
  przyczyna: opóźnienie synchronizacji Dropbox (folder jeszcze nie
  zmaterializował się na QNAP w momencie żądania), nie stały problem
  wymagający restartu.
- **Posiadanie `GHCR_PUSH_TOKEN` (`.env.local`) NIE oznacza, że cały
  przepływ `09_registry_test/06_deploy.sh` zadziała** — QNAP potrzebuje
  osobnego, faktycznie utworzonego `GHCR_READ_TOKEN` we WŁASNYM
  `.env.qnap` (na hoście QNAP, nie w lokalnej kopii na Macu). Sprawdź obie
  strony przed pierwszym testem tego przepływu — patrz
  `dashboard-deployment-scripts.md`, sekcja "Sekrety GHCR".
