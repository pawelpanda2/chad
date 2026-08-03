# GUI standard — ai-start

Status: utworzone 2026-08-02 (Story 99/101 follow-up — "napraw w końcu" zgłoszenie
o głównej ramce Beepera). Nowy folder specjalizacji, analogiczny do
`ai-docs/beeper/`/`ai-docs/msg-workout/` — indeksuje konwencje wyglądu/scrolla
używane w kilku zakładkach Dashboardu, żeby nie trzeba było ich zgadywać albo
wynajdywać na nowo przy każdej kolejnej zakładce.

**Zanim tu zajrzysz po raz drugi w tej samej sesji, sprawdź czy już nie
przeczytałeś** — to jest częsty błąd (Story 99/101: layout Beepera był
poprawiany kilka razy, bo AI nie sprawdziło, że coś już jest opisane).

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

## Wzorzec: split-view z dwoma niezależnymi scrollami + kolapsujący nagłówek

**Gdzie:** `packages/dashboard/app/(dashboard)/dashboard/beeper/page.tsx`
(Conversations/Msg workout tabs) + `components/beeper/beeper-conversations-view.tsx`,
`msg-workout-review-view.tsx`, `beeper-conversation-list.tsx`.

**Kiedy używać:** zakładka typu "lista kontaktów/wątków | szczegół" (czat,
skrzynka mail-podobna) — NIE dla zwykłych tabel (te używają wzorca niżej,
"Widok tabeli").

**Problem, który to rozwiązuje** (Story 99 follow-up, dokładny opis
użytkownika): przy takim split-view standardowa `DashboardPageShell`
(zakładki + pasek filtrów + treść, wszystko w jednej ramce z jednym
scrollem) nie działa dobrze, bo lista kontaktów i konwersacja **muszą** mieć
własny, niezależny scroll (typowy layout czatu) — więc treść zakładki
zawsze dokładnie wypełnia dostępną wysokość i nigdy nie ma nadmiaru do
przewinięcia na poziomie całej strony. To był pierwotny bug: nie dało się
"zjechać niżej", żeby zakładki (Conversations/Permissions/...) i pasek
filtrów schowały się i zrobiły więcej miejsca — ani na telefonie, ani na
desktopie.

**Rozwiązanie — trzy niezależne scrolle, żaden nie jest udawany:**

1. **Lista kontaktów** (`<aside>` → `BeeperConversationList`) — `h-full` +
   własny `overflow-y-auto`. Wypełnia dokładnie dostępną wysokość, własny
   pasek przewijania.
2. **Konwersacja** (`<section>`) — **własna ramka z zaokrąglonymi rogami**
   (`rounded-xl border`, dokładnie ta sama estetyka co ramka główna, tylko
   mniejsza) + własny `overflow-y-auto` wewnątrz. Auto-scroll do najnowszej
   wiadomości ustawia `scrollTop` **bezpośrednio na tym elemencie** — **NIGDY
   `element.scrollIntoView()`**, bo `scrollIntoView()` przewija WSZYSTKICH
   scrollowalnych przodków w łańcuchu, łącznie z głównym scrollem strony (co
   właśnie powodowało, że samo otwarcie konwersacji chowało zakładki — realny
   bug znaleziony i naprawiony w tym Story). `element.scrollTop = element.scrollHeight`
   na referencji do lokalnego kontenera nigdy nie dotyka niczego poza nim.
3. **Główna ramka** (`DashboardPageShell`, poza tym komponentem) — jej
   `overflow-y-auto` jest zawsze obecne (to standardowy mechanizm shella), a
   robi się **naprawdę scrollowalne** (nie tylko technicznie, ale z realnym
   nadmiarem treści) dzięki temu, że wrapper wokół split-view w `page.tsx`
   ma `h-full shrink-0` (NIE `flex-1 min-h-0`):
   ```
   <div className="h-full shrink-0 overflow-hidden">
     <BeeperConversationsView .../>
   </div>
   ```
   `h-full` na flex-childzie liczy się względem **wysokości kontenera
   scrolla** (czyli pełnej dostępnej wysokości ramki), a nie "tego, co
   zostało po zakładkach" — to inna semantyka niż `flex-1` (który dzieli
   pozostałą przestrzeń). Efekt: całkowita wysokość treści w scrollu =
   wysokość paska zakładek+filtrów + pełna wysokość split-view — czyli scroll
   ma dokładnie tyle nadmiaru, ile wynosi wysokość paska zakładek. Przewijając
   go w dół o tyle właśnie, pasek zakładek płynnie znika (natywny scroll
   przeglądarki, bez JS, bez animacji do zsynchronizowania), a split-view
   przesuwa się i wypełnia całą ramkę. Przewijając z powrotem do góry, pasek
   wraca. Zweryfikowane: `scrollHeight - clientHeight` głównego kontenera
   równe dokładnie wysokości paska zakładek+filtrów (np. 88px), scrollowanie
   w dół chowa pasek całkowicie, split-view wypełnia ramkę, kontakt +
   konwersacja pozostają w pełni widoczne i użyteczne.

**Dlaczego nie JS (collapse-on-scroll state)?** Pierwsza wersja tego
rozwiązania próbowała chować pasek zakładek przez `useState`+`onScroll`
nasłuchujący scrolla wewnątrz listy/konwersacji, z animacją `max-height`.
Odrzucone po realnym teście z użytkownikiem: (1) każde otwarcie dłuższej
konwersacji samo w sobie wywoływało scroll wewnętrzny (auto-scroll do
najnowszej wiadomości), co natychmiast chowało pasek — mylące, wyglądało na
zepsute; (2) "trzeci scrollbar" (główny) był w tamtej wersji całkowicie
nieaktywny (żadnego realnego nadmiaru), czyli technicznie niewidoczny —
użytkownik chciał, żeby to WŁAŚNIE główny scrollbar wykonywał to
przewinięcie, płynnie, bez JS. Rozwiązanie CSS-owe (oversized content) nie
ma żadnej z tych wad.

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

## Powiązana dokumentacja

- [../../human-docs/dashboard/common/features/responsive-layout-standard.md](../../human-docs/dashboard/common/features/responsive-layout-standard.md) —
  ogólny standard ramki/scrolla/tabeli z edycją inline (czytaj najpierw).
- [../gui-standards/ai-start.md](../gui-standards/ai-start.md) —
  Forms + Views (Save / Full View / tabela pól / `returnTo`).
- [../beeper/ai-start.md](../beeper/ai-start.md) — architektura Beeper sync/Mongo.
- [../msg-workout/ai-start.md](../msg-workout/ai-start.md) — Story 99 msg workout ↔ Beeper linking.
