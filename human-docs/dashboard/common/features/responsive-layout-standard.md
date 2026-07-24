# Feature: Responsive Dashboard Layout Standard

## Cel feature'a

Jeden wspólny standard responsywnego layoutu dla **wszystkich** głównych stron
dashboardu CHAD. Zamiast kopiować zestawy klas (`Card + flex-1 + overflow`,
`-m-[22px] h-[calc(100dvh-4rem-20px)]`) do każdej strony osobno, strony używają
wspólnych komponentów-powłok. Cel praktyczny:

- dashboard poprawnie działa na telefonie (pion i poziom),
- globalny scrollbar strony nie pojawia się podczas normalnej pracy,
- każda strona pokazuje jedną estetyczną ramkę z zaokrąglonymi rogami, która
  niemal idealnie wypełnia dostępny obszar, z **wewnętrznym** scrollem,
- treść i przyciski są zawsze wyrównane do lewej-górnej krawędzi.

## Zakres

Wyłącznie: layout, responsywność, scroll, wspólne komponenty layoutu.
**Bez zmian** w logice biznesowej, modelu danych i API. Żadne wywołania Content
Providera, cache ani invalidation nie zostały dotknięte.

## Route / API

Brak. To zmiana czysto prezentacyjna (warstwa UI). Wszystkie route pozostają bez
zmian; zmienia się tylko struktura JSX/klas wewnątrz komponentów stron.

## Przepływ danych

Bez zmian. Strony nadal same pobierają dane (client components, `fetch` w
`useEffect`). Powłoki layoutu są bezstanowe i nie dotykają danych.

## Zależność od Content Providera

Brak. Feature nie używa Content Providera, `GetByNames`/`PostByNames` ani
fizycznych/logicznych ścieżek.

## Cache / invalidation

Brak cache. Feature nie wprowadza ani nie modyfikuje żadnego cache.

## Architektura

### Warstwa 1 — Layout aplikacji

`app/(dashboard)/layout.tsx`

**Wspólny mechanizm, jedna różnica w zachowaniu.** Ten sam push-in sidebar i ten
sam stan `menuOpen` na każdym rozmiarze; sidebar jest **domyślnie otwarty** na
desktopie **i** na telefonie. Jedyna różnica desktop vs mobile: co się dzieje po
wyborze pozycji menu — na **desktopie** sidebar **zostaje otwarty**, na
**telefonie** **zamyka się**. Rozróżnienie przez `matchMedia("(min-width:
768px)")` → `isDesktop` (ten sam próg co Tailwind `md`); to jedyne miejsce, gdzie
layout różnicuje desktop i mobile.

- Kontener główny: `flex h-[100dvh] overflow-hidden` (używa `dvh`, więc pasek
  adresu telefonu i obrót ekranu nie psują wysokości).
- **Sidebar (wszędzie)**: ten sam `Sidebar`, renderowany jako **inline panel
  wypychający treść** (`transition-[width]` `w-0` ↔ `w-72`) — identycznie na
  desktopie i mobile. **Bez overlay i bez wyszarzania** obszaru poza menu:
  główna treść przesuwa się w prawo, robiąc miejsce, i pozostaje w pełni
  klikalna. Domyślnie **otwarty** (`w-72`) na desktopie i mobile. Po wyborze
  pozycji menu: desktop — zostaje otwarty; mobile — zamyka się (`onMobileClose`
  gated `!isDesktop`). Na mobile zamyka się też po kliknięciu w treść (klik poza
  sidebarem — `onClick` na kolumnie treści, tylko gdy `!isDesktop`, bez
  blokującej nakładki). Nie ma osobnej, zadokowanej wersji desktopowej.
- **Wyloguj**: zwykła pozycja **wewnątrz** przewijanej nawigacji (`<nav>` z
  `overflow-y-auto`), nie osobna, przyklejona stopka. Gdy pozycji menu jest
  więcej niż mieści ekran, menu ma własny wewnętrzny scrollbar.
- **Uchwyt menu (wszędzie)**: chevron w **lewym-górnym** rogu, w pierwszej
  linii (tam gdzie są przyciski/tytuł), żeby nie zasłaniał zawartości ramki.
  Szeroki i niski dla łatwego kliknięcia na telefonie (`w-12 h-9`, `top-1`).
  Przełącza menu i „jedzie" do prawej krawędzi sidebara po otwarciu
  (`left-1` ↔ `left-72`, `ChevronRight` ↔ `ChevronLeft`). Widoczny na każdym
  rozmiarze.
- **Zarezerwowane miejsce na uchwyt (standard)**: każdy widok zostawia na górze
  z lewej miejsce na uchwyt. `DashboardPageShell` **zawsze** renderuje górny
  wiersz toolbara z `pl-14 min-h-9`. Ekrany edytora (`EditorPageShell`) mają
  `pl-14` na swoim wierszu nagłówka (`msg-planner`, `todo-msg/edit`,
  `leads/msg-workout`).
- **Sidebar — zakładki (2026-07-13)**: ACTIONS (Forms, Views) · MESSAGES/LEADS
  (Statuses, Msg Todo, Msg Planner, Beeper, Folders, Messages) · Others
  (Settings) · Admin (Users). Wyloguj to pozycja w przewijanym `<nav>` tuż pod
  ostatnią grupą (`mt-4`, bez dużego odstępu). Motyw jest w Settings (nie w
  nagłówku sidebara).
- **Topbar**: ukryty na **każdym** rozmiarze przez flagę `SHOW_TOPBAR = false`
  (`{SHOW_TOPBAR && <Topbar />}`). Implementacja **pozostaje w drzewie** — żeby
  przywrócić topbar wszędzie, wystarczy zmienić flagę na `true`, bez innych
  zmian. Nie usunięto implementacji.
- **Theme toggle**: przeniesiony do nagłówka `Sidebar` (bo topbar jest ukryty
  app-wide), więc przełącznik motywu pozostaje dostępny.
- **Główna treść**: `<main className="min-h-0 flex-1 overflow-y-auto p-0.5
  xl:pr-[150px]">`. Padding ~2px, żeby ramka niemal idealnie wypełniała
  ekran. `overflow-y-auto` (nie `hidden`) jest bezpieczne: powłoki
  wypełniają `main` dokładnie (`h-full`), więc na stronach standardowych
  nie powstaje scroll strony, a strony jeszcze niezmigrowane nie są
  przycinane. **`xl:pr-[150px]` (Story 62 pane; breakpoint podniesiony
  z `md`/768px do `xl`/1280px, 2026-07-24):** dodatkowy pusty pas ~150px
  po prawej **tylko na szerokim desktopie** (≥1280px). Przy węższym oknie
  (telefon, tablet, pół ekranu Maca) pas znika i ramka bierze pełną
  szerokość. Sidebar nadal używa `DESKTOP_QUERY` / `md` (768px) —
  niezależny próg. Jeden wspólny punkt zmiany dla wszystkich widoków.
  **Uwaga o historii tej wartości:** Story 56 (2026-07-14) opisał i
  oznaczył jako DONE wersję `md:pr-[100px]`, ale w rzeczywistym kodzie jej
  nigdy nie było (`git log -S"pr-[100px]"` na tym pliku nie ma ani jednego
  commitu) — albo dokumentacja/checklist Story 56 się myliły, albo zmiana
  została cofnięta bez śladu w historii. Story 62 dodało pas od nowa, przy
  okazji zmieniając wartość na `150px` — to nie jest "przywrócenie", tylko
  nowa implementacja.
- **`DashboardHistoryProvider`** (Story 56, 2026-07-14) —
  `components/shared/dashboard-history-provider.tsx`, montowany raz w
  layout.tsx (owinięty w `<Suspense>`, bo korzysta z `useSearchParams`),
  wewnątrz `<main>`, otaczający `{children}`. Śledzi własny stos
  odwiedzonych URL-i (`pathname` + `?form=`/`?view=`) w zwykłym stanie
  Reacta — wyłącznie w RAM, zerowana po odświeżeniu strony, bez
  `localStorage`/`sessionStorage`/backendu. Maksymalnie 5 wpisów wstecz i
  5 wpisów do przodu (przycinanie najstarszych przy każdej nowej,
  nie-cofniętej/nie-do-przodu nawigacji). Udostępnia
  `useDashboardHistory()`: `{ canGoBack, canGoForward, goBack, goForward
  }` — używane wyłącznie przez `NavGroup` (patrz niżej), nie bezpośrednio
  przez strony.

### Warstwa 2 — Wspólne powłoki strony

`components/shared/dashboard-page-shell.tsx` — **DashboardPageShell** (standard
dla stron listowych/treściowych):

- Kolumna `flex h-full min-h-0 w-full flex-col gap-0.5` — wypełnia `main` (bez
  magicznych `calc()` zależnych od wysokości topbara).
- Wiersz 1 (zawsze renderowany, `pl-14` na uchwyt menu): **`NavGroup`
  (Back/Forw) pierwszy, potem opcjonalny `title`, potem opcjonalny
  `toolbar`** (Story 62 — wcześniej było odwrotnie, patrz "Shared
  navigation" niżej). Zawija się do drugiej linii, gdy się nie mieści.
- Opcjonalny `toolbarSecondRow`, osobny wiersz pod wierszem 1, wciąż NAD
  ramką (nie scrolluje z treścią) — miejsce na akcje właściwe dla danej
  strony (filtry, `+Add`, `Edit`, zbiorczy `Save`, ...). Standard: **wiersz
  1 = nawigacja i tytuł, wiersz 2 = akcje strony** (Story 62).
- Ramka: `rounded-xl border bg-card shadow-sm` + `flex-1 min-h-0
  overflow-hidden`.
- Treść ramki: `flex flex-col` (cross-axis `stretch` → dzieci pełnej szerokości,
  ułożone od góry → wyrównanie do lewej-górnej). Scroll wewnętrzny
  (`overflow-y-auto overflow-x-hidden`) domyślnie w ramce.
- Propsy: `title` (Story 62 — krótki tytuł wielkimi literami, np.
  `"SETTINGS"`, `"DAILY TRACKER"`, renderowany w wierszu 1 zaraz po
  `NavGroup`; **nigdy** nie duplikuj go jako osobny podtytuł/ścieżkę
  gdzieś indziej na stronie), `toolbar` (starszy sposób na treść wiersza 1
  — nowe strony powinny wolić `title` + `toolbarSecondRow`), `toolbarSecondRow`
  (Story 56 — opcjonalny drugi wiersz, patrz `statuses/page.tsx`), `upLevel`
  (Story 56 — patrz "Shared navigation" niżej), `scroll` (domyślnie `true`;
  `false` gdy dziecko ma własny scroll, np. tabela z `sticky` nagłówkiem lub
  edytor), `padded`, `className`, `frameClassName`, `contentClassName`.

#### Shared navigation: `NavGroup` (Story 56, 2026-07-14 — zastępuje `BackButton`; kolejność poprawiona w Story 62)

`components/shared/nav-group.tsx` — **NavGroup**: `[Back] [Forw]`,
jedyny sposób renderowania nawigacji "wstecz" na dowolnej stronie
dashboardu. Zastępuje `BackButton` (Story 55) — ten komponent nadal
istnieje (`components/shared/back-button.tsx`) tylko dla dwóch
odosobnionych kart błędu poza `DashboardPageShell`/`EditorPageShell`
(`leads/msg-workout`, `todo-msg/edit`, stan przed zamontowaniem powłoki).
`Prev` (trzeci przycisk z pierwszej wersji Story 56) został usunięty
2026-07-14 — `goBack`/`canGoBack` nadal istnieją w
`dashboard-history-provider.tsx` na wypadek, gdyby wrócił.

- **`DashboardPageShell` renderuje `NavGroup` automatycznie, jako
  PIERWSZY element wiersza 1** (Story 62 — wcześniej, błędnie względem
  własnego komentarza w `nav-group.tsx`, renderował się na końcu, po
  `toolbar`; poprawione, bo standard wymaga kolejności `Back, Forw,
  TYTUŁ`). Strony na tym standardzie dostają nawigację "za darmo", bez
  własnego kodu, nawet jeśli nigdy wcześniej nie miały żadnego przycisku
  Back (np. `msg-planner`, lista `todo-msg`, `users`, lista `beeper`).
  Strony z własnym, ręcznie budowanym wierszem nagłówka na
  `EditorPageShell` (Reports, `todo-msg/edit`, `leads/msg-workout`)
  renderują `<NavGroup upLevel={...} />` samodzielnie, jako pierwszy
  element tego wiersza.
- **Lewo-wyrównany, bez `ml-auto`** — musi być **pierwszym** dzieckiem w
  swoim `flex` wierszu (odwrotnie niż w oryginalnej wersji Story 56).
- **`Forw`** (prawy przycisk, strzałka w prawo): prawdziwa historia
  nawigacji w obrębie dashboardu, z `useDashboardHistory()` — ten sam
  mechanizm na każdej stronie, bez żadnych propsów. Wyszarzony, gdy nie ma
  kolejnego wpisu.
- **`Back`** (środkowy przycisk, większa ikona `Undo2` — okrągła
  strzałka): przejście o **jeden poziom wyżej w hierarchii bieżącej
  strony** (np. wybrany raport → lista raportów → menu Views) — to
  **NIE** jest historia przeglądarki/dashboardu, tylko logika konkretnej
  strony, przekazana przez `upLevel={{ onClick, href, disabled, label }}`.
  Bez `upLevel` (strony bez własnej hierarchii, np. top-level menu) —
  wyszarzony domyślnie. `\`'s dawna, literalna forma tekstowa (`\`) z
  pierwszej wersji Story 56 została zastąpiona ikoną + etykietą "Back" po
  korekcie użytkownika w trakcie realizacji — reużywa dokładnie tego
  samego `onClick`/`disabled`, który wcześniej trafiał do `BackButton`
  (semantyka "idź w górę o poziom" istniała już wcześniej, tylko pod
  nazwą/pozycją "Back").
- Warianty `upLevel`: `onClick` albo `href` (renderuje `Link`, np. strony
  Beeper), `disabled`, `label` (tekst `title` atrybutu).

`components/shared/editor-page-shell.tsx` — **EditorPageShell** (niższa warstwa,
sama kolumna pełnej wysokości, bez ramki):

- `flex h-full min-h-0 w-full flex-col overflow-hidden`.
- Wysokość bierze wyłącznie z rodzica (`h-full`) — działa tak samo na desktopie
  (z topbarem) i na telefonie (topbar ukryty). Usunięto stary hack
  `-m-[22px] h-[calc(100dvh-4rem-20px)]`, który zakładał stały topbar 4rem.
- Używany przez ekrany edytora, gdzie ramką jest sam edytor.

`components/shared/text-editor-with-toolbar.tsx` — **TextEditorWithToolbar**:

- Wygląda i zachowuje się jak standardowa ramka: `rounded-xl border bg-card`,
  wypełnia obszar, scroll tylko wewnętrzny (`.cm-scroller`).
- Pasek narzędzi (Preview | Editor | Save | WCH | extra) jest NAD treścią i
  **zawija się** (`flex-wrap`) na wąskim ekranie telefonu.
- Z zakładki **Preview** usunięto ikonę oka (pozostał sam tekst „Preview”).

### Warstwa 3 — Standard edytowalnej tabeli (Story 62, pilotaż na `DAILY TRACKER`)

Piloted on `Views → DAILY TRACKER` (`app/(dashboard)/dashboard/views/page.tsx`).
Nie ma jeszcze wydzielonego wspólnego komponentu (`components/shared/*table*`)
— ten opis jest przepisem do ręcznego zastosowania przy migracji kolejnych
tabel (`STATUSES`, `USERS`), nie odniesieniem do gotowego importu.

- **Domyślnie read-only.** Brak przełącznika `Edit` → brak kolumny akcji poza
  ołówkiem (patrz niżej), pola nieedytowalne.
- **Kolumna akcji — `[💾][✎]`, stała szerokość** (`components/shared/
  layout-tokens.ts`: `TABLE_ACTION_COLUMN_WIDTH_CLASS`, obecnie `w-[72px]`),
  ta sama we wszystkich stanach (sam ołówek / ołówek+dyskietka / spinner /
  zielony `Saved`):
  - **Ołówek (✎, "Edit Item")** — **zawsze widoczny**, także w trybie
    read-only. Otwiera pełny widok pojedynczego wpisu (Dialog) — osobny od
    edycji inline w tabeli. `title="Edit item"`, `aria-label="Edit item"`.
  - **Dyskietka (💾, "Save")** — widoczna **tylko** gdy globalny `Edit` jest
    włączony. Zapisuje zmiany TEGO wiersza wprost w tabeli. Kolor: szary
    (bez zmian) → czerwony (`text-destructive`, są niezapisane zmiany w tym
    wierszu) → spinner (`animate-spin`, w trakcie zapisu, przycisk
    `disabled`) → zielony `CheckCircle2` (zapisano, znika po ~2s, wraca
    dyskietka). **Nigdy nie pokazuj stanu "zapisano", jeśli zapis
    faktycznie się nie powiódł** — błąd zapisu to osobny stan (toast +
    powrót do czerwonego), nie fałszywy sukces.
  - Żaden zwykły przycisk z literą (np. "E") — odrzucone jako niestandardowe,
    niejednoznaczne, gorsze na telefonie, mylące z globalnym `Edit`.
- **Stan `dirty` pola**: zmiana wartości pola → czerwone tło pola
  (`bg-destructive/10`) + czerwony tekst w polu, niezależnie dla każdego
  pola/wiersza (stan trzymany w mapie `editedRows[itemName][fieldKey]`) —
  edycja jednego wiersza nigdy nie czyści niezapisanych zmian innego.
  Kolumny "— AUTO" (liczone po stronie serwera przy odczycie) są **zawsze**
  tylko do odczytu, nawet w trybie `Edit` — nigdy nie wysyłane przy zapisie.
- **Zbiorczy `Save`** — w drugim wierszu toolbara (`toolbarSecondRow`),
  widoczny tylko w trybie `Edit`, zapisuje **wyłącznie wiersze z realną
  zmianą** (nie wszystkie widoczne, w przeciwieństwie do obecnego
  zachowania `STATUSES`, patrz niżej), pokazuje stan ładowania, każdy
  wiersz aktualizuje swój własny stan niezależnie (jeden nieudany zapis nie
  fałszuje sukcesu innych).
- **Wzorzec zapisu** (nie kopiuj mechanicznie z `STATUSES` — patrz różnice
  niżej): `PATCH /api/forms/daily-entry` → `updateDailyEntry(loca, bodyYaml)`
  w `packages/dba/src/leads.ts` → `GetItem` (odczyt typu/nazwy pod danym
  `loca`) → `Put` na tym samym `loca` — dokładnie ten sam kształt co
  `updateReportEntry` w `report-entries.ts`. Identyfikacja wiersza wyłącznie
  po jego prawdziwym `itemName`/`loca` (dodane jako pole w odpowiedzi
  `GET /api/views`, wcześniej go tam nie było) — **nigdy** po polu `DATE`.
  Zobacz `documentation/ai-docs/begin_here/05_endpoint-rules.md` i
  `documentation/dashboard/forms/features/daily-tracker-dates.md`.
- **Różnice względem `STATUSES`** (świadome, nie błąd migracji): Statuses
  jest zawsze-edytowalny (brak trybu read-only), oznacza `dirty` tylko na
  poziomie wiersza (nie pola), a jego zbiorczy zapis zapisuje **wszystkie**
  widoczne wiersze, nie tylko zmienione. `DAILY TRACKER` celowo tego nie
  powtarza — patrz `backlog/stories/62/03_knowledge.md` §6 dla pełnej listy
  różnic.
- **Scroll tabeli / dotyk**: kontener `overflow-auto overscroll-contain` —
  `overscroll-contain` (czyli `overscroll-behavior: contain`) zatrzymuje
  scroll-chaining/odbijanie na granicach danych bez blokowania normalnego
  przewijania w obu osiach wewnątrz kontenera. To samo rozwiązanie ma być
  zastosowane przy migracji `USERS`/`STATUSES`, gdzie ten sam problem
  (przeciągnięcie palcem poza ostatnią kolumnę, odbicie widoku) jest znany,
  ale jeszcze niepoprawiony.
- **Widok pojedynczego wpisu** (cel ołówka): `Dialog` (shadcn) pokazujący
  wszystkie pola danego wpisu. `Delete` żyje **wyłącznie** tutaj (nigdy w
  wierszu tabeli) — w obecnym stanie renderowany jako `disabled`, z
  tooltipem tłumaczącym dlaczego (Content Provider nie ma działającej
  metody usuwania — pusty stub `DeleteWorker.Delete()`, patrz
  `daily-tracker-dates.md` §7) zamiast być pominięty bez wyjaśnienia.

## Zmienione pliki

Komponenty wspólne:

- `components/shared/dashboard-page-shell.tsx` — **nowy** komponent standardu.
- `components/shared/editor-page-shell.tsx` — przepisany na `h-full`.
- `components/shared/text-editor-with-toolbar.tsx` — ramka + zawijanie paska,
  usunięta ikona oka.
- `components/shared/sidebar.tsx` — prop `mobile` (pełna szerokość, ukryty
  przycisk zwijania w panelu mobilnym).
- `app/(dashboard)/layout.tsx` — responsywny sidebar (Sheet) + uchwyt mobilny,
  topbar `md:block`, `main` bez centrowania (`mx-auto`/`max-w` usunięte).

Strony przeniesione na standard:

- `app/(dashboard)/dashboard/statuses/page.tsx` — 3 widoki (edytor, matrix,
  migration/lista).
- `app/(dashboard)/dashboard/todo-msg/page.tsx` — lista (fix scrolla strony).
- `app/(dashboard)/dashboard/leads/details/page.tsx` — karty leada (fix scrolla).
- `app/(dashboard)/dashboard/forms/page.tsx` — menu + Action + Lead + DAILY
  ENTRY + DATE ENTRY (menu i formularze w standardowej ramce, tytuł w linii
  przycisków, bez podtytułów).
- `app/(dashboard)/dashboard/views/page.tsx` — menu + LEADS + TRACKER/DATES.
- `app/(dashboard)/dashboard/msg-planner/page.tsx` — pasek dat/new/refresh jako
  toolbar nad ramką-edytorem.

Ekrany edytora korzystające z `EditorPageShell` + `TextEditorWithToolbar`
(`todo-msg/edit`, `leads/msg-workout`) zyskują poprawę automatycznie.

**Story 62 (2026-07-16) — tytuł w shellu, pas 150px, wzorzec `SETTINGS` +
`DAILY TRACKER`, username w sidebarze:**
`components/shared/layout-tokens.ts` (nowy — `FRAME_SECTION_GAP_CLASS`
~3px, `TABLE_ACTION_COLUMN_WIDTH_CLASS`), `dashboard-page-shell.tsx` (nowy
prop `title`, `NavGroup` przeniesiony na początek wiersza 1),
`nav-group.tsx` (dokumentacja komentarza dopasowana do faktycznego
zachowania — bez zmiany logiki), `app/(dashboard)/layout.tsx`
(`md:pr-[150px]`), `sidebar.tsx` (fetch `/api/auth/session`, napis
"Dashboard" → `displayName || username`), `settings/layout.tsx` (`title=
"SETTINGS"`, `FRAME_SECTION_GAP_CLASS` zamiast lokalnego `gap-4`),
`views/page.tsx` (`DAILY TRACKER`: `title` zamiast `toolbar` z "Views /
TRACKER", drugi wiersz z `+Add`/`Edit`/zbiorczym `Save`, kolumna akcji
`[💾][✎]`, stan `dirty` per-pole, `Dialog` pojedynczego wpisu,
`overscroll-contain`), `packages/dba/src/leads.ts` (nowa
`updateDailyEntry`), `app/api/forms/daily-entry/route.ts` (nowy `PATCH`,
istniejący `POST` bez zmian), `app/api/views/route.ts` (dodane pole
`loca`, addytywnie). **Nie migrowane w tym Story** (tylko opisane w planie
migracji, patrz `backlog/stories/62/02_plan.md`): strona logowania i
wszystkie pozostałe strony poza `SETTINGS`/`DAILY TRACKER`.

**Story 56 (2026-07-14) — nawigacja + pas 100px:**
`components/shared/nav-group.tsx` (nowy), `components/shared/
dashboard-history-provider.tsx` (nowy), `dashboard-page-shell.tsx`
(`toolbarSecondRow`, `upLevel`, automatyczny `NavGroup`), `app/(dashboard)/
layout.tsx` (`md:pr-[100px]`, `DashboardHistoryProvider` + `Suspense`).
`upLevel` dodany w: `forms/page.tsx` (wszystkie gałęzie), `views/page.tsx`
(leads/reports/tracker/dates), `leads/details/page.tsx`,
`statuses/page.tsx`, `beeper/{inbox,merge,[id]}/page.tsx`. `NavGroup`
wstawiony ręcznie (zamiast automatycznego, bo te strony budują własny
nagłówek na `EditorPageShell`) w: `forms/page.tsx` (gałąź Reports),
`leads/msg-workout/page.tsx`, `todo-msg/edit/page.tsx`.

## Zasada podwójnej ramki i "Save na górze" (Story 62, doprecyzowane po przeglądzie wdrożenia)

Po wdrożeniu pilotażu (`SETTINGS`, `DAILY TRACKER`) użytkownik, przeglądając
realnie działającą aplikację, doprecyzował dwie rzeczy, które nie były
oczywiste z pierwszej wersji standardu:

1. **Każda strona ma mieć co najmniej dwie ramki, nawet gdy treść to
   pojedynczy formularz/tabela.** Zewnętrzna ramka to zawsze
   `DashboardPageShell`'a własna `rounded-xl border bg-card`; wewnątrz niej
   **zawsze** ląduje co najmniej jedna ramka wewnętrzna
   (`rounded-lg border bg-muted/10`) opakowująca właściwą treść — nie
   "jedna, jeśli strona nie wymaga podziału" jak sugerowała pierwsza wersja
   tego dokumentu, tylko zawsze co najmniej jedna. Dotyczy to też tabel
   (patrz `ADD DAILY ENTRY`, `DAILY TRACKER` po poprawce Story 62).
2. **Przyciski zapisu zawsze na górze**, nie na dole formularza:
   - jeśli strona ma pole z automatycznie generowaną nazwą (np. `ADD LEAD`,
     `ADD ACTION`, `ADD REPORT`) — `Save`/`Create` i to pole żyją razem, w
     jednej ramce, na samej górze treści, wyrównane do lewej;
   - jeśli nie ma generowanej nazwy (np. `ADD DAILY ENTRY`, `ADD DATE`) —
     `Save` jest wolnym przyciskiem bez własnej ramki, też na górze, nad
     ramką z resztą formularza.

Zastosowane w Story 62 na: `ADD DAILY ENTRY`, `ADD DATE`, `ADD LEAD`,
`ADD ACTION`, `ADD REPORT`, `DAILY TRACKER`, `DATES`, `LEADS`, `REPORTS`,
`STATUSES` (wszystkie 3 tryby), `MSG TODO`, `MSG PLANNER`, `BEEPER`
(wszystkie 4 trasy), `FOLDER`, `MESSAGES`, `USERS`, `LOGIN` — patrz
`backlog/stories/62/05_tasks_and_checklist.md` Tasks 11–19 dla pełnego
zestawienia plik-po-pliku.

## Zasady dla nowych stron

1. Strona listowa/treściowa → `DashboardPageShell` z `title` (krótki,
   WIELKIMI LITERAMI, bez podtytułów/ścieżek gdzie indziej na stronie) +
   `toolbarSecondRow` na akcje strony (Story 62) — preferowane nad starszym
   wzorcem samego `toolbar`.
2. Tabela ze `sticky` nagłówkiem lub własnym scrollem → `DashboardPageShell`
   z `scroll={false} padded={false}` i wewnętrznym `overflow-auto
   overscroll-contain` (Story 62 — patrz "Warstwa 3" wyżej dla pełnego
   standardu edytowalnej tabeli).
3. Ekran edytora → `EditorPageShell` + `TextEditorWithToolbar`.
4. **Nie** twórz nowego `<div className="-m-[22px] ...">` ani nowego
   `Card + flex-1 + overflow`. To jest już scentralizowane.
5. Treść zawsze od lewej-górnej krawędzi — nie centruj (`items-center`,
   `justify-center`, `mx-auto`).
6. Odstęp między główną ramką a ramkami wewnętrznymi (gdy strona ma sekcje)
   → `components/shared/layout-tokens.ts`'s `FRAME_SECTION_GAP_CLASS`
   (~3px), nigdy lokalna wartość skopiowana per strona. To osobna wartość
   od paddingu treści wewnątrz każdej sekcji — tego paddingu ten token nie
   dotyczy.

## Strona logowania — ograniczony standard (opisany, NIE zaimplementowany w Story 62)

Zakres logowania (`app/(auth)/login/page.tsx`) i jej sąsiadów w tej samej
grupie tras (`register`, `forgot-password`, `setup-2fa`, `verify-email`)
**nie został zmigrowany w Story 62** — obecnie nadal używa wyśrodkowanego
układu (`min-h-screen flex items-center justify-center`), bez związku ze
standardem `DashboardPageShell`. Docelowy, ograniczony standard (do
zaimplementowania w przyszłym Story):

- bez sidebara, bez menu, bez `Back`/`Forw`, bez toolbara dashboardu,
- layout w górnym lewym rogu (nie wyśrodkowany),
- jedna główna ramka + jedna ramka wewnętrzna z formularzem — te same
  zaokrąglenia i ~3px odstęp co w standardzie dashboardowym,
- kontrolowana wysokość, wewnętrzny scrollbar gdy treść przekracza
  dostępną wysokość, **bez** niekontrolowanego globalnego scrolla
  dokumentu,
- osobny mały komponent (np. `components/shared/auth-page-shell.tsx`),
  nie kopiowany ręcznie do każdej strony `(auth)`.

## Edge cases

- **Telefon pion/poziom**: `100dvh` + flex + `overflow` — obie orientacje OK.
  Layout jest identyczny niezależnie od szerokości (brak przełączania na
  wersję desktopową przy `md`).
- **Toolbar nie mieszczący się w jednej linii**: zawija się do drugiej linii
  (`flex-wrap`).
- **Puste / loading / error**: wyrównane do lewej-górnej (nie wyśrodkowane).
- **Długa treść**: scrollbar pojawia się wewnątrz ramki, nigdy na całej stronie.

## Znane ograniczenia

- **Pełna lista stron i ich stopień zgodności z tym standardem**:
  `backlog/stories/62/05_tasks_and_checklist.md` (Tasks 1–19) —
  po Round 2 (pełny rollout, ten sam Story) zmigrowane są: `SETTINGS`,
  `ADD DAILY ENTRY`, `ADD DATE`, `ADD LEAD`, `ADD ACTION`, `ADD REPORT`,
  `DAILY TRACKER`, `DATES`, `LEADS`, `REPORTS`, `STATUSES` (3 tryby),
  `MSG TODO`, `MSG PLANNER`, `BEEPER` (4 trasy), `FOLDER`, `MESSAGES`,
  `USERS`, `LOGIN`. Niezmigrowane pozostają: strona `/dashboard/
  content-provider` (osobny feature spoza tego Story) i sąsiednie trasy
  `(auth)` obok loginu (`register`, `forgot-password`, `setup-2fa`,
  `verify-email`).
- Topbar (search + ikony) jest ukryty na każdym rozmiarze; jego funkcje
  (search, powiadomienia, profil) nie są obecnie dostępne poza kodem. Theme
  toggle przeniesiono do nagłówka sidebara, a Wyloguj jest pozycją w menu, więc
  oba pozostają dostępne.
- `DAILY TRACKER`'s edytowalna tabela (Story 62) nie ma jeszcze wydzielonego
  wspólnego komponentu — logika (dirty tracking, stan zapisu, kolumna akcji)
  żyje bezpośrednio w `views/page.tsx`. Wydzielenie do
  `components/shared/` warte zrobienia przy migracji drugiej tabeli
  (`STATUSES` albo `USERS`), nie wcześniej (żeby nie zgadywać kształtu
  abstrakcji z jednego przypadku użycia).
- Weryfikacja: patrz `backlog/stories/62/05_tasks_and_checklist.md` dla
  dokładnego zakresu tego, co zostało sprawdzone real-mobile-viewport vs.
  tylko statycznie/desktop.

## Dalsze etapy

- Stopniowe przeniesienie pozostałych stron pierwszego poziomu na
  `DashboardPageShell`.
- Ewentualny minimalny pasek mobilny z theme toggle, jeśli będzie potrzebny.

## Powiązana dokumentacja

- [shared-text-editor-toolbar.md](shared-text-editor-toolbar.md)
- [../bugs/text-editor-overflows-page.md](../bugs/text-editor-overflows-page.md)
- [../bugs/shared-editor-layout-and-toolbar-v2.md](../bugs/shared-editor-layout-and-toolbar-v2.md)
- [../../../bugs/msg-planner-editor-internal-scroll-missing.md](../../../bugs/msg-planner-editor-internal-scroll-missing.md)
