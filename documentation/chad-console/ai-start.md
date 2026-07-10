--------------------------------
CONTENT PROVIDER - FILE DATABASE

Repo:
girls

Struktura jest hierarchiczna.

Przykład:

girls/
└── 06/
    └── 80/
        ├── 01/
        ├── 02/
        ├── 03/
        └── ...

Foldery są numerowane:
01
02
03
...

Adres:
06/80/02/01

oznacza:

06
 └── 80
      └── 02
           └── 01

--------------------------------
ITEM MODEL

Najczęściej używany model:

{
  "Body": "...",
  "Settings":
  {
      "type": "Text",
      "name": "todo",
      "address": "girls/06/80/02/01"
  }
}

W praktyce:
- Body = treść
- Settings.name = nazwa itemu
- Settings.type = typ
- Settings.address = pełna ścieżka

--------------------------------
NAZWY ITEMÓW

Najczęściej spotykane:

status
todo
report
conversation
all items

status jest zawsze:
name = status

Nie używać:
statuses

--------------------------------
ALL ITEMS

girls/all items

Body jest słownikiem:

{
  "64": "26-05-11_pn_Marina",
  "75": "26-05-29_pn_Amelia",
  "80": "26-06-07_pt_Ariadna"
}

Klucz:
- segment folderu dziewczyny

Wartość:
- nazwa dziewczyny

To jest główna mapa tłumacząca:

80
-> 26-06-07_pt_Ariadna

--------------------------------
ADRESY

Nigdy nie zakładać:

Settings.address.StartsWith("girls")

Bywało:

girls/06/80/03

albo:

Active/06/80/03

albo inne rooty.

Zawsze:

1. split('/')
2. usuń pierwszy segment
3. pracuj na:

06/80/03

--------------------------------
LOCA

W projekcie często używane pojęcie:

loca

Przykład:

girls/06/80/03

po usunięciu root:

06/80/03

To właśnie loca.

--------------------------------
STATUS BODY FORMAT

Aktualny obowiązujący format:

her-first-msg: false
your-first-message: false
writing-deadline: 99-01-01
priority-today: 0

Dodatkowe pola mogą istnieć.

Nie usuwać ich podczas migracji.

--------------------------------
YAML-LIKE FORMAT

Body NIE jest prawdziwym YAML.

To prosty parser:

key: value

lub

key:

oznacza pustą wartość.

Przykład:

writing-deadline:
priority-today: 1

oznacza:

writing-deadline = ""

priority-today = "1"

Nigdy:

writing-deadline = "priority-today: 1"

--------------------------------
UPDATE STRATEGY

Przy modyfikacji itemów:

1. Pobierz istniejący item
2. Sparsuj Body
3. Zmodyfikuj tylko potrzebne pola
4. Zachowaj pozostałe pola
5. Put

Nie nadpisywać całego Body bez potrzeby.

--------------------------------
CONTENT PROVIDER API

Invoke:

POST /invoke

Body:

[
  "IRepoService",
  "IItemWorker",
  "GetByNames",
  "girls",
  "all items"
]

Response:
raw JSON

Bez wrapperów typu:

{
  "success": true,
  "data": ...
}

--------------------------------
NAJWAŻNIEJSZE METODY

GetByNames

[
  "IRepoService",
  "IItemWorker",
  "GetByNames",
  "girls",
  "all items"
]

FindRecursively

[
  "IRepoService",
  "IMethodWorker",
  "FindRecursively",
  "girls",
  "06",
  "//todo"
]

GetManyByName

[
  "IRepoService",
  "ManyItemsWorker",
  "GetManyByName",
  "girls",
  "06",
  "status"
]

Put

[
  "IRepoService",
  "IItemWorker",
  "Put",
  "girls",
  LOCA,
  "Text",
  NAME,
  BODY
]

PostParentItem

[
  "IRepoService",
  "IItemWorker",
  "PostParentItem",
  "girls",
  GIRL_LOCA,
  "Text",
  "status"
]

--------------------------------
PROJEKT NODEJS

content-finder

Cel:
CLI do przeszukiwania repo girls przez Content Provider API.

Backend:
http://localhost:12024

Uruchomienie:

npm run cli