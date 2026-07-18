# Sesja 2026-07-10 — log Claude

Zapis pytań, decyzji i pracy z dzisiejszej (bardzo długiej) sesji. Formalne dokumenty decyzyjne są w `documentation/ai-docs/` — ten plik to chronologiczny/tematyczny kontekst uzupełniający, żeby nie trzeba było odtwarzać całej rozmowy od zera.

## 1. Punkt wyjścia i migracja szkieletu monorepo

- Znaleziono pusty, świeżo utworzony `chad` (GitHub `pawelpanda2/chad`), dodany do working directories w trakcie sesji.
- Duży prompt architektoniczny (`documentation/ai-docs/26-07-10_cline_prompt_mongodb_qnap_folders_v3.md`) — migracja Content Provider → MongoDB, kompatybilność, QNAP, zakładka Folders, `daily habits`/`dates`. Zapisany jako niezmieniony zapis historyczny (nie edytować).
- Decyzja o formacie pliku treści CP: **`body.txt`** (z rozszerzeniem) — było chwilowe zamieszanie z wersją "bez rozszerzenia", ostatecznie cofnięte.
- Zbudowano szkielet: `packages/{dba,console,dashboard}` skopiowane i przemianowane ze standalone repo (`chad-dba`, `chad-console`, `chad-dashbord`), pnpm workspace, `.tmuxinator.yml`, `docker-compose.{mac,qnap.test,qnap.prod}.yml` dla MongoDB (replica set przygotowany, nie wdrożony na realny QNAP).
- Znaleziska bezpieczeństwa: kopiowanie starych repo przeniosło realne `.env` i `prisma/dev.db` — `.gitignore` rozszerzony (`.env*` zamiast wąskiego wzorca). Prawdziwy adres Tailscale QNAP (`100.117.139.83`, urządzenie „s12") nigdy nie trafił do repo — tylko do pamięci Claude poza repo.
- Konwencja portów właściciela: **12020–12029 = test, 12030–12039 = prod** — korekta mojego błędnego założenia, że publicznie dostępny port 12020 oznacza produkcję.

## 2. Architektura Mac ↔ QNAP (Beeper)

- `beeper-ws`/`beeper-sync` mają działać na Macu (bo tam jest Beeper Desktop), `beeper-oplog`/MongoDB/dashboard na QNAP, połączenie przez Tailscale.
- `directConnection=true` wymagane po stronie klientów zewnętrznych (Mac) łączących się z single-node replica setem na QNAP — member hostname to nazwa serwisu Docker Compose (`mongodb`), nierozwiązywalna z zewnątrz.
- MongoDB replica set: odkryto i naprawiono realny problem — `security.keyFile` wymagany przy auth+replSet nawet dla jednego node'a (keyfile generowany wewnątrz kontenera Linux, nie przez bind-mount z hosta, żeby uniknąć różnic uprawnień macOS/QNAP). W pełni przetestowane lokalnie (tymczasowa ścieżka, nie realny QNAP).
- Otwarte: czy `directConnection=true` faktycznie wystarczy z prawdziwym Node.js MongoDB driverem (testowane tylko `mongosh`) — do zweryfikowania przy migracji `beeper-ws`/`beeper-sync`.

## 3. Analiza modułów `contacts` (Beeper ecosystem)

`contacts` to osobny pnpm monorepo (nie pojedynczy pakiet!) z 4 modułami:
- `dashboard` — **SvelteKit**, nie Next.js (wymaga przepisania, nie kopiowania), brak auth, zależności specyficzne dla Maca (media proxy czyta lokalny cache Beepera).
- `beeper-oplog` — **nie jest prawdziwym mongo oplogiem** — to change-stream consumer normalizujący `beeper_events` do `contacts`/`channels`/`messages`. Wymaga replica set.
- `beeper-ws` — w `contacts` **tylko odbiera** (nie wysyła wiadomości!). Wersja z `hiddengarden.events` jest dojrzalsza (NATS, realnie wysyła) — ale decyzja: na razie baza z `contacts` (prosty listener), bez NATS.
- `beeper-sync` — jednorazowe/cron skrypty (nie daemon), dwa źródła: pełna historia z lokalnego SQLite Beepera + przyrostowo REST API.

Migracja tych modułów do `chad` **nadal zablokowana** — czeka na osobną zgodę.

## 4. `bash-scripts` — reorganizacja i skrypty dashboardu

- `03_scripts` → `bash-scripts`, reorganizacja w podfoldery: `common/` (lib.sh), `mongo/`, `dashboard/`.
- Główne skrypty przemianowane: `start.sh`→`begin.sh`, `stop.sh`→`end.sh` (żeby autouzupełnianie `b`/`e`/`s` było jednoznaczne). Root wrappery: `begin.sh`/`end.sh`/`status.sh`.
- **Realny bug znaleziony podczas testów**: root `begin.sh`/`end.sh` zniknęły z dysku mimo potwierdzonego zapisu (przyczyna nieznana — możliwy artefakt środowiska sandboxowego) — odtworzone i zweryfikowane jako trwałe przed commitem.
- `begin.sh` teraz **realnie uruchamia** Content Provider API (nie tylko ostrzega), jeśli nie działa — przez prawdziwy istniejący skrypt (`02_run_api_charp.sh`, Docker), z jawnym trackingiem ownership (`.tmp/dashboard/content-provider.owned`), żeby `end.sh` nigdy nie zatrzymał CP uruchomionego niezależnie od tej sesji. Przetestowane end-to-end (11 scenariuszy, wszystkie realnie uruchomione, nie tylko sprawdzone jako pliki).
- Ważne odkrycie: realna nazwa kontenera CP to `cp_api_csharp` (nie `cp_api`, jak zakładał stary `run_dev.sh` z chad-dashbord — rozjazd w starym kodzie).

## 5. Content Provider — ewolucja decyzji (WAŻNE, kilka zwrotów)

1. **Pierwsza wersja**: content-provider zostaje jako zewnętrzne sibling-repo, wskazywane przez opcjonalny env `CONTENT_PROVIDER_REPO_PATH`.
2. **Zmiana 1**: nie, ma być częścią monorepo od razu — Git subtree pod `packages/net-content-provider` (bo repo jest głównie .NET).
3. **Zmiana 2**: nazwa `net-content-provider` zbyt wąska — repo jest mieszane (.NET + Blazor + Aspire + próba Next.js + pluginy + eksperymenty TS). Nazwa zmieniona na `packages/net-content-provider`.
4. **Wykonano**: `git subtree add --prefix=packages/net-content-provider git@github.com:pawelpanda2/contentprovider.git main --squash` (wymagało najpierw initial commit w `chad`, bo miał zero commitów). Zweryfikowane: pnpm workspace nadal widzi tylko 4 projekty (root+dba+console+dashboard), subtree nie jest łapany przez glob `packages/*`. Real .env skopiowany z oryginalnego repo do testów (był gitignored, nie trafił do subtree).
5. **Zmiana 3 (najnowsza, jeszcze NIE wykonana)**: z powrotem `packages/net-content-provider`, ale teraz jako **Git submodule** (nie subtree) — bo stare repo `.NET` ma być dalej rozwijane osobno. Wymaga NAJPIERW oczyszczenia źródłowego repo `content-provider` (usunięcie non-.NET folderów, commit+push tam), DOPIERO POTEM dodania jako submodule. **Nic z tego jeszcze nie wykonane** — czekam na zatwierdzenie planu.

### Analiza folderów `content-provider` (fakty, nie zgadywanie)

| Folder | Technologia | Stan | Przeznaczenie |
|---|---|---|---|
| `api_charp`, `front_blazor`, `aspire`, `plugin_charp`, `03_scripts`, `04_dockerfiles` | .NET/C#/Blazor | Aktywne (commity 06-07/2026) | Zostają w `net-content-provider` |
| `front_nextjs` | Next.js 14 | Wczesna, nigdy nieuruchomiona próba (potwierdzone przez użytkownika) — **nie traktować jako wzorzec**, jedynie materiał referencyjny | Do przejrzenia, prawdopodobnie do wywalenia |
| `plugin_nodejs` | Node.js + OSA scripts | Aktywny — plugin desktopowy (otwiera edytor/Explorer/terminal), komunikuje się z GUI CP | **Osobny pakiet `packages/cp-plugin`**, NIE wewnątrz content-provider |
| `typescript_runner` | TS, wywołuje proces C# | Aktywny most Node↔.NET | Kandydat na bazę `net-adapter` (do analizy: HTTP czy spawn procesu, czy aktualny model) |
| `typescript` | Luźne `.ts`, brak `package.json` | **Jawnie martwy/zarezerwowany** (własny README: "not active") | Historyczny, do `content-provider/documentation/reserved-typescript-attempt` |

### Docelowa architektura nowej implementacji (TypeScript, etapami)

```
packages/
  cp-gui/                     # UI: standalone app ORAZ biblioteka komponentów używana w dashboard/Folders (dwa zastosowania, jeden kod)
  cp-plugin/                  # osobny, instalowany na desktopie plugin (edytor/Explorer/terminal) — przyciski nieaktywne gdy plugin niedostępny
  content-provider/
    core/                     # tylko modele/interfejsy/nazwy metod — NIE wybiera storage
    entry/                    # publiczne wejście: repo GUID -> storage -> files/mongo/net-adapter -> jednolity model. Dashboard/cp-gui/API zawsze przez entry, nigdy bezpośrednio przez files/mongo/net-adapter
    files/                    # storage: pliki/Dropbox (dzisiejszy sposób)
    mongo/                    # storage: MongoDB (Etap 2)
    net-adapter/              # kompatybilność ze starym .NET/`/invoke` (baza: analiza typescript_runner, nie mechaniczne kopiowanie)
  net-content-provider/        # (docelowo Git submodule) wyłącznie .NET
```

Jedyny prawdziwy wzorzec GUI to **Blazor** (nie `front_nextjs`) — FolderView, TextView, panel nawigacji, breadcrumb, logika przechodzenia między folderami.

Kompatybilność nazw obowiązkowa: `GetItem`, `GetByNames`, `GetManyByName`, `FindRecursively`, `Put`, `PostParentItem`; modele `Body`, `Config`, legacy `Settings`, `Address`.

**Etap 1** (zatwierdzony zakres): analiza kontraktów .NET, `core`, `entry`, read-only `files`, read-only `net-adapter`, wybór backendu po repo GUID, test zgodności modeli między `net-adapter` a `files`. Mongo i GUI — kolejne etapy.

Przed jakąkolwiek migracją/usunięciem w źródłowym repo `content-provider`: pokazać dokładny plan plików, commitów i rollbacku — **nic jeszcze nie usunięte**.

## 6. Dokumentacja — reorganizacja

- Usunięto przedrostki `chad-` z folderów dokumentacji: `documentation/chad-dba` → `documentation/dba`, `documentation/chad-console` → `documentation/console`, `documentation/chad-dashboard` → `documentation/dashboard` (wykonane przez użytkownika bezpośrednio na dysku, nie przez `git mv` — Claude doszedł do tego przez `git status` pokazujący pliki jako "not under version control" pod nowymi ścieżkami).
- `documentation/dashboard` rozbite na podfoldery per strona: `leads/`, `forms/`, `msg-planner/`, `msg-todo/`, `statuses/`, `views/`, `common/` (dla rzeczy współdzielonych, głównie edytor i dev-panel) — każdy z `bugs/`/`features/`/`next-tasks/`/`task-done/` tam gdzie ma sens. Kategoryzacja oparta na realnej treści plików (np. `msg-workout*` → `leads`, bo to podfunkcja Leads, nie osobna strona; `lead-form-redesign.md` → `forms`, bo dotyczy formularza w zakładce Forms).

## 7. Granice pracy autonomicznej (obowiązują przez całą sesję, potwierdzane wielokrotnie)

Wolno bez pytania: analiza, dokumentacja, szkielet monorepo, poprawki ścieżek/skryptów/pnpm/tmuxinator/Docker Compose, lokalne buildy/testy, naprawa znalezionych błędów.

Zablokowane bez osobnej zgody (aktualne na koniec sesji): usuwanie/przenoszenie folderów w źródłowym repo `content-provider`, dodanie submodule, migracja modułów `contacts`/Beeper, deployment na realny QNAP, zmiany na realnej bazie MongoDB QNAP, production cutover, usuwanie danych, force push, przepisywanie historii Git.
