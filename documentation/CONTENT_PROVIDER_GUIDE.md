# Content Provider Implementation Guide

## Overview

Content Provider to system do przechowywania dokumentów w widocznej strukturze plików i folderów, zgodnie z specyfikacją w `architecture/content-provider.md`.

## Struktura projektu

### Główne foldery:

```
lib/content-provider/          # Główny moduł Content Provider
  types.ts                     # Definicje typów TypeScript
  config.ts                    # Konfiguracja i ścieżki
  fs-utils.ts                  # Operacje na plikach
  repo-service.ts              # Operacje na repozytoriach
  node-service.ts              # Operacje na nodach
  index-service.ts             # Globalny indeks
  seed.ts                      # Seedowanie przykładowych danych
  index.ts                     # Główny entry point z eksportami

app/api/content-provider/      # API endpoints
  repos/route.ts               # GET/POST /api/content-provider/repos
  nodes/route.ts               # GET /api/content-provider/nodes
  index/route.ts               # GET/POST /api/content-provider/index

app/(dashboard)/dashboard/content-provider/page.tsx  # Dashboard UI

cp-root/                       # Domyślna lokalizacja bazy
  .docstore/
    index.json                 # Globalny indeks
    index.sqlite               # Przygotowane miejsce na SQLite
  repos/
    {repoId}/
      config.yaml              # Konfiguracja repozytorium
      content/
        {address}/
          config.yaml          # Konfiguracja noda
          body.*               # Pliki z treścią
```

## Konfiguracja

### Zmienna środowiskowa

```bash
CONTENT_PROVIDER_ROOT_PATH=./cp-root
```

Domyślnie: `./cp-root` w głównym folderze repozytorium.

Można ustawić dowolną ścieżkę absolutną lub relatywną.

## Jak używać

### 1. Inicjalizacja

```typescript
import { initContentProvider } from '@/lib/content-provider';

// Inicjalizuj z automatycznym seedowaniem jeśli pusto
const result = await initContentProvider({ seedIfEmpty: true });
console.log(result); // { success: true, rootPath: '...', message: '...' }
```

### 2. Praca z repozytoriami

```typescript
import { listRepos, readRepo, createRepo } from '@/lib/content-provider';

// Lista wszystkich repozytoriów
const repos = listRepos();

// Czytaj konfigurację repozytorium
const repo = readRepo('repo-id');

// Utwórz nowe repozytorium
const newRepo = createRepo({
  id: 'new-repo-id',
  name: 'My Repository',
  type: 'Repository',
  permissions: [{ userId: 'user1', role: 'owner' }]
});
```

### 3. Praca z nodami

```typescript
import { listNodes, readNodeByAddress, readNodeById, resolveRefNode } from '@/lib/content-provider';

// Lista wszystkich nodów w repozytorium
const nodes = listNodes('repo-id');

// Czytaj node po address
const node = readNodeByAddress('repo-id', 'Active/05/44');

// Czytaj node po ID
const nodeById = readNodeById('repo-id', 'node-id');

// Rozwiąż referencję (Ref -> Text)
if (node.config.type === 'Ref') {
  const resolved = resolveRefNode('repo-id', node.config);
  console.log('Resolved to:', resolved.config.name);
}
```

### 4. API Endpoints

#### GET /api/content-provider/repos
Zwraca listę wszystkich repozytoriów.

#### POST /api/content-provider/repos
Tworzy nowe repozytorium.
Body: `{ id, name, permissions }`

#### GET /api/content-provider/nodes?repoId=xxx
Zwraca listę nodów w repozytorium.

#### GET /api/content-provider/nodes?repoId=xxx&id=yyy
Zwraca szczegóły noda po ID.

#### GET /api/content-provider/nodes?repoId=xxx&address=zzz
Zwraca szczegóły noda po address.

#### GET /api/content-provider/index
Zwraca statystyki indeksu.

#### POST /api/content-provider/index?action=rebuild
Przebudowuje globalny indeks.

## Struktura cp-root (przykład)

```
cp-root/
  .docstore/
    index.json
    index.sqlite

  repos/
    0fc7da8d-3466-4964-a24c-dfc0d0fef87c/
      config.yaml                        # Konfiguracja repozytorium
      content/
        01/                              # Folder node (address: "01", name: "Active")
          config.yaml
          05/
            44/
              config.yaml                # Text node (address: "01/05/44", name: "Target Document")
              body.txt                   # Główna treść
              body-01.txt                # Wersja historyczna
        01/
          17/
            08/
              09/
                config.yaml              # Ref node (address: "01/17/08/09", name: "Reference to Target Document")
```

### Ważne zasady struktury folderów:

1. **Nazwy folderów**: Wewnątrz repozytorium foldery mają nazwy dwucyfrowych lub trzycyffrowych liczb (01, 02, 03, ..., 17, 08, 09, itd.)
2. **Numerowanie**: Nowe foldery numeruje się po kolei od 01, 02, 03, itd.
3. **Nazwa noda**: Prawdziwa nazwa noda jest przechowywana w pliku `config.yaml` w polu `name`, a nie w nazwie folderu
4. **Address**: Pełny address noda to ścieżka folderów oddzielona ukośnikami (np. "01/05/44")

## Typy nodów

### Text
Dokument z treścią. Obecnie wspierane pliki:
- `body.txt` - główna i jedyna wspierana treść
- `body-01.txt`, `body-02.txt` - wersje historyczne/kopie

> **Uwaga:** W przyszłości można rozważyć wsparcie dla alternatywnych formatów (`body.yaml`, `body.json`, `body.hdr`), ale na ten moment system obsługuje wyłącznie `body.txt`.

### Folder
Kontener organizacyjny. Zwykle ma tylko `config.yaml`.

### Ref
Referencja do innego noda. Zawiera:
- `refGuid` - ID noda docelowego (główne źródło prawdy)
- `refRepo` - opcjonalne ID repozytorium docelowego
- `refAddress` - pomocniczy address (cache)

## Rozwiązywanie referencji

```typescript
// Automatyczne rozwiązywanie (domyślnie)
const result = getNode('repo-id', { address: 'Active/17/08/09' });
if (result.resolved) {
  console.log('Ref points to:', result.node.config.name);
}

// Bez rozwiązywania
const refNode = getNode('repo-id', { address: 'Active/17/08/09' }, { resolveRef: false });
```

## Dashboard

Dostępny pod adresem: `/dashboard/content-provider`

Funkcjonalności:
- Przeglądanie repozytoriów
- Lista nodów z wyszukiwarką
- Statystyki indeksu
- Przebudowywanie indeksu
- Wykrywanie zerwanych referencji

## Testowanie

1. Uruchom aplikację:
```bash
npm run dev
```

2. Odwiedź dashboard Content Provider:
```
http://localhost:3000/dashboard/content-provider
```

3. Testuj API:
```bash
# Lista repozytoriów
curl http://localhost:3000/api/content-provider/repos

# Lista nodów
curl "http://localhost:3000/api/content-provider/nodes?repoId=0fc7da8d-3466-4964-a24c-dfc0d0fef87c"

# Szczegóły noda
curl "http://localhost:3000/api/content-provider/nodes?repoId=0fc7da8d-3466-4964-a24c-dfc0d0fef87c&address=Active/05/44"

# Statystyki indeksu
curl http://localhost:3000/api/content-provider/index

# Przebuduj indeks
curl -X POST "http://localhost:3000/api/content-provider/index?action=rebuild"
```

## Przykładowe dane

Repozytorium zostało zseedowane z przykładowymi danymi:
- **Repository**: Main Repository (0fc7da8d-3466-4964-a24c-dfc0d0fef87c)
- **Folder**: Active (11111111-1111-1111-1111-111111111111)
- **Text Node**: Target Document (91300cf5-2b72-4a8f-8a9d-bf7df9d6c9da)
- **Ref Node**: Reference to Target Document (5ab4f5c9-e7c7-4028-8023-842fbb8442d2)

Użytkownicy z uprawnieniami:
- `pawelf` - owner
- `kamils` - owner

## Ważne zasady

1. **Źródło prawdy**: Pliki na dysku są źródłem prawdy
2. **Indeks**: `.docstore/index.json` to cache techniczny
3. **ID vs Address**: ID jest stałe, address może się zmieniać
4. **Referencje**: Główne źródło prawdy to `refGuid` (+ opcjonalnie `refRepo`)
5. **Bezpieczeństwo**: Limit głębokości referencji = 10, wykrywanie cykli

## Rozwój

Moduł jest przygotowany do rozbudowy:
- Dodawanie nowych typów nodów
- Integracja z Google Docs API
- Pełna obsługa SQLite
- Kontrola dostępu na poziomie nodów
- Wersjonowanie i historia zmian
- Eksport/import danych