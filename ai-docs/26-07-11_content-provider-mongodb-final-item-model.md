# Content Provider ↔ MongoDB — finalny model Item i migracja dwukierunkowa

**Status:** decyzja architektoniczna
**Cel:** zachować model Content Providera 1:1, a jednocześnie używać MongoDB jako wydajnego backendu dokumentowego.

---

## 1. Kanoniczny model

Źródłem prawdy nie jest konkretny backend, lecz logiczny **Item**:

```txt
Item
├── config
└── body
```

Content Provider i MongoDB są tylko dwiema reprezentacjami tego samego Itemu.

### Content Provider

Jeden Item jest folderem zawierającym:

```txt
[item-folder]/
├── config.yaml
└── body.txt
```

`config.yaml` zawiera obowiązkowe pola:

```yaml
address: 21d11bdc-f1f4-44d1-b61a-3fa6b039c641/01
id: cb7bc372-781c-4ba6-b7b2-cb9ed60e0202
type: Text
name: 2026-07-10
created: 260710_120000
modified: 260710_120000
```

Do `config.yaml` można bezpośrednio dodawać dowolne pola niestandardowe.

Nie używamy:

```txt
remaining_config
remaining_settings
```

`config` w MongoDB ma być bezpośrednim odpowiednikiem całego `config.yaml`.

`body.txt` może zawierać dowolny content:

- zwykły tekst,
- Markdown,
- JSON,
- YAML,
- własny format nagłówkowy,
- inny format określony w przyszłości.

Nazwa pliku pozostaje zawsze `body.txt`. Rozszerzenie `.txt` nie określa semantyki zawartości.

Docelowo format body może być opisany dodatkowym polem/sekcją w `config.yaml`. Jeżeli takiej informacji nie ma, backend może próbować rozpoznać format. Gdy format jest niejednoznaczny, ma traktować body jako surowy tekst i nie normalizować go.

---

## 2. Reprezentacja w MongoDB

### Baza i kolekcja

Rekomendowany początkowy układ:

```txt
database: chad
collection: items
```

Nie tworzymy osobnej kolekcji ani osobnej bazy dla każdego repo.

Obecne założenie:

```txt
jeden użytkownik = jedno repo
```

Wszystkie Itemy różnych repo mogą znajdować się w jednej kolekcji `items`. Repo jest identyfikowane przez istniejący model Content Providera, przede wszystkim przez `config.address`.

### Jeden dokument MongoDB = jeden Item Content Providera

```json
{
  "_id": "cb7bc372-781c-4ba6-b7b2-cb9ed60e0202",
  "config": {
    "address": "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/01",
    "id": "cb7bc372-781c-4ba6-b7b2-cb9ed60e0202",
    "type": "Text",
    "name": "2026-07-10",
    "created": "260710_120000",
    "modified": "260710_120000"
  },
  "body": "DATA: '2026-07-10'\nŹRÓDŁO: ''\nNAZWA: ''\nLINK: ''\nPULL: 'FALSE'\nCLOSE: NIE\nJAKOŚĆ: ''"
}
```

### Znaczenie pól

- `_id` — wymagany techniczny klucz MongoDB.
- `config.id` — obowiązkowa część modelu Content Providera.
- `config` — całe `config.yaml` po konwersji YAML → obiekt BSON/JSON.
- `body` — surowa zawartość UTF-8 pliku `body.txt`.

Przyjmujemy zasadę:

```txt
_id == config.id
```

Powtórzenie identyfikatora jest celowe:

- `_id` obsługuje natywną tożsamość i indeks MongoDB,
- `config.id` zachowuje kompletny, samodzielny model Content Providera.

`config.id` ma być UUID/GUID globalnie unikalnym pomiędzy wszystkimi repo. Praktyczne ryzyko kolizji prawidłowo generowanego UUID jest pomijalne.

---

## 3. Pola obowiązkowe i czas

Obowiązkowe pola `config`:

```txt
address
id
type
name
created
modified
```

Format `created` i `modified`:

```txt
YYMMDD_HHMMSS
```

Przykład:

```txt
260607_165430
```

Zasady:

- `created` jest ustawiane przy utworzeniu i pozostaje niezmienne.
- `modified` jest aktualizowane przy każdej zmianie `config` lub `body`.
- Polityka strefy czasowej musi być spójna w całym systemie.

---

## 4. Indeksy — bez redundantnych pól technicznych

Nie dodajemy do dokumentu pól:

```txt
repoId
repoGuid
loca
parentAddress
parentId
physicalKey
ancestors
remaining_config
```

Nie są potrzebne jako zapisany cache. Mogłyby rozjechać się z `config.address`.

Wystarczą dwa klucze:

### `_id`

MongoDB automatycznie tworzy unikalny indeks `_id`.

Ponieważ:

```txt
_id == config.id
```

wyszukanie po GUID Itemu jest bezpośrednie i szybkie.

### `config.address`

Tworzymy unikalny indeks:

```js
db.items.createIndex(
  { "config.address": 1 },
  { unique: true }
)
```

`config.address` pozostaje jedynym źródłem prawdy o aktualnym położeniu Itemu.

Nie trzeba zapisywać osobno `repoId` i `loca`. Aplikacja może złożyć lub rozłożyć adres zgodnie z regułami Content Providera.

Dodatkowe indeksy tworzymy dopiero pod realne, zmierzone zapytania.

---

## 5. Strategia wyszukiwania i odporność na przenoszenie Itemów

Numeryczna lokalizacja może zmienić się, gdy użytkownik przestawi elementy w strukturze. Dlatego trwałe referencje nie powinny opierać się wyłącznie na starej `loca`.

### Preferowana kolejność

1. Najpierw wyszukujemy po logicznej ścieżce nazw:

```txt
GetByNames(repoId/userId, startLoca, ["leads", "all items"])
```

2. Po odnalezieniu Itemu korzystamy z jego aktualnego `config.address` i wynikającej z niego numerycznej lokalizacji podczas bieżących operacji.

3. Jeżeli wyszukiwanie po ścieżce nazw się nie powiedzie, używamy trwałego GUID Itemu:

```txt
GetById(itemId)
```

W MongoDB odpowiada temu wyszukanie po:

```js
{ _id: itemId }
```

4. Jeżeli Item został znaleziony po GUID, ale ma inne `config.address` lub inną logiczną ścieżkę, aplikacja:

- informuje użytkownika, że ścieżka została zmieniona,
- pokazuje nowe położenie,
- proponuje aktualizację/migrację zapisanej referencji,
- nie zmienia referencji bez zgody użytkownika, jeżeli zmiana ma znaczenie biznesowe.

### Rekomendowany trwały zapis referencji

Referencja może zawierać:

```txt
repo/user context
logical names path
itemId jako fallback
```

Ścieżka nazw jest pierwszą metodą odnalezienia, a GUID jest mechanizmem ratunkowym i stabilną tożsamością Itemu.

---

## 6. `GetByNames` i struktura folderów

Najczęstszy flow:

```txt
GetByNames(repoId/userId, "", ["leads", "all items"])
```

zwraca Folder Item `all items`.

Jego `body.txt` zawiera mapę/listę dzieci: numery oraz logical names. Na tej podstawie Content Provider rozwiązuje kolejne elementy ścieżki i odtwarza aktualną numeryczną lokalizację.

MongoDB nie zmienia tej semantyki. Adapter Mongo ma korzystać z tego samego modelu Itemów i tej samej logiki parsowania folderowego `body.txt`.

Po rozwiązaniu ścieżki:

```txt
config.address
```

jest aktualnym, kanonicznym adresem Itemu i może zostać użyty do szybkiego odczytu dzięki indeksowi.

---

## 7. Migracja Content Provider → MongoDB

Dla każdego folderu Itemu:

1. Odczytaj `config.yaml`.
2. Sparsuj YAML do obiektu `config`.
3. Zweryfikuj pola obowiązkowe.
4. Odczytaj `body.txt` jako surowy tekst UTF-8.
5. Utwórz dokument:

```json
{
  "_id": "<config.id>",
  "config": { "...cały config.yaml..." },
  "body": "<dokładna zawartość body.txt>"
}
```

6. Zweryfikuj:

```txt
_id == config.id
```

7. Zapisz dokument do `items`.

Nie rozbijamy jednego Itemu na dwa dokumenty MongoDB.

Nie tworzymy dokumentów typu `config.yaml` i `body.txt` osobno.

Nie przenosimy pól niestandardowych do `remaining_config`.

---

## 8. Migracja MongoDB → Content Provider

Dla każdego dokumentu:

1. Zweryfikuj `_id == config.id`.
2. Zweryfikuj pola obowiązkowe `config`.
3. Wyznacz fizyczne miejsce Itemu zgodnie z istniejącymi regułami `config.address`.
4. Zapisz cały obiekt `config` jako `config.yaml`.
5. Zapisz `body` bez zmian jako `body.txt`.

Wynik:

```txt
[item-folder]/
├── config.yaml
└── body.txt
```

### Ważne ograniczenie YAML

Migracja jest bezstratna na poziomie danych i semantyki.

Po konwersji:

```txt
YAML → obiekt → YAML
```

mogą zmienić się wyłącznie elementy prezentacyjne YAML, np.:

- kolejność kluczy,
- rodzaj cudzysłowów,
- wcięcia,
- komentarze,
- aliasy/anchory.

Jeżeli w przyszłości będzie wymagane zachowanie `config.yaml` bajt w bajt, trzeba dodatkowo przechowywać surowy YAML. Obecny model zakłada zgodność danych, a nie identyczne formatowanie pliku YAML.

`body.txt` powinien być zachowany dokładnie jako surowy tekst, bez parsowania i ponownej serializacji.

---

## 9. Test round-trip

Obowiązkowy test:

```txt
CP → Mongo → CP
```

oraz:

```txt
Mongo → CP → Mongo
```

Sprawdzamy:

- `address`,
- `id`,
- `type`,
- `name`,
- `created`,
- `modified`,
- wszystkie pola niestandardowe `config`,
- zgodność `_id == config.id`,
- identyczną zawartość `body.txt`,
- brak utraty Itemów,
- brak duplikatów `config.address`,
- poprawne odnajdywanie po nazwach i fallback po GUID.

---

## 10. Model `dates`

Dla wielu wpisów `dates` nie tworzymy jednego ogromnego `body.txt` ani grup po 10 wpisów.

Rekomendowany układ:

```txt
dates (Folder Item)
├── date entry (Text Item)
├── date entry (Text Item)
├── date entry (Text Item)
└── ...
```

W MongoDB każdy Item — zarówno folder `dates`, jak i każdy wpis — jest osobnym dokumentem w `items`.

Przykładowy wpis:

```json
{
  "_id": "8d0f68f5-b9ad-4e2a-89cf-cf3bc4648ef4",
  "config": {
    "address": "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/15",
    "id": "8d0f68f5-b9ad-4e2a-89cf-cf3bc4648ef4",
    "type": "Text",
    "name": "2026-07-10",
    "created": "260710_120000",
    "modified": "260710_120000"
  },
  "body": "DATA: '2026-07-10'\nŹRÓDŁO: ''\nNAZWA: ''\nLINK: ''\nPULL: 'FALSE'\nCLOSE: NIE\nJAKOŚĆ: ''"
}
```

Korzyści:

- zapis i odczyt dotyczą jednego wpisu,
- nie trzeba pobierać i zapisywać całej listy,
- liczba wpisów nie wymaga ręcznego dzielenia na zakresy `0–9`, `10–19`,
- model pozostaje w pełni zgodny z Content Providerem.

Jeżeli w przyszłości potrzebne będą szybkie zapytania po polach zapisanych wewnątrz `body.txt`, np. `DATA`, `PULL` lub `CLOSE`, można dodać **odtwarzalną projekcję/read model**, np. kolekcję `dates_view`.

Taka projekcja:

- jest generowana z kanonicznych Itemów,
- może mieć typowane pola i indeksy,
- nie jest źródłem prawdy,
- może zostać usunięta i odbudowana bez utraty danych.

---

## 11. Odrzucone wcześniejsze warianty

Aktualna decyzja zastępuje wcześniejsze pomysły:

- jeden dokument MongoDB = jeden plik CP,
- osobne dokumenty dla `config.yaml` i `body.txt`,
- kolekcja `cp_files` / `content_provider_files`,
- `remaining_config`,
- `repoId` i `loca` zapisane jako pola cache,
- grupowanie wielu wpisów w jednym Itemie po 10,
- osobna kolekcja MongoDB dla każdego repo.

Finalnie:

```txt
jeden dokument MongoDB = jeden Item Content Providera
```

i:

```txt
Item = config + body
```

---

## 12. Finalna zasada

```txt
Content Provider:
    config.yaml + body.txt

MongoDB:
    jeden dokument:
        _id
        config
        body
```

Mapowanie:

```txt
config.yaml → config
body.txt    → body
config.id   → _id
```

Warunki:

```txt
_id == config.id
config.address jest unikalne
config.id jest globalnie unikalne
```

To jest prosty, odwracalny i pozbawiony zbędnej redundancji model, który zachowuje semantykę Content Providera, a MongoDB wykorzystuje jako natywny dokumentowy backend.
