# Plan migracji Content Providera na TypeScript/Node

**Status (2026-07-12): WZNOWIONE.** Praca wstrzymana 2026-07-10 została podjęta ponownie. Sekcja 0 poniżej opisuje, co zrobiono w tej sesji. Sekcje 1-9 to oryginalny stan z 2026-07-10, zachowany jako historia — częściowo nieaktualny, patrz adnotacje.

## 0. Sesja wznowienia (2026-07-12)

Zrobione:

- `packages/cp-gui/README.md` — dokończone (dokładny punkt przerwania z 2026-07-10). `pnpm install` + build całej grupy (`cp-core`, `cp-entry`, `cp-net-adapter`, `cp-gui`) — zielone.
- **`cp-core` naprawiony** po realnym audycie źródeł .NET (`packages/net-content-provider/api_charp/SharpRepoService/SharpRepoServiceProg`):
  - usunięto błędne wymagane pole `created` (nie istnieje w żadnym z 12630 sprawdzonych plików `config.yaml` ani w modelu C#);
  - dodano brakujący typ `CpItemType = "Ref"` (obok `Folder`/`Text`);
  - dodano `ContentProviderError`/`ValidationResult` (`packages/content-provider/core/src/errors.ts`).
- **Rozstrzygnięto ostatecznie sprzeczność `body.txt` vs `body` (sekcja 5.1, patrz niżej)**: zawsze `body.txt`, bez wyjątków, bez fallbacku. Potwierdzone czytaniem `PathWorker.SetNames`/`GetBodyPath` (`.../Workers/System/PathWorker.cs:39-43,87-92`) — nie istnieje ścieżka kodu obsługująca plik `body` bez rozszerzenia. `packages/cp-plugin/README.md`'s "Known note" zamknięte.
- **`packages/content-provider/files` (cp-files) zaimplementowany — Etap 2, read-only.** `GetItem`, `GetByNames`, `GetManyByName`, `FindRecursively` działają i przechodzą test zgodności na żywo; `Put`/`PostParentItem` rzucają (Etap 3). Podłączony do `cp-entry`'s routing switch — domyślne repo→backend mapowanie pozostaje puste (wszystko nadal na `net-adapter`), więc **dashboard/console nie zmieniły zachowania**.
- **Test zgodności wykonany naprawdę, read-only, na żywych danych** (`packages/content-provider/files/tests/compat-smoke.mjs`): porównanie `cp-files` vs realny, działający kontener `.NET` (`chad-content-provider-api-local-mac-docker`, port 12024, zamontowany na tym samym realnym `/Users/pawelfluder/Dropbox`) — **14/14 testów PASS** na repo `21d11bdc-f1f4-44d1-b61a-3fa6b039c641` (w tym `GetManyByName` z 57 i 64 realnymi dopasowaniami, `FindRecursively` z 4 realnymi trafieniami, zgodność błędu na prawdziwym `Ref` itemie) + dodatkowe 5/5 PASS na drugim, strukturalnie innym repo (`0272bd75-b34a-4b9a-8289-8dd0991622e7`, "Persistency"). Żadne dane nie zostały zmodyfikowane.
- **Trzy realne błędy znalezione i naprawione w trakcie testowania na żywo** (nie zgadywane — każdy potwierdzony przez bezpośrednie wywołanie żywego `/invoke`):
  1. `loca` jest **slash-joined** (`"03/06"`), nie dash-joined — wcześniejsze założenie (oparte błędnie na konwencji `cp-plugin`'s własnego URL) było złe; poprawione po zweryfikowaniu z `documentation/dba/resolve-paths.md`.
  2. `CpItem.Address` (i `Config.address`/`Settings.address`) jest **zawsze przeliczany** jako `repoGuid + "/" + fizyczny loca` — .NET samo-naprawia (`MigrationWorker.TryMigrateConfig`) `address` przy KAŻDYM odczycie, więc nieaktualna wartość zapisana w `config.yaml` na dysku nigdy nie jest zwracana klientowi.
  3. `GetManyByName(repo, parentLoca, name)` przeszukuje **wnuki** `parentLoca` (dzieci każdego bezpośredniego dziecka), nie bezpośrednie dzieci — potwierdzone: `GetManyByName(repo, "03/06", "status")` zwraca po jednym itemie "status" z każdego folderu-leada pod "03/06", nie item "status" bezpośrednio pod "03/06" (taki nie istnieje).
  4. `Folder`-type itemy zwracają `Body` jako JSON-owy obiekt `{childIndex: childName}` (nie pusty string) — potwierdzone na żywo, zgodne z `documentation/dba/resolve-paths.md`'s przykładem `leadsNameMap`.
  5. `body.txt` czytany przez .NET ucina jeden końcowy znak nowej linii (linia-po-linii + `String.Join("\n", ...)`) — Node's `readFile` go zachowuje; poprawione (`packages/content-provider/files/src/body.ts`).
- **Pełny audyt `packages/net-content-provider/api_charp/SharpRepoService/SharpRepoServiceProg` + `SimpleRunTests`** (autorytatywne testy C#) wykonany — potwierdził powyższe ustalenia i ujawnił dalsze, realne rozbieżności, wszystkie naprawione w `cp-files` i zweryfikowane ponownie na żywych danych (14/14 PASS na repo `21d11bdc-...`, plus 5/5 na drugim repo):
  1. **`GetByNames` tie-break**: .NET używa `SingleOrDefault` — więcej niż jedno dziecko o tej samej `name` na danym poziomie **rzuca błąd** (nie "pierwsze dopasowanie wygrywa", jak wcześniej zaimplementowano). Naprawione.
  2. **`GetManyByName` duplikaty**: grupa (bezpośrednie dziecko `parentLoca`), której wnuki mają więcej niż jedno dopasowanie `name`, jest **całkowicie pomijana** (.NET łapie wewnętrzny wyjątek `SingleOrDefault` i kontynuuje) — nie zwraca duplikatów, nie rzuca błędu do wywołującego. Naprawione.
  3. **`FindRecursively` przeszukuje WYŁĄCZNIE zawartość `body.txt`** (czyli tylko itemy typu Text) — **nigdy nie dopasowuje po `name`**. Wcześniejsza implementacja błędnie dopasowywała też po `name` — naprawione, zweryfikowane: 4/4 identycznych trafień na prawdziwym wyszukiwaniu `"//todo"`.
  4. **`type: "Ref"` jest w pełni dereferencjonowany** (nie tylko wykrywany) — `GetItem`/etc. na Ref-icie zwraca dane DOCELOWEGO itemu (config/body/address), zgodnie z `ReadRefWorker.IfMineGetItem`. Wszystkie 68 prawdziwych Ref-itemów w lokalnych danych ma nieaktualny/legacy `refAddress` (nie rozwiązuje się do prawdziwego repo), więc powodzenie dereferencji nie mogło być zweryfikowane na prawdziwych danych — ale **błąd przy niepowodzeniu jest identyczny jak w realnym .NET** (potwierdzone: oba rzucają na tym samym prawdziwym Ref-icie).
  5. **Mapa nazw dzieci Foldera dereferencjonuje Ref-dzieci** (pokazuje nazwę DOCELOWEGO itemu, nie samego Ref-a) — zgodnie z `ReadFolderWorker.SelectIndexQName`.
- **Świadome rozbieżności od .NET udokumentowane w `packages/content-provider/files/README.md`** (nie zgadywane — każda zweryfikowana): brakujący/uszkodzony `config.yaml` rzuca błąd zamiast cichej degradacji; brakujący `body.txt` zwraca `""` zamiast twardego crashu; jedno nieodczytywalne dziecko w mapie Foldera jest pomijane zamiast psuć cały odczyt rodzica (potwierdzone na żywo: prawdziwy folder `21d11bdc-.../03/18` z jednym stale'owym Ref-dzieckiem — realne .NET rzuca błąd na całym odczycie, `cp-files` zwraca poprawny wynik).
- `cp-mongo` istnieje jako **podstawowy szkielet** (`packages/content-provider/mongo`) — model dokumentu (`CpMongoDocument`) + connection helper + jedna prawdziwa operacja (`GetItem`, `findOne`), reszta rzuca. **Nie podłączony do `cp-entry`'s routingu.**
- **`packages/content-provider/api` (`cp-api`) dodany** — jedyny punkt wejścia HTTP, read-only (GET), owija `cp-entry`. Endpointy: `/health`, `/storage/status`, `/repos`, `/repos/:id/root`, `/repos/:id/items/<loca>`, `/repos/:id/by-names`, `/repos/:id/many-by-name`, `/repos/:id/find`. Zweryfikowany end-to-end (read-only) przez realny routing `cp-entry`→net-adapter→prawdziwe .NET API — wyniki `many-by-name`/`find` zgodne z wcześniej potwierdzonymi (64/4).
- **`cp-gui`'s `createHttpBackendAdapter`/`createHttpPluginAdapter` zaimplementowane naprawdę** (wcześniej rzucały "not implemented") — zweryfikowane realnymi wywołaniami Node przeciw żywemu `cp-api` i żywemu `cp-plugin`.
- **Pierwsza wersja komponentów React `cp-gui`** (`TextView`, `FolderView`, `ContentProviderBrowser`) — port bezpośrednio z prawdziwego źródła `.razor` (nie tylko streszczenia). Zakres read-only Etapu 2 (bez formularzy Add/zapisu, bez GoogleDoc/Tts, bez Logout — patrz `packages/cp-gui/README.md` po pełną listę i uzasadnienie). **WAŻNE: nie zweryfikowane wizualnie w przeglądarce** — brak narzędzia headless-browser w tej sesji; próba weryfikacji przez Node SSR napotkała problem podwójnej instancji React (artefakt mojego doraźnego test-harnessu, nie bug w komponentach) i została porzucona, żeby nie ryzykować dalszych zmian w `pnpm-lock.yaml` w trakcie równoległej sesji. **Przed zaufaniem tym komponentom: odpalić je realnie w przeglądarce.**
- **Ważna obserwacja**: podczas tej sesji odkryto, że inna, równoległa sesja (też "Co-Authored-By: Claude Sonnet 5") aktywnie commitowała do tego samego repo w tym samym czasie (feature "Beeper CRM" w `packages/dashboard`/`packages/dba`, nowe pakiety `beeper-ws`/`beeper-sync`/`beeper-oplog`). Commity przeplotły się bezkonfliktowo, ale przy okazji `pnpm add`/`pnpm remove` (do testu `cp-gui`) omal nie doszło do przypadkowego zgubienia niezcommitowanej zmiany tamtej sesji w `pnpm-lock.yaml`/root `package.json` (odzyskane przez `git stash`, potwierdzone jako w pełni odtworzone przez pnpm, potem tamta sesja sama to scommitowała). **Wniosek na przyszłość**: w tym repo można trafić na równoległą pracę — zawsze `git status`/`git log` przed operacjami na `pnpm-lock.yaml`/root `package.json`, stage'ować tylko własne pliki jawnie po ścieżce, nigdy `git add -A`.
- `cp-gui` — struktura Blazor w pełni zmapowana (patrz niżej). Oczyszczenie źródłowego repo `content-provider` i zamiana subtree→submodule nadal nie wykonane.

### Struktura Blazor (zmapowana 2026-07-12, do wykorzystania przy budowie prawdziwego `cp-gui`)

- **Główny panel nawigacji** (stały, górna część): `packages/net-content-provider/front_blazor/BlazorApp/Pages/Repos.razor` — combobox repo + pole loca + toolbar back/forward/GO/logout, trzyma jedyny załadowany `_item` i logikę nawigacji (`ReloadItemByAddress`, `OnGoBtnClicked`, itd). Renderuje BEZWARUNKOWO oba komponenty poniżej, każdy sam decyduje czy się pokazać na podstawie `Item.Type`.
- **Widok Text-item**: `.../Components/ItemModels/TextView.razor` — renderuje się tylko gdy `Item?.Type == "Text"`. Toolbar (Folder/Content/Config/Terminal, GoogleDoc/Tts, formularz "Add"), `<CodeEditorTabs>` bindowany do `Item.Body`.
- **Widok Folder-item**: `.../Components/ItemModels/FolderView.razor` — renderuje się tylko gdy `Item?.Type == "Folder"`. Deserializuje `Item.Body` jako mapę index→name (dokładnie ten format, który `cp-files` teraz też zwraca), jeden przycisk na dziecko, formularz "Add" (selektor typu Text/Folder/Ref + nazwa) wołający `Repo.PostParentItem`.

### Etap 3 (`Put`/`PostParentItem`) — ZAIMPLEMENTOWANY (2026-07-12, kontynuacja tej samej sesji)

Specyfikacja poniżej opisana wcześniej w tej sesji jako "na przyszłość" — **teraz faktycznie zaimplementowana w `cp-files`** i przetestowana (18/18 sprawdzeń) wyłącznie na jednorazowej fixture w `/tmp/cp-files-write-test`, **nigdy na prawdziwych danych Dropbox**:

- **`PostParentItem`**: idempotentny get-or-create — jeśli dziecko o danej `name` już istnieje pod `parentLoca`, zwraca JEGO dane (bez duplikatu); jeśli nie, tworzy nowe pod kolejnym wolnym numerycznym indeksem (`max(istniejące)+1`, zero-padded do 2 cyfr dla 0-9), ze świeżym `randomUUID()` jako `id`. Walidacja numerycznych folderów rodzica wykonywana PRZED tworzeniem (`validateAllChildrenNumeric`) — nie-numeryczny folder rzuca `ContentProviderError`.
- **`Put`**: NIE jest "znajdź po nazwie" — celuje bezpośrednio w istniejący numeryczny `loca` i nadpisuje bezwarunkowo, z ŚWIEŻYM GUID-em za każdym razem (nie zachowuje poprzedniego `id`). Waliduje że każdy segment `loca` jest numeryczny (pusty `loca` dozwolony).
- **Prawdziwy bug w .NET wiernie zreplikowany, nie naprawiony**: `PutWriteFolderWorker.IfMinePut` (Folder writer) twardo koduje `type: "Text"` w zapisywanym configu, niezależnie od żądanego typu — wywołanie `Put` na Folderze z `type="Folder"` **po cichu psuje jego typ na "Text"** (i, zgodnie z tym samym źródłem, NIE zapisuje `body.txt`). **Decyzja**: zreplikowane wiernie, nie naprawione — celem `cp-files` jest wierność zachowania, a naprawienie tego tutaj rozjechałoby `cp-files` z `cp-net-adapter` (proxy do wciąż-wadliwego realnego .NET) na tej samej operacji zapisu. Jeśli bug zostanie kiedyś naprawiony w .NET, `cp-files` powinien pójść za tą zmianą, nie wyprzedzać jej.
- **`type: "Ref"` w obu operacjach zapisu rzuca `ContentProviderError`** — zachowanie zapisu dla `Ref` nie było częścią potwierdzonego zakresu audytu z 2026-07-12. Nie zgadywane.
- Bez testu zgodności live (w przeciwieństwie do operacji odczytu) — nie ma bezpiecznego sposobu przetestować zapis względem prawdziwego .NET bez użycia prawdziwych danych produkcyjnych albo postawienia osobnej, jednorazowej instancji .NET+filesystem, co nie zostało zrobione w tej sesji.

---

## Stan z 2026-07-10 (historia, częściowo nieaktualna — patrz adnotacje wyżej)

**Status: WSTRZYMANE (2026-07-10, wznowione 2026-07-12 — patrz sekcja 0).** Priorytet zmienił się na działający deployment starego, obecnego .NET Content Providera na QNAP TEST (patrz `documentation/content-provider/next-tasks/qnap-test-deployment-plan.md`, jeśli już powstał, albo najnowszy dokument w `next-tasks/` o tej nazwie). Nic z poniższego nie zostało usunięte — to jest punkt, od którego wznowić pracę, gdy temat wróci.

## 1. Aktualnie przyjęta struktura

```txt
packages/
├── cp-gui/                    # UI: standalone app + biblioteka komponentów dla dashboard/Folders
├── cp-plugin/                 # osobny, instalowany na desktopie plugin (edytor/Explorer/terminal)
├── content-provider/
│   ├── core/                  # cp-core     — modele/interfejsy/nazwy metod, zero logiki storage
│   ├── entry/                 # cp-entry    — publiczne wejście: repo GUID → storage → jednolity model
│   ├── net-adapter/           # cp-net-adapter — kompatybilność ze starym .NET przez /invoke (Etap 1, read-only)
│   ├── files/                 # cp-files    — Etap 2, read-only, zaimplementowany 2026-07-12 (patrz sekcja 0)
│   ├── mongo/                 # cp-mongo    — podstawowy szkielet, zaimplementowany 2026-07-12 (patrz sekcja 0)
│   └── README.md
├── net-content-provider/   # OBECNY stan: Git subtree z całego repo content-provider (nie submodule)
└── net-content-provider/      # NIEISTNIEJĄCE jeszcze — docelowa nazwa po oczyszczeniu źródłowego repo + zamianie subtree→submodule
```

pnpm-workspace.yaml zaktualizowany o `packages/content-provider/*` (dodatkowy glob), żeby core/entry/net-adapter były osobnymi pakietami pnpm. Zweryfikowane: `pnpm install` poprawnie widzi tylko właściwe pakiety, nie łapie `net-content-provider` (brak tam root `package.json`).

## 2. Role poszczególnych pakietów

| Pakiet | Rola | Zależy od |
|---|---|---|
| `cp-core` | Modele (`CpConfig`, `CpBody`, `CpItem`), interfejs `ContentProviderStorage` z kompatybilnymi nazwami metod (`GetItem`, `GetByNames`, `GetManyByName`, `FindRecursively`, `Put`, `PostParentItem`). **Nie wybiera** implementacji storage. | — |
| `cp-entry` | **Jedyny pakiet, który dashboard/cp-gui/API mają importować.** Routing: repo GUID → backend (`repo-storage-config.ts`, na razie statyczna mapa, domyślnie `net-adapter`) → deleguje do wybranego backendu. | `cp-core`, `cp-net-adapter` |
| `cp-net-adapter` | Implementuje `ContentProviderStorage` wołając realne, działające HTTP `/invoke` API .NET. Własny, minimalny klient HTTP (`invoke.ts`) — **nie** kopiuje `net-content-provider/typescript_runner` (patrz sekcja 5), wzorowany na sprawdzonym `packages/dba/src/client.ts`, ale niezależnie zaimplementowany (bez couplingu do tracingu dev-panelu). | `cp-core` |
| `cp-files` | Storage: pliki/Dropbox. **Zaimplementowany, read-only, Etap 2 (2026-07-12).** `GetItem`/`GetByNames`/`GetManyByName`/`FindRecursively` (+ pełna dereferencja `Ref`) — 19/19 real compat-test PASS vs żywe .NET API na dwóch repos, zweryfikowane przeciw autorytatywnym testom C# (`SimpleRunTests`). `Put`/`PostParentItem` rzucają (Etap 3). | `cp-core` |
| `cp-mongo` | Storage: MongoDB. **Podstawowy szkielet (2026-07-12).** Model dokumentu + connection helper + jedno prawdziwe `GetItem`. Nie podłączony do `cp-entry`. | `cp-core` |
| `cp-gui` | UI dual-purpose: standalone app + komponenty w `packages/dashboard` zakładka Folders. **Na razie tylko: package.json, tsconfig, 3 kontrakty integracyjne (`BackendAdapter`, `PluginAdapter`, `RepoAdapter`), index.ts.** README.md NIE dopisane (błąd zapisu, patrz sekcja 9). | `cp-core` (dla typów) |
| `cp-plugin` | Osobny program desktopowy (lokalne HTTP API do otwierania edytora/Findera/terminala). Zmigrowany z `net-content-provider/plugin_nodejs` — kod przeniesiony, przetestowany (`/health` odpowiada), package.json/README/`.env.example`/`.gitignore` gotowe. | brak (świadomie niezależny od content-provider) |
| `net-content-provider` | Obecny, działający system .NET + Blazor + Aspire + eksperymenty, dodany jako **Git subtree** (nie submodule — to ma się zmienić, patrz sekcja 6). | — |
| `net-content-provider` | Docelowa nazwa dla oczyszczonego (tylko .NET) źródłowego repo, dodanego jako **Git submodule**. **Nie utworzone.** | — |

## 3. Co zostało już wykonane

- `git subtree add --prefix=packages/net-content-provider git@github.com:pawelpanda2/contentprovider.git main --squash` — wykonane, zweryfikowane (build, pnpm workspace, struktura wewnętrzna zachowana 1:1).
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
- Zamiana `net-content-provider` (subtree) na `net-content-provider` (submodule) — **nie wykonane**.
- `content-provider/documentation/reserved-typescript-attempt/` (docelowe miejsce dla martwego `typescript/`) — nieutworzone.

## 5. Otwarte decyzje (Decision Required)

1. ~~**Sprzeczność `body.txt` vs `body` bez rozszerzenia**~~ — **ROZSTRZYGNIĘTE 2026-07-12, ostatecznie: zawsze `body.txt`.** Potwierdzone czytaniem realnego kodu .NET (`PathWorker.SetNames`/`GetBodyPath`) i 12630 prawdziwych plików na dysku — nie istnieje wariant bez rozszerzenia. Patrz sekcja 0 i `packages/content-provider/files/README.md`.
2. Czy `cp-gui` ma być zbudowany na Vite+React (standalone) czy w jakiś inny sposób współdzielić komponenty z Next.js dashboardem (np. jako pakiet komponentów importowany bezpośrednio) — nierozstrzygnięte, nie blokowało Etapu 1 (kontrakty są framework-agnostic).
3. Czy `RepoAdapter` w docelowej wersji potrzebuje więcej niż `listRepos()` — nierozstrzygnięte, celowo minimalne w Stage 1.
4. Typ `Ref` w selektorze "Add" w Blazor `FolderView.razor` — sprzeczne reguły w dokumentacji (`content-provider.md`/`frequent-bugs.md` zabraniają, `CONTENT_PROVIDER_GUIDE.md` go implementuje) — przy budowie prawdziwego `cp-gui` trzeba to rozstrzygnąć, nie kopiować automatycznie.

## 6. Kolejność przyszłej migracji (przyjęta, niewykonana)

1. Oczyszczenie źródłowego repo `content-provider`: usunięcie `front_nextjs`, `plugin_nodejs`, `typescript`, `typescript_runner` (po przeniesieniu ich zawartości — `plugin_nodejs` już przeniesiony do `cp-plugin` w `chad`, ale **nie usunięty ze źródłowego repo** — to osobne repo, nietknięte).
2. Commit + push oczyszczonego repo `content-provider` (tylko .NET: `api_charp`, `front_blazor`, `aspire`, `plugin_charp`, `03_scripts`, `04_dockerfiles`, `architecture`).
3. Dodanie oczyszczonego repo jako **Git submodule** pod `packages/net-content-provider` w `chad`.
4. Usunięcie `packages/net-content-provider` (subtree) z `chad` po potwierdzeniu, że `net-content-provider` (submodule) go zastępuje.
5. Aktualizacja wszystkich skryptów/tmuxinator/dokumentacji z `net-content-provider` na `net-content-provider`.
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

## 9. Punkt wznowienia z 2026-07-10 (zamknięty — patrz sekcja 0)

~~Następny krok, gdy temat TypeScript Content Providera wróci:~~ — wykonane 2026-07-12, patrz sekcja 0. Punkty 1-3 poniżej zamknięte; punkt 4 (oczyszczenie źródłowego repo + submodule) nadal aktualny, patrz sekcja 10.

1. ~~Dokończyć `packages/cp-gui/README.md`~~ ✅
2. ~~`pnpm install` + `pnpm --filter cp-gui build`~~ ✅
3. ~~Commit całości nowych pakietów~~ ✅ (plus `cp-files`, dodany w tej samej sesji)
4. Plan plików do usunięcia ze źródłowego repo `content-provider` (sekcja 7) + submodule (sekcja 6, punkty 1-5) — **nadal nie wykonane**.

## 10. Nowy punkt wznowienia (2026-07-12, zaktualizowany po audycie SimpleRunTests)

~~1. Weryfikacja względem SimpleRunTests~~ ✅ — wykonana, wyniki w sekcji 0 (GetByNames/GetManyByName/FindRecursively/Ref wszystkie naprawione i zweryfikowane).
~~2. Obsługa `Ref`-type itemów~~ ✅ — pełna dereferencja zaimplementowana, zweryfikowana (zgodność błędu z realnym .NET na jedynych dostępnych, stale'owych danych).
~~3. `cp-mongo`~~ ✅ (jako podstawowy szkielet — model + connection helper + jedno prawdziwe `GetItem`; reszta świadomie nie zaimplementowana, patrz `packages/content-provider/mongo/README.md`).

~~2. Wspólne API HTTP~~ ✅ — `cp-api` dodane i zweryfikowane (patrz sekcja 0).
~~3. `cp-gui`'s `createHttpBackendAdapter`/`createHttpPluginAdapter`~~ ✅ — zaimplementowane, zweryfikowane na żywo (sekcja 0).
~~4. `cp-gui` pierwsza wersja komponentów~~ ✅ — `TextView`/`FolderView`/`ContentProviderBrowser` dodane (sekcja 0), **ale nie zweryfikowane wizualnie w przeglądarce — patrz sekcja 0's uwaga, zrobić to jako pierwsze przy powrocie do tematu.**

~~5. `Put`/`PostParentItem` w `cp-files`~~ ✅ — zaimplementowane, przetestowane na jednorazowej fixture (18/18), patrz sekcja "Etap 3" wyżej. **Nadal nie podłączone do żadnego zapisującego endpointu `cp-api`** (który pozostaje GET-only) ani do `cp-gui`'s Add-formularzy (nadal celowo pominięte, patrz `packages/cp-gui/README.md`).

Następny krok, gdy temat wróci:

1. **Odpalić `cp-gui` w przeglądarce i faktycznie kliknąć przez prawdziwe repo** — jeszcze nie zrobione (patrz "Verification status" w `packages/cp-gui/README.md`). Najprostsza droga: mały Vite dev harness importujący `cp-gui`'s zbudowany `dist/`, wskazujący na realnie odpalone `cp-api` (port 12027, wymaga `CP_FILES_STORAGE_ROOT`+`CONTENT_PROVIDER_API_URL`) i `cp-plugin` (port 12026).
2. **Endpointy zapisu w `cp-api`** (`PUT`/`POST`) wołające teraz-działające `cp-files.Put`/`PostParentItem` — decyzja do podjęcia: czy i kiedy przełączyć jakiekolwiek prawdziwe repo z `net-adapter` na `files`/`mongo` w `cp-entry`'s routingu (obecnie routing nadal domyślnie pusty — wszystko na `net-adapter`, dashboard/console bez zmian).
3. `cp-mongo`: rozbudowa poza `GetItem` — wymaga decyzji projektowych (indeksy pod `GetByNames`/`GetManyByName`/`FindRecursively` w Mongo) nieopisanych jeszcze nigdzie.
4. Dopiero potem: oczyszczenie źródłowego repo `content-provider` + submodule (sekcja 6, punkty 1-5) — nadal nie wykonane, nie priorytet.

**Przypomnienie na przyszłość** (patrz sekcja 0's uwaga o równoległej sesji): sprawdzić `git status`/`git log` przed kontynuacją — to repo bywa współdzielone z inną, równoległą sesją pracującą nad innymi zadaniami (np. Beeper CRM w tej sesji). Stage'ować zawsze jawne ścieżki, nigdy `git add -A`/`.`.
