# Story 60 — Input

## Input 1

Claude Code — krytyczna izolacja repozytoriów w Folder + standard Beeper i ramek

Pracujesz nad projektem CHAD.

To zadanie obejmuje:

1. **krytyczną lukę bezpieczeństwa w zakładce Folder**,
2. poprawienie układu przycisków w zakładce Beeper,
3. ustandaryzowanie zewnętrznych i wewnętrznych ramek stron.

Najwyższy priorytet ma Task 1. Nie traktuj filtrowania na frontendzie jako zabezpieczenia.

---

## Zasady rozpoczęcia pracy

Najpierw przeczytaj:

`documentation/ai-docs/what-and-where.md`

Następnie otwórz tylko dokumenty wskazane tam jako właściwe dla:

- izolacji danych użytkowników,
- mechanizmu repo context,
- zakładki Folder,
- zakładki Beeper,
- `DashboardPageShell`,
- wspólnego layoutu stron, toolbarów i ramek.

Dopiero później analizuj kod.

Nie zakładaj istnienia ani znaczenia innych plików dokumentacji. Nie zgaduj nazw dokumentów, komponentów, endpointów ani metod — sprawdź aktualną strukturę repozytorium.

Sprawdź w szczególności:

- jak ustalany jest aktualnie zalogowany użytkownik,
- jak działa `runWithRepoContext(...)`,
- gdzie pobierana jest lista repozytoriów,
- czy repozytorium można wskazać także przez parametr endpointu, URL, body requestu albo zapisany stan,
- które strony korzystają z `DashboardPageShell`,
- jaki jest obecny standard przycisków Back/Forw oraz zwijania menu.

Przed implementacją przedstaw krótko:

1. przyczynę luki,
2. aktualny przepływ danych,
3. miejsca wymagające zabezpieczenia,
4. plan zmian,
5. plan testów bezpieczeństwa i UI.

Nie wykonuj deploymentu PROD. Deployment TEST może nastąpić wyłącznie po zakończeniu implementacji, testów i zgodnie z repozytoryjnymi skryptami oraz po wyraźnej zgodzie użytkownika.

---

## Task 1 — KRYTYCZNE: izolacja repozytoriów w zakładce Folder

### Problem

Na środowisku TEST zakładka Folder pokazuje obecnie wszystkie repozytoria Content Providera.

Widoczne są przez to:

- prywatne repozytoria innych użytkowników,
- moje prywatne repozytoria niezwiązane z aktualnie zalogowanym użytkownikiem,
- repozytoria należące do innych aplikacji.

Jest to poważna luka bezpieczeństwa, ponieważ może prowadzić do odczytu pełnych danych innych użytkowników oraz innych systemów.

### Reguła repozytorium użytkownika

Dla zalogowanego użytkownika dozwolone jest wyłącznie repozytorium o nazwie:

`chad_<username>`

Przykład:

- username: `pawel_f`
- dozwolone repozytorium: `chad_pawel_f`

Użyj istniejącej, kanonicznej wartości username z systemu uwierzytelniania. Nie twórz nowego niezależnego źródła nazwy użytkownika.

Jeżeli istnieje już standard normalizacji username, użyj go. Jeżeli go nie ma, nie wymyślaj samowolnie rozbudowanego mapowania — opisz znaleziony format danych i zastosuj najmniejszą bezpieczną zmianę zgodną z obecną architekturą.

### Wymagania bezpieczeństwa

#### 1. Zabezpieczenie musi znajdować się w `packages/dba`

DBA może technicznie pobrać nazwy repozytoriów z Content Providera, ale do wyższych warstw może zwrócić tylko repozytorium, którego nazwa jest **dokładnie równa**:

`chad_<username>`

Nie używaj:

- `includes`,
- częściowego dopasowania,
- `startsWith` jako ostatecznego warunku,
- dopasowania bez uwzględnienia pełnej nazwy,
- fallbacku do pierwszego repozytorium,
- fallbacku do wszystkich repozytoriów,
- repozytorium przekazanego przez klienta bez walidacji.

Ostateczne dopasowanie ma być ścisłe.

#### 2. Zasada deny by default

Jeżeli:

- nie ma zalogowanego użytkownika,
- nie można wyznaczyć username,
- pasujące repozytorium nie istnieje,
- znaleziono niejednoznaczny wynik,
- klient próbuje wskazać inne repozytorium,

system ma odmówić dostępu i zwrócić kontrolowany błąd bez ujawniania nazw pozostałych repozytoriów.

Nie wolno w takim przypadku pokazywać całej listy ani wybierać repozytorium zastępczego.

#### 3. Ochrona wszystkich operacji, nie tylko listy

Samo odfiltrowanie listy repozytoriów nie wystarcza.

Sprawdź wszystkie ścieżki używane przez zakładkę Folder i zabezpiecz również bezpośrednie operacje:

- pobieranie drzewa/folderów,
- pobieranie elementu,
- odczyt pliku/body,
- tworzenie,
- edycję,
- usuwanie,
- odświeżanie,
- wszystkie endpointy przyjmujące repo ID lub repo name.

Nawet po ręcznej zmianie requestu w DevTools użytkownik nie może uzyskać dostępu do innego repozytorium.

Jeżeli aktualna architektura na to pozwala, repozytorium powinno być wyznaczane po stronie DBA na podstawie kontekstu użytkownika, a nie z wartości przesłanej przez dashboard.

Wykorzystaj istniejący `runWithRepoContext(...)` zgodnie z dokumentacją projektu.

#### 4. Brak wycieku metadanych

Dashboard ani odpowiedź API nie powinny otrzymywać:

- pełnej listy repozytoriów,
- nazw niedozwolonych repozytoriów,
- repo IDs należących do innych użytkowników lub aplikacji.

Nie loguj całej listy repozytoriów w logach dostępnych dla zwykłego użytkownika.

#### 5. Combobox repozytorium

W zakładce Folder:

- combobox repozytorium ma pokazywać tylko repozytorium aktualnego użytkownika,
- zmiana wartości ma być zablokowana,
- kontrolka ma być `disabled` albo zastąpiona bezpiecznym polem tylko do odczytu, zgodnie z istniejącym standardem UI,
- nie może istnieć możliwość wpisania lub wybrania innej wartości,
- stan frontendu nie może przywracać wcześniej wybranego repozytorium innego użytkownika.

Zablokowanie comboboxa jest dodatkową ochroną UX, ale nie zastępuje zabezpieczenia w DBA.

### Testy wymagane dla Task 1

Dodaj testy na właściwym poziomie architektury. Minimum:

1. `pawel_f` otrzymuje wyłącznie `chad_pawel_f`.
2. Inne repozytoria CHAD nie są zwracane.
3. Repozytoria innych aplikacji nie są zwracane.
4. Próba przekazania ręcznie innego repo ID/nazwy kończy się odmową.
5. Brak pasującego repozytorium nie powoduje fallbacku.
6. Brak username nie powoduje zwrócenia listy.
7. Niedozwolone nazwy repozytoriów nie pojawiają się w payloadzie błędu.
8. Odświeżenie strony nie przywraca niedozwolonego wyboru.
9. Combobox jest nieedytowalny.
10. Bezpośredni request omijający UI również jest blokowany.

Jeżeli repozytorium ma istniejący zestaw testów izolacji użytkowników, rozszerz go zamiast tworzyć równoległy, niespójny mechanizm.

---

## Task 2 — Beeper: przeniesienie dodatkowych przycisków do ramki

### Cel

Zakładka Beeper ma stosować wspólny standard nagłówka strony.

Na samej górze strony, w pierwszej linii, mogą znajdować się tylko:

1. przycisk chowania/pokazywania lewego menu,
2. `Back`,
3. `Forw`,
4. krótka nazwa aktualnej strony lub widoku.

Nie dodawaj tam pozostałych akcji Beepera.

### Dodatkowe akcje

Wszystkie pozostałe przyciski i akcje charakterystyczne dla Beepera:

- przenieś z globalnej górnej linii,
- umieść w drugiej linii,
- ale już **wewnątrz pierwszej zewnętrznej ramki strony**,
- zastosuj istniejące komponenty toolbaru i spacing, jeżeli takie są.

Nie duplikuj nawigacji Back/Forw i nie twórz drugiego niezależnego standardu nagłówka.

`Forw` jest zamierzoną krótką nazwą przycisku.

Sprawdź działanie na desktopie i mobile.

---

## Task 3 — ustandaryzowanie ramek stron

### Docelowa hierarchia

Każda strona objęta wspólnym layoutem ma mieć następującą strukturę:

1. **jedna zewnętrzna ramka strony**,
2. wewnątrz niej **jedna lub więcej ramek sekcji**,
3. dopiero wewnątrz ramek sekcji znajdują się właściwe elementy strony.

Czyli:

`DashboardPageShell / page -> zewnętrzna ramka -> ramka lub ramki sekcji -> zawartość`

Nie powinno być:

- elementów page'a leżących bezpośrednio poza zewnętrzną ramką,
- kilku równoległych „zewnętrznych” ramek udających root strony,
- toolbarów oderwanych od ramki,
- przypadkowego podwójnego borderu,
- ramek nakładających się na siebie,
- globalnego scrolla wynikającego z błędnej wysokości ramek.

### Zakres

Najpierw ustal wszystkie strony korzystające z `DashboardPageShell`.

Ustandaryzuj wspólny mechanizm w komponencie bazowym lub współdzielonych komponentach, zamiast kopiować indywidualny CSS do każdej strony, o ile aktualna architektura na to pozwala.

Zmiany nie mogą zepsuć:

- wewnętrznego scrollowania,
- layoutu mobile,
- zwijania lewego menu,
- nagłówka Back/Forw,
- istniejących edytorów,
- wysokości viewportu,
- zachowania modali i dropdownów.

Jeżeli część stron wymaga więcej niż jednej wewnętrznej sekcji, każda sekcja może mieć własną ramkę, ale wszystkie muszą pozostawać wewnątrz jednej zewnętrznej ramki strony.

### Standard wizualny

Nie wymyślaj nowego design systemu.

Znajdź najlepiej zaimplementowaną istniejącą stronę i użyj jej jako wzorca dla:

- border radius,
- border,
- padding,
- gap,
- wysokości,
- overflow,
- zachowania na mobile i desktopie.

Jeżeli istnieją wspólne tokeny lub komponenty, użyj ich.

---

## Kolejność implementacji

1. Znajdź i opisz źródło luki.
2. Napraw izolację repozytoriów w `packages/dba`.
3. Zabezpiecz wszystkie bezpośrednie operacje Foldera.
4. Dodaj testy bezpieczeństwa.
5. Zablokuj zmianę repozytorium w UI.
6. Popraw układ przycisków Beepera.
7. Ustandaryzuj ramki stron.
8. Wykonaj testy regresji UI.
9. Zaktualizuj dokumentację.
10. Wykonaj typecheck, testy i build.

Nie zaczynaj od kosmetyki UI przed zamknięciem luki.

---

## Dokumentacja

Zaktualizuj dokumentację zgodnie z konwencją znalezioną przez:

`documentation/ai-docs/what-and-where.md`

Dokumentacja musi opisywać co najmniej:

- zasadę mapowania `username -> chad_<username>`,
- że filtrowanie i autoryzacja są wymuszane w DBA,
- zasadę deny by default,
- brak możliwości wyboru repozytorium przez klienta,
- zabezpieczenie operacji bezpośrednich,
- standard nagłówka strony,
- standard jednej zewnętrznej ramki i wewnętrznych ramek sekcji.

Nie twórz dokumentacji w przypadkowym miejscu.

---

## Walidacja końcowa

Uruchom właściwe dla repozytorium:

- testy jednostkowe/integracyjne,
- testy izolacji użytkowników,
- typecheck,
- lint, jeżeli obowiązuje,
- build dashboardu i odpowiednich pakietów.

Sprawdź ręcznie lub testami:

- Folder jako `pawel_f`,
- brak widoczności innych repozytoriów,
- próbę ręcznej podmiany repo ID/nazwy,
- brak wycieku nazw w błędzie,
- disabled/read-only repo control,
- Beeper na desktopie,
- Beeper na mobile,
- strony z `DashboardPageShell`,
- scroll wewnętrzny i brak globalnego scrolla.

Nie twierdź, że wykonano test manualny, jeżeli wykonano tylko analizę statyczną.

---

## Raport końcowy

Na końcu podaj:

1. znalezioną przyczynę luki,
2. miejsca, w których wymuszono izolację,
3. sposób mapowania użytkownika do repozytorium,
4. zachowanie przy braku repozytorium,
5. testy bezpieczeństwa i ich wyniki,
6. zmiany w Folder UI,
7. zmiany w Beeper,
8. zmiany standardu ramek,
9. zmienione pliki,
10. zaktualizowaną dokumentację,
11. wyniki typecheck/test/build,
12. niewykonane elementy lub ryzyka.

Nie deployuj PROD.

## Input 2

nadaj nowy numer temu story 60
