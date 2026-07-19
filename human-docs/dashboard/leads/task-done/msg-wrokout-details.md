# Task dla Cline — nowy widok szczegółów msg workout z podglądem i edytorem

Trzeba zaimplementować nowy widok dla pojedynczego `msg workout`.

Obecnie w zakładce `Leads`, po wejściu w szczegóły leada, w ramce `Msg workouts` widać listę workoutów danego leada.

Teraz po kliknięciu konkretnego workoutu z tej listy ma otworzyć się osobny widok podobny do wcześniejszych widoków z `Preview` i `Editor`.

W tym widoku użytkownik ma widzieć zawartość `text-itemu` msg workout i móc ją edytować.

---

# Co ma działać

1. Użytkownik wchodzi w:

`Leads`

2. Otwiera konkretnego leada.

3. W ramce `Msg workouts` widzi listę workoutów.

4. Klika jeden workout, np.:

`26-07-09`

5. Otwiera się nowy widok szczegółów tego workoutu.

6. Widok ma mieć:

* nazwę workoutu,
* informację do jakiego leada należy,
* zakładkę / sekcję `Preview`,
* zakładkę / sekcję `Editor`,
* body workoutu w podglądzie,
* body workoutu w edytorze,
* przycisk `Save`.

7. Po edycji i kliknięciu `Save` body text-itemu ma zostać zapisane przez Content Providera.

---

# Ścieżki i logika danych

To jest `text-item`, który znajduje się pod folderem `msg workout`.

Przykład logicznej ścieżki nazw:

`leads, all items, 26-07-06_pn_Karolina_ruda, msg workout, 26-07-09`

Ale w nowej logice nie powinniśmy za każdym razem resolve’ować całej ścieżki nazw, jeśli znamy już `loca`.

---

# Preferowany flow

Po wejściu w szczegóły leada mamy już:

* `leadName`,
* `leadLoca`,
* listę children z folderu `msg workout`,
* dla każdego workoutu jego nazwę i `loca` / adres numeryczny, jeśli Content Provider zwraca go w children.

Po kliknięciu workoutu preferowane jest przekazanie do widoku:

* `repoGuid`,
* `leadName`,
* `leadLoca`,
* `workoutName`,
* `workoutLoca`.

Nie hardcoduj żadnego `loca`.

`workoutLoca` może być użyte tylko wtedy, gdy przyszło z Content Providera.

---

# Pobranie konkretnego workoutu

Jeżeli mamy `workoutLoca`, pobierz item przez:

```json
["IRepoService","IItemWorker","GetItem","<repoGuid>","<workoutLoca>"]
```

Przykład:

```json
["IRepoService","IItemWorker","GetItem","21d11bdc-f1f4-44d1-b61a-3fa6b039c641","03/06/89/03/02"]
```

Jeżeli z listy nie mamy `workoutLoca`, ale mamy `msgWorkoutFolderLoca`, użyj:

```json
["IRepoService","IItemWorker","GetByNames2","<repoGuid>","<msgWorkoutFolderLoca>","<workoutName>"]
```

Nie używaj starego pełnego:

```json
["IRepoService","IItemWorker","GetByNames","<repoGuid>","leads","all items","<leadName>","msg workout","<workoutName>"]
```

chyba że nie ma innej istniejącej możliwości i wyraźnie to uzasadnisz.

---

# Zapis body workoutu

Do zapisu użyj `Put` na `workoutLoca`:

```json
["IRepoService","IItemWorker","Put","<repoGuid>","<workoutLoca>","<body>"]
```

Przykład:

```json
["IRepoService","IItemWorker","Put","21d11bdc-f1f4-44d1-b61a-3fa6b039c641","03/06/89/03/02","<body workoutu>"]
```

Nie zapisuj przez nazwę, jeśli masz `workoutLoca`.

---

# UI

Widok ma być podobny do istniejących widoków z podglądem i edytorem.

Najpierw znajdź istniejący działający widok, który ma:

* `Preview`,
* `Editor`,
* zapis `Save`,
* edycję text-itemu,
* najlepiej CodeMirror albo używany już edytor.

Nie kopiuj kodu bez analizy.

Jeśli istnieje wspólny komponent, użyj go.

Jeśli nie istnieje, rozważ wydzielenie wspólnego komponentu, ale nie rób dużego refactoru bez potrzeby.

---

# Ważne wymagania UI

1. Kliknięcie workoutu z listy otwiera nowy widok.
2. Widok ma mieć działający back / powrót do szczegółów leada.
3. Edytor ma mieć własny scroll, a nie tworzyć scroll całej strony.
4. Podgląd ma mieć własny scroll.
5. `Save` ma faktycznie zapisywać body przez `IItemWorker.Put`.
6. Po zapisie UI ma pokazać informację, że zapisano.
7. Jeśli zapis się nie uda, UI ma pokazać błąd.
8. Nie maskuj błędów pustym stanem.
9. Nie pobieraj listy wszystkich leadów tylko po to, żeby otworzyć jeden workout.
10. Nie pobieraj body wszystkich workoutów na liście — body pobieramy dopiero po kliknięciu konkretnego workoutu.

---

# Edge cases

Obsłuż:

1. Workout istnieje i ma body.
2. Workout istnieje, ale body jest puste.
3. Workout został usunięty lub `workoutLoca` jest nieaktualne.
4. Brak `workoutLoca` w URL / state.
5. `Put` zwraca błąd.
6. Użytkownik edytuje body i wraca bez zapisu.
7. Nazwa workoutu zawiera dopisek po średniku, np. `26-06-19; ai bot`.
8. Nazwa workoutu zawiera suffix, np. `26-07-09_b`.

---

# Dokumenty do przeczytania przed implementacją

1. `architecture/chad-dba/project-goal.md`
2. `architecture/chad-dba/import-dba.md`
3. `architecture/chad-dba/data-access.md`
4. `architecture/chad-dba/cp-paths.md`
5. `architecture/chad-dba/resolve-paths.md`
6. `architecture/chad-dba/post-parent-item.md`
7. `architecture/ai-docs/feature-documentation-rules.md`
8. istniejące feature’y dotyczące:

   * `leads`
   * `msg workout`
   * text-item editor
   * preview/editor view
   * CodeMirror
9. istniejące bugi dotyczące:

   * scrolla w edytorach,
   * zapisu `Put`,
   * `GetByNames2`,
   * pustego response body z `/invoke`.

---

# Pliki do sprawdzenia

Najpierw znajdź realne odpowiedniki w projekcie, ale prawdopodobnie trzeba sprawdzić:

* widok szczegółów leada,
* API route od lead details,
* aktualną listę msg workouts,
* istniejący widok text-item z preview/editor,
* wrappery API w `chad-dba`,
* helpery do `GetItem`,
* helpery do `Put`,
* helpery do `GetByNames2`.

Nie zgaduj nazw plików. Znajdź je w kodzie.

---

# Zakazy

Nie wolno:

* hardcodować `03/06/89/03/02`,
* traktować logical names jako filesystem path,
* używać starego `GetByNames` do pełnej ścieżki, jeśli można użyć `GetItem` albo `GetByNames2`,
* czytać Dropboxa / filesystemu bezpośrednio,
* pobierać body wszystkich workoutów z listy,
* maskować błędów pustą listą,
* robić drugiego edytora, jeśli istnieje już komponent do edycji text-itemów,
* kopiować kodu bez sprawdzenia istniejących komponentów,
* pisać “działa”, jeśli nie sprawdziłeś zapisu.

---

# Implementacja — oczekiwany flow

1. Lista msg workoutów w szczegółach leada renderuje każdy workout jako klikalny element.
2. Kliknięcie przekazuje do nowego widoku dane identyfikujące workout:

   * `leadName`,
   * `leadLoca`,
   * `workoutName`,
   * `workoutLoca` albo `msgWorkoutFolderLoca + workoutName`.
3. Nowy widok pobiera body konkretnego workoutu:

   * preferowane: `GetItem(repoGuid, workoutLoca)`.
4. Widok pokazuje body w `Preview`.
5. Widok pokazuje body w `Editor`.
6. `Save` wykonuje:

   * `Put(repoGuid, workoutLoca, body)`.
7. Po zapisie odśwież lokalny stan.
8. Powrót wraca do szczegółów tego samego leada.

---

# Test

Po implementacji sprawdź:

1. Kliknięcie workoutu z listy otwiera nowy widok.
2. Otwiera się właściwy workout, nie pierwszy z listy.
3. Workout z nazwą zawierającą `; ai bot` otwiera się poprawnie.
4. Body pokazuje się w Preview.
5. Body pokazuje się w Editor.
6. Edycja i Save zapisują przez `IItemWorker.Put`.
7. Po odświeżeniu strony zapisane zmiany nadal są widoczne.
8. Back wraca do właściwego leada.
9. Edytor ma własny scroll.
10. Podgląd ma własny scroll.
11. Konsola przeglądarki nie ma nowych błędów.
12. Network pokazuje poprawne wywołania:

    * `GetItem` dla workoutu,
    * `Put` przy zapisie.
13. Nie ma pobierania body wszystkich workoutów na liście.

---

# Dokumentacja

Po implementacji dodaj albo zaktualizuj dokumentację feature’a w:

`architecture/chad-dashboard/features/[nazwa-feature].md`

Jeśli zmieniasz też `chad-dba`, dodaj lub zaktualizuj odpowiedni feature doc w:

`architecture/chad-dba/features/[nazwa-feature].md`

Jeśli naprawisz bug, dodaj albo zaktualizuj:

`architecture/chad-dashboard/bugs/[nazwa-buga].md`

albo:

`architecture/chad-dba/bugs/[nazwa-buga].md`

w zależności od miejsca problemu.

---

# Oczekiwana odpowiedź końcowa

Odpowiedz w tej kolejności:

## 1. Analiza

## 2. Dokumentacja

## 3. Istniejące rozwiązania

## 4. Plan

## 5. Implementacja

## 6. Test

## 7. Dokumentacja

Nie pisz “gotowe”, jeśli nie przetestowałeś realnego zapisu.
