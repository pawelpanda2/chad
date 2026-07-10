# Content Provider Data Access

## Cel

Ten dokument opisuje, jak poprawnie korzystać z Content Providera z poziomu TypeScript, `chad-dba` i `chad-dashbord`. Ma być instrukcją dla AI, Copilota, Cline i człowieka, zanim powstanie nowy feature oparty o `/invoke`.

## 1. Czym jest Item

Content Provider jest plikową bazą danych.

Każdy item jest w praktyce węzłem z metadanymi i opcjonalnym body:

- `config.yaml` trzyma metadata, w tym logical name
- `body.txt` albo wewnętrzne body trzyma treść tekstową
- logical name nie jest tym samym co physical folder name

Najważniejsze:

- physical folder names są numeryczne, np. `01`, `02`, `03`, `001`
- logical names pochodzą z `config.yaml`, np. `leads`, `msg planner`, `26-06-19`
- nie wolno budować filesystem path typu `leads/msg planner/26-06-19`

## 2. Adresowanie

Podstawowe adresowanie itemu to:

- `repoGuid`
- `loca`

Przykład:

- `repoGuid`: `21d11bdc-f1f4-44d1-b61a-3fa6b039c641`
- `loca`: `03/21/05`

Pełny address ma postać:

- `21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/21/05`

W praktyce:

- `address` to pełna ścieżka z `repoGuid`
- `loca` to sama część numeryczna

Nie myl:

- `repoGuid`
- `loca`
- `address`

## 3. Logical path

Ścieżka:

- `leads / msg planner / 26-06-19`

to sekwencja logical names, a nie filesystem path.

To oznacza:

- `leads` musi zostać rozwiązane przez Content Provider
- `msg planner` musi zostać rozwiązane przez Content Provider
- `26-06-19` też jest logical name, nie nazwą katalogu na dysku

## 4. Poprawne `/invoke`

W działającym kodzie `chad-dba` format wywołania jest:

```json
[
  "IRepoService",
  "IItemWorker",
  "MethodName",
  "repoGuid",
  "arg1",
  "arg2"
]
```

To jest ważne. Działające wywołania mają prefiks `IRepoService`.

### `IItemWorker.GetByNames`

Przykład:

```json
[
  "IRepoService",
  "IItemWorker",
  "GetByNames",
  "21d11bdc-f1f4-44d1-b61a-3fa6b039c641",
  "leads",
  "msg planner"
]
```

Realny wynik dla `leads / msg planner`:

```json
{
  "Body": {
    "03": " how to proceed?",
    "04": "26-06-11",
    "05": "26-06-19"
  },
  "Settings": {
    "type": "Folder",
    "name": "msg planner",
    "address": "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/21"
  }
}
```

### `IItemWorker.GetItem`

Pobiera item po `loca`.

Przykład:

```json
[
  "IRepoService",
  "IItemWorker",
  "GetItem",
  "21d11bdc-f1f4-44d1-b61a-3fa6b039c641",
  "03/21/05"
]
```

W `Msg Planner` realny wynik dla `03/21/05` to item `Text` z body bezpośrednio na tym itemie, nie folder z dzieckiem `body.txt`.

### `IManyItemsWorker.GetManyByName`

Służy do znalezienia wielu itemów po logical name pod danym rodzicem.

Przykład z działającego kodu dla `contacts`:

```json
[
  "IRepoService",
  "IManyItemsWorker",
  "GetManyByName",
  "21d11bdc-f1f4-44d1-b61a-3fa6b039c641",
  "03/06",
  "contacts"
]
```

Nie zakładaj, że to zadziała dla każdego modelu danych. W `Msg Planner` szukanie `body.txt` pod datą zwracało `[]`, bo data sama jest itemem `Text`.

### `IItemWorker.Put`

Przykład:

```json
[
  "IRepoService",
  "IItemWorker",
  "Put",
  "21d11bdc-f1f4-44d1-b61a-3fa6b039c641",
  "03/21/05",
  "Text",
  "26-06-19",
  "...content..."
]
```

Do `Put` trzeba znać:

- `repoGuid`
- `loca`
- `type`
- logical `name`
- `content`

### `PostParentItem`

Tworzy albo zwraca dziecko pod wskazanym parentem.

Przykład:

```json
[
  "IRepoService",
  "IItemWorker",
  "PostParentItem",
  "21d11bdc-f1f4-44d1-b61a-3fa6b039c641",
  "03/21",
  "Text",
  "26-06-25"
]
```

Używaj tego do create-or-get. Nie używaj jako obejścia, gdy dane już istnieją pod innym modelem.

## 5. Jak pobrać folder po nazwach

Dla:

- `leads / msg planner`

poprawne args są:

```json
[
  "IRepoService",
  "IItemWorker",
  "GetByNames",
  "21d11bdc-f1f4-44d1-b61a-3fa6b039c641",
  "leads",
  "msg planner"
]
```

Po tym odczytujesz:

- `Settings.address` jako pełny address folderu
- `Body` jako mapę `physicalChildKey -> logicalChildName`

W `Msg Planner` parent folder został znaleziony poprawnie:

- `repoGuid`: `21d11bdc-f1f4-44d1-b61a-3fa6b039c641`
- `loca`: `03/21`

## 6. Jak pobrać children folderu

Najpierw sprawdź realny shape odpowiedzi, nie zgaduj.

W `Msg Planner` children przyszły w `Body`, nie w `Children`.

Realnie:

```json
{
  "03": " how to proceed?",
  "04": "26-06-11",
  "05": "26-06-19"
}
```

To oznacza:

- liczba children znaleziona: `3`
- logical names children: `" how to proceed?"`, `"26-06-11"`, `"26-06-19"`
- po regexie `/^\d{2}-\d{2}-\d{2}$/` przechodzą: `26-06-11`, `26-06-19`
- wynik dla frontendu: `2` daty

Jeżeli response ma mapę `Body`, child `loca` budujesz jako:

- `parentLoca + "/" + physicalChildKey`

dla tego przypadku:

- `03/21/04`
- `03/21/05`

## 7. Jak pobrać i zapisać body

Nie zakładaj z góry, że tekst siedzi w child itemie `body.txt`.

W `Msg Planner` realna struktura jest taka:

- `msg planner` jest folderem
- dzieci z datami są itemami `Text`
- body siedzi bezpośrednio na itemie daty

Odczyt:

```json
[
  "IRepoService",
  "IItemWorker",
  "GetItem",
  "21d11bdc-f1f4-44d1-b61a-3fa6b039c641",
  "03/21/05"
]
```

Zapis:

1. `GetItem` dla `loca`, żeby poznać aktualny `Settings.name`
2. `Put` bezpośrednio do tego samego `loca`

Przykład:

```json
[
  "IRepoService",
  "IItemWorker",
  "Put",
  "21d11bdc-f1f4-44d1-b61a-3fa6b039c641",
  "03/21/05",
  "Text",
  "26-06-19",
  "...content..."
]
```

## 8. Typowe błędy AI

- używanie fizycznej ścieżki `leads/msg planner`
- filtrowanie po nazwie folderu fizycznego zamiast po `config.yaml:name`
- mylenie `repoGuid`, `loca` i `address`
- używanie złego formatu `/invoke`, np. bez `IRepoService`
- zakładanie, że `GetItem` zawsze zwraca `Children`
- zakładanie, że każde body jest w child itemie `body.txt`
- buildowanie `chad-dba` bez sprawdzenia, czy dashboard widzi nowy build
- maskowanie błędów pustą listą zamiast logowania odpowiedzi CP
- używanie `FirstOrDefault()` jako obejścia bez potwierdzenia modelu danych

## 9. Checklist dla nowego feature'a

- sprawdź realną metodę `/invoke` w istniejącym kodzie
- zrób `curl` do `/invoke`
- pokaż surową odpowiedź CP
- nie maskuj błędów pustą listą
- pokaż cały flow: route -> chad-dba -> `/invoke`
- potwierdź, gdzie naprawdę siedzi body
- sprawdź, czy dashboard importuje aktualny `dist` z `chad-dba`
- dopiero potem rób UI

## Realna przyczyna awarii Msg Planner

`Msg Planner` nie działał z dwóch powodów naraz:

1. `getMsgPlannerDateFolders()` zakładało, że children będą w `Children`, ale realny response z CP trzymał je w `Body` jako mapę physical key -> logical name.
2. `getMsgPlannerBodyForDate()` i `saveMsgPlannerBody()` zakładały model `date folder -> child body.txt`, ale realne itemy dat są bezpośrednio itemami `Text` z body na sobie.

To nie był problem z `GetByNames` dla `leads / msg planner`. Ten krok działał poprawnie.