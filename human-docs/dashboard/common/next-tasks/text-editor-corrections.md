# Bug task dla Cline — poprawki shared editor toolbar/layout

Trzeba zapisać i poprawić bug po wdrożeniu shared edytora.

Dotyczy wspólnego komponentu edytora oraz widoków:

* `todo-msg/edit`
* `leads/msg-workout`
* `msg-planner`

---

# Objawy / poprawki

## 1. Edytor nie wypełnia całej wysokości przy małej ilości tekstu

Jeżeli w edytorze jest mało tekstu, tło edytora kończy się po jednej linijce.

Widać, że pasek / tło CodeMirror nie wypełnia całego okna.

Oczekiwane:

* edytor ma zawsze wypełniać całe dostępne okno do dołu,
* nawet jeśli body ma tylko jedną linijkę,
* scroll ma być lokalny w edytorze,
* nie może pojawiać się scroll całej strony.

---

## 2. Kolejność przycisków i widoczność

Aktualnie przyciski są w dobrym miejscu, ale kolejność ma być zmieniona.

Oczekiwany układ toolbaru:

```text
[ Preview ] [ Editor ] [ Save ] [ WCH ]
```

Zasada:

* `Preview` i `Editor` są zawsze widoczne,
* `Save` widoczny tylko w trybie `Editor`,
* `WCH` widoczny tylko w trybie `Editor`.

Czyli w trybie Preview:

```text
[ Preview ] [ Editor ]
```

W trybie Editor:

```text
[ Preview ] [ Editor ] [ Save ] [ WCH ]
```

---

## 3. Preview — brak strat między obramowaniami

W trybie Preview między obramowaniami nie może być nawet `1px` straty.

Ramki mają idealnie do siebie przylegać.

Oczekiwane:

* bez szczelin między toolbar/tabs/content,
* bez niepotrzebnych marginów,
* bez niepotrzebnego paddingu między obramowaniem a tekstem,
* tekst ma zaczynać się możliwie blisko wewnętrznej ramki,
* nie może być wizualnego “pływania” contentu wewnątrz ramek.

---

## 4. Msg planner nadal nie używa wspólnego edytora

W zakładce `msg planner` wygląda na to, że edytor nie został zmieniony na wspólny komponent.

Trzeba to sprawdzić.

Jeśli faktycznie `msg planner` dalej używa starego edytora, podłącz go do shared editor component.

Jeżeli nie można tego zrobić bezpiecznie, opisz dlaczego i zapisz jako next step, ale najpierw realnie sprawdź kod.

---

# Co sprawdzić w kodzie

Najpierw sprawdź:

1. `components/shared/text-editor-with-toolbar.tsx`
2. `components/shared/editor-page-shell.tsx`
3. `BodyTextEditor`
4. `todo-msg/edit/page.tsx`
5. `leads/msg-workout/page.tsx`
6. `msg-planner/page.tsx`
7. istniejące style wysokości / overflow / flex
8. dokumentację buga o scrollu edytorów, jeśli istnieje

---

# Podejrzana przyczyna

Prawdopodobnie problem wysokości wynika z tego, że któryś wrapper nie ma:

* `h-full`
* `min-h-0`
* `flex-1`
* `overflow-hidden`

albo CodeMirror nie ma wymuszonej wysokości:

* parent ma wysokość,
* ale sam editor / `.cm-editor` nie rozciąga się do `100%`.

Nie rób hacka typu `height: 600px`.

To ma działać responsywnie w dostępnym oknie.

---

# Zakazy

Nie wolno:

* używać stałej wysokości typu `600px`,
* dodawać przypadkowych marginów,
* maskować problemu paddingiem,
* robić osobnego edytora tylko dla `msg planner`,
* rozdzielać znowu logiki toolbaru,
* wkładać `Save` i `WCH` do środka CodeMirror,
* pokazywać `Save` i `WCH` w trybie Preview,
* psuć działania `todo-msg/edit` i `msg-workout`.

---

# Oczekiwany efekt

1. Przy krótkim tekście edytor wypełnia całe dostępne okno.
2. Toolbar ma kolejność:

```text
Preview | Editor | Save | WCH
```

3. `Save` i `WCH` są widoczne tylko w trybie `Editor`.
4. Preview nie ma szczelin między obramowaniami.
5. Preview nie ma zbędnych odstępów wewnątrz ramki.
6. `msg planner` używa wspólnego komponentu albo jest jasno opisany powód, dlaczego jeszcze nie.

---

# Test

Po poprawce sprawdź:

1. `todo-msg/edit` z bardzo krótkim tekstem.
2. `todo-msg/edit` z długim tekstem.
3. `leads/msg-workout` z krótkim tekstem.
4. `leads/msg-workout` z długim tekstem.
5. `msg-planner`.
6. Tryb Preview:

   * widoczne tylko `Preview` i `Editor`,
   * brak `Save`,
   * brak `WCH`,
   * ramki przylegają bez szczelin.
7. Tryb Editor:

   * widoczne `Preview`, `Editor`, `Save`, `WCH`,
   * edytor wypełnia całą wysokość,
   * WCH działa.
8. Scroll:

   * lokalny w edytorze,
   * lokalny w preview,
   * nie na całej stronie.
9. Konsola bez nowych błędów.

---

# Dokumentacja

Zapisz bug w:

```text
architecture/chad-dashboard/bugs/shared-editor-layout-and-toolbar-v2.md
```

W dokumentacji opisz:

* objawy,
* widoki dotknięte bugiem,
* przyczynę,
* poprawkę,
* zasady toolbaru,
* zasady wysokości edytora,
* zasady preview bez szczelin,
* status `msg planner`,
* testy.
