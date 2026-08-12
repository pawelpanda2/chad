# GUI standard — ai-start

Status: utworzone 2026-08-02 (Story 99/101 follow-up — "napraw w końcu" zgłoszenie
o głównej ramce Beepera). Nowy folder specjalizacji, analogiczny do
`ai-docs/beeper/`/`ai-docs/msg-workout/` — indeksuje konwencje wyglądu/scrolla
używane w kilku zakładkach Dashboardu, żeby nie trzeba było ich zgadywać albo
wynajdywać na nowo przy każdej kolejnej zakładce.

**Zanim tu zajrzysz po raz drugi w tej samej sesji, sprawdź czy już nie
przeczytałeś** — to jest częsty błąd (Story 99/101: layout Beepera był
poprawiany kilka razy, bo AI nie sprawdziło, że coś już jest opisane).

## Twarda zasada: NIGDY elementów wyrównanych do prawej strony

**(dodana 2026-08-06, po realnym zgłoszeniu: Photos card w Lead Details/
Google Contacts miał `justify-between` — nagłówek "Photos (N)" po lewej,
przyciski Gallery/Add photo odepchnięte na prawy kraniec wiersza — właściciel
tego pod żadnym pozorem nie chce.)**

Pod żadnym pozorem nie używaj `justify-between`, `ml-auto`, `justify-end`
ani żadnej innej techniki, która odpycha element(y) na prawą krawędź
wiersza/ramki. Wszystkie kontrolki (nagłówek, liczniki, przyciski) mają być
spakowane od lewej, w jednym `flex` rzędzie z `gap`, w kolejności czytania —
nigdy rozepchnięte na przeciwne krańce.

To nie jest nowa zasada wymyślona od zera — **ten sam wzorzec już był
opisany** niżej w tym pliku dla licznika wierszy tabel bez edycji inline
("ma być spakowany po lewej, zaraz za ostatnią kontrolką, nie odepchnięty na
prawy kraniec") — różnica jest taka, że to zgłoszenie podnosi go do rangi
**uniwersalnej, twardej zasady dla całego GUI**, nie tylko dla liczników w
tabelach. Zanim dodasz jakikolwiek nowy pasek przycisków/nagłówek, sprawdź
czy przypadkiem nie używasz `justify-between`/`ml-auto` żeby coś odepchnąć —
jeśli tak, popraw na spakowane od lewej.

**Przykład poprawki (Photos card, Story 106 follow-up):**
`components/shared/photos-section.tsx` — nagłówek `Photos (N)` + przycisk
`Gallery` w jednym `flex items-center gap-2` bez `justify-between`, oba po
lewej stronie zaraz obok siebie.

## Czytać gdy

Dowolna zmiana dotykająca: głównej ramki strony (`DashboardPageShell`),
scrolla wewnątrz zakładki, widoku tabeli (kolumny, licznik wierszy), widoku
listy podzielonej na dwie kolumny (lista + szczegół/konwersacja), albo
skróconych nagłówków/ikon wymagających tooltipa.

## Relacja do `human-docs/dashboard/common/features/responsive-layout-standard.md`

**To jest dokumentacja DLA LUDZI** (opisuje co użytkownik zobaczy, historię
Story 56/62) i **pozostaje jedynym źródłem prawdy** dla:
- `DashboardPageShell`/`EditorPageShell` — struktura ramki, `NavGroup`,
  `title`/`toolbar`/`toolbarSecondRow`, zasada "co najmniej dwie ramki",
  "Save na górze".
- **Warstwa 3 — standard edytowalnej tabeli** (kolumna akcji `[💾][✎]`, stan
  `dirty` per-pole, wzorzec zapisu) — to dotyczy tabel z **edycją inline**
  (DAILY TRACKER, docelowo STATUSES/USERS). Beeper Permissions/Groups (patrz
  niżej) to inny przypadek — tabele **bez** edycji inline, tylko pojedyncze
  pola/comboboxy per wiersz — nie mylić tych dwóch wzorców.

**Ten plik (`ai-docs/gui-standard/`) dodaje tylko to, czego tamten dokument
nie opisuje** — nie duplikuje go. Konkretnie: split-view z dwoma niezależnymi
scrollami + kolapsującym nagłówkiem (poniżej), i drobne, powtarzalne wzorce
(licznik wierszy w drugiej linii przycisków, kolumny o stałej szerokości,
tooltip po kliknięciu) wypracowane przy Beeperze, które nadają się do
ponownego użycia w innych zakładkach.

**Forms / Views (Save frame, Full View, tabela amber, `returnTo`, drafty):**
patrz osobny folder
[`ai-docs/gui-standards/`](../gui-standards/ai-start.md)
(liczba mnoga) — [forms-and-views.md](../gui-standards/forms-and-views.md).
Nie mieszaj tych standardów z Beeper split-view poniżej.

## Wzorzec: Beeper split-view — panele scrollują, brak głównego scrolla

**Gdzie:** `packages/dashboard/app/(dashboard)/dashboard/beeper/page.tsx`
(Conversations/Msg workout tabs) + `components/beeper/beeper-conversations-view.tsx`,
`msg-workout-review-view.tsx`, `beeper-conversation-list.tsx`.

**Kiedy używać:** zakładka typu "lista kontaktów/wątków | szczegół" (czat).

**Zasada wysokości (2026-08-03):** cały widok Beeper **zawsze mieści się**
w dostępnej wysokości okna. `DashboardPageShell` na Beeperze ma
`scroll={false}` — **nie ma** głównego pionowego scrollbara ramki.
Wysokość dla paneli odzyskuje się przez zwinięcie bloku tabs/filters
(chevron ↑/↓ w `toolbarLeading`, stan `isViewToolbarCollapsed`), nie przez
przewijanie shella. Split-view siedzi w
`<div className="min-h-0 flex-1 overflow-hidden">` (NIE w starym
`h-full shrink-0`, które celowo robiło overflow pod shell scroll).

**Zwijanie paska zakładek:** tylko blok tabs/filters wewnątrz ramki.
Nie ruszać pozycji scrollbarów paneli, nie owijać ich scroll containerów,
nie używać `direction`.

**Scrollują wyłącznie panele:**

1. **Lista kontaktów** — własny `overflow-y-auto`.
2. **Konwersacja** — własna ramka + własny `overflow-y-auto`. Auto-scroll
   do najnowszej wiadomości: `scrollTop` **bezpośrednio** na tym elemencie —
   **NIGDY `element.scrollIntoView()`** (przewijałoby przodków).
3. **Msg workout** (gdy otwarty) — własny scroll panelu.
4. **Permissions / Groups** — własny `min-h-0 flex-1 overflow-y-auto` na
   poziomie `beeper/page.tsx` (tabele), bo nie ma już shell scrolla.

**Historia (nie przywracać):** wcześniejszy wzorzec „oversized”
(`h-full shrink-0` + shell `overflow-y-auto`) celowo tworzył trzeci scrollbar
żeby zjechać zakładki. Zastąpiony chevronem collapse + `scroll={false}`.

## Widok tabeli (bez edycji inline) — Beeper Permissions/Groups→List

Uzupełnienie Warstwy 3 z `responsive-layout-standard.md` dla tabel, które
**nie mają** edycji inline (żadnego trybu Edit, żadnej kolumny `[💾][✎]`) —
tylko pojedyncze kontrolki per wiersz (checkbox, combobox) zapisujące się
od razu przy zmianie:

- **`table-fixed` + jawne szerokości + dodatkowa pusta kolumna na końcu**
  (`<th aria-hidden="true" />`/`<td aria-hidden="true" />`) — bez tego
  kolumny "pływają" i zmieniają szerokość przy każdej zmianie
  filtra/wyszukiwania (realny bug znaleziony dwa razy w tym Story: raz w
  Groups, potem osobno w Permissions — jeśli dodajesz kolejną tabelę tego
  typu, zastosuj ten wzorzec od razu, nie czekaj na zgłoszenie). Odstępy:
  8px od lewej na pierwszej kolumnie, 16px między kolumnami (`pl-2`/`pr-4`
  na komórkach).
- **Licznik wierszy ("N items") nie ma własnego wiersza.** Renderowany w
  drugiej linii przycisków strony (obok filtrów/wyszukiwania), przekazywany
  w górę przez `onCountChange?: (count: number) => void`, bez `ml-auto` —
  ma być spakowany po lewej, zaraz za ostatnią kontrolką, nie odepchnięty na
  prawy kraniec we własnej, w przeciwnym razie pustej linii.
- **Generyczne słowo, nie domenowe** — "N items", nie "N contacts" (albo co
  innego specyficznego dla danej zakładki) — bo etykieta żyje w współdzielonym
  miejscu (`page.tsx`), nie w komponencie, który wie, czym są te wiersze.
- **Wyścig zapytań (race condition) przy zmianie filtra:** jeśli `load()`
  zależy od propsów, które mogą się zmienić zanim poprzednie zapytanie
  wróci (np. `groupFilter` zmienia się zaraz po mount przez efekt
  ustawiający domyślną grupę), **musi** mieć guard przed przestarzałą
  odpowiedzią (`cancelledRef` per-wywołanie, ustawiane w cleanup efektu) —
  inaczej wolniejsza, starsza odpowiedź (np. bez filtra) może nadpisać
  szybszą, poprawną. Realny bug znaleziony w tym Story
  (`beeper-permissions-view.tsx`) — API zwracał poprawnie przefiltrowane
  dane, ale UI pokazywał starą, niefiltrowaną listę, bo dwa zapytania
  leciały równolegle bez żadnej ochrony przed kolejnością odpowiedzi.

## Tooltip po kliknięciu (nie po najechaniu)

**Gdzie:** `components/shared/click-reveal-tooltip.tsx` (dla tekstu, np.
skrócony nagłówek kolumny "Plat.") i wzorzec bezpośrednio w
`components/beeper/beeper-platform-icon.tsx` (dla ikony — nie może być
osobnym `<button>`, bo ta ikona bywa zagnieżdżona wewnątrz innego
`<button>`, np. wiersza listy kontaktów; `<button>` w `<button>` to
nieprawidłowy HTML — użyj `role="button"` na `<span>` zamiast tego).

**Kiedy używać:** skrócona etykieta/ikona, gdzie pełne znaczenie nie jest
oczywiste, a hover nie jest pożądany (np. telefon nie ma hover) albo
świadomie nie chcemy natywnego `title`. Klik pokazuje bąbelek z pełnym
tekstem na ~2s, potem znika sam. Nigdy nie łącz z natywnym atrybutem
`title` na tym samym elemencie — dwa niezależne mechanizmy tooltipa na
raz są mylące.

## Generyczne etykiety Search (obowiązkowe)

**(dodane 2026-08-08.)** Pola wyszukiwania w listach/hubach używają
**generycznej** nazwy — nie domenowej.

| Dozwolone | Zakazane |
|-----------|----------|
| `placeholder="Search"` | `Filter leads…`, `Search leads...`, `Search contacts`, `Search reports…` |
| `aria-label="Search"` | `aria-label="Filter leads"` / `Search contacts` |

`aria-label` też ma być po prostu `"Search"` (ten sam generyczny token).
Kontekst (leady, kontakty, raporty) wynika z otoczenia widoku, nie z
placeholderu. Przy nowym Search albo przy restylu istniejącego — zawsze
`Search`, nigdy „Search X” / „Filter X”.

Przykład: Msg Auto → manually added msg — Search + opcjonalny przycisk
**Filters** (osobna linia filtrów, nie w placeholderze Search).

## Powiązana dokumentacja

- [../../human-docs/dashboard/common/features/responsive-layout-standard.md](../../human-docs/dashboard/common/features/responsive-layout-standard.md) —
  ogólny standard ramki/scrolla/tabeli z edycją inline (czytaj najpierw).
- [../gui-standards/ai-start.md](../gui-standards/ai-start.md) —
  Forms + Views (Save / Full View / tabela pól / `returnTo`).
- [../beeper/ai-start.md](../beeper/ai-start.md) — architektura Beeper sync/Mongo.
- [../msg-workout/ai-start.md](../msg-workout/ai-start.md) — Story 99 msg workout ↔ Beeper linking.
