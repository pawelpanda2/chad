# DataLib Features - Content Provider Operations

Dokument opisuje operacje dostępne w Content Provider dla aplikacji personal-dashboard.

## Overview

Content Provider udostępnia zestaw operacji do zarządzania danymi w strukturze repozytoriów. Wszystkie operacje używają **nazw logicznych**, a nie fizycznych ścieżek.

## Available Operations

### 1. GetByNames (Read)

Operacja odczytu danych z użyciem nazw logicznych.

```csharp
var result = argsService.Invoke(new[]
{
    "IRepoService", "IItemWorker", "GetByNames",
    "root",        // repo root
    "users",       // logical folder name
    "users-list"   // item name
});
```

**Zastosowanie:**
- Odczyt listy użytkowników
- Odczyt struktury folderów
- Odczyt rekordów formularzy

**Przykład dla formularzy:**
```csharp
// Odczyt wszystkich rekordów action dla użytkownika
var result = argsService.Invoke(new[]
{
    "IRepoService", "IItemWorker", "GetByNames",
    "root",
    "repos",
    "<userGuid>",
    "forms",
    "action"
});
```

### 2. PostByNames (Ensure Path Exists)

Operacja tworzenia/gwarancji istnienia ścieżki logicznej.

```csharp
var result = argsService.Invoke(new[]
{
    "IRepoService", "IItemWorker", "PostByNames",
    "root",          // repo root
    "forms",         // logical folder name
    "action",        // form type
    "260610_221131"  // record key
});
```

**Zastosowanie:**
- Tworzenie brakujących folderów po drodze
- Tworzenie itemu dla rekordu
- Gwarancja, że ścieżka istnieje przed zapisem

**Właściwości:**
- **Idempotentna** — można wywołać wielokrotnie
- **Atomowa** — tworzy całą ścieżkę na raz
- **Bezpieczna** — nie nadpisuje istniejących danych

### 3. WriteFile (Write Body)

Operacja zapisu contentu do itemu.

```csharp
var result = argsService.Invoke(new[]
{
    "IRepoService", "IItemWorker", "WriteFile",
    "root",
    "forms",
    "action",
    "260610_221131",
    "body.yaml",
    bodyYamlContent
});
```

**Zastosowanie:**
- Zapis danych formularza
- Aktualizacja contentu itemu

## Two-Step Write Flow

Zapis danych do Content Provider zawsze działa **dwuetapowo**:

### Step 1: PostByNames (Ensure Path)

```typescript
// Najpierw upewniamy się, że ścieżka istnieje
const postResult = await invokeContentProvider([
  'IRepoService',
  'IItemWorker',
  'PostByNames',
  'root',
  'forms',
  'action',
  '260610_221131'
]);
```

### Step 2: WriteFile (Write Content)

```typescript
// Potem zapisujemy content
const writeResult = await invokeContentProvider([
  'IRepoService',
  'IItemWorker',
  'WriteFile',
  'root',
  'forms',
  'action',
  '260610_221131',
  'body.yaml',
  bodyYaml
]);
```

### Dlaczego dwuetapowo?

1. **Separacja odpowiedzialności** — PostByNames tworzy strukturę, WriteFile zapisuje dane
2. **Idempotentność** — PostByNames można bezpiecznie powtarzać
3. **Atomowość** — najpierw struktura, potem dane
4. **Bezpieczeństwo** — unikamy błędów gdy ścieżka nie istnieje

## Logical Path Resolution

Wszystkie operacje używają **nazw logicznych**, które są resolves do fizycznych ścieżek poprzez sprawdzanie `config.yaml` w każdym folderze.

### Przykład resolucji

Logiczna ścieżka:
```
root / forms / action / 260610_221131
```

Fizyczna struktura:
```
cp-root/repos/<userGuid>/
  01/
    config.yaml  # name: "forms"
    01/
      config.yaml  # name: "action"
      01/
        config.yaml  # name: "260610_221131"
        body.yaml
```

Content Provider:
1. Szuka w repo folderu `01`, `02`, itd.
2. Sprawdza `config.yaml` w każdym
3. Wybiera ten z `name: "forms"`
4. W środku powtarza proces dla `"action"`
5. I tak dalej...

## Best Practices

### ✅ DOBRE

```typescript
// Używaj nazw logicznych
await invokeContentProvider([
  'IRepoService', 'IItemWorker', 'GetByNames',
  'root', 'forms', 'action', '260610_221131'
]);

// Zawsze PostByNames przed WriteFile
await invokeContentProvider([
  'IRepoService', 'IItemWorker', 'PostByNames',
  'root', 'forms', 'action', '260610_221131'
]);
await invokeContentProvider([
  'IRepoService', 'IItemWorker', 'WriteFile',
  'root', 'forms', 'action', '260610_221131', 'body.yaml', bodyYaml
]);
```

### ❌ ZŁE

```typescript
// Nie używaj fizycznych ścieżek
await invokeContentProvider([
  'IRepoService', 'IItemWorker', 'GetByNames',
  'root', '01', '01', '260610_221131'  // ŹLE!
]);

// Nie pisz bezpośrednio bez PostByNames
await invokeContentProvider([
  'IRepoService', 'IItemWorker', 'WriteFile',
  'root', 'forms', 'action', '260610_221131', 'body.yaml', bodyYaml
  // Ryzykowne jeśli ścieżka nie istnieje!
]);
```

## Error Handling

### PostByNames Errors

- **Path already exists**: Zwraca istniejący item (nie błąd)
- **Invalid name**: Błąd walidacji nazwy logicznej
- **Permission denied**: Brak uprawnień do tworzenia

### WriteFile Errors

- **Path not found**: Ścieżka nie istnieje (rozwiązanie: użyj PostByNames)
- **Invalid content**: Błąd formatu contentu
- **File too large**: Przekroczony limit rozmiaru

## Performance Considerations

1. **PostByNames** jest szybki — tworzy tylko brakujące elementy
2. **WriteFile** jest szybki — zapisuje tylko content
3. **GetByNames** może być wolniejszy — skanuje foldery

### Optymalizacja

```typescript
// Dla wielu rekordów, użyj jednego PostByNames na ścieżkę
// Potem wiele WriteFile operacji
await postByNames('root', 'forms', 'action', 'record1');
await writeFile('root', 'forms', 'action', 'record1', 'body.yaml', data1);

await writeFile('root', 'forms', 'action', 'record2', 'body.yaml', data2);
// record2 musi mieć własny PostByNames jeśli ścieżka nie istnieje
```

## See Also

- `architecture/data-retrieve.md` — szczegółowy opis GetByNames
- `architecture/features/forms-features.md` — przykład użycia dla formularzy
- `lib/form-storage.ts` — implementacja w TypeScript