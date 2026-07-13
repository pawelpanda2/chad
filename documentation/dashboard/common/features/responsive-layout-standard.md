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
- **Główna treść**: `<main className="min-h-0 flex-1 overflow-y-auto p-0.5">`.
  Padding ~2px, żeby ramka niemal idealnie wypełniała ekran. `overflow-y-auto`
  (nie `hidden`) jest bezpieczne: powłoki wypełniają `main` dokładnie
  (`h-full`), więc na stronach standardowych nie powstaje scroll strony, a
  strony jeszcze niezmigrowane nie są przycinane.

### Warstwa 2 — Wspólne powłoki strony

`components/shared/dashboard-page-shell.tsx` — **DashboardPageShell** (standard
dla stron listowych/treściowych):

- Kolumna `flex h-full min-h-0 w-full flex-col` — wypełnia `main` (bez magicznych
  `calc()` zależnych od wysokości topbara).
- Opcjonalny `toolbar` NAD ramką: `flex flex-wrap items-center` — przyciski w
  jednej linii, a gdy się nie mieszczą, zawijają się do drugiej. Jeśli jest
  tytuł, stoi w tej samej linii co przyciski, bez dodatkowych opisów.
- Ramka: `rounded-xl border bg-card` + `flex-1 min-h-0 overflow-hidden`.
- Treść ramki: `flex flex-col` (cross-axis `stretch` → dzieci pełnej szerokości,
  ułożone od góry → wyrównanie do lewej-górnej). Scroll wewnętrzny
  (`overflow-y-auto`) domyślnie w ramce.
- Propsy: `toolbar`, `scroll` (domyślnie `true`; `false` gdy dziecko ma własny
  scroll, np. tabela z `sticky` nagłówkiem lub edytor), `padded`, `className`,
  `frameClassName`, `contentClassName`.

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

## Zasady dla nowych stron

1. Strona listowa/treściowa → `DashboardPageShell` (przyciski w `toolbar`).
2. Tabela ze `sticky` nagłówkiem lub własnym scrollem → `DashboardPageShell`
   z `scroll={false} padded={false}` i wewnętrznym `overflow-auto`.
3. Ekran edytora → `EditorPageShell` + `TextEditorWithToolbar`.
4. **Nie** twórz nowego `<div className="-m-[22px] ...">` ani nowego
   `Card + flex-1 + overflow`. To jest już scentralizowane.
5. Treść zawsze od lewej-górnej krawędzi — nie centruj (`items-center`,
   `justify-center`, `mx-auto`).

## Edge cases

- **Telefon pion/poziom**: `100dvh` + flex + `overflow` — obie orientacje OK.
  Layout jest identyczny niezależnie od szerokości (brak przełączania na
  wersję desktopową przy `md`).
- **Toolbar nie mieszczący się w jednej linii**: zawija się do drugiej linii
  (`flex-wrap`).
- **Puste / loading / error**: wyrównane do lewej-górnej (nie wyśrodkowane).
- **Długa treść**: scrollbar pojawia się wewnątrz ramki, nigdy na całej stronie.

## Znane ograniczenia

- Strony spoza zakresu (np. `dashboard` home, `analytics`, `beeper`, `settings`)
  nie zostały przeniesione na standard — nadal mogą scrollować `main`. `main`
  celowo pozostaje `overflow-y-auto`, żeby ich nie przyciąć.
- Topbar (search + ikony) jest ukryty na każdym rozmiarze; jego funkcje
  (search, powiadomienia, profil) nie są obecnie dostępne poza kodem. Theme
  toggle przeniesiono do nagłówka sidebara, a Wyloguj jest pozycją w menu, więc
  oba pozostają dostępne.
- Weryfikacja: przeszły `tsc --noEmit` oraz `next build`. Widoku mobilnego nie
  zweryfikowano wizualnie w przeglądarce w tym środowisku (strony za auth).

## Dalsze etapy

- Stopniowe przeniesienie pozostałych stron pierwszego poziomu na
  `DashboardPageShell`.
- Ewentualny minimalny pasek mobilny z theme toggle, jeśli będzie potrzebny.

## Powiązana dokumentacja

- [shared-text-editor-toolbar.md](shared-text-editor-toolbar.md)
- [../bugs/text-editor-overflows-page.md](../bugs/text-editor-overflows-page.md)
- [../bugs/shared-editor-layout-and-toolbar-v2.md](../bugs/shared-editor-layout-and-toolbar-v2.md)
- [../../../bugs/msg-planner-editor-internal-scroll-missing.md](../../../bugs/msg-planner-editor-internal-scroll-missing.md)
