Cline task — chad-console: naprawa wyświetlania chatów + cp-paths.md jako source of truth

Projekt:
`chad-console`

Kontekst:
Pracujesz w projektach Content Provider / chad-dba / chad-console. Nie zgaduj architektury.

Najpierw przeczytaj:

1. `architecture/chad-dba/project-goal.md`
2. `architecture/chad-dba/import-dba.md`
3. `architecture/chad-dba/data-access.md`
4. `architecture/chad-dba/cp-paths.md`
5. `architecture/chad-dba/resolve-paths.md`
6. `architecture/chad-dba/post-parent-item.md`
7. `architecture/ai-docs/feature-documentation-rules.md`
8. dokumentację dotyczącą `chad-console`
9. bugi/features związane z wyszukiwaniem chatów / wiadomości

## Zadanie 1 — bug: Wyświetl chaty znalezione pokazuje body folderu zamiast rozmowy

Flow w konsoli:

1. Menu główne:
   `6. Ask OpenAI about girl`

2. Wybieram leada.

3. Potem wybieram:
   `3. Wyświetl chaty znalezione`

Problem:
Dla leada `26-05-29_pn_Amelia` pokazuje:

```text
CHAT: 26-05-29_pn_Amelia
Kanał: whatsup
------------------------------------------------------------
{"01":"beeper","02":"manual"}
```

To nie jest treść rozmowy. To wygląda jak body/config folder-itemu, który ma children:

```json
{"01":"beeper","02":"manual"}
```

Czyli kod zatrzymał się za wcześnie — pobrał folder, a powinien wejść głębiej do text-itemu `beeper`.

## Poprawna logika

Pod ścieżką wiadomości może być:

### Wariant A — bezpośredni text-item

Ścieżka nazw:

```text
beeper, whatsup, [nazwa leada]
```

albo dalej:

```text
beeper, whatsup, [nazwa leada], beeper
```

Jeżeli zwrócony item jest `Text`, to jego body jest rozmową.

### Wariant B — folder-item z kolejnymi text-itemami

Ścieżka nazw:

```text
beeper, whatsup, [nazwa leada]
```

może zwrócić `Folder`, który ma children, np.:

```text
beeper
manual
```

Wtedy trzeba wejść jeszcze niżej i pobrać child:

```text
beeper, whatsup, [nazwa leada], beeper
```

I dopiero jeśli ten item jest `Text`, wyświetlić jego body jako rozmowę.

## Wymaganie techniczne

W kodzie `Wyświetl chaty znalezione`:

1. Pobierz znaleziony item.
2. Sprawdź jego typ w `Settings` / metadata / modelu itemu.
3. Jeżeli typ to `Text`:

   * wyświetl jego body.
4. Jeżeli typ to `Folder`:

   * sprawdź children,
   * znajdź child o logical name `beeper`,
   * pobierz ten child,
   * sprawdź typ,
   * jeżeli `Text`, wyświetl jego body.
5. Nie pokazuj body folderu jako rozmowy.
6. Jeżeli folder nie ma childa `beeper`, pokaż czytelny komunikat diagnostyczny:

   * że znaleziono folder,
   * jakie ma children,
   * że nie znaleziono text-itemu `beeper`.

Nie hardcoduj ścieżek numerycznych.
Nie czytaj filesystemu ręcznie.
Użyj `chad-dba` / istniejących workerów.

## Przykład ścieżek nazw

Dla leada:

```text
26-05-29_pn_Amelia
```

najpierw próbujemy:

```text
beeper, whatsup, 26-05-29_pn_Amelia
```

Jeżeli to folder, próbujemy:

```text
beeper, whatsup, 26-05-29_pn_Amelia, beeper
```

## Zadanie 2 — cp-paths.md jako source of truth

Znajdź wszystkie ważne ścieżki logical names używane w projektach:

* `chad-console`
* `chad-dashboard`
* `chad-dba`
* `content-finder`

i opisz je w:

```text
architecture/chad-dba/cp-paths.md
```

Ten plik ma być source of truth dla ścieżek Content Providera.

Nie chodzi o wszystkie pojedyncze requesty, tylko o najważniejsze stabilne logical paths, np.:

* pobieranie wszystkich leadów,
* konkretny lead,
* status leada,
* contacts,
* msg workout,
* msg planner,
* msg todo,
* beeper/whatsup chaty.

## Format wpisów w cp-paths.md

Każdy wpis ma mieć format dwuczęściowy:

```text
NAME: [nazwa operacji]

DESCRIPTION
[opis po ludzku]

COMMANDS
[komendy CP/chad-dba]
```

## Przykład wpisu

```text
NAME: POBIERANIE WSZYSTKICH LEADOW

DESCRIPTION
Leady znajdujemy po ścieżce nazw:

leads, all items

Ta ścieżka nazw nie może ulec zmianie.

To zwróci folder-item z listą leadów.

Dla przykładu ścieżka numeryczna może wyglądać tak:

03/06

Ścieżka numeryczna może zawsze ulec zmianie i nie wolno jej hardcodować.

Po rozwiązaniu ścieżki nazw można pobierać item po ścieżce numerycznej przez GetItem.

COMMANDS
IItemWorker.GetByNames(repoGuid, "leads", "all items")
IItemWorker.GetItem(repoGuid, "03/06")
```

## Wpis dla chatów beeper / whatsup

Dodaj wpis opisujący ten bugfix, np.:

```text
NAME: POBIERANIE CHATU BEEPER / WHATSUP DLA LEADA

DESCRIPTION
Chat dla leada znajduje się po ścieżce nazw:

beeper, whatsup, [lead name]

Ta ścieżka może zwrócić bezpośrednio text-item z rozmową albo folder-item z dalszymi wariantami źródła, np.:

beeper
manual

Jeżeli zwrócony item jest Text, jego body jest rozmową.

Jeżeli zwrócony item jest Folder, trzeba sprawdzić jego children i wejść w child o nazwie:

beeper

czyli pełna ścieżka nazw:

beeper, whatsup, [lead name], beeper

Dopiero text-item `beeper` zawiera rozmowę.

Nie wolno wyświetlać body folder-itemu jako rozmowy.

COMMANDS
IItemWorker.GetByNames(repoGuid, "beeper", "whatsup", leadName)

if item.type == "Text":
    display item.body

if item.type == "Folder":
    IItemWorker.GetByNames(repoGuid, "beeper", "whatsup", leadName, "beeper")
```

## Dokumentacja buga

Po naprawie dodaj bug doc:

```text
architecture/chad-console/bugs/[nazwa-buga].md
```

Bug doc ma zawierać:

* objaw,
* przykład błędnego outputu,
* root cause,
* różnicę Text vs Folder,
* poprawny flow,
* test ręczny.

## Test ręczny

1. Uruchom `chad-console`.
2. Wybierz:
   `6. Ask OpenAI about girl`
3. Wybierz lead:
   `26-05-29_pn_Amelia`
4. Wybierz:
   `3. Wyświetl chaty znalezione`
5. Sprawdź, że nie pokazuje:
   `{"01":"beeper","02":"manual"}`
6. Sprawdź, że jeżeli `beeper, whatsup, [lead]` jest folderem, kod wchodzi w:
   `beeper, whatsup, [lead], beeper`
7. Sprawdź, że wyświetlana jest właściwa treść rozmowy z text-itemu.
8. Sprawdź innego leada, gdzie chat może być bezpośrednio text-itemem.
9. Sprawdź, że oba warianty działają.
10. Sprawdź, że `cp-paths.md` zawiera nowy wpis jako source of truth.
