# Data Retrieval via Content Provider - GetByNames

Dokument wyjaśnia, jak działa pobieranie danych z Content Providera przez `GetByNames`, żeby nie zgadywać ścieżek.

## Najważniejsza zasada

`GetByNames` **nie dostaje** fizycznych folderów typu `01/02`.
Dostaje **nazwy logiczne**, a Content Provider przechodzi po folderach i sprawdza `config.yaml`.

## Przykład logicznej ścieżki

```
0fc7da8d-3466-4964-a24c-dfc0d0fef87c / "users" / "users-list"
```

## Jak to działa fizycznie

1. `0fc7da8d-3466-4964-a24c-dfc0d0fef87c` wskazuje repo w `cp-root/repos/<guid>`
2. Content Provider szuka w repo folderu `01`, `02`, `03`, itd.
3. W każdym folderze sprawdza `config.yaml`
4. Wybiera ten folder, którego `name` w `config.yaml` to `users`
5. Potem w środku znowu szuka folderów `01`, `02`, itd.
6. Wybiera ten folder, którego `name` w `config.yaml` to `users-list`
7. Dopiero wtedy zwraca znaleziony item/body

## Struktura fizyczna

```
cp-root/repos/0fc7da8d-3466-4964-a24c-dfc0d0fef87c/
  01/
    config.yaml  # name: "users"
    01/
      config.yaml  # name: "users-list"
      body.yaml    # dane
```

## Przykład dla formularzy

Logiczna ścieżka:
```
<userGuid> / "forms" / "action" / "260610_191531"
```

Fizyczna struktura:
```
cp-root/repos/<userGuid>/
  01/
    config.yaml  # name: "forms"
    01/
      config.yaml  # name: "action"
      01/
        config.yaml  # name: "260610_191531"
        body.yaml    # dane formularza
```

## C# reference call

```csharp
var args2 = new string[] { "IRepoService", "IItemWorker", "GetByNames", "root", "users", "users-list" };
var result2 = argsService.Invoke(args2);
```

## Two-step write flow

Zapis formularza do Content Provider działa dwuetapowo:

### Step 1 — ensure path exists (PostByNames)

Najpierw wywołujemy `PostByNames`, aby upewnić się, że logiczna ścieżka istnieje i utworzyć brakujące foldery/item:

```csharp
// Dla formularza action:
var rA1 = argsService.Invoke(new[]
{
    "IRepoService", "IItemWorker", "PostByNames",
    "root",          // repo root
    "forms",         // logical folder name
    "action",        // form type
    "260610_221131"  // record key (YYMMDD_HHMMSS)
});

// PostByNames:
// - tworzy brakujące foldery po drodze (forms, action)
// - tworzy item dla recordKey
// - zwraca info o utworzonym/znalezionym itemie
```

`PostByNames` gwarantuje, że cała ścieżka logiczna istnieje. Jeśli foldery już istnieją, nie robi nic złego — po prostu zwraca istniejący item.

### Step 2 — write body (Put/WriteFile)

Po uzyskaniu pewności, że ścieżka istnieje, zapisujemy właściwy content:

```csharp
// Dla formularza action:
var bodyYaml = "formName: action\nuserGuid: ...\n...";

var rA2 = argsService.Invoke(new[]
{
    "IRepoService", "IItemWorker", "WriteFile",
    "root",
    "forms",
    "action",
    "260610_221131",
    "body.yaml",
    bodyYaml
});
```

### Przykład pełnego zapisu formularza action

```csharp
// 1. Ensure path exists
var postResult = argsService.Invoke(new[]
{
    "IRepoService", "IItemWorker", "PostByNames",
    "root", "forms", "action", "260610_221131"
});

// 2. Write body
var bodyYaml = yaml.Serialize(new {
    formName = "action",
    userGuid = "3c315f8e-6b14-46ab-9d5d-147efef6bde6",
    createdAt = DateTime.Now.ToString("o"),
    recordKey = "260610_221131",
    actionTitle = "26-06-10_dg",
    actionType = "dg",
    actionTypeLabel = "daygame",
    actionStartTime = "22:11",
    notes = "Dobra sesja"
});

var writeResult = argsService.Invoke(new[]
{
    "IRepoService", "IItemWorker", "WriteFile",
    "root", "forms", "action", "260610_221131", "body.yaml", bodyYaml
});
```

### Dlaczego dwuetapowo?

1. **Idempotentność** — `PostByNames` można wywołać wielokrotnie bez ryzyka duplikacji
2. **Atomowość** — najpierw tworzymy strukturę, potem zapisujemy dane
3. **Bezpieczeństwo** — unikamy błędów gdy ścieżka nie istnieje

### Ważne

- **Nie używaj** fizycznych ścieżek `01/02` w kodzie aplikacji
- **Zawsze** używaj nazw logicznych: `"forms"`, `"action"`, `"lead"`
- Content Provider sam znajdzie odpowiednie foldery po `config.yaml`
- Każdy folder musi mieć `config.yaml` z polem `name`
- **Zapis zawsze wykonuj dwuetapowo**: `PostByNames` → `WriteFile`
