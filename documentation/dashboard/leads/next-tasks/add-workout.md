Dodaj nowy feature w zakładce Leads.

Kontekst:
W zakładce Leads, po wybraniu leada, jest sekcja Msg Workout.
W tej sekcji jest lista istniejących workoutów.
Aktualnie mogę kliknąć workout z listy i otwiera się on w edytorze.

Nowy feature:
Dodaj przycisk `+ New` w sekcji Msg Workout.

Zachowanie:
Po kliknięciu `+ New` aplikacja ma utworzyć nowy msg workout dla aktualnie wybranego leada.

Nazwa nowego workoutu:

* bazowo dzisiejsza data w formacie `YY-MM-DD`
* przykład dla 9 lipca 2026:
  `26-07-09`

Jeśli workout z dzisiejszą datą już istnieje:

* drugi utworzony tego dnia ma dostać suffix `b`
* trzeci suffix `c`
* czwarty suffix `d`
* itd.

Przykład:

* pierwszy klik: `26-07-09`
* drugi klik: `26-07-09b`
* trzeci klik: `26-07-09c`
* czwarty klik: `26-07-09d`

Ważne:

* nie używaj suffixu `a`
* pierwszy workout ma być bez litery
* litery zaczynają się od `b`
* sprawdzaj istniejące workouty dla danego leada, żeby nie nadpisać istniejącego itemu
* po utworzeniu nowego workoutu lista Msg Workout ma się odświeżyć
* nowo utworzony workout powinien od razu otworzyć się w edytorze
* treść nowego workoutu może być na razie pusta albo zawierać minimalny szablon, jeśli obecny system wymaga body
* nie psuj obecnego działania: kliknięcie istniejącego workoutu dalej ma otwierać go w edytorze

UI:

* przycisk `+ New` ma być widoczny obok / nad listą Msg Workout
* jeśli w tej sekcji jest już `Refresh`, zachowaj go
* układ ma być prosty: `+ New` i `Refresh` mogą być w jednej linii nad listą workoutów

Implementacja:

* znajdź komponent odpowiedzialny za zakładkę Leads i sekcję Msg Workout
* znajdź aktualną logikę pobierania listy workoutów
* dodaj funkcję generującą kolejną wolną nazwę workoutu na podstawie dzisiejszej daty
* dodaj funkcję tworzącą nowy item workoutu w Content Providerze
* po utworzeniu odśwież listę i ustaw nowy item jako aktualnie otwarty w edytorze

Dokumentacja:
Po zakończeniu zapisz krótki opis feature w projekcie `chad-dba`:
`architecture/[nazwa projektu]/features/[nazwa-featurea].md`

W dokumencie opisz:

* co dodano
* gdzie w UI jest przycisk
* jak działa generowanie nazw `YY-MM-DD`, `YY-MM-DDb`, `YY-MM-DDc`
* jakie pliki zostały zmienione
* jak przetestować

Test ręczny:

1. Wejdź w Leads.
2. Wybierz leada.
3. Otwórz sekcję Msg Workout.
4. Kliknij `+ New`.
5. Sprawdź, czy powstał workout `26-07-09`.
6. Kliknij `+ New` drugi raz.
7. Sprawdź, czy powstał workout `26-07-09b`.
8. Kliknij `+ New` trzeci raz.
9. Sprawdź, czy powstał workout `26-07-09c`.
10. Sprawdź, czy nowo utworzony workout otwiera się w edytorze.
11. Sprawdź, czy stare workouty nadal można otwierać z listy.
