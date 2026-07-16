# Story 53 — Input

## Input 1

Standard realizacji feature'ów CHAD

Od tego zadania wprowadzamy nowy obowiązkowy standard dla wszystkich nowych feature'ów.

Każdy feature otrzymuje kolejny numer.

Przykład:

53
54
55
56
...

Każdy feature posiada własny katalog dokumentacji.

Przykład:

documentation/dashboard/features/53/

(nie zakładaj jednak tej ścieżki — najpierw sprawdź aktualną konwencję dokumentacji i umieść katalog zgodnie z obowiązującą strukturą projektu).

Każdy katalog feature'a musi zawierać przynajmniej:

53/
    input.md
    report.md
    knowledge.md

input.md

Plik input.md jest źródłem prawdy.

Ma zawierać:

pełny prompt użytkownika,
wszystkie dodatkowe wymagania przekazane później,
wszystkie doprecyzowania,
decyzje użytkownika podjęte w trakcie realizacji.

Nie streszczaj promptu.

Nie skracaj go.

Ma być możliwe odtworzenie całego zadania wyłącznie na podstawie input.md.

report.md

report.md opisuje wykonanie zadania.

Powinien zawierać między innymi:

przeczytaną dokumentację,
znalezione podobne rozwiązania,
plan realizacji,
zmienione pliki,
nowe pliki,
zmienione metody,
przebieg implementacji,
wykonane testy,
problemy napotkane podczas realizacji,
decyzje architektoniczne,
ograniczenia,
elementy niewykonane,
propozycje kolejnych kroków.

Nie wolno pisać, że coś zostało przetestowane, jeżeli wykonano jedynie build albo typecheck.

knowledge.md

To jest najważniejszy nowy dokument.

Nie opisuje implementacji.

Opisuje wyłącznie wiedzę potrzebną do wykonania zadania.

Powinien zawierać listę odnośników do dokumentacji wraz z krótkim opisem:

Przykład:

documentation/ai-docs/what-and-where.md
Główny indeks dokumentacji.

documentation/dba/data-access.md
Opis komunikacji z Content Providerem.

documentation/dba/post-parent-item.md
Opis działania PostParentItem.

documentation/dashboard/views/features/views.md
Opis systemu Views.

documentation/dashboard/forms/features/forms.md
Opis systemu Forms.

Dzięki temu przy kolejnych poprawkach Claude nie będzie ponownie szukał całej dokumentacji.

Zadanie 53

To zadanie ma numer:

53

Jeżeli dokumentacja dla Feature 53 jeszcze nie istnieje, utwórz ją zgodnie z nowym standardem.

Jeżeli istnieje częściowo, uzupełnij ją.

Część 1 — Migracja actions → views

To jest pierwsze zadanie implementacyjne.

Ja ręcznie zmieniłem strukturę danych.

Teraz kod musi zostać do niej dostosowany.

Nowa ścieżka logical names:

actions/reports
↓

views/reports

Analogicznie:

actions/dates
↓

views/dates

actions/actions
↓

views/actions

actions/daily
↓

views/daily

To dotyczy wszystkich czterech istniejących widoków.

Przeanalizuj cały projekt i znajdź wszystkie miejsca używające:

actions/*

Zmodyfikuj je tak, aby korzystały z:

views/*

Dotyczy to między innymi:

dashboardu,
packages/dba,
API routes,
server actions,
helperów,
testów,
dokumentacji.

Nie pozostawiaj mieszanego modelu:

część actions/*
część views/*

Po migracji jedyną poprawną ścieżką ma być:

views/*

Część 2 — Poprawa formularza Reports

Obecna implementacja formularza Reports nie spełnia oczekiwań.

Należy ją przebudować.

Etap 1

Po wejściu do formularza Reports użytkownik nie powinien od razu widzieć edytora.

Najpierw powinien zostać wyświetlony pierwszy panel (zaokrąglona ramka).

Panel zawiera:

Data

Pole wyboru daty.

Rodzaj raportu

Lista:

Daygame
Nightgame
Organized party
Other

W kodzie zastosuj krótkie prefiksy:

Daygame → dg
Nightgame → ng
Organized party → op
Other → other
Pozostała część nazwy

Pole tekstowe.

Przykład:

galeria mokotów
Wygenerowana nazwa

Pole tylko do odczytu.

Generowane automatycznie.

Przykład:

26-05-06_dg_galeria mokotów

Nazwa powinna aktualizować się na żywo po zmianie:

daty,
rodzaju,
końcówki nazwy.

Nie wpisuje jej użytkownik.

Create

Na dole panelu znajduje się:

Create

Po kliknięciu:

tworzony jest nowy raport,
wykonywany jest cały flow Content Providera,
po sukcesie dane w górnym panelu zostają zablokowane do edycji,
dopiero wtedy pojawia się drugi panel.
Etap 2

Drugi panel zawiera wyłącznie edytor raportu.

Edytor powinien wykorzystywać istniejący wspólny komponent.

Układ:

╭────────────────────────────╮
│ panel danych raportu       │
╰────────────────────────────╯

╭────────────────────────────╮
│ edytor                     │
│                            │
│                            │
│                            │
╰────────────────────────────╯

Po utworzeniu raportu:

data,
rodzaj,
wygenerowana nazwa

stają się tylko do odczytu.

Nie można ich już zmienić.

Można edytować jedynie treść raportu.

Wymagania

Nie zgaduj architektury.

Najpierw:

przeczytaj dokumentację,
zaktualizuj dokumentację Feature 53,
przedstaw krótki plan,
dopiero rozpocznij implementację.

Na końcu uzupełnij:

53/report.md,
53/knowledge.md,
oraz what-and-where.md, jeśli nowe dokumenty powinny zostać dopisane do indeksu.

Uważam, że ten standard z numerowanymi katalogami (input.md, report.md, knowledge.md) bardzo ułatwi pracę przy długich feature'ach. Po miesiącu będzie można wejść do katalogu 53 i od razu zobaczyć: co było wymaganiem, jaka wiedza była potrzebna i co zostało faktycznie zrobione, bez przekopywania historii rozmów.

## Input 2

Przeczytałem Twój plan dla **Feature 53**.

Ogólnie kierunek jest dobry i możesz go realizować, ale przed rozpoczęciem implementacji wprowadź poniższe poprawki.

Nie rozpoczynaj jeszcze kodowania.

Najpierw zaktualizuj plan.

---

# 1. Nie analizuj rzeczy spoza aktualnego zadania

Mam wrażenie, że zbyt dużo czasu poświęcasz na analizowanie kodu, który nie jest potrzebny do wykonania aktualnego feature'a.

Przykład:

* dead code,
* stare komentarze,
* nieużywane helpery,
* potencjalne refaktoryzacje.

Jeżeli coś nie wpływa na aktualny feature:

* nie analizuj tego szczegółowo,
* nie opisuj przez kilka akapitów,
* nie próbuj tego naprawiać.

Jeżeli zauważysz coś istotnego, dopisz jedną krótką notatkę do `53/todos.md` albo do sekcji "Future improvements" w `report.md`.

Nie poświęcaj na to czasu podczas realizacji Feature 53.

Priorytetem jest wykonanie zadania użytkownika.

---

# 2. reports.ts

Nie zgadzam się z proponowaną nazwą:

```text
views-reports.ts
```

To, że aktualnie dane znajdują się pod:

```text
views/reports
```

nie powinno decydować o nazwie pliku.

Plik powinien opisywać odpowiedzialność modułu.

Jeżeli moduł odpowiada za Reports, preferowaną nazwą jest:

```text
reports.ts
```

Jeżeli istnieje rzeczywisty konflikt nazw w projekcie, pokaż go i uzasadnij inną nazwę.

Nie zmieniaj nazwy tylko dlatego, że logical path nazywa się `views`.

---

# 3. Generated name

To jest bardzo ważne wymaganie.

Po kliknięciu:

```text
Create
```

wygenerowana nazwa raportu staje się jego tożsamością.

Od tego momentu:

* data jest zablokowana,
* rodzaj raportu jest zablokowany,
* suffix jest zablokowany,
* wygenerowana nazwa jest zablokowana.

Nie wolno już automatycznie przeliczać nazwy.

Jeżeli użytkownik chce zmienić:

* datę,
* rodzaj,
* suffix,

powinien utworzyć nowy raport.

Nie próbuj wspierać zmiany nazwy istniejącego raportu.

---

# 4. Test całego flow UI jest obowiązkowy

Nie chcę zakończenia zadania po:

* build,
* typecheck,
* testach API.

Po implementacji wykonaj cały scenariusz użytkownika.

Kolejno:

1. otwórz Forms;
2. wybierz Reports;
3. wybierz datę;
4. wybierz rodzaj raportu;
5. wpisz suffix;
6. sprawdź wygenerowaną nazwę;
7. kliknij Create;
8. sprawdź, że pola zostały zablokowane;
9. sprawdź, że pojawił się edytor;
10. wpisz treść;
11. kliknij Save;
12. przejdź do Views;
13. wybierz Reports;
14. otwórz właśnie utworzony raport;
15. sprawdź, że treść jest poprawna.

Jeżeli nie możesz wykonać któregoś kroku, napisz dokładnie dlaczego.

Nie pisz, że UI zostało zweryfikowane, jeżeli wykonano tylko build albo analizę kodu.

---

# 5. Nowy standard dokumentacji Feature

Do Feature 53 dodaj jeszcze jeden dokument:

```text
53/
    input.md
    knowledge.md
    report.md
    todos.md
```

`todos.md` ma zawierać wyłącznie rzeczy świadomie odłożone na później.

Przykład:

* migracja starych raportów,
* kolejne usprawnienia Reports,
* pomysły nieobjęte aktualnym feature'em.

Nie wpisuj tam bugów naprawionych w Feature 53.

---

# 6. Nie rozszerzaj samodzielnie zakresu zadania

Jeżeli podczas implementacji znajdziesz coś ciekawego, ale nieobjętego Feature 53:

* nie implementuj tego,
* nie refaktoryzuj,
* nie poprawiaj przy okazji.

Zapisz krótką notatkę do `todos.md`.

Feature powinien realizować dokładnie to, o co został poproszony.

---

Po uwzględnieniu powyższych uwag zaktualizuj plan Feature 53 i dopiero rozpocznij implementację.

## Input 3

Korekta standardu dokumentacji:

Nie nazywaj tego `Feature 53`.

Od teraz ta jednostka pracy ma nazywać się:

```text
Story 53
```

Numerowane katalogi dotyczą całych story, a nie pojedynczych feature'ów.

Story może obejmować:

* nowy feature,
* migrację,
* poprawki istniejącego feature'a,
* zmiany w kilku warstwach projektu,
* testy,
* dokumentację,
* świadomie odłożone dalsze zadania.

Dla obecnego zadania utwórz katalog:

```text
documentation/stories/53/
```

Jeżeli aktualna struktura dokumentacji wymaga innej lokalizacji, najpierw sprawdź `documentation/ai-docs/what-and-where.md`, ale nazwa jednostki ma pozostać:

```text
Story 53
```

W katalogu mają znajdować się:

```text
documentation/stories/53/
├── input.md
├── knowledge.md
├── report.md
└── todos.md
```

#### input.md

Zawiera pełne wymagania wejściowe dla Story 53 oraz późniejsze korekty i doprecyzowania użytkownika.

Nie skracaj ich i nie zamieniaj w ogólne podsumowanie.

#### knowledge.md

Zawiera odnośniki do dokumentacji i kodu potrzebnych do realizacji Story 53 wraz z krótką informacją, dlaczego dane źródło było potrzebne.

#### report.md

Zawiera końcowy raport z realizacji całego Story 53:

* wykonany zakres,
* zmienione pliki,
* decyzje,
* testy,
* rzeczywiste wyniki,
* problemy,
* elementy niewykonane.

#### todos.md

Zawiera wyłącznie rzeczy świadomie odłożone poza zakres Story 53.

W całym planie, dokumentacji i raporcie zamień określenia:

```text
Feature 53
```

na:

```text
Story 53
```

Dokumenty opisujące konkretne funkcjonalności, takie jak Reports Form albo Reports View, nadal mogą być dokumentacją feature'ów w swoich właściwych katalogach.

Natomiast katalog numerowany `53` opisuje całe story i łączy wszystkie zmiany wykonywane w ramach tego zadania.

Po tej korekcie zaktualizuj plan Story 53 i dopiero potem rozpocznij implementację.

## Input 4

Mała korekta standardu Story.

Pozostajemy przy katalogach wyłącznie numerycznych.

Nie twórz katalogów typu:

```text
53_reports
53_reports-first-version
Story 53
```

Docelowo cała dokumentacja ma być możliwa do migracji do Content Providera, gdzie fizyczne foldery są wyłącznie numeryczne, a nazwa logiczna znajduje się w `config.yaml`.

Dlatego obowiązująca struktura ma wyglądać tak:

```text
stories/
    53/
        01_input.md
        02_plan.md
        03_knowledge.md
        04_todos.md
        05_report.md
```

Numer Story jest nazwą katalogu.

Nazwa Story będzie przechowywana jako metadana (analogicznie do `config.yaml` w Content Providerze), a nie jako część fizycznej nazwy katalogu.

Proszę zaktualizuj plan i dokumentację do tej konwencji.

## Input 5

Popraw dokumentację Story.

Zasady standardu Story przenieś do jednego wspólnego pliku:

```text
documentation/stories/standard.md
```

Nie powtarzaj ich w `53/01_input.md`.

`01_input.md` ma zawierać wyłącznie:

```text
# Story 53 — Input

## Input 1
[pełny pierwszy prompt użytkownika]

## Input 2
[pełny kolejny input użytkownika]
```

Bez opisu standardu, komentarzy, streszczeń i wyjaśnień organizacyjnych.

Standard struktury `01_input.md`, `02_plan.md`, `03_knowledge.md`, `04_todos.md`, `05_report.md` opisz tylko raz w `stories/standard.md`.

## Input 6

generated name niech bedzie obok przycisku create. oczywiscie mowie o formularzu reports. i w sumie popraw nazwy w menu forms zeby wszystkie byly duzymi literami tam jak w menu views sa opisane widoki
