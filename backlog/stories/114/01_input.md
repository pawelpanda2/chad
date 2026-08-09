# Story 114 — Input

## Input 1

Cursor — Examples / Knowledge v1 snapshot + Knowledge v2 intelligent layout

1. Opis konkretnego zadania użytkownika

Pracujesz w repozytorium CHAD:

$repo_path

To zadanie ma dwa etapy. Najpierw zabezpiecz aktualny wygląd Knowledge jako przykład referencyjny, a dopiero potem przebuduj produkcyjny widok Knowledge zgodnie z zaakceptowaną makietą.

Makieta referencyjna nowego układu znajduje się w repozytorium w folderze:

examples/

Najpierw znajdź aktualny plik HTML odpowiadający ostatniej zaakceptowanej makiecie Knowledge v2. Nie zgaduj nazwy — sprawdź rzeczywistą zawartość examples/.

Przed przygotowaniem tego promptu zweryfikowano aktualny stan publicznego repo:

/dashboard/knowledge jest już dynamicznym hubem z kategoriami pobieranymi z /api/knowledge;

/dashboard/knowledge/[category] renderuje sekcje i dokumenty z realnych danych chad_shared/knowledge;

bieżący widok używa istniejących komponentów/tokens Dashboardu;

tej dynamiki nie wolno cofnąć do statycznych danych.

1.1. Task 1 — nowa pozycja głównego menu Examples

Dodaj w głównym sidebarze Dashboardu nową pozycję:

Examples

Ma znajdować się w sekcji OTHERS.

Po kliknięciu ma otwierać hub/menu zgodne z istniejącym wzorcem Msg Auto. Nie projektuj osobnego, nowego systemu menu, jeśli obecny wzorzec można wykorzystać.

Na początek hub Examples ma zawierać jeden kafelek:

Knowledge v1

Po wejściu do Knowledge v1 pokaż zamrożony przykład obecnego wyglądu Knowledge sprzed przebudowy v2, ale na danych mockowanych.

Cel:

zachować obecny dobry GUI jako referencję;

móc porównywać kolejne wersje;

nie zgubić zaakceptowanego wyglądu;

później dodawać następne przykłady do tego samego menu.

Wymagania:

Knowledge v1 nie może pobierać danych z /api/knowledge;

używa wyłącznie lokalnych/mockowanych danych;

ma odwzorować obecny wygląd kategorii Knowledge przed Task 2;

mock ma zawierać kilka sekcji o różnej liczbie wpisów;

Examples jest wyłącznie warstwą demonstracyjną GUI;

nie twórz backendu/DBA dla Examples;

nie dotykaj chad_shared ani realnych danych.

Przed rozpoczęciem Task 2 upewnij się, że Knowledge v1 faktycznie zachowuje obecny wygląd.

1.2. Task 2 — Knowledge v2: inteligentny układ sekcji

Przebuduj wyłącznie rozmieszczenie ramek/sekcji w produkcyjnym:

/dashboard/knowledge/[category]

Nie zmieniaj źródła danych ani routingu dokumentów. Knowledge nadal ma korzystać z realnych cp_items/chad_shared/knowledge.

Użytkownik bardzo lubi obecny frontend. Zachowaj:

kolorystykę;

styl i zaokrąglenia ramek;

ikony i typografię;

ogólną estetykę;

DashboardPageShell;

Back/Forw/up-level;

istniejące komponenty i layout tokens;

obecny flow kliknięcia dokumentu.

Zmienia się algorytm rozmieszczenia.

1.3. Maksymalnie 3 kolumny

Układ ma automatycznie wybierać:

3 kolumny → jeśli realnie się mieszczą
2 kolumny → jeśli 3 się nie mieszczą
1 kolumna → jeśli 2 się nie mieszczą

Zasady:

maksymalnie 3 kolumny;

żadnej czwartej;

układ przyklejony do lewego górnego rogu;

niewykorzystane miejsce po prawej może być puste;

kolumn nie rozciągaj na cały viewport;

NIE używaj sztywnych breakpointów jako głównego kryterium;

decyzja 3/2/1 wynika z rzeczywistych wyliczonych szerokości + dostępnego miejsca;

3 kolumny mają pojawić się od razu, kiedy się mieszczą, a nie dopiero przy arbitralnym dużym breakpointcie.

1.4. Brak globalnego poziomego scrollbara

To twarde wymaganie.

Strona Knowledge nie może dostać poziomego scrollbara całej strony.

Algorytm ma realnie dobrać 3/2/1 i szerokości tak, aby mieścić się w kontenerze. Nie maskuj złego layoutu samym overflow-x:hidden.

1.5. Szerokość liczona osobno dla każdej kolumny

Każda kolumna ma własną szerokość.

Przykład jest poprawny:

kolumna 1: 310 px
kolumna 2: 190 px
kolumna 3: 170 px

jeśli tak wynika z jej własnych nazw.

Wszystkie ramki w tej samej kolumnie mają identyczną szerokość.

Różne kolumny NIE muszą mieć identycznej szerokości.

1.6. Heurystyka szerokości kolumny

Dla każdej kolumny osobno:

przeanalizuj nazwy sekcji i dokumentów, które trafiają do tej kolumny;

policz reprezentatywną/średnią długość tekstów;

dodaj niewielki zapas około 30%;

dobierz szerokość tak, aby większość typowych nazw mieściła się w jednej linii;

pojedynczy bardzo długi outlier nie może poszerzać całej kolumny;

zastosuj sensowne minimum i maksimum;

maksymalna szerokość kolumny/ramki około 400px;

jeśli w danej kolumnie nazwy są krótkie, kolumna ma być wyraźnie węższa;

nawet przy jednej kolumnie nie rozciągaj jej bez potrzeby na pełny ekran.

Nie licz jednej wspólnej średniej dla wszystkich 3 kolumn. Każda kolumna liczy własną.

1.7. Normalne długie nazwy

Normalna długa nazwa zawierająca spacje:

zawija się na kolejną linię;

nie poszerza całej kolumny;

zwiększa wysokość tylko konkretnego wiersza;

nie dostaje poziomego scrollbara.

1.8. Ekstremalnie długi niełamliwy token

Jeżeli jeden element zawiera bardzo długi token bez spacji, którego nie da się normalnie zawinąć:

NIE pokazuj poziomego scrollbara;

na końcu tego konkretnego elementu pokaż dwie małe strzałki ‹ i ›;

obie są obok siebie na prawym końcu wiersza;

› przesuwa tekst tego jednego elementu w lewo, odsłaniając dalszy fragment;

‹ przesuwa tekst z powrotem;

przesuwaj wyłącznie tekst tego dokumentu;

nie przesuwaj karty, kolumny ani strony;

strzałki są widoczne tylko dla faktycznie niełamliwego overflow.

1.9. Inteligentna wysokość ramek

Ramki w jednym wizualnym wierszu NIE muszą mieć tej samej wysokości.

Cel:

ograniczyć puste miejsce;

nie pozwolić, aby jedna sekcja z 20–30 wpisami robiła gigantyczną wysokość;

krótkie ramki zostawić naturalnie krótkie;

długim dodawać pionowy scrollbar.

Podstawowy cel wysokości:

około 5 widocznych wpisów

Jeżeli wszystkie ramki w wierszu mają znacznie więcej elementów, cap może wzrosnąć do około:

8 wpisów

1.10. Średnia liczby wpisów w wizualnym wierszu

Dla ramek obok siebie licz średnią liczby dokumentów i zaokrąglaj w górę.

Przykład 2 kolumn:

1 + 5
średnia = 3

Ramka 1 zostaje naturalna, a ramka 5 pokazuje około 3 wpisów + pionowy scrollbar.

Przykład 3 kolumn:

1 + 1 + 5
średnia = 2.33
ceil = 3

Dłuższa ramka pokazuje około 3 wpisów + scrollbar.

Połącz to z capami:

normalnie około 5;

gdy wszystkie są duże, do około 8;

krótkich ramek nie rozciągaj;

tylko ramki przekraczające limit dostają ograniczenie wysokości/scroll.

1.11. Długie sekcje — test 25 elementów

W testowych/mockowanych danych umieść co najmniej jedną sekcję z około:

25 dokumentami

Zweryfikuj:

pionowy scrollbar konkretnej ramki;

sensowną długość thumb;

zachowanie przy 1/2/3 kolumnach;

brak wpływu na globalny horizontal scroll;

brak rozsypywania sąsiednich ramek.

1.12. Makieta w examples/

Ostatnia zaakceptowana makieta HTML jest w:

examples/

Otwórz ją i potraktuj jako referencję zachowania.

Nie kopiuj surowego JS/CSS 1:1, jeśli jest to sprzeczne z React/Next/Tailwind i aktualnymi komponentami CHAD.

Przenieś dokładnie decyzje UX:

maks. 3 kolumny;

indywidualne szerokości kolumn;

3/2/1 zależne od faktycznego fit;

heurystykę średniej długości tekstów osobno per kolumna;

zawijanie zwykłych długich tekstów;

‹ › dla ekstremalnego tokenu;

heurystykę wysokości;

pionowy scroll per ramka.

1.13. Nie cofaj dynamicznego Knowledge

Produkcja ma nadal:

pobierać kategorie z istniejącego /api/knowledge;

pobierać sekcje/dokumenty z istniejącego dynamicznego API;

korzystać z chad_shared/knowledge;

zachować obecny routing.

Statyczne/mockowane dane są tylko w:

Examples → Knowledge v1

Nie przywracaj w produkcji statycznego GROUPS.

1.14. Implementacja algorytmu

Jeżeli algorytm nie mieści się czytelnie w kilku klasach:

wydziel mały testowalny helper/hook/komponent;

nie wkładaj całej matematyki do ogromnego page.tsx;

nie rozsiewaj magicznych liczb;

nazwij parametry, np. maxColumns, maxColumnWidth, normalRowCap, allLargeRowCap, widthReserveRatio;

nie twórz nadmiernie ogólnego frameworka layoutowego.

1.15. Responsywność i ręczny test

Sprawdź:

szeroki desktop;

laptop;

stopniowe zwężanie okna;

tablet;

telefon.

Najważniejszy smoke:

powoli zmniejszaj viewport: 3 → 2 → 1;

potem zwiększaj: 1 → 2 → 3;

przejście ma następować wtedy, gdy realnie kolejna liczba kolumn przestaje/zaczyna się mieścić;

nie może być sytuacji, że jest dużo wolnego miejsca, a layout zbyt długo pozostaje przy 1 lub 2 kolumnach.

1.16. Zakres — wykonaj

Wykonaj:

nowy sidebar item Examples pod OTHERS;

hub /dashboard/examples w stylu Msg Auto;

kafelek Knowledge v1;

statyczny/mockowany snapshot starego GUI Knowledge;

inteligentny layout Knowledge v2;

maks. 3 kolumny;

osobną szerokość dla każdej kolumny;

dynamiczne 3/2/1 bez sztywnych breakpointów jako głównej logiki;

brak globalnego horizontal scroll;

wrap normalnych długich nazw;

lokalne ‹ › dla niełamliwego tokenu;

inteligentną wysokość;

pionowe scrollbary długich sekcji;

testy helpera/layoutu;

realny responsive smoke;

aktualizację właściwej dokumentacji i Story;

commit;

lokalny rebuild/restart/smoke zgodnie z sekcją 2.

1.17. Nie wykonuj

Nie:

zmieniaj chad_shared ani cp_items;

migruj danych;

zmieniaj modelu DBA;

zmieniaj API Knowledge bez realnej potrzeby;

zmieniaj routingu dokumentów;

dodawaj search/filter/tag/AI;

dodawaj czwartej kolumny;

twórz globalnego poziomego scrolla;

rozciągaj jednej kolumny na cały ekran bez potrzeby;

pozwalaj pojedynczemu outlierowi sterować szerokością całej kolumny;

wykonuj pushu;

wykonuj deployu TEST/PROD.

1.18. Kryteria akceptacji

Task 1:

Examples jest w sidebarze pod OTHERS.

Examples otwiera hub podobny do Msg Auto.

Hub ma Knowledge v1.

Knowledge v1 używa tylko mocków.

Wizualnie zachowuje Knowledge sprzed v2.

Examples nie odczytuje/mutuje chad_shared.

Task 2:7. Produkcyjny Knowledge nadal używa realnych danych.8. Maksymalnie 3 kolumny.9. 3 kolumny pojawiają się tak wcześnie, jak tylko faktycznie się mieszczą.10. Każda kolumna liczy własną szerokość.11. Wszystkie ramki danej kolumny mają tę samą szerokość.12. Różne kolumny mogą mieć różne szerokości.13. Krótkie kolumny są węższe.14. Jedna kolumna nie rozciąga się bez potrzeby na pełny viewport.15. Brak globalnego horizontal scroll.16. Normalne długie nazwy się zawijają.17. Ekstremalny token pokazuje ‹ › na końcu wiersza.18. Strzałki przesuwają tylko tekst konkretnego elementu.19. Sekcja 25 wpisów ma pionowy scrollbar.20. Krótkie ramki są naturalnie krótkie.21. Długie ramki używają średniej + cap około 5/8.22. Layout poprawnie działa 3↔2↔1.23. Brak regresji desktop/mobile.24. Otwieranie dokumentów nadal działa.25. Testy przechodzą.26. Lokalny Docker został przebudowany i realnie sprawdzony.27. Wykonano commit końcowy.

1.19. Raport końcowy

Raport ma być krótki:

co faktycznie zmieniono;

jakie testy faktycznie wykonano;

wynik lokalnego rebuild/restart/smoke;

commit SHA;

prawdziwe blokady/niewykonane punkty.

Nie dodawaj pełnego diffu ani zbędnego dodatkowego podsumowania.

2. Zabezpieczenia przekazywane do AI Codera

(Pełna treść sekcji "Zabezpieczenia" — zasady tokenów/dokumentacji/git/danych/DBA/deploymentu/autonomii/testów — przekazana w tej samej wiadomości; patrz historia sesji Cursor. AI Coder ma stosować te zasady przy realizacji Story 114.)
