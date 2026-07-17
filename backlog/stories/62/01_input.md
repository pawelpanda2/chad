# Story 62 — Input

## Input 1

Masz rację — **to ja jestem specjalistą od layoutu CHAD**, a poniżej daję gotowy prompt dla Claude Code. Uwzględniłem zasady z Twojego promptu startowego projektu.

Pracujesz nad projektem CHAD.

Masz przygotować **nowe Story dotyczące wspólnego standardu layoutu i responsywnego UI dla wszystkich stron aplikacji**.

Nie traktuj tego jako lokalnej poprawki jednego ekranu. Celem jest zaprojektowanie jednego standardu, stworzenie dwóch pierwszych ekranów wzorcowych, udokumentowanie rozwiązania i przygotowanie późniejszej migracji wszystkich pozostałych stron.

# 1. Obowiązkowy start

Najpierw przeczytaj:

`documentation/ai-docs/what-and-where.md`

Następnie sprawdź aktualną strukturę dokumentacji i dopiero na jej podstawie otwieraj dokumenty dotyczące:

* layoutu dashboardu,
* `DashboardPageShell`,
* widoku mobilnego,
* scrollowania,
* ramek,
* tabel,
* formularzy,
* nawigacji `Back` i `Forw`,
* historii nawigacji,
* wspólnych komponentów UI.

Najpierw dokumentacja, później kod.

Nie zakładaj istnienia nadrzędnych plików `README.md`, `CLAUDE.md` ani `AGENTS.md`, jeżeli aktualna struktura repozytorium tego nie potwierdza.

# 2. Nowy folder backlog i nowe Story

Użytkownik utworzył nowy folder:

`documentation/backlog`

i przeniósł do niego dotychczasowe stories.

Wykonaj następujące czynności:

1. sprawdź rzeczywistą aktualną strukturę `documentation/backlog`,
2. ustal obowiązującą numerację i strukturę Story,
3. utwórz nowe Story w `documentation/backlog`,
4. użyj kolejnego wolnego numeru,
5. zachowaj dokładnie aktualną konwencję plików stosowaną w pozostałych Story,
6. wpisz do Story pełny input użytkownika, plan, wiedzę, checklistę i pozostałe dokumenty wymagane przez aktualną konwencję,
7. zaktualizuj dokumentację wskazującą starą lokalizację stories,
8. nie przenoś stories z powrotem do wcześniejszego katalogu,
9. nie zgaduj nazw plików — najpierw sprawdź istniejące Story w `documentation/backlog`.

Nowe Story ma dotyczyć:

**Wspólnego standardu layoutu, ramek, toolbarów, tabel, scrollowania i responsywności wszystkich stron CHAD.**

# 3. Zakres wszystkich stron

Musisz zinwentaryzować wszystkie poniższe strony, ich route'y, pozycje menu, komponenty oraz istniejące layouty.

Nie pomijaj żadnej strony tylko dlatego, że nie jest aktualnie widoczna w głównym menu.

## Forms

Docelowe nazwy w menu i tytuły stron:

1. `ADD DAILY ENTRY`
2. `ADD DATE`
3. `ADD LEAD`
4. `ADD ACTION`
5. `ADD REPORT`

Wymagane zmiany:

* obecny formularz Daily Entry ma być nazwany `ADD DAILY ENTRY`,
* obecny `DATE ENTRY` ma być zmieniony na `ADD DATE`,
* `ADD LEAD` pozostaje jako `ADD LEAD`,
* obecne `ACTIONS` ma być zmienione na `ADD ACTION`,
* obecne `REPORTS` w grupie Forms ma być zmienione na `ADD REPORT`.

Na formularzach usuń dodatkowe podpisy powtarzające znaczenie strony, np.:

* `Daily log`,
* podobne podtytuły,
* pełne ścieżki,
* drugie nazwy strony umieszczone pod właściwym tytułem.

Na ekranie ma pozostać jeden krótki tytuł zapisany wielkimi literami, np.:

`ADD DAILY ENTRY`

## Views

Docelowe nazwy:

1. `DAILY TRACKER`
2. `DATES`
3. `LEADS`
4. `REPORTS`

Wymagane zmiany:

* obecne `TRACKER` ma być zmienione na `DAILY TRACKER`,
* usuń dodatkowe podpisy, np. `Daily tracker`,
* nie pokazuj jednocześnie nazwy w menu, ścieżki i podtytułu,
* ma pozostać jeden krótki tytuł wielkimi literami.

## Pozostałe strony

Standard docelowo ma objąć również:

1. `STATUSES`
2. `MSG TODO`
3. `MSG PLANNER`
4. `BEEPER`
5. `FOLDER`
6. `MESSAGES`
7. `SETTINGS`
8. `USERS`

## Strona logowania

Standard obejmuje również stronę logowania, ale w ograniczonej odmianie:

* bez sidebara,
* bez menu,
* bez `Back`,
* bez `Forw`,
* bez toolbaru dashboardu,
* layout umieszczony w górnym lewym rogu,
* jedna główna ramka,
* jedna ramka wewnętrzna zawierająca formularz,
* te same zaokrąglenia i minimalne odstępy co w dashboardzie,
* kontrolowana wysokość,
* wewnętrzny scrollbar, jeżeli zawartość zwiększy wysokość ekranu,
* brak niekontrolowanego globalnego scrollowania dokumentu.

# 4. Najpierw wykonaj inwentaryzację

Przed implementacją przygotuj tabelę lub listę zawierającą dla każdej strony:

* nazwę strony,
* route,
* plik strony,
* główny komponent,
* używany shell/layout,
* obecny tytuł,
* pozycję menu,
* rodzaj strony:

  * formularz,
  * tabela,
  * lista,
  * edytor,
  * ustawienia,
  * logowanie,
* obecne zachowanie scrolla,
* używane ramki,
* przyciski pierwszego wiersza,
* przyciski dodatkowe,
* problemy ze standardem.

Pełna lista stron musi znaleźć się w dokumentacji Story, żeby kolejne etapy nie pominęły części aplikacji.

# 5. Kolejność wdrażania

Nie wdrażaj od razu zmian na wszystkich stronach.

W tym Story należy najpierw stworzyć dwa wzorce:

1. wzorcowy standard zwykłej strony na `SETTINGS`,
2. wzorcowy standard tabeli na `Views → DAILY TRACKER`.

Dopiero po zatwierdzeniu tych wzorców standard będzie przenoszony na pozostałe strony.

Story może zawierać pełny plan migracji wszystkich stron, ale pierwsza implementacja ma dotyczyć przede wszystkim:

* `SETTINGS`,
* `DAILY TRACKER`,
* wspólnych komponentów potrzebnych tym stronom,
* dokumentacji standardu.

Nie kopiuj ręcznie identycznego CSS do kolejnych stron.

# 6. Wzorcowy layout — Settings

Obecna strona `Settings` jest najbliżej oczekiwanego standardu, ale nadal wymaga poprawek.

Dopiero po tych poprawkach ma stać się wzorcem.

## Główna ramka

Strona ma posiadać jedną główną, zaokrągloną ramkę.

Główna ramka ma:

* maksymalnie wykorzystywać dostępny obszar,
* znajdować się blisko granicy obszaru strony,
* nie mieć przypadkowych dużych marginesów,
* ograniczać zawartość strony,
* nie rozszerzać globalnego dokumentu,
* posiadać kontrolowany wewnętrzny scroll, gdy zawartość jest wyższa niż dostępny obszar.

Wewnątrz głównej ramki mogą znajdować się kolejne ramki:

* jedna, jeśli strona nie wymaga podziału,
* kilka, jeśli istnieją logiczne sekcje.

## Odstęp między ramkami

W obecnym `Settings` odstęp między główną ramką a ramkami wewnętrznymi jest za duży.

Zmniejsz go do około:

`3px`

Wartość ma być zapisana we wspólnym tokenie, zmiennej albo komponencie, a nie powielana lokalnie.

## Pierwszy wiersz nagłówka

W `Settings` pierwsze elementy mają być ułożone w kolejności:

1. `Back`
2. `Forw`
3. `SETTINGS`

Obecnie przyciski `Back` i `Forw` są ułożone poprawnie, ale brakuje krótkiego tytułu `SETTINGS`.

Tytuł:

* ma być krótki,
* ma być zapisany wielkimi literami,
* nie może być ścieżką,
* nie może być powtórzony pod spodem.

## Drugi wiersz nagłówka

Wszystkie przyciski specyficzne dla danej strony powinny znajdować się w drugim wierszu toolbaru.

Pierwszy wiersz jest zarezerwowany dla podstawowej nawigacji i tytułu.

Standard:

* pierwszy wiersz: nawigacja i tytuł,
* drugi wiersz: akcje właściwe dla danego ekranu,
* kolejne sekcje: zawartość strony.

# 7. Pusty pasek po prawej stronie na desktopie

Na desktopie po prawej stronie aplikacji ma pozostać pusty obszar o szerokości:

`150px`

Ten obszar:

* ma znajdować się poza główną ramką strony,
* ma być pusty,
* nie może być częścią tabeli ani treści,
* nie może powodować poziomego scrolla,
* ma obowiązywać dla stron dashboardu.

Na telefonie i w mobilnym breakpointcie:

* pustego pasa nie ma,
* strona wykorzystuje pełną dostępną szerokość.

Znajdź wcześniejsze Story, task albo implementację dotyczącą pustego prawego pasa około `100px` lub `200px`.

Ustal:

* czy rozwiązanie zostało usunięte,
* czy zostało nadpisane,
* czy działa tylko na części stron,
* czy istnieje regresja w `DashboardPageShell`,
* dlaczego obecnie efektu nie ma.

Nie dodawaj kolejnego lokalnego marginesu bez zrozumienia istniejącej implementacji.

Docelowa wartość dla tego Story to:

`150px`

# 8. Wzorcowa tabela — Views → DAILY TRACKER

Drugim ekranem wzorcowym ma być:

`Views → DAILY TRACKER`

Najpierw zastosuj na nim wspólny standard głównej ramki, nagłówka, prawego pasa i wewnętrznego scrollowania.

Następnie przygotuj wspólny standard tabel.

# 9. Toolbar DAILY TRACKER

## Pierwszy wiersz

Pierwszy wiersz:

1. `Back`
2. `Forw`
3. `DAILY TRACKER`

Jeżeli istnieje przycisk zbiorczego zapisywania, powinien być umieszczony zgodnie ze standardem na początku części akcji lub w ustalonym miejscu toolbaru.

Jako wzorzec zachowania zbiorczego `Save` wykorzystaj tabelę `STATUSES`.

Nie kopiuj jednak błędów layoutu strony `STATUSES`.

## Drugi wiersz

W drugim wierszu umieść dodatkowe akcje:

1. `+Add`
2. `Edit`

### `+Add`

Przycisk `+Add` ma przekierować do formularza odpowiadającego widokowi.

Dla `DAILY TRACKER` odpowiadającym formularzem jest:

`ADD DAILY ENTRY`

Nie koduj na sztywno przypadkowej ścieżki, jeżeli w projekcie istnieje centralna definicja route'ów lub menu.

### `Edit`

Tabela domyślnie działa w trybie tylko do odczytu.

Po kliknięciu `Edit`:

* tabela przechodzi do trybu edycji,
* pola możliwe do edycji zostają odblokowane,
* ujawnia się pierwsza kolumna tabeli,
* w pierwszej kolumnie znajdują się przyciski zapisywania poszczególnych wierszy.

Po wyłączeniu trybu edycji:

* pierwsza kolumna jest ponownie niewidoczna,
* pola są tylko do odczytu.

# 10. Edycja i zapisywanie wierszy

## Stan domyślny

Pierwsza kolumna jest domyślnie niewidoczna.

Po wejściu w tryb `Edit` pojawia się jako kolumna akcji.

Kolumna ma mieć stałą szerokość, która nie zmienia się między stanami:

* ikona zapisu,
* spinner,
* napis `Saved`.

## Zmiana pola

Po zmianie wartości pola:

* tło zmienionego pola robi się czerwone,
* przycisk zapisu danego wiersza robi się czerwony,
* stan zmiany ma dotyczyć konkretnego pola i konkretnego wiersza,
* niezapisane zmiany innych wierszy nie mogą zostać przypadkowo wyczyszczone.

Użyj istniejących tokenów kolorów albo wspólnego systemu stylów.

Nie wprowadzaj przypadkowych kolorów inline.

## Zapis pojedynczego wiersza

Po kliknięciu zapisu:

1. ikona/przycisk zapisu znika,
2. w tym samym miejscu pojawia się spinner,
3. podczas zapisu nie można wysłać drugiego requestu dla tego samego wiersza,
4. po poprawnym zapisie spinner znika,
5. w tym samym miejscu pojawia się zielony, zanikający napis:
   `Saved`
6. szerokość napisu nie może rozszerzyć kolumny,
7. po zniknięciu `Saved` ponownie pojawia się ikona dyskietki/zapisu,
8. czerwone oznaczenie zapisanych pól zostaje usunięte.

Nie może występować skakanie szerokości tabeli podczas przełączania stanów.

## Zbiorczy Save

W lewym górnym obszarze tabeli lub toolbara ma być dostępny zbiorczy przycisk `Save`.

W dużej części istnieje już podobne rozwiązanie.

Jako podstawowy wzorzec logiki sprawdź widok:

`STATUSES`

Zbiorczy `Save` powinien:

* zapisać wszystkie zmienione wiersze,
* pokazywać stan ładowania,
* nie zapisywać ponownie wierszy bez zmian,
* zachować poprawne stany poszczególnych wierszy,
* nie blokować całej aplikacji dłużej, niż jest to konieczne.

Najpierw sprawdź istniejącą implementację i wykorzystaj wspólną logikę, jeżeli jest prawidłowa.

# 11. Scrollowanie tabel i dotyk

Usuń efekt luźnego przesuwania tabel lub całego widoku poza rzeczywiste granice danych.

Obecny problem:

* na telefonie można przesunąć widok palcem poza ostatnią kolumnę,
* pojawia się pusta przestrzeń,
* po puszczeniu tabela odbija i wraca,
* podobny problem występuje co najmniej w `USERS` i `STATUSES`.

Docelowe zachowanie:

* scroll zatrzymuje się dokładnie na początku danych,
* scroll zatrzymuje się dokładnie na końcu danych,
* nie można wyciągnąć tabeli poza jej ograniczenia,
* nie pojawia się pusta przestrzeń za ostatnią kolumną,
* nie występuje efekt odbijania,
* ruch palcem nie przesuwa całej strony, jeśli użytkownik przewija tabelę,
* poziomy scrollbar jest dostępny i odpowiada rzeczywistemu zakresowi danych,
* pionowy scroll odbywa się we właściwej ramce,
* globalny dokument nie powinien przejmować scrolla tabeli.

Sprawdź i dobierz poprawne rozwiązanie m.in. dla:

* `overscroll-behavior`,
* `touch-action`,
* szerokości kontenera,
* `overflow-x`,
* `overflow-y`,
* ograniczeń flex/grid,
* `min-width: 0`,
* szerokości samej tabeli.

Nie rozwiązuj problemu przez ukrycie całej nadmiarowej zawartości, jeżeli uniemożliwi to dostęp do dalszych kolumn.

# 12. Standard scrollowania stron

Docelowy standard:

* brak przypadkowego globalnego scrollbara strony,
* główna ramka ogranicza wysokość strony,
* główna ramka może przewijać listę kolejnych sekcji,
* ramka wewnętrzna może mieć własny scroll, jeśli zawiera długą listę, tabelę lub edytor,
* tabela posiada własny kontrolowany poziomy scroll,
* scroll jednej ramki nie może bez potrzeby przesuwać całej strony,
* rozwiązanie musi działać na desktopie oraz telefonie.

Szczególnie sprawdź interakcje pomiędzy:

* viewportem,
* layoutem aplikacji,
* `DashboardPageShell`,
* główną ramką,
* toolbarami,
* tabelą,
* sidebarem,
* prawym pasem `150px`.

# 13. Wspólne komponenty

Przed implementacją sprawdź, czy można rozbudować istniejące komponenty zamiast tworzyć nowe duplikaty.

Rozważ wspólne elementy odpowiadające za:

* shell strony,
* główną ramkę,
* ramkę wewnętrzną,
* pierwszy wiersz toolbara,
* drugi wiersz akcji,
* krótki tytuł strony,
* prawy desktopowy pas,
* mobilny breakpoint,
* tryb `Edit`,
* kolumnę akcji tabeli,
* stan dirty pola,
* zapis wiersza,
* spinner,
* komunikat `Saved`,
* zbiorczy `Save`,
* kontrolowane przewijanie tabeli.

Nie twórz jednego ogromnego komponentu zawierającego logikę wszystkich stron.

Oddziel:

* wspólny layout,
* zachowanie tabeli,
* logikę biznesową konkretnego widoku.

# 14. Dokumentacja standardu

W ramach Story utwórz lub zaktualizuj dokumentację opisującą wspólny standard.

Dokument ma zawierać:

1. schemat głównej ramki,
2. schemat ramek wewnętrznych,
3. odstęp około `3px`,
4. pierwszy wiersz: `Back`, `Forw`, tytuł,
5. drugi wiersz: akcje konkretnej strony,
6. krótki tytuł wielkimi literami,
7. brak zduplikowanych podtytułów,
8. desktopowy prawy pas `150px`,
9. brak pasa na telefonie,
10. zasady wewnętrznego scrollowania,
11. zasady tabel,
12. tryb `Edit`,
13. zapisywanie pojedynczych wierszy,
14. zbiorczy `Save`,
15. stany `dirty`, `saving`, `saved`,
16. stałą szerokość kolumny akcji,
17. brak overscroll/bounce na dotyku,
18. ograniczony standard strony logowania,
19. listę wszystkich stron objętych przyszłą migracją.

Dokumentacja ma umożliwiać innemu agentowi AI zbudowanie nowej strony zgodnej ze standardem bez kopiowania istniejącego ekranu metodą prób i błędów.

# 15. Plan późniejszej migracji

Po przygotowaniu `SETTINGS` i `DAILY TRACKER` dodaj do Story checklistę migracji pozostałych ekranów:

## Forms

* `ADD DAILY ENTRY`
* `ADD DATE`
* `ADD LEAD`
* `ADD ACTION`
* `ADD REPORT`

## Views

* `DATES`
* `LEADS`
* `REPORTS`

## Pozostałe

* `STATUSES`
* `MSG TODO`
* `MSG PLANNER`
* `BEEPER`
* `FOLDER`
* `MESSAGES`
* `USERS`
* strona logowania

Dla każdej strony zapisz:

* rodzaj layoutu,
* wymagane ramki,
* wymagane wewnętrzne scrolle,
* przyciski pierwszego i drugiego wiersza,
* potencjalne wyjątki,
* stopień zgodności z nowym standardem.

# 16. Ograniczenia architektoniczne

Dashboard nie może:

* wywoływać bezpośrednio metod Content Providera,
* znać interfejsów Content Providera,
* wykonywać bezpośrednich zapytań do MongoDB,
* przenosić logiki biznesowej z `packages/dba` do komponentów UI.

Next.js API routes mają pozostać cienkimi adapterami.

Zmiany layoutu nie mogą naruszyć izolacji danych użytkowników ani działania `runWithRepoContext(...)`.

# 17. Weryfikacja

Po implementacji wykonaj odpowiednie:

* typecheck,
* lint, jeśli projekt go posiada,
* testy,
* build dashboardu.

Sprawdź przynajmniej:

## Desktop

* `SETTINGS`,
* `DAILY TRACKER`,
* szeroki viewport,
* prawy pas dokładnie około `150px`,
* brak niepotrzebnego poziomego scrolla całej strony,
* działanie ramek i wewnętrznych scrollbarów.

## Mobile

* brak prawego pasa,
* pełna dostępna szerokość,
* stabilne przesuwanie tabeli,
* brak pustej przestrzeni za ostatnią kolumną,
* brak odbijania widoku,
* działanie `Back`, `Forw`, `Edit`, `+Add` i zapisywania.

## Tabela

* tryb domyślny read-only,
* ujawnienie kolumny po `Edit`,
* czerwone oznaczenie zmienionego pola,
* czerwony przycisk zapisu,
* spinner,
* zielony zanikający `Saved`,
* powrót ikony zapisu,
* brak zmiany szerokości kolumny,
* zbiorczy zapis wielu zmienionych wierszy.

## Login

* górny lewy róg,
* dwie ramki,
* brak menu i nawigacji,
* wewnętrzny scrollbar po zwiększeniu zawartości,
* brak niekontrolowanego globalnego scrolla.

Nie twierdź, że coś zostało sprawdzone mobilnie, jeśli wykonano wyłącznie analizę statyczną albo desktopowy build.

# 18. Sposób pracy

Teraz wykonaj:

1. analizę dokumentacji,
2. aktualizację informacji o `documentation/backlog`,
3. utworzenie nowego Story,
4. inwentaryzację wszystkich stron,
5. analizę istniejących komponentów i wcześniejszych tasków,
6. przygotowanie `02_plan.md` oraz pozostałych dokumentów Story zgodnie z aktualną konwencją,
7. przedstawienie użytkownikowi:

   * numeru i ścieżki nowego Story,
   * znalezionego stanu obecnego,
   * propozycji wspólnych komponentów,
   * planu implementacji,
   * ryzyk i miejsc wymagających migracji.

Po przygotowaniu dokumentacji i planu zatrzymaj się i poczekaj na zatwierdzenie użytkownika przed rozpoczęciem implementacji.

Nie wykonuj deploymentu TEST ani PROD w ramach tego etapu.

Ten prompt kończy pierwszą fazę na utworzeniu Story, analizie i planie — Claude nie powinien samowolnie rozpocząć masowej przebudowy wszystkich stron.

jeszcz takei drobne poprawki ze zamiast u gory napisu dashboard chce miec nazwe uzytkownika

## Input 2

Plan Story 62 jest zasadniczo zatwierdzony, ale przed implementacją wprowadź poniższe korekty do dokumentacji Story.

1. W tej fazie implementuj wyłącznie dwa ekrany pilotażowe:
   - SETTINGS,
   - Views → DAILY TRACKER,
   oraz tylko te wspólne komponenty, które są bezpośrednio potrzebne tym dwóm ekranom.

2. Stronę logowania, pozostałe strony Forms/Views, STATUSES, MSG TODO, MSG PLANNER, BEEPER, FOLDER, MESSAGES i USERS na razie tylko opisz w planie migracji. Nie implementuj ich w tej fazie.

3. Nie dodawaj teraz `auth-page-shell.tsx`, ponieważ login nie jest jednym z dwóch ekranów pilotażowych.

4. Zmiana napisu „Dashboard” na nazwę użytkownika jest osobnym wymaganiem, mozesz ja realizowac od razu

5. Wielkie litery dotyczą krótkich tytułów stron, np. `SETTINGS` i `DAILY TRACKER`. Nie zmieniaj automatycznie casing wszystkich nazw w sidebarze. To chodzi o to jak kliknie sie views albo forms i otiwera sei menu to tam tylko te zmiany



7. Rozdziel dwa pojęcia:
   - około 3px odstępu między główną ramką a ramkami wewnętrznymi,
   - padding zawartości wewnątrz poszczególnych ramek.
   Nie zastępuj automatycznie całego `gap-4 p-4` jednym tokenem, jeżeli spowoduje to zbyt mały padding wewnętrznej zawartości.

8. Pusty pas 150px ma obowiązywać wyłącznie w rzeczywistym widoku desktopowym. Nie zakładaj bez analizy, że breakpoint `md` jest właściwy. Telefon i mobilny układ mają wykorzystywać pełną szerokość.

9. Przed rozpoczęciem edycji DAILY TRACKER sprawdź dokładnie istniejącą drogę zapisu danych.
   - Nie buduj pozornego UI Save bez działającego zapisu.
   - Nie dodawaj bez uzgodnienia logiki biznesowej do dashboardu.
   - Jeżeli brakuje odpowiedniego endpointu lub metody DBA, opisz minimalną potrzebną zmianę i zatrzymaj się przed jej implementacją.

10. Nawet trybu Edit nie może  usuwać danych. Tylko po klknieciu danego elementu tabeli powinien sie otwierac ten jeden wpis i dopiero w nim powinno byc opcja delete a jeszcze po jej kliknieciu pojawiac ostrzezenei i pytanei czy na pewno chcesz usunac 

11. Najpierw popraw dokumenty Story 62 zgodnie z tymi decyzjami. Następnie rozpocznij implementację tylko SETTINGS i DAILY TRACKER.

12. Po implementacji zrob commit wykonaj typecheck/build i testy doployujac na local mac docker. Nie wykonuj deploymentu TEST ani PROD.

## Input 3

i a i nie wyajsnilem ze otwarcie itemu w tabeli powinno byc mozliwe tylko poprzec klikniecie wolnej przestszeni pomiedzy przyciskiem save a ramka jest pola

## Input 4

inaczej bo to bzdura w pierwszej kolumnie niech bedzie tak:
Lepszy układ w pierwszej kolumnie:

dyskietka — zapisuje zmiany wiersza,
ołówek — otwiera pełny widok edycji konkretnego Itemu.

Przycisk z samą literą E:

nie jest standardowym symbolem,
może oznaczać „Edit", „Entry" albo coś innego,
będzie mniej czytelny na telefonie,
może zostać pomylony z globalnym przyciskiem Edit.

Najbardziej logiczny standard dla CHAD:

[💾] [✎]
 Save  Edit Item

Po najechaniu powinien mieć tooltip Edit item, a dla czytników aria-label="Edit item".

W trybie read-only można pokazywać tylko ołówek. Po włączeniu globalnego Edit pojawia się dodatkowo dyskietka. Dzięki temu kolumna pozostaje jednoznaczna:

ołówek zawsze otwiera konkretny Item,
dyskietka zawsze zapisuje edycję bezpośrednio w tabeli,
Delete znajduje się dopiero po otwarciu Itemu.

## Input 5

Wybieram: dodaj teraz prawdziwe `updateDailyEntry`, tak aby Save rzeczywiście zapisywał dane.

Nie twórz stuba ani no-op. Interfejs nie może pokazywać spinnera i komunikatu `Saved`, jeżeli dane nie zostały zapisane.

Przed implementacją uzupełnij dokumentację dla AI:

1. Otwórz `documentation/ai-cos/knowledge/01_ai_start.md` i ustal, który aktualny dokument pełni funkcję indeksu `what-and-where`.

2. W folderze `documentation/ai-cos/knowledge` utwórz nowy dokument:

   `endpoint-for-xyz.md`

   Nazwa może zostać delikatnie dopasowana do istniejącej konwencji nazewnictwa dokumentów, ale dokument ma jednoznacznie dotyczyć zasad dodawania i zmieniania endpointów.

3. Dodaj ten dokument bardzo wysoko w `what-and-where.md` — przed dokumentacją deploymentu — ponieważ jest to podstawowa zasada architektury potrzebna przed implementacją feature'ów.

4. W `endpoint-for-xyz.md` opisz następujące zasady:

   - Jeżeli feature wymaga zapisu lub modyfikacji danych, ale odpowiedni endpoint albo metoda nie istnieje, wolno i należy dodać brakującą obsługę.
   - Logika dostępu do Content Providera ma znajdować się w `packages/dba`.
   - W `packages/dba` można używać metod Content Providera, ale szczegóły Content Providera muszą pozostać ukryte w tej warstwie.
   - Dashboard nie może znać ani wywoływać bezpośrednio interfejsów i metod Content Providera.
   - Next.js API route ma pozostać cienkim adapterem wywołującym funkcję z `packages/dba`.
   - Nie wolno tworzyć pozornego Save, stuba ani no-op, który zwraca sukces bez zapisania danych.
   - Zmiana istniejącego endpointu musi zachować kompatybilność ze wszystkimi wcześniejszymi feature'ami korzystającymi z jego obecnego kontraktu.
   - Przed zmianą istniejącego endpointu należy znaleźć jego użycia i sprawdzić wpływ zmiany.
   - Jeżeli nie ma pewności, że zmiana zachowa kompatybilność, bezpieczniej jest stworzyć nową metodę lub nowy endpoint niż zmieniać znaczenie istniejącego.
   - Nie duplikuj endpointu, jeżeli istniejący można bezpiecznie rozszerzyć bez zmiany dotychczasowego kontraktu.
   - Nowa metoda powinna mieć jednoznaczną nazwę odpowiadającą operacji biznesowej, a nie nazwę bezpośredniej metody Content Providera.
   - Po implementacji trzeba sprawdzić zarówno nowy zapis, jak i wcześniejsze feature'y korzystające z powiązanego kodu.

5. Następnie zaimplementuj minimalną, prawdziwą drogę zapisu dla DAILY TRACKER:

   - funkcję `updateDailyEntry(...)` w `packages/dba`,
   - wykorzystanie metod Content Providera wyłącznie wewnątrz DBA,
   - cienki API route w dashboardzie,
   - podłączenie rzeczywistego zapisu do UI,
   - obsługę błędu zapisu bez pokazywania fałszywego `Saved`.

6. Wzoruj się na działających rozwiązaniach `updateReportEntry` i zapisie w `Statuses`, ale najpierw sprawdź ich aktualny kod i kontrakty. Nie kopiuj mechanicznie błędów ani niepasujących założeń.

7. Uzupełnij dokumenty Story 62 o tę decyzję architektoniczną.

Po tej korekcie kontynuuj zatwierdzoną implementację.

## Input 6

zmienilem nazwe /docuemntation/knowledge na /documentation/begin_here
wiec uzupelnij w dokumentacji odniesienia do tego jak jakies sa na nowa nazwe

## Input 7

Przed podjęciem decyzji przeczytaj:

`documentation/dashboard/forms/daily-tracker-dates.md`

Ten dokument opisuje istniejący, zweryfikowany przepływ Daily Entry oraz
potwierdza, że istniejące Itemy były już nadpisywane w miejscu przez `Put`.

Na jego podstawie:

1. Nie twórz niezależnego mechanizmu zapisu od zera.
2. Zachowaj istniejący POST jako operację tworzenia nowego wpisu.
3. Dodaj kompatybilną operację PUT/PATCH dla aktualizacji istniejącego wpisu.
4. W DBA dodaj `updateDailyEntry`, wykorzystując istniejący przepływ
   `runWithRepoContext` i Content Provider.
5. Aktualizuj dokładnie istniejący Item przez jego ukryte `itemName` lub
   rzeczywiste `loca`.
6. Nie wywołuj `generateEntryName()` i nie używaj `PostParentItem` podczas
   aktualizacji.
7. Nie identyfikuj rekordu wyłącznie po `DATE`.
8. Nie zapisuj pól AUTO — są obliczane przy odczycie.
9. Po `Put` wykonaj ponowny odczyt i potwierdź, że liczba wpisów się nie
   zwiększyła, a zmienił się dokładnie wskazany Item.
10. Dodaj `documentation/dashboard/forms/daily-tracker-dates.md` do
    właściwego indeksu `what-and-where.md`, aby kolejni agenci znajdowali
    ten dokument przed analizą kodu.

## Input 8

# [W] ADD DAILY ENTRY
- jest pojedynczy element wiec powienien byc w podwojnej ramce
- wtedy ta pierwsza ramka ma scroll bar 150px od prawej
- a formularz jest w kolejnej ramce
- tak to chcialem miec w standarcei
- do tego najpierw jest tytul a potem
# [W] ADD DATE
- te same bledy co w ADD DAILY ENTRY
# [OK/N] ADD LEAD
- nie wiem czy jest scroll bar w glownej ramce bo jest malo elementow
- ale wzgledem standardu wszystko wyglada ok
- natomaist tutaj chcicalbym przeniesc na gore do osobnej ramki
- do osobnej ramki przycisk save razem obok z wygenerowana nazwa
- oba do lewej wyrownane
# [W] ADD ACTION
- to samo co w ADD DAILY ENTRY
- nie ma podowjnej ramki
- dodawko te tak jak w ADD LEAD
- daj save na gore razem z wygenerowana ramka
- a te co sa teraz reszta daj do osobnej ramki
- i daj to jako standard ze przyciski save sa na gorze
- albo jako wolne bez ramki
- albo jak jest wygenrowana nazwa to razem z nia w ramce
# [W] ADD REPORT
- tu tez brakuje podwojnej ramki
- tej zewnetrzenej brakuje

nie sprawdzam dalej bo widze ze wszedzie te same bledy sie powtrzaja wiec popraw to wszedzie
to pozostale widoki:

## Views

# [W] DAILY TRACKER
-
# [W] DATES
-
# [W] LEADS
-
# [W] REPORTS
-

## Pozostałe

# [W] Statuses
-
# [W] Msg Todo
-
# [W] Msg Planner
-
# [W] Beeper
-
# [W] Folder
-
# [W] Messages
-
# [W] Settings
-
# [W] Users
-

## Login

# [W] Login
-

[W] oznacza wrong

## Input 9

dodatkowo zrobiles duza regresje
rozwaliles dwa widoki
msg todo oraz msg planner takie bledy tam sa w tych widokach

Error: Failed to parse JSON response. Args: ["IRepoService","IItemWorker","PostByNames","8b603669-f8e6-4224-bd78-a474998995fa","Folder","leads","all items"] Raw response: error:{"messageType":"System.Reflection.TargetInvocationException","message":"Exception has been thrown by the target of an invocation.","stackTrace":" at System.Reflection.MethodBaseInvoker.InvokeWithFewArgs(Object obj, BindingFlags invokeAttr, Binder binder, Object[] parameters, CultureInfo culture)\n at SharpApiArgsProg.Services.StringArgsResolverService.TryInvoke(Object worker, MethodInfo method, Object[] parameters, String& result) in /src/api_charp/StringArgsResolver/Services/StringArgsResolverService.cs:line 80","targetSite":"System.Object InvokeWithFewArgs(System.Object, System.Reflection.BindingFlags, System.Reflection.Binder, System.Object[], System.Globalization.CultureInfo)","source":"System.Private.CoreLib","innerException":{"messageType":"System.InvalidOperationException","message":"Operation is not valid due to the current state of the object.","stackTrace":" at SharpRepoServiceProg.Workers.System.PathWorker.HandleError() in /src/api_charp/SharpRepoService/SharpRepoServiceProg/Workers/System/PathWorker.cs:line 147\n at SharpRepoServiceProg.Workers.System.PathWorker.GetItemPath(ValueTuple`2 adrTuple) in /src/api_charp/SharpRepoService/SharpRepoServiceProg/Workers/System/PathWorker.cs:line 54\n at SharpRepoServiceProg.Workers.Validation.ValidationWorker.ValidateChildFoldersAreNumeric(ValueTuple`2 parentAdrTuple, String& invalidFolderName) in /src/api_charp/SharpRepoService/SharpRepoServiceProg/Workers/Validation/ValidationWorker.cs:line 34\n at SharpRepoServiceProg.Workers.Validation.ValidationWorker.ValidateParentBeforeCreateChild(ValueTuple`2 parentAdrTuple, String& errorMessage, String& invalidFolderName, String& parentPath) in /src/api_charp/SharpRepoService/SharpRepoServiceProg/Workers/Validation/ValidationWorker.cs:line 89\n at SharpRepoServiceProg.Workers.CrudWrites.WriteMultiWorker.PostItem(ItemModel& item, ValueTuple`2 adrTuple, String type, String name) in /src/api_charp/SharpRepoService/SharpRepoServiceProg/Workers/CrudWrites/WriteMultiWorker.cs:line 53\n at SharpRepoServiceProg.Workers.APublic.ItemWorkers.ItemWorker.PostByNames(String parent, String type, String[] names) in /src/api_charp/SharpRepoService/SharpRepoServiceProg/Workers/APublic/ItemWorkers/PostItemWorker.cs:line 46\n at InvokeStub_ItemWorker.PostByNames(Object, Span`1)\n at System.Reflection.MethodBaseInvoker.InvokeWithFewArgs(Object obj, BindingFlags invokeAttr, Binder binder, Object[] parameters, CultureInfo culture)","targetSite":"System.String HandleError()","source":"SharpRepoServiceProg","innerException":null}}

Error: Failed to parse JSON response. Args: ["IRepoService","IItemWorker","GetByNames","8b603669-f8e6-4224-bd78-a474998995fa","leads","msg planner"] Raw response: error:{"messageType":"System.Reflection.TargetInvocationException","message":"Exception has been thrown by the target of an invocation.","stackTrace":" at System.Reflection.MethodBaseInvoker.InvokeWithFewArgs(Object obj, BindingFlags invokeAttr, Binder binder, Object[] parameters, CultureInfo culture)\n at SharpApiArgsProg.Services.StringArgsResolverService.TryInvoke(Object worker, MethodInfo method, Object[] parameters, String& result) in /src/api_charp/StringArgsResolver/Services/StringArgsResolverService.cs:line 80","targetSite":"System.Object InvokeWithFewArgs(System.Object, System.Reflection.BindingFlags, System.Reflection.Binder, System.Object[], System.Globalization.CultureInfo)","source":"System.Private.CoreLib","innerException":{"messageType":"System.InvalidOperationException","message":"Operation is not valid due to the current state of the object.","stackTrace":" at SharpRepoServiceProg.Workers.System.PathWorker.HandleError() in /src/api_charp/SharpRepoService/SharpRepoServiceProg/Workers/System/PathWorker.cs:line 147\n at SharpRepoServiceProg.Workers.CrudReads.ReadManyWorker.ListOfOnlyConfigItems(ValueTuple`2 adrTuple) in /src/api_charp/SharpRepoService/SharpRepoServiceProg/Workers/CrudReads/ReadManyWorker.cs:line 101\n at SharpRepoServiceProg.Workers.APublic.ItemWorkers.ItemWorker.GetByNames(String Repo, String[] names) in /src/api_charp/SharpRepoService/SharpRepoServiceProg/Workers/APublic/ItemWorkers/GetItemWorker.cs:line 67\n at InvokeStub_ItemWorker.GetByNames(Object, Span`1)\n at System.Reflection.MethodBaseInvoker.InvokeWithFewArgs(Object obj, BindingFlags invokeAttr, Binder binder, Object[] parameters, CultureInfo culture)","targetSite":"System.String HandleError()","source":"SharpRepoServiceProg","innerException":null}}

do tego znowu wywaliles dev panel ktory ma byc widoczny w lokalnej dev wersji
taki dzyndzel z prawej storny niezaleznie od konce strony 150px tej wolnej przestrzeni on ma do od saemj krawedzie storny sie pojawiac

## Input 10

widze jeszce sporo bledow:
## Legend
W - Wrong, dużo rzeczy źle
C - Correct, ok z wymaganiam, ale coś do poprawy jednak
OK - wszystko dobrze

## Forms

# [C] FORMS MENU
- wszystko idealnie
- zewnetrzna ramka jest maksymalnie roszerzona
- od tej zewnetrznej do ramek wewnetrznych widze jest ok 8 px.
- przyjmijmy to za wzor i standard te 8 px
- sprawdz czy to jest 8px jezeli wiecej to daj wiecej na standard
- ale tyle ile tu jest

# [W] ADD DAILY ENTRY
- tutaj odstep od glownej ramki wydaje sie za maly nie jakos znacznie
- ale widac ze jest to mniej niz np. w FORMS MENU
- dodatkowo wloz save w osobna ramke u gory i wloz go w glowna ramke
- mozesz zmiejszyc troche ta table z uzupelnianiem tak do jej 80% czyli minus 20%

# [W] ADD DATE
- tutaj podobnie jak w ADD DAILY ENTRY
- czyli odstep miedzy glowna ramka ta ze scrodka troche wiekszy
- oraz przycisk same do srodka do ramki i w ogobnej wewnetrznej ramce
# [] ADD LEAD
- tutaj tez podobnie ale tutaj to juz jakies mikro przerwy sa miedzy ta duza ramka a ramkami wewnetrznymi
- a znowu ta pierwsza z przyciskiem save ma dziwnie duzo przestrzeni od wewnatrz sookola siebie
- nazwa generowana powinna byc w takim wyszarzonym zablokowanym input tak jak w ADD ACTION
# [] ADD ACTION
- tutaj podobnie jak w ADD LEAD strasznie maly odstep miedzy duzo i mala ramka
- usun napis "Title (auto-generated
- wewnetrznie ramki jezeli sie da powinnny sie dosuwac do lwej do 500px jezeli sie da to taka domyslna wartosc dopychania ramek wewnetrznych do lewej

reszta widokow tez probuj w tym standarcdzie poprawic, nie chcialo mi sie juz ich przegladac ale to sa te widoki:
# [] ADD REPORT


## Views

# [W] DAILY TRACKER
-
# [W] DATES
-
# [W] LEADS
-
# [W] REPORTS
-

## Pozostałe

# [W] Statuses
-
# [W] Msg Todo
-
# [W] Msg Planner
-
# [W] Beeper
-
# [W] Folder
-
# [W] Messages
-
# [W] Settings
-
# [W] Users
-

## Login

# [W] Login
-

## Input 11 (mid-turn interrupt)

w statuses tez tak zrob ze wsadz przyciski z drugiej lini do duzej ramka i odaj ten 8px czy jaki tam wyliczyles standardowy pomiedzy glowno ramka a ramka tabeli

## Input 12 (mid-turn interrupt)

w ADD DATE mozesz pierwsza kolumne dorownac do szerokosci napisow plus jakies 5-10px bo narazie jest szerokosc napisu plus bardzo duzo chyab ze 150px

## Input 13 (mid-turn interrupt)

w messages planner tez popraw odstep od glownej ramki (wyliczone na podstawie FORMS MENU odstep miedzy przyciskami a glowna ramka chyba 8px lub wiecej)
i to odsuwanie do 500px jezeli sie da bo dane sa krotki albo do konca jzeli dane sa na tyle dlugie

## Input 14

w page'u add daily entry zaraz przy przycisku dodaj taki fajny napis ktory byl wczesniej po kliknieciu przycisku save tam cos pisalo na zielono succesfully saved data czy cos takiego i daj lekki deley jezeli sie jakos super szybko sie zapisze wtedy to wygldalo tak fajnie plynie i spoko bedzie wygladal taki napis pojawiajacy sie obok przycisku save
do tego jak przekieroawalo mnie na widok trackera to mam blad sprawdz dlaczego i sprobuj naprawic:
error: Failed to fetch

## Input 15 (mid-turn interrupt)

w add action niepotrzeny jest napis Title usun go i zmiejsze odsept przycisku save do ramki do 8px i w innych miejscach gdie jest przycisk save

## Input 16

niech w beeper chaty kolejne na liscie beda tak jak w reports view zrobione ze sie podswietlaja takie ramki szare kolejne

## Input 17 (mid-turn interrupt)

i zrob zeby to byl standar dla listy i mozesz usunac ta kreske odzielajaca pomiedzy przyciskami u gory a lista w Beeper

## Input 18

zarowne dates, daily tracker i statues widze ten sam blad ze scroll bar zamiast byc w zewnetrznej ramce to jest w ramce tabeli. to nie tak ma byc. jka przesuwam prawy srolbar vertykarny z glownej ramki to maja sie przesuwac przyciski razem z tabela, wszystko co jest w srodku
przenies te scroll bary

## Input 19

zrobiles cos takiego ze naglowki z tabeli zostaja w miejscu w trakcie przesuwania scroll bara nei prosilem o taka funkcjonalnosc usun ja
natomaist to co miales zrobic to brakuje bo dolny scroll bar nie istnieje w wisoku tracker i nie moge przesuwac w prawo miales nie usuwac go calkowicie tylko przeniesc do zewnetrznej ramki
popraw wszystkie widoki z tabelami w ten sposb czyli tez statuses

## Input 20

super teraz jest ok z tymi scroll barami
sprawdz jeszcze dlaczego rogi w tej znowu wewnetrznej ramce nie sa teraz takie ladne okrable czy tam nie ma jakiego podwonego obramowania, ale to drobniutki szczegol nie zepsuj wszystkiego jak nie wiesz jak to poprawic
a najwazniejsze to usun te olowki z pierwszej kolumny obok przycisku edit daj dyskietki
i do pierwszej kolumny daj czarne dyskietki tak jak w statuses
i one maja sie pojawiac cala ta pierwsza ukryta kolumna jak elasnie klikne edit
i to edit ma sie tylko zmieniac kolor jakby byl zaznaczony
i od tej pory pola sa edytowalne a jak cos sie zmieni to dyskietka sie robi czerowana

drugi przycisk jaki dodasz to open raw i on bedzie powodowal ze wszystkie wiersze sa teraz klikalne i da sie otworzyc wiersz kokretny po jego kliknieciu tak jak przy olowku w tej chwili
tylko nie otwieraj mi nowego okienka tak jak jest w tej chwili tylko przeladuj caly widok i otworz takie okno jak jest przy formularzu

## Input 21 (mid-turn interrupt)

z ta roznica ze u gory jak jest przycisk save to ma byc jeszcze przycisk delete i po jego klinieciu male okienko (cos jak teraz przy olowku) z pytaniem czy na pewno chce usunac ten wiersz i wymagnie przepisania randomowego slowa jedneog z 6 zahardowanych na potwierdzenie ze na pewno chcesz usunac wiersz

## Input 22 (mid-turn interrupt)

i usun z beepera ta brzydka czesc z prawej strony danego itemu listy
ta z data i id beeperoweym i 1ch.
takie dane powinny byc widoczne juz po kliknieciu

## Input 23 (mid-turn interrupt)

nie zgadaja mi sie dokladnie tez nazwy np. Setting jak sie otiwera to w naglowku SETTINGS powinno byc zgodne z tym tytulem ktory otiweram

## Input 24 (mid-turn interrupt)

podobnie users messages and folders

## Input 25 — clarifying question answers

1. Sidebar labels vs uppercase page headers mismatch: chose "Lowercase all page headers to match sidebar (title case)".
2. Folders vs FOLDER wording mismatch: chose "\"Folders\" everywhere".
3. Delete button on the new edit page, given Content Provider has no working delete: chose "Build it as \"clear fields\"" (labeled "Clear", not "Delete").

## Input 26

edit juz fajnie odkrywa kolumne z dyskietkami
ale neistety dalej jest ten napis ktory nei chcialem czyli "Done editing"
miales po prostu podswietlic ten przycisk zrobic zeby wygladal na aktywny i tylko i nie robic zmiany jego wygladu czy jego napisu

## Input 27 (mid-turn interrupt)

i przycisk zbiorczy save sie wstawia zamiast w tabele w jej rog tak jak to jest w statuses to wstawia sie w pierwsza linie pryzciskow je przesuwajac. to nie tak mialo byc

## Input 28 (mid-turn interrupt)

i przycisk po kliknieciu open raw mial byc delete a nie clear (ten obok save juz po otwarciu konkretnego raw)

## Input 29 (mid-turn interrupt)

dodaj jeszcze obok delete przycisk Full View ktory wraca do pelnego widoku

## Input 30 (mid-turn interrupt)

z ta roznica ze u gory jak jest przycisk save to ma byc jeszcze przycisk delete i po jego klinieciu male okienko (cos jak teraz przy olowku) z pytaniem czy na pewno chce usunac ten wiersz i wymagnie przepisania randomowego slowa jedneog z 6 zahardowanych na potwierdzenie ze na pewno chcesz usunac wiersz

(Note: this instruction arrived earlier in the same turn, before Input 26,
but is recorded here in the order it was actually processed relative to
the other mid-turn interrupts — see 05_tasks_and_checklist.md Round 8 for
the true chronological implementation order.)

## Input 31 (mid-turn interrupt)

i dla przycisku open raw usun ikonke ktora jest obok napisu i zrob zeby wyrazniej byl widac ze przycisk jest aktywny

## Input 32 (mid-turn interrupt)

i tez podswietlenie po najechaniu na row tez zeby bylo mocniejszym ciemniejszym kolorem

## Input 33 (mid-turn interrupt)

i przycisk edit w ogole mial zamaist olowka miec dyskeitke a ma olowek dalej

## Input 34 (mid-turn interrupt)

dates powinno miec dokladnie takie same opcje z +Add, Edit, Open raw

## Input 35 (mid-turn interrupt)

widze ze w dates nie pokazuje sie scrollbar ten z prawej wertykalny
dodaj go wedlug standardu

## Input 36

cos znowu popsules w ostatnich zmianach ze scroll barem
w Dates i Daily Tracker zniknely scroll bary
na wersji ktora jest wrzucona na test jeszcze sa ok
jezeli zalogoujesz sie na qnap to powinno byc juz. w obrazie umieszczona informacja ktory to commit
wiec mozesz porownac
albo z lokalnych zmian git sprobuj wywnioskowac

## Input 37 (mid-turn interrupt)

pamietaj ze na zewnetrznej ramce ma byc scroll bar
zarowno ten wertykalny jak i horyzontalny ma byc na zewnetrznej ramce

## Input 38 (mid-turn interrupt)

wrzucam Ci zdjecie z testu po zwiekszeniu do 50%
wiec nie zmieniaj czasem widoku na takie male
po prostu chce Ci pokazac ile kolumn zgubiles
wzgledem tego co bylo na test przed chwila deployowane
kurwa jakie Ty jestes pojebany ze robisz mi ciagle regresjie
przywroc te pola w tracker
to jest przeciez utrata danych kurwa
skup sie id okladnie rob polecenia bez wymyslania dodatkow

## Input 39

jeszcze znalazlem bugi:
1) po wcisnieu edit odkrywa sie pierwsza kolumna ale mieszaja sie naglowki kolumn, nie przesuwaja sie o 1 tylko zostaja i nie sa poprawnie podpisane
2) brakuje zbiorczego przycisku save w pierszej komorce tabeli w lewym gornym rogu
3) pierwsza kolumna z dyskietakami nie jest maksymalnie sciznieta do 1px odstepow
4) po przycisniecu dyskietki zielony napis save roszerze kolumne, a powienine pojawiac sie zamiast dyskietki na chwile i nie zajmowac wiecej miejsca niz ona tak zeby nie rozszerzyc kolumny

## Input 40 (mid-turn interrupt)

bugi
1) znowu rogi wygladaja brzydko w tabeli nie sa zaokraglone
2) jak zmienie dane i podswietli sie na czerwo i wroce wartosc do poprzedniej to juz tego nei wykrywa a powinno wiedziec ze teraz dane sa takie jka byly na poczatku i sie odswietlic przestac byc czerwony

## Input 41 (mid-turn interrupt)

daelj jak powrcac do oryginalnych danych to dyskietka tego nie wyrkywa i nie przestaje byc czerwona razem z tym polem ktore zmienilem i tez jest czerwone
