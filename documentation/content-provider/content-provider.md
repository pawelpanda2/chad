sa ny # Content Provider / DocStore — specyfikacja struktury danych

## 1. Cel systemu

Content Provider to system do przechowywania dokumentów w widocznej strukturze plików i folderów.

Główne założenie: źródłem prawdy są realne pliki na dysku, a nie ukryta baza typu MongoDB. Dzięki temu dokumenty można przeglądać, edytować, backupować i wersjonować także poza aplikacją, np. w VS Code, Finderze, Git albo przez zwykłe narzędzia systemowe.

> **WAŻNE:** Na ten moment system obsługuje **wyłącznie pliki `body.txt`** jako treść dokumentów. Wszystkie przykłady z `body.yaml`, `body.json`, `body.hdr` w tej dokumentacji należy traktować jako przyszłe możliwości (future/roadmap), a nie aktualnie wspierane funkcje.

System ma obsługiwać:

- wiele osobnych repozytoriów dokumentów
- stabilne identyfikatory GUID dla repozytoriów i nodów
- widoczną strukturę folderów
- treść dokumentu w pliku `body.txt` (obecnie jedyny wspierany format)
- wersje i kopie treści, np. `body-01.txt`, `body-02.txt`
- konfigurację repozytorium i każdego noda przez `config.yaml`
- globalny indeks techniczny w `.docstore/`
- typy proste: `Text`, `Folder`
- kontrolę dostępu na poziomie repozytoriów
- eksport do Google Docs albo innych formatów

---

## 2. Główna struktura katalogów

Podstawowa struktura `cp-root`:

```text
cp-root/
  .docstore/
    index.sqlite
    index.json

  repos/
    0fc7da8d-3466-4964-a24c-dfc0d0fef87c/
      config.yaml
      01/
        02/
          03/
            config.yaml
            body.txt
            body.json
            body.yaml
            body.hdr
            body-01.txt
```

Znaczenie folderów:

| Element | Znaczenie |
|---|---|
| `cp-root/` | Główny folder danych Content Provider |
| `.docstore/` | Globalny techniczny indeks/cache dla całego `cp-root` |
| `.docstore/index.sqlite` | Szybki indeks do wyszukiwania po GUID, adresie, typie, nazwie itd. |
| `.docstore/index.json` | Opcjonalny prosty indeks / snapshot indeksu |
| `repos/` | Folder zawierający wszystkie repozytoria dokumentów |
| `repos/{repoGuid}/` | Jedno repozytorium dokumentów |
| `repos/{repoGuid}/config.yaml` | Konfiguracja repozytorium |
| `repos/{repoGuid}/{address}/config.yaml` | Konfiguracja konkretnego noda |
| `repos/{repoGuid}/{address}/body.*` | Treść noda w różnych formatach albo wersjach |

W tej wersji nie ma globalnego `cp-root/config.yaml`. Główny folder `cp-root` jest tylko kontenerem na `.docstore/` i `repos/`.

---

## 3. Poziomy modelu danych

System ma cztery główne poziomy:

```text
Content Provider
  cp-root
    repos/{repoId}
      {address}
        config.yaml
        body.*
```

Logiczny model:

```text
Content Provider = cały system
cp-root = główny folder danych
Repo = osobna przestrzeń dokumentów
Node = pojedynczy dokument / folder / referencja
NodeFile = konkretny plik noda, np. body.txt, body.json, body-01.txt
```

---

## 4. Repozytoria

Repozytorium to osobna przestrzeń dokumentów. Każde repozytorium ma własny GUID i własny folder w `repos/`.

Przykład:

```text
cp-root/
  repos/
    0fc7da8d-3466-4964-a24c-dfc0d0fef87c/
      config.yaml
```

Przykładowy `config.yaml` repozytorium:

```yaml
id: "0fc7da8d-3466-4964-a24c-dfc0d0fef87c"
name: "Sprawy prywatne"
type: "Folder"
createdAt: "2026-06-06T12:00:00+02:00"
updatedAt: "2026-06-06T12:00:00+02:00"
```

**Ważne:** Repozytorium to też jest `Folder`. Nie ma osobnego typu `Repository`. Pierwszy/root item w repo ma być po prostu `type: "Folder"`.

---

## 5. Node

Node to pojedynczy element w repozytorium. Może być dokumentem (`Text`) albo folderem (`Folder`).

Najważniejsza zasada:

```text
id = tożsamość noda
address = aktualna lokalizacja noda w strukturze
path = fizyczna ścieżka na dysku
```

`id` nie powinno się zmieniać nigdy, nawet po przeniesieniu noda w inne miejsce.

`address` może się zmieniać, bo oznacza aktualne miejsce noda w drzewie.

Przykład noda:

```text
repos/0fc7da8d-3466-4964-a24c-dfc0d0fef87c/01/02/03/
  config.yaml
  body.txt
  body.json
  body.yaml
```

Przykładowy `config.yaml` noda typu `Text`:

```yaml
id: "de021445-2ac5-4998-b4d4-8c3e7d24d8bb"
type: "Text"
name: "general; lrzdz; by stack"
address: "01/02/03"
primaryBody: "body.txt"
createdAt: "2026-06-06T12:00:00+02:00"
updatedAt: "2026-06-06T12:00:00+02:00"
```

---

## 6. Typy nodów

Podstawowe typy proste:

```text
Text
Folder
```

### 6.1. Text

`Text` to realny dokument. Może mieć jeden albo wiele plików treści:

```text
config.yaml
body.txt
body.json
body.yaml
body.hdr
body-01.txt
```

Przykład:

```yaml
id: "de021445-2ac5-4998-b4d4-8c3e7d24d8bb"
type: "Text"
name: "Notatka o architekturze"
address: "01/02/03"
primaryBody: "body.txt"
```

### 6.2. Folder

`Folder` to kontener organizacyjny. Może nie mieć `body.*`, a jedynie `config.yaml` i dzieci.

Przykład:

```yaml
id: "11111111-1111-1111-1111-111111111111"
type: "Folder"
name: "Active"
address: "01"
```

Folder służy do budowania struktury drzewa.

---

## 7. Struktura folderów w repo

**Bardzo ważna zasada:** Wszystkie foldery w repozytorium mają mieć nazwy tylko jako 2- lub 3-cyfrowe liczby.

**NAJWAŻNIEJSZE:** Folder `content/` jest CAŁKOWICIE ZABRONIONY. Nody są przechowywane bezpośrednio w folderze repozytorium.

Poprawnie:

```text
repos/{repoGuid}/
  config.yaml
  01/
    config.yaml
    02/
      config.yaml
      03/
        config.yaml
```

Niepoprawnie:

```text
repos/{repoGuid}/
  config.yaml
  content/
    01/
  Active/
  Users/
  Documents/
```

Nazwy typu "Active", "Users", "Documents", "content" nie są nazwami folderów. To ma być pole `name` w `config.yaml`.

Przykład:

```text
repos/{repoGuid}/
  config.yaml
  01/
    config.yaml
```

`config.yaml`:

```yaml
id: "11111111-1111-1111-1111-111111111111"
type: "Folder"
name: "Active"
address: "01"
```

Przy tworzeniu nowych folderów używaj kolejnych wolnych numerów:
- `01`
- `02`
- `03`
- itd.

---

## 8. Pliki noda

Jeden node może mieć wiele plików reprezentujących tę samą treść lub różne wersje tej treści.

Przykład:

```text
config.yaml
body.txt
body.json
body.yaml
body.hdr
body-01.txt
body-02.txt
body-backup-2026-06-06.txt
```

Znaczenie przykładowych plików:

| Plik | Znaczenie |
|---|---|
| `config.yaml` | Metadane i konfiguracja noda |
| `body.txt` | Główna/originalna treść tekstowa |
| `body.json` | Wersja JSON wygenerowana z oryginału albo edytowana ręcznie |
| `body.yaml` | Wersja YAML wygenerowana z oryginału albo edytowana ręcznie |
| `body.hdr` | Własny format / format headerowy / specjalny format systemu |
| `body-01.txt` | Starsza wersja / historia / kopia |
| `body-02.txt` | Kolejna starsza wersja / kopia |

Ważne rozróżnienie:

```text
body.txt = główny/originalny plik
body.json/body.yaml/body.hdr = alternatywne formaty tej samej treści
body-01.txt/body-02.txt = wersje historyczne albo kopie
```

### primaryBody

Można dodać w `config.yaml` informację o tym, który plik jest źródłowy:

```yaml
id: "de021445-2ac5-4998-b4d4-8c3e7d24d8bb"
type: "Text"
name: "Notatka"
address: "01/02/03"

primaryBody: "body.txt"
```

Przykłady poprawne:

```yaml
primaryBody: "body.txt"
primaryBody: "body.yaml"
primaryBody: "body.json"
```

Jeżeli treść ma strukturę, preferuj `body.yaml` albo `body.json`, bo wtedy wiadomo jak ją czytać.
`body.txt` zostaje dla zwykłego tekstu.

Kod powinien odczytywać primary body file na podstawie `primaryBody`.

---

## 9. Dane domenowe w body, nie w config

`config.yaml` ma opisywać technicznie node. Nie wpisuj tam danych domenowych.

Niepoprawnie:

```yaml
# config.yaml - ŹLE!
id: "..."
type: "Text"
name: "Permissions"
address: "01/03"
permissions:
  - userId: "pawelf"
    role: "owner"
  - userId: "kamils"
    role: "owner"
```

Poprawnie:

`config.yaml`:

```yaml
id: "..."
type: "Text"
name: "Permissions"
address: "01/03"
primaryBody: "body.yaml"
```

`body.yaml`:

```yaml
permissions:
  - userId: "pawelf"
    role: "owner"
  - userId: "kamils"
    role: "owner"
```

Dane domenowe powinny być w `body.yaml` albo `body.json`.

---

## 10. Historia i wersjonowanie

Wersje można przechowywać jako realne pliki:

```text
body.txt
body-01.txt
body-02.txt
body-03.txt
```

Albo z datą:

```text
body.txt
body-2026-06-06-1200.txt
body-2026-06-07-0900.txt
```

Rekomendacja MVP:

```text
body.txt = aktualna wersja
body-01.txt = starsza kopia
body-02.txt = jeszcze starsza kopia
```

Dodatkowo można używać Git do pełniejszej historii zmian plików. Wtedy pliki `body-01.txt` są bardziej ręcznymi snapshotami, a Git jest głównym mechanizmem historii technicznej.

---

## 11. Indeks globalny

Indeks globalny znajduje się w:

```text
cp-root/.docstore/
  index.sqlite
  index.json
```

Filesystem jest źródłem prawdy, a indeks jest tylko cachem / przyspieszeniem wyszukiwania.

Indeks powinien pozwalać szybko znaleźć:

- node po `id`
- node po `repoId + id`
- node po `address`
- node po `name`
- node po `type`
- wszystkie dzieci danego folderu

Przykładowy `index.json`:

```json
{
  "nodes": {
    "0fc7da8d-3466-4964-a24c-dfc0d0fef87c:de021445-2ac5-4998-b4d4-8c3e7d24d8bb": {
      "repoId": "0fc7da8d-3466-4964-a24c-dfc0d0fef87c",
      "id": "de021445-2ac5-4998-b4d4-8c3e7d24d8bb",
      "type": "Text",
      "name": "general; lrzdz; by stack",
      "address": "01/02/03",
      "path": "repos/0fc7da8d-3466-4964-a24c-dfc0d0fef87c/01/02/03",
      "primaryBody": "body.txt"
    }
  }
}
```

SQLite może mieć np. takie tabele:

```text
repositories
nodes
node_files
```

Przykładowe pola dla `nodes`:

```text
repo_id
node_id
type
name
address
path
primary_body
created_at
updated_at
```

---

## 12. Przenoszenie noda

Przeniesienie noda nie zmienia jego `id`.

Zmienia się tylko:

- fizyczna ścieżka folderu
- `address` w `config.yaml`
- wpis w indeksie

Przykład przed:

```yaml
id: "de021445-2ac5-4998-b4d4-8c3e7d24d8bb"
address: "01/02/03"
```

Po przeniesieniu:

```yaml
id: "de021445-2ac5-4998-b4d4-8c3e7d24d8bb"
address: "04/01/03"
```

Tożsamość noda pozostaje taka sama.

---

## 13. Dostęp i bezpieczeństwo

Dostęp najlepiej trzymać na poziomie repozytorium.

Przy odczycie noda system sprawdza:

1. Czy user ma dostęp do repozytorium, w którym leży node

---

## 14. Rekomendowana architektura techniczna

Najlepszy kierunek dla integracji z Next.js / shadcn dashboard:

```text
Filesystem = źródło prawdy
SQLite = globalny indeks/cache
Next.js = API + GUI
TypeScript = logika DocStore
Git = opcjonalna historia/backup
```

Przykładowa struktura kodu w aplikacji Next.js:

```text
src/
  lib/
    doc-store/
      models.ts
      config-parser.ts
      node-reader.ts
      node-writer.ts
      node-index.ts
      node-mover.ts
      repo-service.ts
      permissions-service.ts

  app/
    api/
      docstore/
        nodes/
          route.ts
        repos/
          route.ts

    dashboard/
      documents/
        page.tsx
```

Najważniejsze serwisy:

| Serwis | Odpowiedzialność |
|---|---|
| `RepoService` | Odczyt i zarządzanie repozytoriami |
| `NodeReader` | Odczyt noda z folderu |
| `NodeWriter` | Zapis configu i plików body |
| `NodeIndexService` | Budowanie i odświeżanie indeksu |
| `NodeMover` | Przenoszenie noda bez zmiany `id` |
| `PermissionsService` | Sprawdzanie dostępu |

---

## 15. Minimalne reguły standardu

### Repo

Każde repozytorium:

- jest folderem w `cp-root/repos/{repoGuid}`
- ma `config.yaml`
- ma unikalny `id`
- ma `type: "Folder"` (nie `Repository`)

### Node

Każdy node:

- jest folderem w `repos/{repoGuid}/{address}`
- ma `config.yaml`
- ma stałe `id`
- ma `type`
- ma `name`
- ma `address`

### Text

Node typu `Text`:

- ma przynajmniej jeden plik `body.*`
- ma `primaryBody` wskazujące na główny plik
- domyślnie główny plik to `body.txt`

### Folder

Node typu `Folder`:

- może mieć tylko `config.yaml`
- służy do organizacji dzieci

---

## 16. Nawigacja po logicznych nazwach - getByNames()

Backend powinien używać logicznych nazw do odwoływania się do danych, a nie technicznych ścieżek.

### Funkcja getByNames()

```typescript
/**
 * Znajduje node po logicznych nazwach z config.yaml
 * 
 * @param repoId - GUID repozytorium
 * @param ...names - kolejne logiczne nazwy (name z config.yaml)
 * @returns Node z config i body (jeśli primaryBody jest ustawione)
 */
async function getByNames(
  repoId: string,
  ...names: string[]
): Promise<CpNode | null>
```

### Przykład użycia

```typescript
// Znajdź node o ścieżce logicznej: users / users-list
const usersListNode = await contentProvider.getByNames(
  "0fc7da8d-3466-4964-a24c-dfc0d0fef87c",
  "users",
  "users-list"
);

// Odczytaj dane użytkowników z body.yaml
const users = usersListNode.body.users;
```

### Jak to działa

1. Funkcja znajduje repozytorium po `repoId`
2. Szuka dziecka o `name: "users"` w config.yaml (w folderze repo)
3. W tym folderze szuka dziecka o `name: "users-list"`
4. Zwraca znaleziony node z odczytanym `primaryBody`

### Ważne

- **Adresy techniczne** (01, 01/01, 02/03) są tylko ścieżkami fizycznymi
- **Nazwy logiczne** (users, users-list, invoices) są w polu `name` w config.yaml
- Backend powinien używać `getByNames()` zamiast znać techniczne ścieżki

---

## 17. Najważniejsze decyzje projektowe

Aktualnie przyjęty standard:

```text
Nazwa systemu: Content Provider
Główny folder danych: cp-root
Folder repozytoriów: repos
Techniczny folder indeksu: .docstore
Konfiguracja repozytorium: config.yaml
Konfiguracja noda: config.yaml
Źródło prawdy: filesystem
Indeks: SQLite + opcjonalnie JSON
Typy proste: Text, Folder (AI/kod używa tylko tych typów)
Tożsamość repo: repo GUID
Tożsamość noda: node GUID
Globalna tożsamość noda: repoGuid + nodeGuid
Adres: tylko lokalizacja, nie tożsamość
Nazwy folderów: tylko 2- lub 3-cyfrowe liczby (01, 02, 03, itd.)
```

**Ważne zasady:**

1. **Nazwy folderów:** Wszystkie foldery w repozytorium mają nazwy tylko jako 2- lub 3-cyfrowe liczby. Nazwy logiczne (np. "Active", "Users") są w polu `name` w `config.yaml`.

2. **Typy dla AI/kod:** Na razie kod i seed mają używać tylko typów `Folder` i `Text`. Nie twórz typu `Ref` w seedzie ani w automatycznie generowanych przykładach.

3. **Repo to Folder:** Nie ma typu `Repository`. Pierwszy/root item w repo ma być po prostu `type: "Folder"`.

4. **Brak googleDocId w podstawowej logice:** Nie używaj `googleDocId` w seedzie ani w podstawowych przykładach. To może być przyszłe pole dla eksportu.

5. **Dane domenowe w body:** `config.yaml` ma tylko techniczne metadane. Dane domenowe (np. permissions) powinny być w `body.yaml` lub `body.json`.

---

## 17. Przykład kompletnego repozytorium

```text
cp-root/
  .docstore/
    index.sqlite
    index.json

  repos/
    0fc7da8d-3466-4964-a24c-dfc0d0fef87c/
      config.yaml
      01/
        config.yaml
        02/
          config.yaml
          03/
            config.yaml
            body.txt
            body.json
            body.yaml
            body-01.txt
```

`repos/0fc7.../config.yaml`:

```yaml
id: "0fc7da8d-3466-4964-a24c-dfc0d0fef87c"
name: "Main repo"
type: "Folder"
createdAt: "2026-06-06T12:00:00+02:00"
updatedAt: "2026-06-06T12:00:00+02:00"
```

`repos/0fc7.../01/config.yaml`:

```yaml
id: "11111111-1111-1111-1111-111111111111"
type: "Folder"
name: "Active"
address: "01"
createdAt: "2026-06-06T12:00:00+02:00"
updatedAt: "2026-06-06T12:00:00+02:00"
```

`repos/0fc7.../01/02/config.yaml`:

```yaml
id: "22222222-2222-2222-2222-222222222222"
type: "Folder"
name: "Documents"
address: "01/02"
createdAt: "2026-06-06T12:00:00+02:00"
updatedAt: "2026-06-06T12:00:00+02:00"
```

`repos/0fc7.../01/02/03/config.yaml`:

```yaml
id: "91300cf5-2b72-4a8f-8a9d-bf7df9d6c9da"
type: "Text"
name: "Target document"
address: "01/02/03"
primaryBody: "body.txt"
createdAt: "2026-06-06T12:00:00+02:00"
updatedAt: "2026-06-06T12:00:00+02:00"
```

---

## 18. Krótkie podsumowanie

Content Provider powinien działać jako filesystem-based document store.

Najważniejsza idea:

```text
Foldery i pliki są prawdziwe i widoczne.
GUID-y dają stabilną tożsamość.
Adresy są tylko lokalizacją.
SQLite przyspiesza wyszukiwanie.
Foldery mają nazwy numeryczne (01, 02, 03).
Nazwy logiczne są w config.yaml jako name.
```

To daje system, który jest prosty, czytelny, przenośny, kompatybilny z Git i jednocześnie wystarczająco mocny, żeby podłączyć do niego GUI, API, eksporty i uprawnienia.