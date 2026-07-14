# Story 53 — 05_report.md

## Checklist

| # | Ai Status | Real Status | Task
|---|-----------|-------------|
| 1 | DONE      |             | Migrate `actions/*` → `views/*` across the whole project
| 2 | DONE      |             | Rebuild the Reports form as a two-stage panel (metadata → lock → editor)
| 3 | DONE      |             | Move the "Generated name" field next to the Create button
| 4 | DONE      |             | Uppercase all Forms menu labels to match the Views menu style


# Task 1 — Migrate `actions/*` → `views/*`

**Requested:** (`01_input.md`, Input 1, "Część 1") — the owner manually
renamed the Content Provider's top-level `actions` folder to `views`;
find every place in the project using the `actions/*` logical path
(dashboard, `packages/dba`, API routes, server actions, helpers, tests,
documentation) and change it to `views/*`, leaving no mixed model.

**Done:**
- Confirmed live against the real local Content Provider (repo
  `21d11bdc-f1f4-44d1-b61a-3fa6b039c641`) that `views/{daily,dates,actions,reports}`
  is the actual current structure.
- `packages/dba/src/leads.ts` — `getAllDateEntries`/`getAllDailyEntries`/
  `saveDateEntry`/`saveDailyEntry`, comments, and local variable names
  (`actionsResult`/`actionsLoca` → `viewsResult`/`viewsLoca`).
- `packages/dba/src/actions-reports.ts` renamed to
  `packages/dba/src/report-entries.ts` (see Task 2's architectural
  decision below) and updated to the `views/reports` path;
  `packages/dba/src/index.ts` export updated to match.
- `packages/dashboard/app/api/forms/date-entry/route.ts`,
  `daily-entry/route.ts`, `forms/reports/route.ts`,
  `app/api/views/reports/route.ts` — comments and `path: "views/..."`
  strings.
- `packages/dashboard/app/(dashboard)/dashboard/forms/page.tsx` and
  `views/page.tsx` — fallback strings and comments.
- `packages/dashboard/app/api/flow/cp-flow.ts` — the same string swap in
  the (unused/dead) `getDateEntryRecords`/`getDailyEntryRecords`/
  `saveDateEntryForm`/`saveDailyEntryForm`, per explicit "no mixed model"
  scope, without further touching that dead code. The unrelated
  `'forms','actions'` path (`saveActionForm`/`getCurrentUserForms`) was
  correctly left alone — different top-level folder, different feature,
  not mentioned by the user.
- Docs updated: `documentation/dashboard/views/features/views-tracker.md`,
  `daily-tracker-dates.md`, `views.md`,
  `documentation/dba/features/report-entries.md` (renamed from
  `actions-reports.md`), `documentation/ai-docs/what-and-where.md`.

**Files changed:** `packages/dba/src/leads.ts`,
`packages/dba/src/actions-reports.ts` → `report-entries.ts`,
`packages/dba/src/index.ts`,
`packages/dashboard/app/api/forms/{date-entry,daily-entry,reports}/route.ts`,
`packages/dashboard/app/api/views/reports/route.ts`,
`packages/dashboard/app/api/flow/cp-flow.ts`,
`packages/dashboard/app/(dashboard)/dashboard/{forms,views}/page.tsx`,
the doc files listed above.

**Tested:**
- `tsc --noEmit` clean in `packages/dba` and `packages/dashboard` (after
  rebuilding `dba`'s `dist/` to drop the orphaned `actions-reports.*`
  output).
- `next lint` clean w.r.t. this Story's changes.
- Direct `/invoke` calls against the real local Content Provider (not just
  code review): `getAllDateEntries()` and `getAllDailyEntries()` confirmed
  to still correctly read `views/dates` (2 entries) and `views/daily`
  (3 entries) after the path change.

**Not done / not verifiable:** `documentation/dba/bugs/getlist-valuetuple-and-date-entries-mismap.md`
intentionally left untouched — it's a historical bug report quoting old
literal args; rewriting it would falsify the historical record.

**Status: DONE**

---

# Task 2 — Rebuild the Reports form (two-stage panel)

**Requested:** (`01_input.md`, Input 1, "Część 2", refined by Input 2's
"Generated name" identity-lock requirement and mandatory full-UI-test
requirement) — Stage 1: a rounded metadata panel (date, report kind with
`dg`/`ng`/`op`/`other` prefixes, free-text suffix, live-generated
read-only name, Create button) shown before any editor. On successful
Create, the metadata locks permanently and Stage 2 (the shared editor
component) appears below it, editing only the report body.

**Done:**
- `packages/dba/src/report-entries.ts`: `createReportEntry(content,
  requestedName)` now takes the caller-supplied generated name instead of
  an internal sequential `generateEntryName`; new `nextAvailableName`
  helper appends `b`, `c`, ... on a name collision (reusing the same
  same-day-suffix convention already documented for dates/daily), and
  returns the name actually used.
- `packages/dashboard/app/api/forms/reports/route.ts`: `POST` gains
  `itemName` (required when `loca` is absent).
- `packages/dashboard/app/(dashboard)/dashboard/forms/page.tsx`: new state
  (`reportDate`, `reportKind`, `reportSuffix`, `reportItemName`), a new
  `generateReportName` helper (kept separate from the unrelated Actions
  form's `generateActionTitle`), `generatedReportName`/`displayedReportName`
  memo, new `handleReportCreate` handler, `handleReportSave` simplified to
  update-only (Create is now its own step), `resetReportsForm` extended,
  and the render branch rebuilt into the two-stage layout.
- Per Input 2 point 3: once Create succeeds, date/kind/suffix inputs are
  permanently `disabled` and the live memo is replaced by the
  server-confirmed `reportItemName` — there is no path to re-generate or
  edit an existing report's identity; a new report is required for that.
- `documentation/dashboard/forms/features/reports-form.md` fully rewritten
  to describe the new flow, API contract, and limitations.

**Files changed:** `packages/dba/src/report-entries.ts`,
`packages/dashboard/app/api/forms/reports/route.ts`,
`packages/dashboard/app/(dashboard)/dashboard/forms/page.tsx`,
`documentation/dashboard/forms/features/reports-form.md`.

**Tested (real, not just build):**
- Direct Content Provider verification: `createReportEntry("", "26-07-14_dg_verify story 53 test")`
  created that exact name; a second call with the **same** requested name
  correctly produced `"...testb"` (collision suffix confirmed);
  `updateReportEntry` + `getAllReportEntries` confirmed the written body
  round-trips correctly.
- **Full real browser click-through** (headless Chrome via
  `puppeteer-core`, driving `next dev` on port 12020 against the real
  Content Provider), all 15 requested steps:
  1. Login as `pawel_f` → `/dashboard`.
  2. Forms → Reports → Stage 1 panel visible, **no editor yet** (screenshot
     `04_reports-stage1-initial.png`).
  3-5. Set date to `2026-07-20`, kind "Organized party", suffix "browser
     click-through test".
  6. Confirmed generated name = exactly
     `26-07-20_op_browser click-through test`, live-updating.
  7. Clicked Create.
  8. Confirmed (via DOM `disabled` attribute, not just visually) that
     date/kind/suffix are locked (screenshot `08_after-create.png`).
  9. Confirmed the editor panel appeared below (CodeMirror `.cm-content`
     present, screenshot `09_editor-visible.png`).
  10. Typed report content (screenshot `10_content-typed.png`).
  11. Clicked Save → "Saved" indicator appeared (screenshot
      `11_after-save.png`).
  12-13. Views → REPORTS view → list showed all 5 reports including the
     new one (screenshot `13_views-reports-list.png`).
  14. Opened the new report — header correctly read "Views / REPORTS /
      26-07-20_op_browser click-through test" (screenshot
      `14_opened-created-report.png`).
  15. Content check: the Views preview panel showed "Empty content" —
      **but** directly verified (separate `GetItem` call to the Content
      Provider, and the raw JSON from `/api/views/reports` over the
      authenticated browser session) that the saved body is 100% correct
      and complete. The "Empty content" display is a pre-existing
      limitation of the shared `PreviewContent`/`HeadersRenderer`
      component (it only renders text that contains at least one
      "header" line — confirmed the exact same placeholder already
      appears in the Forms editor's own Preview tab immediately after
      Create, before anything is typed, i.e. before this Story touched
      anything) — not a regression introduced by this Story. Logged in
      `06_propositions.md`, not fixed (out of scope: a generic shared-component
      limitation, not specific to Reports).
- Browser console showed no JS errors related to this feature (only
  unrelated 404s for `site.webmanifest`).

**Not done / not verifiable:** The "Empty content" Preview-panel display
for plain, header-less text was not fixed — confirmed pre-existing and out
of scope, logged in `06_propositions.md`.

**Status: DONE** (the one caveat above is a pre-existing, out-of-scope
renderer limitation, not an incomplete part of this task — the underlying
create/lock/save/list/read data flow this task was actually responsible
for is fully verified correct.)

---

# Task 3 — Move "Generated name" next to the Create button

**Requested:** (`01_input.md`, Input 6) — "generated name niech bedzie
obok przycisku create" — the Generated name field should sit next to the
Create button, not in the top Date/Kind/Suffix row.

**Done:** Moved the "Generated name" read-only field out of the top
`grid-cols-[auto_auto_1fr]` row into its own row directly beside the
Create button (`flex gap-3 items-end`), in
`packages/dashboard/app/(dashboard)/dashboard/forms/page.tsx`.

**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/forms/page.tsx`.

**Tested:** `tsc --noEmit` clean; confirmed visually via a fresh headless-
browser screenshot (`reports-new-layout.png`) showing the Generated name
input immediately to the left of the Create button.

**Not done / not verifiable:** Nothing outstanding.

**Status: DONE**

---

# Task 4 — Uppercase Forms menu labels

**Requested:** (`01_input.md`, Input 6) — "popraw nazwy w menu forms zeby
wszystkie byly duzymi literami tam jak w menu views sa opisane widoki" —
make all Forms menu button labels uppercase, matching how Views menu
labels (`TRACKER`, `DATES`, `LEADS`, `REPORTS`) are styled.

**Done:** Changed `Add Lead` → `ADD LEAD`, `Actions` → `ACTIONS`,
`Reports` → `REPORTS` in the Forms menu. `DAILY ENTRY`/`DATE ENTRY` were
already uppercase and left unchanged. Subtitle text (e.g. "New contact")
intentionally left in normal case, matching the exact precedent in the
Views menu (subtitles like "Daily tracker" are not uppercased there
either).

**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/forms/page.tsx`.

**Tested:** `tsc --noEmit` clean; confirmed visually via a fresh headless-
browser screenshot (`forms-menu-uppercase.png`) showing all five Forms
menu buttons with uppercase primary labels.

**Not done / not verifiable:** Nothing outstanding.

**Status: DONE**

---

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
  da się ich usunąć — brak operacji delete). Patrz `06_propositions.md`.
- `PreviewContent`/`HeadersRenderer` pokazuje "Empty content" dla zwykłego
  tekstu bez nagłówków (pre-istniejące, nienaprawione — patrz `06_propositions.md`).
- Naming scheme `views/daily` (data+litera zamiast liczb) — zgłoszone przez
  użytkownika w trakcie realizacji, świadomie odłożone (patrz `06_propositions.md`).
- `cp-flow.ts` zawiera martwe, zduplikowane funkcje dla dates/daily —
  literały zaktualizowane, funkcje nie usunięte (patrz `06_propositions.md`).

## Elementy niewykonane

Żadne z zadeklarowanego zakresu (4 taski powyżej) nie zostało pominięte.
Wszystkie punkty funkcjonalne z `01_input.md` zostały zaimplementowane i
zweryfikowane zgodnie z opisem wyżej. Ustanowienie/ewolucja standardu
dokumentacji Story (Inputy 1, 3, 4, 5) było pracą organizacyjną, nie
funkcjonalną — celowo bez własnego Tasku na checkliście, zgodnie z zasadą
w `01_story-standard.md`.

## Kolejne kroki

Patrz `06_propositions.md` (5 pozycji, żadna nie blokuje zamknięcia Story
53). `04_todos.md` jest puste — wszystko, co podczas realizacji trafiło do
scratchpada, zostało albo zrobione, albo odrzucone, albo przeniesione tam
jako właściwa propozycja, zgodnie z zasadą w `01_story-standard.md`.
