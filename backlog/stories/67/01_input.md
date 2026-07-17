# Story 67 — Input

## Input 1

# Prompt startowy do Claude Code — Story „History / Daily Tracker / Dropbox”

Chcę utworzyć **nowe, osobne Story z nowym numerem** dotyczące historii zmian danych Content Providera synchronizowanych przez Dropbox.

Najpierw wykonaj analizę, utwórz dokumentację Story i pokaż plan do akceptacji. **Nie implementuj kodu przed moją zgodą.**

---

## 1. Kontekst projektu

Projekt CHAD jest monorepo. Content Provider działa jako osobne repozytorium podłączone do CHAD jako git submodule w:

```text
packages/net-content-provider
```

Nie modyfikuj Content Providera bez wyraźnej potrzeby. Ta funkcja ma powstać głównie po stronie CHAD:

```text
Dashboard
    ↓
DBA
    ↓
nowy package dropbox-sync
    ↓
Dropbox API
    ↓
MongoDB — lokalna historia zmian
```

Frontend nie może rozmawiać bezpośrednio z Dropboxem.

Przed planowaniem:

1. przeczytaj aktualny spis dokumentacji i obowiązujące zasady projektu;
2. sprawdź aktualny standard Story i właściwą lokalizację nowych Story;
3. sprawdź aktualną strukturę workspace i nazwy package'y;
4. przeczytaj dokumentację Dashboarda, DBA, MongoDB, Dev Panelu, deploymentu oraz standardów UI;
5. nie zakładaj istnienia `README.md`, `CLAUDE.md` ani `AGENTS.md`, dopóki repozytorium tego nie potwierdzi;
6. sprawdź istniejące implementacje menu `Views`, `Leads`, `DashboardPageShell`, obsługi MongoDB i background jobs, zanim zaproponujesz nowe rozwiązanie.

Utwórz nowe Story z kolejnym wolnym numerem zgodnie z aktualnym standardem projektu.

---

## 2. Cel funkcji

W Dashboardzie ma powstać nowa główna sekcja:

```text
History
    Daily Tracker
```

Układ menu `History` ma być zgodny z aktualnym sposobem działania sekcji `Views`.

Pierwsza pozycja:

```text
History → Daily Tracker
```

ma pokazywać historię zmian Dropbox dla folderu danych tabeli Daily Tracker.

Identyfikator przekazany przeze mnie:

```text
8b603669-f8e6-4224-bd78-a474998995fa-04-02
```

traktuj jako skrót:

```text
repo: 8b603669-f8e6-4224-bd78-a474998995fa
loca: 04/02
```

Najpierw potwierdź w rzeczywistej strukturze Dropbox/Content Providera dokładną ścieżkę. Nie zgaduj i nie sklejaj ścieżki na ślepo.

W przyszłości `History` ma obsługiwać kolejne foldery i repozytoria, ale pierwsza wersja ma być ograniczona do Daily Tracker.

---

## 3. Nowy package `dropbox-sync`

Dodaj nowy package w CHAD, proponowana nazwa:

```text
packages/dropbox-sync
```

Najpierw sprawdź konwencję nazw package'y w monorepo. Jeżeli obecna konwencja wymaga innej nazwy, zaproponuj ją w planie, ale nie zmieniaj nazwy samowolnie bez uzasadnienia.

Odpowiedzialność package'u:

- uwierzytelnianie do Dropbox API;
- pobieranie zmian folderu przez cursor;
- pobieranie metadanych plików;
- pobieranie revisions plików tekstowych;
- pobieranie poprzedniej i aktualnej wersji pliku;
- obliczanie minimalnego diffu;
- normalizacja zdarzeń Dropbox do modelu CHAD;
- grupowanie zdarzeń;
- zapis historii do MongoDB;
- okresowe synchronizacje;
- backfill historii dostępnej jeszcze w Dropbox;
- diagnostyka integracji.

Package nie może zawierać komponentów UI ani logiki konkretnej strony Dashboarda.

---

## 4. Uwierzytelnianie Dropbox

Nie używaj loginu i hasła do konta Dropbox.

Przygotuj integrację przez oficjalne Dropbox API i oficjalny SDK, z użyciem aplikacji Dropbox oraz bezpiecznych sekretów, np.:

```text
DROPBOX_APP_KEY
DROPBOX_APP_SECRET
DROPBOX_REFRESH_TOKEN
```

lub innego oficjalnie rekomendowanego mechanizmu, który potwierdzisz w aktualnej dokumentacji Dropbox.

Wymagania:

- żadnych sekretów w Git;
- żadnych sekretów wpisanych na stałe w kodzie;
- konfiguracja zgodna z obecnym standardem `.env` projektu;
- osobne wartości dla local/test/prod;
- minimalny wymagany zakres uprawnień;
- preferowany dostęp tylko do potrzebnego katalogu, jeżeli Dropbox API pozwala to zrobić;
- przygotuj dokładną instrukcję czynności ręcznych w panelu Dropbox App Console;
- nie zapisuj tokenów w logach ani odpowiedziach API;
- nie proś mnie o podawanie hasła do konta Dropbox.

---

## 5. Synchronizacja zmian

Do monitorowania użyj mechanizmu cursor:

```text
/files/list_folder
/files/list_folder/continue
```

lub aktualnego oficjalnego odpowiednika.

Wymagania:

1. pierwsze uruchomienie:
   - rozpoznanie wskazanego folderu;
   - pobranie dostępnej historii/backfill w granicach możliwości Dropbox;
   - zapisanie kursora;
2. kolejne uruchomienia:
   - pobieranie tylko nowych zmian od ostatniego kursora;
   - brak ponownego skanowania całej historii;
3. synchronizacja ma być idempotentna;
4. ponowne przetworzenie tego samego Dropbox eventu lub revision nie może tworzyć duplikatów;
5. cursor ma być przechowywany trwale w MongoDB;
6. awaria po częściowym zapisie nie może powodować utraty zmian;
7. aktualizacja kursora dopiero po bezpiecznym zapisaniu przetworzonych zdarzeń;
8. błędy Dropbox API mają być czytelnie logowane i widoczne w Dev Panelu;
9. nie blokuj requestu użytkownika długim backfillem;
10. backfill i synchronizacja powinny działać jako osobne zadanie/background worker zgodne z architekturą projektu.

Sprawdź, czy projekt ma już standard dla background jobs. Nie dodawaj ciężkiego frameworka, jeżeli wystarczy prosty mechanizm zgodny z obecnym runtime.

---

## 6. Minimalny zakres danych

Nie chcę archiwizować nadmiarowych danych ani kopiować całego Dropboxa.

Na stałe przechowuj tylko minimum potrzebne do:

- wyświetlenia tabeli historii;
- pokazania, co się zmieniło;
- odtworzenia wersji pliku z diffów i okresowych snapshotów;
- diagnostyki zgłoszenia typu „zniknęły dane".

W pierwszej wersji śledź tylko dane Daily Tracker i pliki tekstowe Content Providera, przede wszystkim:

```text
config.yaml
body.txt
body
body.yaml
body.json
```

Uwzględnij faktyczny model plików używany w tym repozytorium. Nie implementuj archiwizacji binariów.

Dla każdego zdarzenia zapisuj tylko potrzebne metadane, np.:

```text
id
timestamp
repoId
loca
element
fileName
operation
dropboxFileId
dropboxRevision
previousRevision
pathDisplay / względna ścieżka
previousSize
currentSize
linesAdded
linesRemoved
diff
groupId
source
syncRunId
createdAt
```

Nie zapisuj pełnych absolutnych ścieżek serwera, jeżeli nie są konieczne.

---

## 7. MongoDB — osobne kolekcje

Historia ma być zapisywana w MongoDB w osobnych kolekcjach, niezależnie od dokumentów tabeli.

Preferowany model:

```text
history_events
history_snapshots
history_sync_state
```

Najpierw sprawdź standard nazewnictwa kolekcji w projekcie i dopasuj nazwy.

### `history_events`

Jeden dokument reprezentuje zmianę lub logicznie pogrupowaną operację.

Przykładowe pola:

```json
{
  "_id": "...",
  "scope": "daily-tracker",
  "repoId": "8b603669-f8e6-4224-bd78-a474998995fa",
  "loca": "04/02",
  "element": "84",
  "fileName": "body.txt",
  "operation": "modified",
  "timestamp": "2026-07-17T11:13:00Z",
  "dropboxFileId": "...",
  "previousRevision": "...",
  "currentRevision": "...",
  "previousEventId": "...",
  "storageType": "diff",
  "linesAdded": 3,
  "linesRemoved": 11,
  "diff": "...",
  "groupId": "...",
  "syncRunId": "..."
}
```

### `history_snapshots`

Pełna treść pliku zapisywana tylko okresowo lub w sytuacji wymagającej zabezpieczenia danych.

Przykładowe pola:

```json
{
  "_id": "...",
  "scope": "daily-tracker",
  "repoId": "...",
  "loca": "04/02",
  "element": "84",
  "fileName": "body.txt",
  "versionNumber": 25,
  "dropboxRevision": "...",
  "timestamp": "...",
  "content": "...",
  "contentHash": "...",
  "reason": "periodic"
}
```

### `history_sync_state`

Przechowuje co najmniej:

```text
scope
folder identifier
Dropbox cursor
last successful sync
last attempted sync
status
last error
backfill status
```

Dodaj indeksy zapewniające:

- unikalność eventu/revision;
- szybkie sortowanie po dacie;
- filtrowanie po scope, repoId, loca, element, fileName, operation;
- szybkie znalezienie poprzedniej wersji;
- brak duplikatów po ponowieniu synchronizacji.

---

## 8. Historia jak Git: diffy i okresowe snapshoty

Chcę przechowywać historię podobnie do Gita:

```text
snapshot
diff
diff
diff
...
kolejny snapshot
diff
...
```

Nie zapisuj pełnej kopii pliku przy każdej zmianie.

Dla modyfikacji pliku:

1. pobierz poprzednią revision;
2. pobierz aktualną revision;
3. oblicz tekstowy diff;
4. zapisz tylko diff i metadane;
5. usuń tymczasowe kopie po przetworzeniu.

Snapshot utwórz, gdy zachodzi przynajmniej jeden warunek:

```text
- od ostatniego snapshotu było 25 zmian;
- od ostatniego snapshotu minęło 7 dni;
- plik lub element został usunięty;
- zmiana obejmuje więcej niż 30% zawartości pliku;
- nie istnieje jeszcze żaden snapshot bazowy.
```

Wartości 25 / 7 dni / 30% umieść w konfiguracji, nie na stałe w wielu miejscach.

Dodatkowe zasady:

- przy usunięciu zapisz ostatni pełny snapshot małego pliku tekstowego;
- nie zapisuj snapshotu binarnego;
- diff ma mieć limit rozmiaru i liczby linii;
- zaproponuj rozsądne domyślne limity, np. maksymalnie 500 linii i 100 KB;
- gdy diff przekracza limit, zapisz podsumowanie:
  - liczba dodanych/usuniętych linii;
  - stary/nowy rozmiar;
  - `diffStored: false`;
  - powód, np. `diff-too-large`;
- pełne wersje pobieraj tylko tymczasowo;
- nie zapisuj tych samych treści wielokrotnie;
- zastosuj hash treści do deduplikacji, jeśli ma to realną wartość.

Zaprojektuj i przetestuj możliwość odtworzenia wersji:

```text
najbliższy wcześniejszy snapshot
+ kolejne diffy
= wskazana wersja
```

W pierwszym Story nie musi powstać przycisk „Przywróć", ale mechanizm danych ma umożliwiać późniejsze bezpieczne odtworzenie wersji.

---

## 9. Operacje i grupowanie

Normalizuj operacje do:

```text
added
modified
deleted
moved
```

W UI pokaż po polsku:

```text
Dodanie
Edycja
Usunięcie
Przeniesienie
```

Dropbox może zwrócić serię zdarzeń, np.:

```text
utworzono folder 84
dodano 84/config.yaml
dodano 84/body.txt
```

w tej samej sekundzie lub krótkim oknie.

Nie pokazuj ich jako setek niezależnych wierszy.

Zaprojektuj deterministyczne grupowanie, np. według:

```text
repoId + loca + element + operation + okno czasu
```

Domyślne okno czasu umieść w konfiguracji, np. 2–5 sekund.

Przykład jednego wiersza:

```text
17.07.2026 | 02:01 | 84 | Dodanie | folder + config.yaml + body.txt
```

Po rozwinięciu pokaż wszystkie zdarzenia składowe.

Nie grupuj zmian, jeżeli mogłoby to ukryć dwie niezależne operacje.

---

## 10. Nowa sekcja Dashboarda

Dodaj główne menu:

```text
History
```

Zachowanie i układ menu mają być takie jak w istniejącej sekcji:

```text
Views
```

Pierwszy przycisk/pozycja:

```text
Daily Tracker
```

Po kliknięciu ma otwierać stronę historii Daily Tracker.

Strona ma używać aktualnych standardów Dashboarda, w tym:

- `DashboardPageShell`;
- brak globalnego scrolla;
- scroll wewnątrz ramek;
- poprawne działanie desktop/mobile;
- dark mode;
- standardowy toolbar;
- standardowe loading, empty i error states;
- zgodność z aktualnym providerem historii Back/Forw, jeżeli dotyczy;
- brak samodzielnego wymyślania nowych wzorców, jeżeli istnieją już komponenty do ponownego użycia.

---

## 11. UI historii

PDF z przykładową tabelą dodam do repozytorium.

Przed implementacją:

1. znajdź ten PDF;
2. podaj jego dokładną ścieżkę;
3. potraktuj go jako referencję danych i ogólnego wyglądu;
4. nie kopiuj bezmyślnie layoutu, jeśli koliduje ze standardami Dashboarda.

Tabela ma mieć kolumny:

```text
Data
Godzina
Element
Operacja
Obiekt
Uwagi
```

`Element` ma zawierać krótki numer, np.:

```text
84
```

a nie pełną ścieżkę.

Kolory mają czytelnie rozróżniać:

- dodania;
- edycje;
- usunięcia;
- przeniesienia.

Zachowaj dostępność i czytelność w dark mode; nie opieraj znaczenia wyłącznie na kolorze.

Dodaj:

- sortowanie po dacie;
- filtr zakresu dat;
- filtr operacji;
- filtr elementu;
- filtr pliku;
- limit/paginację;
- odświeżanie;
- informację o ostatniej udanej synchronizacji;
- ręczne uruchomienie synchronizacji tylko w DEV/TEST lub dla uprawnionego użytkownika;
- stan „synchronizacja w toku".

---

## 12. Widok szczegółów

Kliknięcie wiersza ma otworzyć szczegóły podobnie do wzorca używanego w `Leads` lub innego aktualnego standardu master-detail.

Pokaż:

```text
timestamp
element
operacja
pliki w grupie
pełna względna ścieżka Dropbox
revision przed i po
rozmiar przed i po
liczba dodanych/usuniętych linii
diff
metadata Dropbox
syncRunId
informacja, czy istnieje snapshot
powód utworzenia snapshotu
```

Diff pokaż czytelnie:

```text
- usunięta linia
+ dodana linia
```

Dodaj możliwość:

```text
Pokaż diff
Pokaż snapshot bazowy
Odtwórz podgląd wersji
```

W pierwszej wersji nie dodawaj destrukcyjnego przywracania danych do Dropbox ani Content Providera.

---

## 13. DBA i API

Dashboard ma korzystać wyłącznie z DBA.

Zaprojektuj endpointy zgodne z aktualnym standardem projektu. Nie wymuszam nazw, ale funkcjonalnie potrzebne są operacje odpowiadające:

```text
GET history scopes/menu
GET history events dla Daily Tracker
GET szczegóły eventu/grupy
GET diff
GET odtworzony podgląd wersji
GET status synchronizacji
POST uruchom synchronizację — tylko uprawniony DEV/TEST
```

API musi obsługiwać:

```text
dateFrom
dateTo
operation
element
fileName
limit
cursor/page
sort
```

Nie zwracaj sekretów Dropbox, tokenów ani niepotrzebnych surowych odpowiedzi SDK.

---

## 14. Bezpieczeństwo i prywatność

Historia może zawierać treści użytkowników.

Wymagania:

- nie wystawiaj package'u `dropbox-sync` publicznie;
- frontend nie dostaje tokenów Dropbox;
- dostęp tylko przez DBA;
- sprawdź istniejący mechanizm uwierzytelniania i izolacji użytkowników;
- nie pozwól użytkownikowi zmienić `repoId`/`loca` tak, aby odczytać historię innych repozytoriów;
- scope `Daily Tracker` ma być mapowany po stronie serwera;
- żadnych surowych dowolnych ścieżek przekazanych przez klienta;
- zabezpieczenie przed path traversal;
- logi nie mogą zawierać tokenów ani pełnej treści plików;
- pełny diff pokazuj tylko użytkownikowi z prawem do danego scope;
- test/prod mają osobne konfiguracje;
- ręczna synchronizacja i szczegółowa diagnostyka zgodnie z istniejącymi flagami DEV/TEST;
- uwzględnij rate limits Dropbox i retry z backoffem;
- nie wykonuj nieograniczonych równoległych pobrań revisions.

---

## 15. Retencja i ograniczenie rozmiaru

Zaprojektuj system tak, aby nie rósł bez kontroli.

Proponowane zasady do oceny:

- metadane eventów przechowuj długoterminowo;
- diffy przechowuj przez konfigurowalny okres, np. 12 miesięcy;
- snapshoty zachowuj dłużej niż diffy;
- snapshot po usunięciu zachowuj bezterminowo lub przez osobny dłuższy okres;
- limit rozmiaru diffu;
- limit maksymalnego rozmiaru śledzonego pliku;
- brak historii binariów;
- job czyszczący wygasłe diffy;
- po usunięciu diffu pozostaw metadane:
  - co zmieniono;
  - kiedy;
  - ile linii dodano/usunięto;
  - dlaczego szczegółowy diff nie jest już dostępny.

Nie implementuj automatycznego kasowania bez testów i jasnej konfiguracji.

---

## 16. Backfill dostępnej historii Dropbox

Na pierwszym uruchomieniu spróbuj pobrać historię dostępnych revisions i zmian dla wskazanego folderu, w zakresie dostępnym dla aktualnego planu Dropbox.

Wymagania:

- nie zakładaj konkretnego okresu retencji bez sprawdzenia odpowiedzi API;
- nie deklaruj, że API zwróci historię folderu, której Dropbox faktycznie nie udostępnia;
- rozróżnij:
  - historię revisions istniejących plików;
  - deleted entries;
  - zmiany wykrywane od momentu zapisania kursora;
  - pełny Business audit log, który może nie być dostępny na zwykłym koncie;
- w planie jasno opisz, co da się pobrać wstecz, a co będzie kompletne dopiero od momentu uruchomienia `dropbox-sync`;
- pokaż w UI informację:
  - „historia zaimportowana z Dropbox";
  - „historia monitorowana lokalnie od …";
  - ewentualne luki.

---

## 17. Odporność na awarie

Synchronizacja ma być odporna na:

- restart QNAP-a;
- restart kontenera;
- timeout Dropbox;
- rate limit;
- utratę połączenia;
- błąd pobrania jednej revision;
- powtórzenie tego samego eventu;
- częściowe zapisanie batcha;
- brak poprzedniej revision;
- usunięcie pliku przed pobraniem jego treści;
- błędny YAML lub tekst niekodowany w UTF-8;
- bardzo duży plik.

Nie pozwól, aby jeden wadliwy plik zatrzymał całą synchronizację.

Zapisuj status synchronizacji i błędy diagnostyczne w sposób zgodny z aktualnym systemem observability/Dev Panelu.

---

## 18. Testy

Przygotuj plan testów obejmujący co najmniej:

### Unit

- normalizacja ścieżki do `element`;
- mapowanie operacji Dropbox;
- generowanie diffu;
- limit diffu;
- decyzja o snapshocie:
  - pierwsza wersja;
  - 25 zmian;
  - 7 dni;
  - usunięcie;
  - zmiana >30%;
- grupowanie folder + config + body;
- brak fałszywego grupowania;
- idempotencja eventu;
- rekonstrukcja wersji ze snapshotu i diffów;
- obsługa brakującej poprzedniej revision.

### Integration

- zapis eventów i snapshotów do MongoDB;
- unikalne indeksy;
- ponowienie batcha bez duplikatów;
- cursor aktualizowany dopiero po zapisie;
- restart synchronizacji;
- filtrowanie i paginacja API;
- uprawnienia do scope;
- brak możliwości wskazania dowolnej ścieżki;
- redakcja sekretów.

### UI

- tabela jak w referencyjnym PDF;
- filtry;
- grupowanie;
- szczegóły;
- diff;
- loading/empty/error;
- dark mode;
- desktop/mobile;
- wewnętrzny scroll;
- brak globalnego scrolla.

### Test end-to-end

Przygotuj mały testowy folder Dropbox lub fixture i odtwórz scenariusz:

```text
utworzenie elementu 84
dodanie config.yaml
dodanie body.txt
edycja body.txt
usunięcie elementu 84
```

Oczekiwany rezultat:

- czytelne wiersze historii;
- poprawne grupowanie;
- diff edycji;
- snapshot przed usunięciem;
- możliwość odtworzenia podglądu ostatniej wersji;
- brak duplikatów po ponownej synchronizacji.

---

## 19. Deployment

Uwzględnij:

- local Mac;
- local Docker;
- QNAP test;
- QNAP prod;
- istniejące standardy skryptów i `.env`;
- MongoDB używane przez CHAD;
- brak osobnego publicznego portu dla `dropbox-sync`, jeśli package działa jako biblioteka/worker w DBA;
- restart-safe background sync;
- health/status synchronizacji;
- diagnostykę w Dev Panelu.

Najpierw oceń, czy `dropbox-sync` powinien być:

```text
A. biblioteką używaną przez DBA,
B. osobnym wewnętrznym workerem/kontenerem,
C. częścią istniejącego procesu DBA.
```

Zarekomenduj najprostszy wariant zgodny z obecną architekturą. Nie twórz nowego kontenera bez realnej potrzeby.

---

## 20. Dokumentacja Story

W nowym Story zapisz:

- dokładny input;
- plan;
- wiedzę z audytu;
- decyzje architektoniczne;
- model MongoDB;
- model synchronizacji;
- zasady snapshotów;
- limity i retencję;
- bezpieczeństwo;
- testy;
- deployment;
- ryzyka;
- pytania wymagające decyzji;
- checklistę zgodną z aktualnym standardem Story.

Nie implementuj kodu na etapie tworzenia Story.

---

## 21. Co masz mi pokazać przed akceptacją

Przed implementacją pokaż:

1. numer i ścieżkę nowego Story;
2. znalezioną dokładną ścieżkę Dropbox Daily Tracker;
3. znaleziony PDF referencyjny;
4. proponowaną architekturę;
5. decyzję: biblioteka czy osobny worker;
6. model `history_events`;
7. model `history_snapshots`;
8. model `history_sync_state`;
9. sposób generowania i przechowywania diffów;
10. reguły snapshotów;
11. reguły grupowania;
12. sposób backfillu;
13. ograniczenia zwykłego konta Dropbox;
14. sposób autoryzacji Dropbox;
15. endpointy DBA;
16. makietę/strukturę UI `History → Daily Tracker`;
17. plan testów;
18. plan deploymentu;
19. listę plików/package'y do zmiany;
20. ryzyka i otwarte decyzje.

Na końcu daj jednoznaczną rekomendację, czy zakres powinien zostać:

```text
- jednym Story,
- czy podzielony na:
  1. Dropbox sync + Mongo history,
  2. UI History,
  3. późniejsze przywracanie wersji.
```

Jeżeli proponujesz podział, nadal utwórz główne Story opisujące całość i jasno wydziel kolejne etapy.
