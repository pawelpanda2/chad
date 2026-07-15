# Story 53 — Others (decisions, problems, limitations, propositions)

**Note (Story 56 migration):** this file merges what used to be
`05_report.md`'s non-Task sections and the separate `06_propositions.md`
(after two intermediate renames: `06_report.md`+`07_propositions.md`) into
one optional file, per the final Story documentation standard. Content
unchanged from the originals, only relocated/merged.

## Decyzje architektoniczne

- **Nazwa pliku `report-entries.ts` zamiast `views-reports.ts`**: pierwsza
  propozycja (`views-reports.ts`) została odrzucona przez użytkownika —
  nazwa pliku ma opisywać odpowiedzialność modułu, nie dzisiejszą ścieżkę
  CP. `reports.ts` był niedostępny (realna kolizja z pre-istniejącym,
  niepowiązanym plikiem). `report-entries.ts` wybrany, bo pasuje do już
  istniejących nazw eksportowanych symboli (`ReportEntryItem`,
  `createReportEntry`) i konwencji `leads.ts` (`DateEntryItem`/
  `DailyEntryItem`).
- **Kolizja nazw raportów rozwiązywana sufiksem `b`/`c`/...**: nie było to
  wprost w oryginalnym prompt-cie, ale wynika z tego samego problemu co przy
  `dates`/`daily` (find-or-create w `PostParentItem` scaliłby dwa różne
  raporty o tej samej wygenerowanej nazwie) — zastosowano już
  udokumentowaną konwencję zamiast wymyślać nową.
- **`reportLoca !== null` jako sygnał "utworzono"**: uniknięto dodatkowej
  zmiennej stanu — dokładnie ten sam sygnał już istniał w poprzedniej
  wersji formularza.
- **Wygenerowana nazwa jako trwała tożsamość raportu** (korekta użytkownika,
  patrz `01_input.md` Input 2, punkt 3): po Create pola daty/rodzaju/sufiksu
  są `disabled` na stałe, `reportItemName` (nazwa potwierdzona przez
  serwer) zastępuje na stałe żywy `useMemo` — nie ma ścieżki
  re-generowania nazwy istniejącego raportu.

## Problemy napotkane podczas realizacji

- **Środowisko lokalne (`local-mac-docker`) zniknęło w trakcie testu**:
  kontenery `chad-dashboard-local-mac-docker`,
  `chad-content-provider-api-local-mac-docker`,
  `chad-mongodb-local-mac-docker` zniknęły całkowicie z `docker ps -a`
  między jednym a drugim uruchomieniem skryptu testowego, mimo że jedyna
  destrukcyjna komenda z mojej strony to `docker stop` (nie `rm`) na
  samym kontenerze dashboardu (żeby zwolnić port 12020 pod `next dev` z
  żywym kodem). Przyczyna nieustalona (możliwe: równoległa sesja/proces
  użytkownika, restart Docker Desktop, albo coś niepowiązanego z tą pracą).
  Po uzyskaniu wyraźnej zgody użytkownika ("masz całkowite pozwolenie na
  restartowanie lokalnych stack'ów") przywrócono `content-provider-api`
  przez własny, przetestowany skrypt projektu (odtworzenie kroków
  `03_local_mac_docker/03_begin.sh` ograniczone do jednej usługi, żeby nie
  kolidować z portem zajętym przez `next dev`). Dane repo (`views/reports`,
  `views/dates`, `views/daily`) przetrwały bez zmian.
- **Symulowane wpisywanie klawiszy w natywne pole `<input type="date">` i
  w pole sufiksu zaraz po zamknięciu Radix Select** zawodziło (błędna
  wartość daty przy pierwszej próbie; ucięty tekst sufiksu przy drugiej —
  prawdopodobnie Radix Select oddaje fokus z powrotem do triggera po
  zamknięciu, przerywając wpisywanie w połowie). Rozwiązane przez
  bezpośrednie ustawienie wartości przez natywny setter + `dispatchEvent`
  (ten sam trik, który jest już standardową praktyką dla kontrolowanych
  inputów Reacta w automatyzacji przeglądarki).
- **Nieaktualny `dist/` pakietu `dba`** po zmianie sygnatury
  `createReportEntry` — `packages/dashboard`'s `tsc --noEmit` początkowo
  zgłosił błąd typów, bo `node_modules`/workspace-link wskazywał na stary
  skompilowany `.d.ts`. Naprawione przez `rm -rf dist && npm run build` w
  `packages/dba` (usunięcie też osieroconego `actions-reports.*` z
  poprzedniej kompilacji, który `tsc` sam by nie usunął).

## Ograniczenia

- Trzy testowe raporty pozostały w danych lokalnego Content Providera (nie
  da się ich usunąć — brak operacji delete). Patrz Propozycje niżej.
- `PreviewContent`/`HeadersRenderer` pokazuje "Empty content" dla zwykłego
  tekstu bez nagłówków (pre-istniejące, nienaprawione — patrz Propozycje
  niżej).
- Naming scheme `views/daily` (data+litera zamiast liczb) — zgłoszone przez
  użytkownika w trakcie realizacji, świadomie odłożone (patrz Propozycje
  niżej).
- `cp-flow.ts` zawiera martwe, zduplikowane funkcje dla dates/daily —
  literały zaktualizowane, funkcje nie usunięte (patrz Propozycje niżej).

## Elementy niewykonane

Żadne z zadeklarowanego zakresu (4 taski) nie zostało pominięte. Wszystkie
punkty funkcjonalne z `01_input.md` zostały zaimplementowane i
zweryfikowane zgodnie z opisem w `05_tasks_and_checklist.md`. Ustanowienie/
ewolucja standardu dokumentacji Story (Inputy 1, 3, 4, 5) było pracą
organizacyjną, nie funkcjonalną — celowo bez własnego Tasku na checkliście.

## Propozycje (kolejne kroki)

Curated, final list of follow-up proposals from Story 53 — promoted out of
`04_todos.md` (empty, per the Story standard) rather than left sitting in
a scratchpad. None of these block Story 53's completion.

### 1. Remove dead date/daily functions from `cp-flow.ts`

`getDateEntryRecords`, `getDailyEntryRecords`, `saveDateEntryForm`,
`saveDailyEntryForm` (in `packages/dashboard/app/api/flow/cp-flow.ts`)
aren't imported anywhere in the repo — a dead, duplicate reimplementation
of what `leads.ts` already does live. Story 53 only updated their
`actions`→`views` literals (to avoid a mixed model in the text), without
removing or refactoring them. Proposal: delete these four functions in a
dedicated, separate Story.

### 2. Backfill naming for reports created before Story 53

The two reports that existed under `views/reports` before Story 53 (`01`,
`02`) keep their old, purely sequential physical names — the new
`{YY-MM-DD}_{kind}_{suffix}` scheme only applies to reports created from
now on. Proposal: decide whether these should be renamed for consistency,
and if so, how to reconstruct a plausible date/kind/suffix for them
(their content would need to be reviewed manually).

### 3. `views/daily` (DAILY ENTRY) naming scheme

The user noticed (2026-07-14, during Story 53 Part 1) that entries under
`views/daily` are still named in date+letter format (`26-07-10`,
`26-07-10b`, ...), per `documentation/dashboard/views/features/views.md`
("Item Naming"). Request: change this to plain sequential numbers (`01`,
`02`, `03`, ...), matching the convention other views/entries use.
Out of scope for both Story 53 Part 1 (a pure path migration) and Part 2
(the Reports form) — proposal for a dedicated follow-up Story.

### 4. `PreviewContent`/`HeadersRenderer` shows "Empty content" for plain text without headers

Found during the Story 53 browser click-through (2026-07-14):
`groupNodes()` in
`packages/dashboard/components/shared/headers-renderer.tsx` only creates a
renderable group when it encounters a level-0 "header" line — plain free
text with no header line never lands in any group, so the shared renderer
shows the "Empty content" placeholder even though the Content Provider and
the API response genuinely contain the text (directly verified: a
`GetItem` call to the Content Provider and the raw JSON from
`/api/views/reports` both show the full body). This affects both the
Reports editor's own Preview tab and the Reports view — it predates Story
53 (a shared component, untouched by this Story) and is not a regression
from the migration or the form rebuild. Proposal: decide whether Reports
should enforce a minimal header, or whether `PreviewContent` should fall
back to rendering plain text when no headers are found.

### 5. Leftover test reports in the local Content Provider

Three test reports remain in the local Content Provider's data (repo
`21d11bdc-f1f4-44d1-b61a-3fa6b039c641`, `views/reports`):
`26-07-14_dg_verify story 53 test`, `26-07-14_dg_verify story 53 testb`
(from direct `dba`-layer verification), and `26-07-20_op_browser
click-through test` (from the browser click-through). The Content
Provider has no delete operation (`DeleteWorker.Delete` is a stub, see
`documentation/dba/features/report-entries.md`), so these couldn't be
cleaned up after testing — they remain as harmless test data in the local
environment. Proposal: if a delete operation is ever added to the Content
Provider, use it to remove these three items.
