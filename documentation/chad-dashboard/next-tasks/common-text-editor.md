# Task dla Cline — ustandaryzowany komponent edytora z toolbar nad edytorem + naprawa przycisku WCH

Trzeba poprawić edytor używany w widokach tekstowych, szczególnie w zakładce `Msg todo`.

---

# Problem

W zakładce `Msg todo`, po wejściu w jeden wpis i otwarciu edytora:

1. przycisk `WCH` od białych znaków nie działa,
2. nie ma podglądu,
3. przyciski edytora nie powinny być wkładane do okienka z tekstem,
4. przyciski edytora nie powinny być wkładane do zakładek `Preview / Editor`.

---

# Cel

Chcę ustandaryzować edytor tak, żeby między różnymi kartami był używany ten sam komponent edytora.

Ten komponent ma mieć:

1. toolbar / linijkę przycisków nad edytorem,
2. działający przycisk `WCH`,
3. podgląd,
4. edytor,
5. zapis,
6. wspólną logikę działania,
7. możliwość konfiguracji flagami, jeśli gdzieś potrzebna jest drobna różnica.

---

# Najważniejsza zasada UI

Toolbar z przyciskami ma być NAD edytorem.

Nie wolno go wkładać:

* do pola tekstowego,
* do CodeMirror,
* do środka edytora,
* do zakładki `Preview`,
* do zakładki `Editor`.

Ma być osobna linijka nad panelem edycji / podglądu.

---

# Co trzeba zrobić

1. Znajdź wszystkie istniejące widoki, które mają edytor tekstu / markdown / CodeMirror.
2. Znajdź obecny przycisk `WCH`.
3. Sprawdź, dlaczego `WCH` nie działa w `Msg todo`.
4. Sprawdź, czy problem był już opisany w dokumentacji bugów.
5. Sprawdź, czy istnieje wspólny komponent edytora.
6. Jeśli istnieje — rozbuduj go.
7. Jeśli nie istnieje — wydziel jeden wspólny komponent.

---

# Wspólny komponent

Docelowo ma istnieć jeden reusable component, np. nazwę dobierz do istniejącej konwencji projektu:

* `TextItemEditor`
* `MarkdownTextEditor`
* `ContentEditor`
* albo inna nazwa zgodna z kodem.

Nie zgaduj nazwy — sprawdź istniejące komponenty.

Komponent powinien obsługiwać:

* wartość tekstu,
* zmianę tekstu,
* zapis,
* tryb `Preview`,
* tryb `Editor`,
* toolbar nad edytorem,
* przycisk `WCH`,
* ewentualne flagi konfiguracyjne.

---

# Toolbar

Toolbar ma być osobnym elementem UI nad edytorem.

Przykład logiczny układu:

```text
[ Save ] [ WCH ] [ inne przyciski edytora ]

[ Preview | Editor ]

--------------------------------
panel podglądu albo edytora
--------------------------------
```

Albo jeśli w danym widoku są zakładki nad toolbarem, to nadal toolbar musi być nad panelem, a nie w środku tekstu.

Najważniejsze:

```text
toolbar
editor / preview
```

Nie:

```text
editor
toolbar w środku tekstu
```

---

# WCH

`WCH` oznacza pokazywanie / ukrywanie białych znaków.

Napraw:

1. żeby kliknięcie faktycznie przełączało stan,
2. żeby zmiana była widoczna w edytorze,
3. żeby działało po przełączeniu między `Preview` i `Editor`,
4. żeby działało po zmianie wpisu,
5. żeby działało w `Msg todo`,
6. żeby działało w innych widokach używających wspólnego edytora.

Jeśli obecny mechanizm WCH jest lokalny dla jednego komponentu, przenieś go do wspólnego komponentu.

---

# Preview

W `Msg todo` brakuje podglądu.

Dodaj tam taki sam mechanizm `Preview / Editor`, jak w innych widokach tekstowych.

Nie twórz osobnego, drugiego podglądu tylko dla `Msg todo`.

Użyj wspólnego komponentu.

---

# Standaryzacja między kartami

Po zmianie edytor powinien działać tak samo w różnych miejscach, np.:

* `Msg todo`,
* widok pojedynczego `msg workout`,
* inne istniejące text-item views,
* przyszłe widoki text-itemów.

Jeżeli któryś widok potrzebuje różnicy, dodaj flagę / prop, np.:

* `showPreview`,
* `showSave`,
* `showWhitespaceToggle`,
* `readOnly`,
* `initialMode`,
* `onSave`.

Nie twórz osobnych forków komponentu.

---

# Dokumenty do przeczytania przed implementacją

1. `architecture/chad-dba/project-goal.md`
2. `architecture/chad-dba/import-dba.md`
3. `architecture/chad-dba/data-access.md`
4. `architecture/chad-dba/cp-paths.md`
5. `architecture/chad-dba/resolve-paths.md`
6. `architecture/chad-dba/post-parent-item.md`
7. `architecture/ai-docs/feature-documentation-rules.md`
8. feature’y dotyczące:

   * edytora,
   * CodeMirror,
   * text-item,
   * preview/editor,
   * Msg todo,
   * msg workout
9. bugi dotyczące:

   * `WCH`,
   * białych znaków,
   * scrolla edytora,
   * zapisu `Put`,
   * preview/editor.

---

# Pliki do sprawdzenia

Nie zgaduj nazw plików.

Najpierw znajdź:

* komponent używany przez `Msg todo`,
* komponent używany przez widok `msg workout`,
* komponent używany przez inne edytory text-itemów,
* obecny kod przycisku `WCH`,
* obecny kod CodeMirror,
* obecny kod preview,
* helpery zapisu przez `Put`.

---

# Zakazy

Nie wolno:

* dodawać przycisków do środka pola tekstowego,
* robić osobnego edytora tylko dla `Msg todo`,
* kopiować CodeMirror między widokami,
* tworzyć drugiej implementacji `WCH`,
* robić osobnego preview tylko dla jednej zakładki,
* usuwać istniejących funkcji bez sprawdzenia użyć,
* psuć widoku `msg workout`,
* psuć zapisu przez `Put`,
* maskować błędów zapisu,
* pisać “naprawione”, jeśli nie przetestowałeś w UI.

---

# Implementacja — oczekiwany kierunek

1. Zrób analizę istniejących edytorów.
2. Wybierz albo wydziel wspólny komponent edytora.
3. Przenieś toolbar nad edytor.
4. Dodaj / napraw przycisk `WCH` w toolbarze.
5. Dodaj preview/editor do `Msg todo`.
6. Podłącz `Msg todo` do wspólnego komponentu.
7. Podłącz `msg workout` i inne widoki tekstowe do wspólnego komponentu, jeśli to bezpieczne.
8. Jeśli pełne podłączenie wszystkich widoków jest za duże na jeden krok, zrób to etapowo, ale komponent od początku ma być projektowany jako wspólny.

---

# Test

Po implementacji sprawdź ręcznie albo Playwrightem:

1. `Msg todo`:

   * otwarcie wpisu,
   * jest toolbar nad edytorem,
   * działa `WCH`,
   * jest `Preview`,
   * jest `Editor`,
   * zapis nadal działa.

2. Widok `msg workout`:

   * otwarcie workoutu,
   * toolbar nad edytorem,
   * działa `WCH`,
   * działa `Preview`,
   * działa `Editor`,
   * zapis przez `Put`.

3. Przełączanie:

   * `WCH` działa po przełączeniu `Preview -> Editor`,
   * zmiany w edytorze widać w podglądzie,
   * scroll edytora jest lokalny,
   * scroll podglądu jest lokalny.

4. Błędy:

   * błąd zapisu pokazuje error,
   * konsola przeglądarki bez nowych błędów,
   * Network pokazuje poprawne wywołania.

---

# Dokumentacja

Dodaj albo zaktualizuj feature doc:

```text
architecture/chad-dashboard/features/shared-text-editor-toolbar.md
```

Dodaj albo zaktualizuj bug doc:

```text
architecture/chad-dashboard/bugs/wch-button-not-working-in-msg-todo.md
```

W dokumentacji opisz:

* objaw,
* przyczynę,
* decyzję o wspólnym komponencie,
* toolbar nad edytorem,
* działanie WCH,
* preview/editor,
* flagi komponentu,
* testy,
* czego nie wolno robić w przyszłości.

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

Nie pisz “gotowe”, jeśli nie sprawdziłeś realnie działania `WCH` w `Msg todo`.
