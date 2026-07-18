# Project Items - Mapa danych w Content Provider

Ten plik zawiera mapowanie specjalnych dla tego projektu danych/encji na ich lokalizacje w Content Provider.

## Zasada

Jeśli dodajesz nową encję/dane przechowywane w Content Provider, dopisz ją do tego pliku.

**WAŻNE:** Backend powinien ZAWSZE pobierać dane przez funkcję `getByNames()`, a nie przez fizyczne ścieżki. Fizyczne ścieżki (np. `01/01/body.yaml`) służą tylko do debugowania i dokumentacji. Normalny kod aplikacji musi używać `getByNames(repoGuid, ["users", "users-list"])`.

---

## Users (Użytkownicy)

**Project item:** `users`

**Content Provider location:**
- repo: `0fc7da8d-3466-4964-a24c-dfc0d0fef87c`
- logical path: `users` / `users-list`
- primary body: `body.yaml`

**Physical path:**
```
cp-root/repos/0fc7da8d-3466-4964-a24c-dfc0d0fef87c/01/01/body.yaml
```

**Struktura folderów:**
```
cp-root/repos/0fc7da8d-3466-4964-a24c-dfc0d0fef87c/
  config.yaml
  01/
    config.yaml                    # name: "users", type: "Folder"
    01/
      config.yaml                  # name: "users-list", type: "Text", primaryBody: "body.yaml"
      body.yaml                    # dane użytkowników
```

**Backend access:**
```typescript
const usersListNode = await contentProvider.getByNames(
  "0fc7da8d-3466-4964-a24c-dfc0d0fef87c",
  "users",
  "users-list"
);

const users = usersListNode.body.users;
```

**Struktura body.yaml:**
```yaml
users:
  - id: "..."
    email: "..."
    name: "..."
    passwordHash: "..."  # bcrypt/argon2 hash, NIGDY plain text
    createdAt: "2026-06-06T12:00:00+02:00"
    updatedAt: "2026-06-06T12:00:00+02:00"
```

---

## Dodawanie nowych project items

Aby dodać nową encję:

1. Utwórz strukturę folderów w Content Provider:
   - Użyj kolejnych wolnych numerów (01, 02, 03...)
   - Stwórz config.yaml z odpowiednimi metadanymi
   - Stwórz body.yaml/body.json z danymi

2. Dodaj wpis do tego pliku z:
   - Nazwą project item
   - Lokalizacją w Content Provider (repo, logical path, primary body)
   - Physical path
   - Przykładem backend access z `getByNames()`
   - Strukturą danych w body.yaml/json