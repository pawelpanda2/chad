# CHAD — notatki i backlog

## Done

### Nagrywanie raportów

- [x] Funkcja głosowa.
- [x] Możliwość głosowego nagrywania raportu.

### Mobile

- [x] W wersji mobilnej formularza Reports przycisk `Create` powinien być w nowej linii.
- [x] Do rozważenia: takie samo zachowanie również w przeglądarce na laptopie.

### Domyślna zakładka Preview / Editor

- [x] Edytor powinien pozwalać określić, która zakładka jest zaznaczona domyślnie:
  - w niektórych przypadkach `Preview`,
  - w innych `Editor`.
- [x] Dla raportów po ich utworzeniu należy ustawić odpowiedni domyślny widok.

---

## Todo 03

### Krótki tytuł zamiast ścieżki

- [ ] Nadal widoczny jest tytuł w formie ścieżki:
  - `Views / REPORTS / 26-07-14_dg_story56 empty test`
- [ ] Zamiast ścieżki ma być wyświetlany krótki tytuł.

### Actions — przeniesienie elementów na górę

- [ ] Przenieść przycisk i automatycznie generowaną nazwę na górę widoku.

---

## Todo 02 — pilne bugi

### Reports — osobna ramka dla Create i Generated name

- [ ] Rozdzielić `Create` i `Generated name` do osobnej, zaokrąglonej ramki.
- [ ] Umieścić tę ramkę na górze.
- [ ] Kolejność od lewej:
  1. przycisk `Create`,
  2. `Generated name`.
- [ ] Oba elementy wyrównać do lewej.

### Nagrywanie — osobny panel i Move

- [ ] Nagrywanie działa poprawnie, ale potrzebna jest osobna, jednoliniowa ramka.
- [ ] Umieścić ją pomiędzy górną ramką z nazwą a edytorem.
- [ ] W ramce ma znajdować się przycisk `Record`.
- [ ] Ramka powinna zwiększać wysokość w miarę przybywania tekstu.
- [ ] Obok `Record` dodać przycisk `Move`.
- [ ] `Move` ma:
  - przenieść tekst na koniec edytora raportu,
  - wyczyścić pole nagrania,
  - automatycznie zapisać raport.

### Reports view — pusty raport

- [ ] Po wybraniu pustego raportu nie pojawia się `Editor` ani `Preview`.
- [ ] Pusty raport również musi otwierać edytor i podgląd.

### Pusty odstęp po prawej stronie

- [ ] W widoku desktopowym dodać na końcu wszystkich widoków pusty odstęp po prawej stronie.
- [ ] Wstępna wartość: około `100px`.

### Back / Next / Hierarchy Back

- [ ] Obecny przycisk `Back` po prawej stronie przesunąć o około `75px` w lewo.
- [ ] Przed nim dodać przycisk `Next`, służący do przejścia do ostatnio otwartej strony.
- [ ] `Back` i `Next` mają być wyszarzone, gdy historia jest pusta.
- [ ] Przed `Next` dodać przycisk cofania w hierarchii.
- [ ] Przycisk hierarchii ma działać tylko wtedy, gdy aktualny widok jest zagnieżdżony niżej.

### Skrypty — pozycja re-start.sh

- [ ] `re-start.sh` miał pozostać jako:
  - `02_re-start.sh`
- [ ] Claude umieścił go pod numerem `04`; trzeba ustalić przyczynę i poprawić zgodnie z konwencją.

---

## Todo 01

### Standard podwójnej ramki

- [ ] Opracować wspólny standard głównej ramki i zagnieżdżonych ramek.

### Prisma

- [ ] Wyjaśnić, po co Prisma znajduje się w projekcie.
- [ ] Sprawdzić:
  - gdzie jest używana,
  - czy projekt ma relacyjną bazę danych,
  - czy Prisma jest wykorzystywana w związku z MongoDB.

### Beeper

- [ ] Poprawić menu Beepera.

### CP GUI

- [ ] Usunąć podpowiedź `03/06` z tła inputa `loca`.

### CP ZIP download

- [ ] Dodać możliwość pobrania ZIP:
  - jednego repo,
  - wielu repo jednocześnie.

### Wspólny edytor w Folder

- [ ] W widoku Folder użyć tego samego wspólnego edytora, który jest używany m.in. w Reports.

### Ostatnia modyfikacja i lokalny cache danych

- [ ] Przy starcie aplikacja pobiera daty ostatnich modyfikacji z `config` głównych folderów Content Providera.
- [ ] Jeżeli lokalne dane są aktualne, aplikacja nie powinna wykonywać zbędnych requestów.
- [ ] Dodać ustawienie w `Settings` pozwalające użytkownikowi zezwolić na pobieranie jego danych na urządzenie.
- [ ] Aplikacja powinna później dopytywać tylko o Text Itemy zmienione po dacie ostatniej lokalnej synchronizacji.

### Miarka szerokości

- [ ] U góry każdej strony dodać miarkę/linijkę:
  - dłuższy znacznik co `100px`,
  - krótszy znacznik co `50px`.
- [ ] Ma pomagać oceniać szerokość widoku, szczególnie w mobilnej przeglądarce.
- [ ] Użyć jej również do oceny minimalnych szerokości.

### Standard Edit

- [ ] Dodać przycisk `Edit`.
- [ ] Dopiero po wejściu w tryb edycji mają pojawiać się przyciski `Save`.
- [ ] Ustalić ten mechanizm jako wspólny standard.

### Reorganizacja stron i menu

- [ ] Zmienić nagłówek `Messages / Leads` na `Messages`.
- [ ] Pod `Messages` pozostawić tylko zakładkę `Beeper`.
- [ ] Utworzyć nagłówek `Msg Automation`.
- [ ] Przenieść pod niego pozostałe zakładki ze starej grupy.
- [ ] Pod `OTHERS` przenieść zakładkę `Folders`.

### Więcej wewnętrznych scrollbarów

- [ ] Główna ramka ma scrollować listę kolejnych elementów/ramek.
- [ ] Zagnieżdżona ramka wewnątrz głównej powinna mieć własny scroll.
- [ ] Poprawić w ten sposób m.in. Reports.
- [ ] Lista raportów ma być zagnieżdżoną ramką, której szerokość dostosowuje się do długości nazw.
- [ ] Zastosować podobny standard w innych zakładkach.
- [ ] Opisać standard w dokumentacji `.md`, aby AI stosowało go przy nowych widokach.

### Redis

- [ ] Przeanalizować, czy Redis może pomóc w szybkości ładowania stron.
- [ ] Nie wdrażać bez wcześniejszego ustalenia rzeczywistego problemu wydajnościowego.

### Niepotrzebne napisy

- [ ] Usunąć napis `5 of 5 reports`.
- [ ] Znaleźć inne zbędne napisy w UI.

### Wybór najszybszego serwera

- [ ] Dane mają być dostępne:
  - na serwerze użytkownika,
  - na serwerze Kamila.
- [ ] Gdy podstawowy serwer jest wolny lub niedostępny:
  - wykonać healthcheck serwera Kamila,
  - przełączyć się na szybszy/dostępny serwer.

### Sidebar jako preview, bez ścieśniania

- [ ] Po rozsunięciu menu główny widok nie powinien się ścieśniać.
- [ ] W miejscu menu ma pojawić się lekkie, nieklikalne preview.
- [ ] Klikanie w preview ma być zablokowane.

### Delete Item

- [ ] `Delete` ma być dostępny tylko po wejściu do konkretnego Itemu.
- [ ] Nie pokazywać `Delete` w tabelach ani widokach wielu Itemów.
- [ ] Po kliknięciu pokazać potwierdzenie.
- [ ] Rozważyć dodatkowe potwierdzenie przez wpisanie losowego słowa, np.:
  - `agree`,
  - `trouble`,
  - `morning`,
  - `listener`,
  - `gorilla`,
  - `paprika`.

### Jeden wspólny Content Provider

- [ ] Lokalnie przy starcie sprawdzać, czy samodzielny CP działa na porcie `12021`.
- [ ] Jeżeli działa — korzystać z niego.
- [ ] Jeżeli nie działa — uruchomić własny CP przez Docker Compose.
- [ ] W trakcie działania, gdy CP przestanie odpowiadać, lokalna aplikacja może uruchomić własny CP.
- [ ] To zachowanie ma dotyczyć wyłącznie środowiska lokalnego.
- [ ] Na TEST i PROD ma działać jeden osobny, współdzielony CP na porcie `12021`.
- [ ] Rozważyć automatyczny restart kontenera CP po awarii.

### Pusty pasek po prawej — desktop

- [ ] W desktopowej przeglądarce pozostawić pusty pasek po prawej stronie.
- [ ] W tej notatce pojawia się również wartość około `200px`.
- [ ] Na telefonie wykorzystywać całą szerokość.
- [ ] **Do rozstrzygnięcia:** `100px` czy `200px`.

### Bez ścieżek w tytułach

- [ ] Nie wyświetlać tytułów w formie:
  - `Views / REPORTS / 26-07-14_dgb`
- [ ] Używać krótkiego tytułu.

### Stack nawigacji

- [ ] Dodać prostą historię przechodzenia wstecz i do przodu.
- [ ] Zapamiętywać ostatnio otwarte widoki.

### Msg Planner — błąd CP

- [ ] Naprawić błąd:
  ```text
  Error: Empty response body from /invoke.
  Args: ["IRepoService","IItemWorker","GetByNames","8b603669-f8e6-4224-bd78-a474998995fa","leads","msg planner"]
  ```
- [ ] Najpierw ustalić, czy problem leży w CP, DBA, konfiguracji repo, porcie czy obsłudze pustej odpowiedzi.

### Cloudflare

- [ ] Dodać Cloudflare do PROD.
- [ ] Najpierw potwierdzić, czy ta decyzja nadal obowiązuje względem aktualnej konfiguracji domeny i proxy.

### Wskaźnik ładowania przy nawigacji

- [ ] Po kliknięciu `Date Entry` czasem długo trwa przejście do formularza.
- [ ] W przycisku pokazać spinner i tekst `Loading`.
- [ ] Na czas ładowania zablokować pozostałe przyciski.
- [ ] Podobnie obsłużyć przycisk `Back`, gdy operacja trwa długo.

### Poziomy scroll na dotyku

- [ ] W widokach tabelowych brakuje widocznego dolnego poziomego scrollbara.
- [ ] Przesuwanie palcem pozwala wyjechać poza ostatnią kolumnę i pokazuje pustą przestrzeń.
- [ ] Widok odbija po puszczeniu; użytkownik nie chce takiego efektu.
- [ ] Dotyczy co najmniej:
  - Users,
  - Statuses.
- [ ] Scroll powinien twardo zatrzymywać się na pierwszym i ostatnim pikselu danych.

### Zamykanie sidebara

- [ ] Przycisk zamykania na sidebarze ma mieć dwie strzałki.
- [ ] Powinien mieć większą wysokość — około dwóch linii przycisków.
- [ ] Wzorować zachowanie na przycisku zamykania sidebara w ChatGPT.
- [ ] Gdy sidebar jest otwarty:
  - widoczny przycisk osadzony w sidebarze,
  - zewnętrzny „dyndzel” ukryty.
- [ ] Gdy sidebar jest całkowicie zwinięty:
  - przycisk w sidebarze niewidoczny,
  - zewnętrzny „dyndzel” widoczny.

### Zapamiętywanie widoków we frontendzie

- [ ] Rozważyć zapamiętywanie struktury widoku bez danych w pamięci przeglądarki.
- [ ] Przy ponownym wejściu automatycznie odtwarzać widok na telefonie/laptopie.

### Pozostałe pomysły / do doprecyzowania

- [ ] Zwiększyć okienko Text Item w Blazor App.
- [ ] Raporty z randek przechowywać osobno.
- [ ] Dodać raport z randki z Darią.
- [ ] Przekazywać AI informację o aktualnym dniu.
- [ ] Umieszczać inne podstawowe informacje na górze promptu.
- [ ] Dla raportów z randek dodać opcję:
  - czy randka się odbyła.