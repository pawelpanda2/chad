# Dodatkowy task — poprawa układu toolbaru w Msg Planner

W zakładce `Msg Planner` znajdują się dodatkowe kontrolki:

* combobox,
* `+ New`,
* `Refresh`.

Obecnie są wyrównane do prawej strony.

Chcę zmienić układ, aby był spójny z nowym wspólnym edytorem.

---

# Oczekiwany układ

Dodaj osobną linię nad edytorem.

Na tej linii umieść:

* combobox,
* `+ New`,
* `Refresh`.

Wszystkie elementy mają być wyrównane do lewej strony.

Przykład:

```text
[ Combobox ] [ + New ] [ Refresh ]
```

Pod tą linią ma znajdować się standardowy toolbar wspólnego edytora:

```text
[ Preview ] [ Editor ] [ Save ] [ WCH ]
```

A dopiero pod nim właściwy panel Preview / Editor.

---

# Ważne

Nie umieszczaj tych kontrolek:

* w toolbarze edytora,
* w zakładkach `Preview / Editor`,
* wewnątrz CodeMirror.

To są kontrolki specyficzne dla `Msg Planner` i powinny mieć własną linię nad wspólnym toolbar'em.

---

# Architektura

Nie modyfikuj wspólnego komponentu edytora tylko po to, żeby obsłużyć te trzy kontrolki.

Shared editor powinien pozostać uniwersalny.

`Msg Planner` ma jedynie dodać własny pasek nad wspólnym komponentem.

---

# Test

Po zmianie sprawdź:

1. Combobox, `+ New` i `Refresh` są w osobnej linii.
2. Są wyrównane do lewej strony.
3. Pod nimi znajduje się standardowy toolbar wspólnego edytora.
4. Preview, Editor, Save i WCH nadal działają poprawnie.
5. Układ jest spójny z pozostałymi widokami i nie powoduje nowych problemów z wysokością ani scrollowaniem.
