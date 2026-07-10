# Plan migracji Content Providera na TypeScript/Node — STAN ZATRZYMANY (2026-07-10)

**Status: WSTRZYMANE.** Priorytet zmienił się na działający deployment starego, obecnego .NET Content Providera na QNAP TEST (patrz `documentation/content-provider/next-tasks/qnap-test-deployment-plan.md`, jeśli już powstał, albo najnowszy dokument w `next-tasks/` o tej nazwie). Nic z poniższego nie zostało usunięte — to jest punkt, od którego wznowić pracę, gdy temat wróci.

## 1. Aktualnie przyjęta struktura

```txt
packages/
├── cp-gui/                    # UI: standalone app + biblioteka komponentów dla dashboard/Folders
├── cp-plugin/                 # osobny, instalowany na desktopie plugin (edytor/Explorer/terminal)
├── content-provider/
│   ├── core/                  # cp-core     — modele/interfejsy/nazwy metod, zero logiki storage
│   ├── entry/                 # cp-entry    — publiczne wejście: repo GUID → storage → jednolity model
│   ├── net-adapter/           # cp-net-adapter — kompatybilność ze starym .NET przez /invoke (Etap 1, read-only)
│   ├── files/                 # cp-files    — NIEISTNIEJĄCE jeszcze (Etap 2)
│   ├── mongo/                 # cp-mongo    — NIEISTNIEJĄCE jeszcze (Etap 2)
│   └── README.md
├── legacy-content-provider/   # OBECNY stan: Git subtree z całego repo content-provider (nie submodule)
└── net-content-provider/      # NIEISTNIEJĄCE jeszcze — docelowa nazwa po oczyszczeniu źródłowego repo + zamianie subtree→submodule
```

pnpm-workspace.yaml zaktualizowany o `packages/content-provider/*` (dodatkowy glob), żeby core/entry/net-adapter były osobnymi pakietami pnpm. Zweryfikowane: `pnpm install` poprawnie widzi tylko właściwe pakiety, nie łapie `legacy-content-provider` (brak tam root `package.json`).

## 2. Role poszczególnych pakietów

| Pakiet | Rola | Zależy od |
|---|---|---|
| `cp-core` | Modele (`CpConfig`, `CpBody`, `CpItem`), interfejs `ContentProviderStorage` z kompatybilnymi nazwami metod (`GetItem`, `GetByNames`, `GetManyByName`, `FindRecursively`, `Put`, `PostParentItem`). **Nie wybiera** implementacji storage. | — |
| `cp-entry` | **Jedyny pakiet, który dashboard/cp-gui/API mają importować.** Routing: repo GUID → backend (`repo-storage-config.ts`, na razie statyczna mapa, domyślnie `net-adapter`) → deleguje do wybranego backendu. | `cp-core`, `cp-net-adapter` |
| `cp-net-adapter` | Implementuje `ContentProviderStorage` wołając realne, działające HTTP `/invoke` API .NET. Własny, minimalny klient HTTP (`invoke.ts`) — **nie** kopiuje `legacy-content-provider/typescript_runner` (patrz sekcja 5), wzorowany na sprawdzonym `packages/dba/src/client.ts`, ale niezależnie zaimplementowany (bez couplingu do tracingu dev-panelu). | `cp-core` |
| `cp-files` | Storage: pliki/Dropbox. **Nie zaimplementowane.** | `cp-core` (planowane) |
| `cp-mongo` | Storage: MongoDB. **Nie zaimplementowane.** | `cp-core` (planowane) |
| `cp-gui` | UI dual-purpose: standalone app + komponenty w `packages/dashboard` zakładka Folders. **Na razie tylko: package.json, tsconfig, 3 kontrakty integracyjne (`BackendAdapter`, `PluginAdapter`, `RepoAdapter`), index.ts.** README.md NIE dopisane (błąd zapisu, patrz sekcja 9). | `cp-core` (dla typów) |
| `cp-plugin` | Osobny program desktopowy (lokalne HTTP API do otwierania edytora/Findera/terminala). Zmigrowany z `legacy-content-provider/plugin_nodejs` — kod przeniesiony, przetestowany (`/health` odpowiada), package.json/README/`.env.example`/`.gitignore` gotowe. | brak (świadomie niezależny od content-provider) |
| `legacy-content-provider` | Obecny, działający system .NET + Blazor + Aspire + eksperymenty, dodany jako **Git subtree** (nie submodule — to ma się zmienić, patrz sekcja 6). | — |
| `net-content-provider` | Docelowa nazwa dla oczyszczonego (tylko .NET) źródłowego repo, dodanego jako **Git submodule**. **Nie utworzone.** | — |

## 3. Co zostało już wykonane

- `git subtree add --prefix=packages/legacy-content-provider git@github.com:pawelpanda2/contentprovider.git main --squash` — wykonane, zweryfikowane (build, pnpm workspace, struktura wewnętrzna zachowana 1:1).
- Analiza folderów `content-provider` (tabela technologia/stan/przeznaczenie) — `front_nextjs` (wczesna, nigdy nieuruchomiona próba — nie traktować jako wzorzec), `plugin_nodejs` (aktywny, zmigrowany), `typescript_runner` (aktywny ale **przestarzały** — spawnuje `dotnet run` do osobnego, starego `SimpleRun.csproj`, NIE woła realnego HTTP API), `typescript` (jawnie martwy/zarezerwowany wg własnego README).
- `cp-core`: `types.ts` (CpConfig/CpBody), `contracts.ts` (ContentProviderStorage + CpItem) — zbudowane, kompiluje się.
- `cp-entry`: `repo-storage-config.ts` (statyczna mapa repo→backend) + `index.ts` (facade delegujący) — zbudowane, kompiluje się.
- `cp-net-adapter`: `invoke.ts` (własny, minimalny HTTP client do `/invoke`) + `index.ts` (implementacja `ContentProviderStorage`) — zbudowane, kompiluje się.
- **Smoke test wykonany naprawdę**: uruchomiony realny kontener `cp_api_csharp` (obraz `cp_webapi:260709_014534`, storage testowy `/tmp/cp_repos`), wywołanie `entry.GetByNames()` z fałszywym GUID — potwierdzony pełny round-trip HTTP (POST → `/invoke` → realna odpowiedź serwera .NET z błędem `System.Reflection.TargetInvocationException`, sparsowanym i rzuconym diagnostycznie, nie zamaskowanym). Zachowanie parsowania błędów zweryfikowane jako identyczne z już sprawdzonym `packages/dba/src/client.ts` (oba rzucają z surowym tekstem przy niepowodzeniu `JSON.parse`).
- `cp-plugin`: pełna migracja z `plugin_nodejs` (server.js, config.js, pathResolver.js, osaRunner.js, OsaScripts/*.scpt, ADDRESS_FORMATS.md) — **uruchomiony naprawdę**, `/health` odpowiedział `{"status":"ok",...}`.
- `cp-gui`: package.json, tsconfig.json, `src/index.ts`, `src/adapters/{backend-adapter,plugin-adapter,repo-adapter}.ts` — napisane na podstawie realnej analizy `front_blazor/BlazorApp/Components/ItemModels/{FolderView,TextView}.razor` (dokładne toolbary, przyciski, wzorzec `BackendAdapter`/`PluginAdapter`/`RepoAdapter` jako wstrzykiwane zależności w Blazor).
- Dokumentacja `chad-dashboard` rozbita na strony (`leads/forms/msg-planner/msg-todo/statuses/views/common`), `session-log.md` znacząco rozszerzony.

## 4. Czego jeszcze nie wykonano

- `cp-gui/README.md` — **nie zapisany** (Write przerwany błędem środowiska w trakcie sesji). To dokładny punkt przerwania, patrz sekcja 9.
- `cp-files`, `cp-mongo` — w ogóle nie zaczęte (Etap 2).
- `Put`/`PostParentItem` w `cp-net-adapter` — kod istnieje, ale nieprzetestowany (Etap 3, świadomie nieużywany).
- Test zgodności `net-adapter` vs `files` (Body/Config/Address/Settings/id/name/type/created) — niemożliwy do wykonania, dopóki `cp-files` nie istnieje.
- `cp-gui` — brak jakiejkolwiek implementacji komponentów (FolderView/TextView/nav/breadcrumb) — tylko kontrakty.
- Rzeczywiste implementacje `createHttpBackendAdapter`/`createHttpPluginAdapter` w `cp-gui` — celowo rzucają błąd "not implemented yet".
- Oczyszczenie źródłowego repo `content-provider` z folderów non-.NET (`front_nextjs`, `plugin_nodejs`, `typescript`, `typescript_runner`) — **nic nie usunięte, nic nie przeniesione między repozytoriami**.
- Zamiana `legacy-content-provider` (subtree) na `net-content-provider` (submodule) — **nie wykonane**.
- `content-provider/documentation/reserved-typescript-attempt/` (docelowe miejsce dla martwego `typescript/`) — nieutworzone.

## 5. Otwarte decyzje (Decision Required)

1. **Sprzeczność `body.txt` vs `body` bez rozszerzenia**: wcześniej w tej samej sesji ustalono ostatecznie `body.txt` (z rozszerzeniem — po chwilowym odwróceniu decyzji i cofnięciu). Później, przy migracji `cp-plugin`, pojawiła się wiadomość mówiąca "dostosuj model do nowej nazwy pliku body bez rozszerzenia" — **sprzeczne z wcześniejszym ustaleniem**. Zachowano `body.txt` (zgodnie z ostatnią jawną decyzją), flaga zostawiona w `packages/cp-plugin/README.md`. **Wymaga jednoznacznego potwierdzenia, które ustalenie obowiązuje.**
2. Czy `cp-gui` ma być zbudowany na Vite+React (standalone) czy w jakiś inny sposób współdzielić komponenty z Next.js dashboardem (np. jako pakiet komponentów importowany bezpośrednio) — nierozstrzygnięte, nie blokowało Etapu 1 (kontrakty są framework-agnostic).
3. Czy `RepoAdapter` w docelowej wersji potrzebuje więcej niż `listRepos()` — nierozstrzygnięte, celowo minimalne w Stage 1.
4. Typ `Ref` w selektorze "Add" w Blazor `FolderView.razor` — sprzeczne reguły w dokumentacji (`content-provider.md`/`frequent-bugs.md` zabraniają, `CONTENT_PROVIDER_GUIDE.md` go implementuje) — przy budowie prawdziwego `cp-gui` trzeba to rozstrzygnąć, nie kopiować automatycznie.

## 6. Kolejność przyszłej migracji (przyjęta, niewykonana)

1. Oczyszczenie źródłowego repo `content-provider`: usunięcie `front_nextjs`, `plugin_nodejs`, `typescript`, `typescript_runner` (po przeniesieniu ich zawartości — `plugin_nodejs` już przeniesiony do `cp-plugin` w `chad`, ale **nie usunięty ze źródłowego repo** — to osobne repo, nietknięte).
2. Commit + push oczyszczonego repo `content-provider` (tylko .NET: `api_charp`, `front_blazor`, `aspire`, `plugin_charp`, `03_scripts`, `04_dockerfiles`, `architecture`).
3. Dodanie oczyszczonego repo jako **Git submodule** pod `packages/net-content-provider` w `chad`.
4. Usunięcie `packages/legacy-content-provider` (subtree) z `chad` po potwierdzeniu, że `net-content-provider` (submodule) go zastępuje.
5. Aktualizacja wszystkich skryptów/tmuxinator/dokumentacji z `legacy-content-provider` na `net-content-provider`.
6. Dokończenie `cp-gui` (README + realna implementacja komponentów).
7. `cp-files` (Etap 2), potem `cp-mongo` (Etap 2), test zgodności modeli.
8. `Put`/`PostParentItem` (Etap 3).

## 7. Lista plików/folderów do przeniesienia (gdy temat wróci)

| Stary folder (w źródłowym repo `content-provider`) | Nowe miejsce | Status |
|---|---|---|
| `plugin_nodejs` | `chad/packages/cp-plugin` | ✅ już skopiowane do `chad` (2026-07-10) — **źródłowe repo `content-provider` nietknięte, folder tam nadal istnieje** |
| `front_nextjs` | `chad/packages/cp-gui` (tylko jako materiał referencyjny, nie 1:1) | nieprzeniesione |
| `typescript_runner` | analiza jako baza `cp-net-adapter` — **odrzucona** (przestarzała, spawnuje proces), kod ostatecznie NIE użyty | nieprzeniesione, prawdopodobnie do usunięcia bez przenoszenia |
| `typescript` | `chad/packages/content-provider/documentation/reserved-typescript-attempt` (tylko historycznie) | nieprzeniesione |
| `api_charp`, `front_blazor`, `aspire`, `plugin_charp`, `03_scripts`, `04_dockerfiles`, `architecture` | zostają w źródłowym repo, docelowo `packages/net-content-provider` (submodule) | bez zmian |

## 8. Ryzyka

- Usunięcie folderów ze źródłowego repo `content-provider` bez wcześniejszego pełnego zachowania kodu gdzie indziej (`typescript`, `typescript_runner`, `front_nextjs`) — do zrobienia dopiero po jawnym planie plików i commitów (już zapowiedziane, nie wykonane).
- Zamiana subtree→submodule oznacza inny model pracy z historią — commity w `net-content-provider` będą osobne od `chad`, wymaga nowego workflow (`git submodule update`, osobne push) — nieprzetestowane.
- Nazwa pakietu `cp-core`/`cp-entry`/`cp-net-adapter` już zajęta w `pnpm-workspace.yaml` — jeśli submodule/reorganizacja repo źródłowego zmieni strukturę, trzeba ponownie zweryfikować, że `packages/content-provider/*` nadal poprawnie się rozwiązuje.
- Sprzeczność `body.txt`/`body` (sekcja 5.1) może się przeciekać do nowego kodu, jeśli zostanie rozstrzygnięta inaczej niż obecnie przyjęte `body.txt`.

## 9. Dokładny punkt wznowienia pracy

Następny krok, gdy temat TypeScript Content Providera wróci:
1. Dokończyć `packages/cp-gui/README.md` (treść była już przygotowana w poprzedniej odpowiedzi, przerwana błędem zapisu — do odtworzenia: opis dual-purpose, źródło wzorca Blazor z konkretnymi wnioskami z `FolderView.razor`/`TextView.razor`, tabela kontraktów, sekcja "Not in Stage 1").
2. `pnpm install` + `pnpm --filter cp-gui build` — jeszcze niewykonane po utworzeniu plików `cp-gui` (blokowane przez brakujące README nie jest wymagane technicznie, ale warto zrobić od razu po dokończeniu README).
3. Commit całości nowych pakietów (`cp-core`, `cp-entry`, `cp-net-adapter`, `cp-gui`, `cp-plugin`) — **jeszcze niescommitowane** w chwili wstrzymania (sprawdzić `git status` przed kontynuacją, coś mogło się zmienić w międzyczasie).
4. Dopiero potem: plan plików do usunięcia ze źródłowego repo `content-provider` (sekcja 7) + submodule (sekcja 6, punkty 1-5).
