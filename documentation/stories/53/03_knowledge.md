# Story 53 — 03_knowledge.md

Wyłącznie wiedza potrzebna do wykonania zadania — nie opisuje implementacji
(patrz `05_report.md` dla przebiegu prac). Cel: przy kolejnej poprawce tego
story nie trzeba już przeszukiwać całego repo od zera.

## Standard dokumentacji "Story"

Opisany raz w `documentation/ai-docs/knowledge/01_story-standard.md` — nie powtarzany tutaj.
Ten Story dotyka wielu pakietów naraz (`dba`, `dashboard/forms`,
`dashboard/views`), stąd numerowany katalog zamiast per-pakietowej
dokumentacji.

- `documentation/ai-docs/what-and-where.md`
  Główny indeks dokumentacji repo `chad`. Zasada: przeczytać PRZED większym
  zadaniem, potem otworzyć tylko potrzebne dokumenty z właściwej kategorii.
  Do zaktualizowania: nowa sekcja opisująca `documentation/stories/<N>/`.
- `documentation/ai-docs/feature-documentation-rules.md`
  Stary (2026-07-1x) standard dokumentowania *pojedynczych funkcjonalności*
  jednym plikiem `.md` per temat (np. `reports-form.md`) — współistnieje z
  numerowanym katalogiem Story, nie jest przez niego zastępowany.

## Content Provider — model danych i wywołania

- `documentation/dba/post-parent-item.md`
  `PostParentItem` = find-or-create, idempotentne. Kluczowe dla zrozumienia
  ryzyka kolizji nazw przy tworzeniu raportu (patrz `05_report.md`, sekcja
  "ograniczenia" — dwa raporty o identycznej wygenerowanej nazwie tego
  samego dnia).
- `documentation/dba/data-access.md`
  Ogólny opis komunikacji z Content Providerem, `repoGuid`, kształt
  `Settings.address` → `loca`, przykładowe wywołania `/invoke`.
- `documentation/ai-docs/feature-documentation-rules.md` (sekcja "Zasady dla
  Content Providera") — fizyczne foldery są numeryczne, nazwy logiczne żyją
  w configu; kod nie buduje ścieżek fizycznych ręcznie.
- Realny stan danych w lokalnym Content Providerze (zweryfikowany przez
  bezpośrednie zapytania `/invoke` do `chad-content-provider-api-local-mac-docker`,
  port 12024, repo `21d11bdc-f1f4-44d1-b61a-3fa6b039c641`, 2026-07-14):
  root-level folder **`views`** (dawniej `actions`, ręcznie przemianowany
  przez właściciela) zawiera 4 dzieci: `daily` (3 wpisy), `dates` (2 wpisy),
  `actions` (pusty folder), `reports` (2 wpisy). Folder `forms` (używany
  przez CAŁKIEM INNY, niepowiązany mechanizm — patrz niżej) nie istnieje w
  tych danych (`GetByNames` zwraca pusto).

## Rozróżnienie: dwa różne, niepowiązane drzewa danych o łudząco podobnych nazwach

To jest najważniejsza pułapka w tym zadaniu — łatwo pomylić dwa mechanizmy:

1. **`views/*`** (dawniej `actions/*`) — top-level folder grupujący 4
   widoki/formularze: `dates`, `daily`, `reports`, `actions`. To jest
   PRZEDMIOT migracji w Części 1. Implementacja: `packages/dba/src/leads.ts`
   (`getAllDateEntries`/`getAllDailyEntries`/`saveDateEntry`/`saveDailyEntry`),
   `packages/dba/src/actions-reports.ts` (reports) — przemianowany na
   `packages/dba/src/report-entries.ts` (nazwa opisuje odpowiedzialność
   modułu — CRUD raportów — nie dzisiejszą ścieżkę CP; `reports.ts` był
   niedostępny, patrz punkt 3 niżej).
2. **`forms/actions`** — CAŁKIEM INNY folder (parent `forms`, nie `actions`
   ani `views`), używany przez `saveActionForm`/`getCurrentUserForms` w
   `packages/dashboard/app/api/flow/cp-flow.ts`, wywoływany przez
   `app/api/forms/action/route.ts` (formularz "Actions" / `FormType ===
   "action"` w `forms/page.tsx`, pola `actionType: "dg"|"ng"`, tytuł
   auto-generowany przez `generateActionTitle`). Ten folder nie istnieje
   nawet w danych lokalnych (folder `forms` = not found) — mechanizm jest
   praktycznie martwy/nieużywany w praktyce, ale kod jest aktywny (importowany).
   **NIE jest częścią migracji Części 1** — inny top-level parent, inne dane,
   user o tym nie wspomniał.
3. **`packages/dba/src/reports.ts`** (root-level, NIE `actions-reports.ts`)
   — jeszcze inny, pre-istniejący, niepowiązany folder `reports`
   bezpośrednio pod rootem repo (adres `.../02`), z `GetReports`/
   `GetReportByName`. Ma już realne, niezwiązane dane. To jest DOKŁADNIE ten
   plik, którego nazwa jest już zajęta — dlatego `actions-reports.ts` nie
   mógł zostać przemianowany na `reports.ts` i trafił na `report-entries.ts`
   zamiast tego. Nie mylić z `views/reports` (dawniej `actions/reports`).
4. `cp-flow.ts` zawiera niewykorzystywaną (nigdzie nieimportowaną,
   zweryfikowane grepem) duplikat-logikę dla dates/daily z tymi samymi
   literałami `'actions','dates'`/`'actions','daily'` — literały zmienione
   przy okazji migracji, reszta bez zmian; szczegóły odłożone do
   `04_todos.md`, nie analizowane dalej tutaj.

## Istniejący wzorzec nazw z prefiksem typu + data + sufiks (do ponownego użycia w Części 2)

- `packages/dashboard/app/(dashboard)/dashboard/forms/page.tsx`:
  `generateActionDate(date)` (linia ~177) i `generateActionTitle(date, "dg"|"ng", suffix?)`
  (linia ~181) już implementują DOKŁADNIE ten wzorzec nazwy, jakiego chce
  użytkownik dla Reports: `{YY-MM-DD}_{typ}_{sufiks}`, live-aktualizowany
  przez `useEffect` (linie ~380-390) obserwujący datę/typ/sufiks. To jest
  gotowy wzorzec do naśladowania (nie kopiować 1:1 — `ActionFormData` ma
  tylko `dg`/`ng`, Reports potrzebuje też `op`/`other`, i to jest inny,
  niepowiązany formularz — patrz punkt wyżej).
- `documentation/dashboard/views/features/views.md` (sekcja "Item Naming")
  dokumentuje konwencję unikania kolizji nazw tego samego dnia: pierwszy
  wpis bez sufiksu literowego, kolejne z `b`, `c`, ... Ten sam problem
  dotyczy generowanej nazwy raportu (dwa raporty tego samego dnia/typu/
  sufiksu → `PostParentItem` znalazłby ten sam istniejący item zamiast
  utworzyć nowy — patrz `post-parent-item.md`).

## Wspólne komponenty layoutu / edytora (obowiązkowe do reużycia w Części 2)

- `documentation/dashboard/common/features/responsive-layout-standard.md`
  Jedyny obowiązujący standard layoutu: `DashboardPageShell`/`EditorPageShell`.
- `packages/dashboard/components/shared/dashboard-page-shell.tsx`
  `DashboardPageShell` = toolbar nad ramką + JEDNA zaokrąglona ramka
  (`rounded-xl border bg-card shadow-sm`) która sama scrolluje. Ten dokładny
  className jest źródłem "zaokrąglonej ramki" z promptu.
- `packages/dashboard/components/shared/editor-page-shell.tsx`
  `EditorPageShell` = tylko pełnowysokościowa kolumna flex (bez ramki) —
  używana gdy strona sama komponuje własne ramki/panele (co jest potrzebne
  w Części 2 dla DWÓCH ramek jedna pod drugą — nie ma gotowego komponentu do
  dwóch stackowanych ramek, trzeba je złożyć z prymitywów).
- `documentation/dashboard/common/features/shared-text-editor-toolbar.md`
  + `packages/dashboard/components/shared/text-editor-with-toolbar.tsx`
  `TextEditorWithToolbar` — SAM renderuje już własną zaokrągloną ramkę
  (`rounded-xl border bg-card h-full`, linia ~96) z Preview/Editor tabs i
  przyciskiem Save. To jest "wspólny komponent edytora" z promptu (Etap 2) —
  używać bez zmian, nie zagnieżdżać w drugiej ramce.

## Istniejąca dokumentacja i implementacja formularza Reports (Część 2, stan przed migracją)

- `documentation/dashboard/forms/features/reports-form.md`
  Opisuje obecny (do przebudowy) formularz: pokazuje edytor od razu, brak
  panelu danych, nazwa itemu w CP jest czysto sekwencyjna (`01`, `02`, ...).
- `documentation/dba/features/actions-reports.md`
  Warstwa `dba` dla Reports (do przemianowania na `report-entries.md` w
  ramach Części 1, zgodnie z przemianowaniem `actions-reports.ts` →
  `report-entries.ts`). Opisuje `resolveReportsFolder`/`createReportEntry`/
  `updateReportEntry`/`getAllReportEntries` — `createReportEntry` obecnie
  generuje nazwę itemu przez `generateEntryName` (czysto sekwencyjną, "01",
  "02", ...) — Część 2 wymaga zamiany tego na przekazywaną z UI wygenerowaną
  nazwę (`{YY-MM-DD}_{typ}_{sufiks}`).
- `packages/dashboard/app/(dashboard)/dashboard/forms/page.tsx`, sekcja
  "Render: Reports Form" (obecnie ok. linii 654-681) — dziś jedna
  `EditorPageShell` z edytorem od razu, zero panelu danych. To dokładnie ten
  render trzeba zastąpić dwuetapowym layoutem.
- `packages/dba/src/leads.ts` — `generateEntryName` (reużywana też przez
  reports) generuje sekwencyjne "01"/"02"/... — pozostaje używana przez
  dates/daily (te NIE zmieniają się w Części 2, tylko w Części 1 zmienia się
  ich ścieżka `actions/*` → `views/*`).
