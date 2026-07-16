## Input 1

Story 56 — pilne bugi i poprawki nawigacji / Reports

Przeczytaj najpierw:

documentation/ai-docs/knowledge/01_ai_start.md

Następnie postępuj zgodnie z obowiązującym standardem Story.

Utwórz:

documentation/stories/56/
├── 01_input.md
├── 02_plan.md
├── 03_knowledge.md
├── 04_todos.md
├── 05_report.md
└── opcjonalnie 06_propositions.md

`01_input.md` ma zawierać wyłącznie pełny input użytkownika, bez powtarzania standardu Story.

Podczas pracy regularnie aktualizuj `04_todos.md`, aby po przypadkowym przerwaniu sesji można było wznowić pracę dokładnie od ostatniego kroku.

Po pełnym zakończeniu Story plik `04_todos.md` ma być pusty.

Najpierw przeanalizuj istniejący kod i dokumentację, przygotuj `02_plan.md` i poczekaj na zatwierdzenie planu przed implementacją.

# Story 56 — pilne bugi

## Task 1 — osobna górna ramka Create i Generated name

W formularzu Reports zmień organizację paneli.

Obecnie przycisk `Create` i pole `Generated name` są częścią istniejącej ramki metadanych.

Rozdziel je i umieść w osobnej, zaokrąglonej ramce na samej górze formularza Reports.

Układ od lewej strony:

```text
[Create] [Generated name: ...]
````

Wymagania:

* ramka ma być na samej górze;
* elementy mają być wyrównane do lewej;
* pierwszy od lewej ma być przycisk `Create`;
* za nim ma znajdować się `Generated name`;
* wykorzystaj istniejący standard ramek dashboardu;
* nie twórz nowego, niespójnego stylu;
* zachowaj istniejącą logikę blokowania danych po utworzeniu raportu.

Pozostałe pola metadanych raportu pozostają w osobnej ramce poniżej, chyba że aktualny kod wymaga minimalnej reorganizacji dla poprawnego układu.

## Task 2 — osobna ramka nagrywania i przenoszenie tekstu do raportu

Obecne nagrywanie głosowe działa poprawnie, ale jego UI i przepływ wymagają przebudowy.

Dodaj osobną, zaokrągloną ramkę pomiędzy:

1. górną ramką z `Create` i `Generated name`;
2. edytorem raportu.

Ramka nagrywania powinna początkowo wyglądać jak jednoliniowy panel.

Ma zawierać:

```text
[Record] [Move] [transkrybowany tekst]
```

Wymagania:

* przycisk `Record` uruchamia i zatrzymuje istniejące nagrywanie;
* obok znajduje się przycisk `Move`;
* transkrybowany tekst jest widoczny w tej ramce;
* ramka ma automatycznie zwiększać swoją wysokość wraz z ilością tekstu;
* nie może mieć stałej wysokości ograniczającej dłuższą transkrypcję;
* tekst powinien mieć własne poprawne zawijanie;
* ramka nie może rozwalać wysokości całej strony ani powodować niekontrolowanego globalnego scrolla.

Po kliknięciu `Move`:

1. skopiuj albo przenieś cały tekst z ramki nagrywania na koniec aktualnej treści raportu;
2. zachowaj istniejący tekst raportu;
3. dodaj odpowiedni separator nowej linii, aby teksty się nie sklejały;
4. zaktualizuj stan wspólnego edytora;
5. automatycznie wykonaj zapis raportu, tak jak po kliknięciu przycisku `Save`;
6. po potwierdzonym sukcesie zapisu wyczyść pole transkrypcji;
7. jeżeli zapis się nie powiedzie, nie usuwaj transkrypcji i pokaż błąd.

Nie duplikuj logiki zapisywania. `Move` powinien korzystać z tej samej funkcji zapisu co przycisk `Save`.

Przycisk `Move` powinien być nieaktywny, jeżeli:

* raport nie został jeszcze utworzony;
* transkrypcja jest pusta;
* trwa już zapis.

## Task 3 — pusty raport w Reports View

Napraw bug w widoku Reports.

Aktualny problem:

* użytkownik wybiera raport, którego body jest puste;
* nie pojawia się edytor ani Preview.

Oczekiwane zachowanie:

* po wybraniu istniejącego raportu zawsze pokazują się zakładki `Preview` i `Editor`;
* pusta treść nie może być traktowana jako brak wybranego raportu;
* `Editor` ma się pojawić także dla pustego stringa;
* `Preview` może pokazywać poprawny empty state, ale cały panel musi istnieć;
* użytkownik musi móc rozpocząć edycję pustego raportu.

Znajdź warunek, który błędnie traktuje pusty string jako wartość fałszywą, np.:

```ts
if (content)
```

i rozdziel:

* brak wybranego raportu;
* wybrany raport z pustą treścią.

Nie poprawiaj tego przypadkowym fallbackiem. Ustal rzeczywistą przyczynę.

## Task 4 — prawy pusty pas we wszystkich widokach desktopowych

W desktopowej wersji dashboardu dodaj po prawej stronie wszystkich widoków pusty pas odstępu o szerokości około:

```text
100px
```

Wymagania:

* dotyczy wszystkich głównych widoków dashboardu;
* odstęp ma być wprowadzony wspólnie, a nie przez kopiowanie klas do każdej strony;
* znajdź wspólny wrapper, layout albo page shell;
* nie zmniejszaj przypadkowo mobilnego widoku;
* na telefonie nie dodawaj stałego pasa 100px;
* sprawdź wpływ na wewnętrzne scrolle i wysokość paneli;
* globalny scrollbar strony nadal nie powinien pojawiać się podczas normalnej pracy.

Najpierw ustal dokładnie, czy odstęp powinien być:

* paddingiem wspólnego kontenera;
* zarezerwowaną przestrzenią pod nawigację;
* częścią wspólnego toolbaru.

Nie implementuj osobnych hacków na każdej stronie.

## Task 5 — Back, Next i przycisk cofania w hierarchii

Na końcu po prawej stronie widoku znajduje się przycisk `Back`.

Przebuduj ten obszar jako wspólną nawigację.

Docelowy układ od lewej do prawej:

```text
[\] [Next] [Back]
```

Cała grupa ma znajdować się po prawej stronie.

### Pozycjonowanie

* prawy pusty pas ma około 100px;
* grupa przycisków ma być umieszczona jeszcze około 75px w lewo od tego pasa;
* nie hardcoduj pozycji osobno na każdej stronie;
* wykorzystaj wspólny komponent albo wspólny layout;
* sprawdź zachowanie przy różnych szerokościach desktopu;
* przygotuj rozsądne zachowanie mobilne.

### Back

`Back` ma przechodzić do poprzednio otwartej strony/widoku w historii dashboardu.

Powinien być wyszarzony i nieaktywny, jeżeli nie ma wcześniejszego wpisu w historii.

### Next

`Next` ma przechodzić do strony/widoku, z którego użytkownik wcześniej cofnął się przyciskiem `Back`.

To jest odpowiednik przejścia do przodu w historii.

Powinien być wyszarzony i nieaktywny, jeżeli nie ma kolejnego wpisu w historii.

Nie interpretuj `Next` jako przejścia do najnowszej strony na sztywno. Ma działać jak forward history po wcześniejszym użyciu Back.

### Przycisk `\` — cofanie w hierarchii

Przed `Next` dodaj przycisk oznaczony:

```text
\
```

Ten przycisk służy do przejścia o jeden poziom wyżej w aktualnej hierarchii widoku.

Przykładowo:

```text
Views
→ Reports
→ konkretny raport
```

Kliknięcie `\` na poziomie konkretnego raportu powinno wrócić do listy Reports, a kolejne kliknięcie — jeżeli istnieje taki poziom — do menu Views.

Wymagania:

* nie może działać tak samo jak `Back`;
* ma korzystać z aktualnej hierarchii/routingu danego widoku;
* powinien być wyszarzony, jeżeli użytkownik jest już na najwyższym poziomie;
* nie może zgadywać ścieżki na podstawie tekstu URL bez sprawdzenia istniejącego systemu `?view=` / `?form=` i aktualnego modelu nawigacji;
* zastosuj jeden wspólny mechanizm dla stron, na których istnieje hierarchia.

## Task 6 — standaryzacja wspólnej nawigacji

Nie wdrażaj Back/Next/`\` tylko w Reports.

Najpierw znajdź wszystkie miejsca, gdzie istnieje przycisk `Back`, lokalna historia albo przechodzenie poziom wyżej.

Utwórz lub rozszerz wspólny komponent nawigacyjny, jeżeli obecna architektura na to pozwala.

Wymagania:

* spójny wygląd;
* spójna kolejność przycisków;
* wspólne zasady disabled;
* brak kopiowania tej samej logiki;
* brak regresji w Forms, Views i pozostałych głównych stronach.

Nie zmieniaj bez potrzeby logiki biznesowej stron.

# Dokumentacja

Story 56 ma zostać opisane zgodnie ze standardem Stories.

`05_report.md` musi zaczynać się od checklisty przeznaczonej do mojego ręcznego sprawdzenia aplikacji:

```md
## Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 |  |  | Osobna górna ramka Create i Generated name |
| 2 |  |  | Ramka nagrywania z Record i Move |
| 3 |  |  | Edytor i Preview dla pustego raportu |
| 4 |  |  | Prawy pusty pas we wszystkich widokach desktopowych |
| 5 |  |  | Nawigacja Back, Next i \ |
| 6 |  |  | Standaryzacja wspólnej nawigacji |
```

AI wypełnia wyłącznie kolumnę `Ai Status`.

Kolumna `Real Status` pozostaje pusta dla mnie.

Na checkliście umieszczaj wyłącznie funkcjonalne zadania możliwe do ręcznego sprawdzenia w aplikacji. Nie dodawaj tam prac dokumentacyjnych ani organizacyjnych.

# Test ręczny obowiązkowy

Po implementacji wykonaj rzeczywisty test UI.

Co najmniej:

1. Forms → Reports.
2. Sprawdź górną ramkę Create + Generated name.
3. Utwórz raport.
4. Sprawdź blokadę metadanych.
5. Nagraj tekst.
6. Sprawdź rozszerzanie ramki transkrypcji.
7. Kliknij Move.
8. Sprawdź dopisanie tekstu na końcu raportu.
9. Sprawdź automatyczny zapis.
10. Otwórz pusty raport w Views.
11. Sprawdź obecność Preview i Editor.
12. Sprawdź Back.
13. Sprawdź Next po użyciu Back.
14. Sprawdź `\` na co najmniej dwóch poziomach hierarchii.
15. Sprawdź stan disabled wszystkich przycisków.
16. Sprawdź desktopowy pas po prawej.
17. Sprawdź mobile, aby desktopowy odstęp nie powodował regresji.

Nie uznawaj Story za zakończone po samym typechecku lub buildzie.

Wykonaj także:

* typecheck odpowiednich pakietów;
* build;
* lint;
* dostępne testy;
* test działania w przeglądarce.

Jeżeli czegoś nie uda się zweryfikować, opisz to dokładnie w `05_report.md`.

## Input 2

a i jeszcze w formularzu reports w ramce z nazwa przenies create w gorny lewy rog tej ramki a obok tego przycisku create daj generated name
i pod nimi w nowej linijce reszte elementow z nazwy Date, Report kind, Rest of the name

## Input 3

i jeszcze kolejny task do tego story przejrzyj wszytskie widoki bo widze ze np. w widoku leada konkretnego jak klikniesz jakis lead z widoku leadow to strzalka cofanie nie jest jeszcze nawet po prawej stronie, a to był poprzedniego story task
wiec zrob taki standard na te wszytskie strony z tymi trzeba strzalkami Back Backslask i Forward ktore opisalem wczesniej
