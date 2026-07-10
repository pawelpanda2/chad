# Resolve Paths Principle

## Overview

This document describes the critical principle for working with Content Provider API paths. Understanding the difference between **path by names** and **numeric loca** is essential for correct API usage.

## Key Concepts

### Path by Names vs Numeric Loca

There are two types of paths in the Content Provider API:

1. **Path by Names** (human-readable)
   - Example: `["leads", "all items"]` or `["leads", "06"]`
   - Used with `GetByNames` method to resolve to actual items
   - Cannot be used directly with methods like `FindRecursively`, `GetItem`, `Put`

2. **Numeric Loca** (actual address)
   - Example: `"03/06"` or `"06/73/02/status"`
   - The real numeric path stored in `Settings.address`
   - Required by methods like `FindRecursively`, `GetItem`, `Put`

### Settings.address Format

When you call `GetByNames`, the response contains `Settings.address` with the full path:

```
21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06
```

The format is: `{repoId}/{numericLoca}`

To get the numeric loca, strip the repoId prefix:
- Full address: `21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06`
- Repo ID: `21d11bdc-f1f4-44d1-b61a-3fa6b039c641`
- Numeric loca: `03/06`

## Resolution Process

### Step 1: Call GetByNames

First, resolve the path by names to get the actual item:

```typescript
// Request
["IRepoService", "IItemWorker", "GetByNames", "21d11bdc-f1f4-44d1-b61a-3fa6b039c641", "leads", "all items"]

// Response
{
  Settings: {
    address: "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06",
    name: "all items",
    // ... other fields
  },
  Body: { /* ... */ }
}
```

### Step 2: Extract Numeric Loca

From the response, extract and parse `Settings.address`:

```typescript
const address = response.Settings.address; // "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06"
const repoId = "21d11bdc-f1f4-44d1-b61a-3fa6b039c641";
const loca = address.substring(repoId.length + 1); // "03/06"
```

### Step 3: Use with API Methods

Now use the resolved numeric loca with methods that require it:

```typescript
// Correct: using resolved numeric loca
["IRepoService", "IMethodWorker", "FindRecursively", "21d11bdc-f1f4-44d1-b61a-3fa6b039c641", "03/06", "//todo"]

// WRONG: using names directly (will fail!)
["IRepoService", "IMethodWorker", "FindRecursively", "21d11bdc-f1f4-44d1-b61a-3fa6b039c641", "leads", "06", "//todo"]
```

## Helper Functions

The `chad-dba` package provides helper functions for path resolution:

### chad_ResolveByNames(repoId, ...names)

Calls `GetByNames` and returns the full item response:

```typescript
const item = await chad_ResolveByNames(SHARED_REPO_ID, "leads", "all items");
console.log(item.Settings.address); // "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06"
```

### chad_GetLocaFromAddress(address, repoId)

Extracts numeric loca from a full address:

```typescript
const address = "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06";
const repoId = "21d11bdc-f1f4-44d1-b61a-3fa6b039c641";
const loca = chad_GetLocaFromAddress(address, repoId); // "03/06"
```

### chad_ResolveLocaByNames(repoId, ...names)

Combines both steps to directly get numeric loca from names:

```typescript
const loca = await chad_ResolveLocaByNames(SHARED_REPO_ID, "leads", "all items");
console.log(loca); // "03/06"
```

### chad_GetLeadsLoca()

Convenience function for getting leads folder loca:

```typescript
const leadsLoca = await chad_GetLeadsLoca();
console.log(leadsLoca); // e.g., "03/06"
```

### chad_GetRelativeLoca(fullLoca, baseLoca)

Gets the relative loca by stripping the base loca prefix:

```typescript
const fullLoca = "03/06/71/02/02";
const baseLoca = "03/06";
const relativeLoca = chad_GetRelativeLoca(fullLoca, baseLoca);
console.log(relativeLoca); // "71/02/02"
```

### chad_GetFirstSegment(relativeLoca)

Gets the first segment of a relative loca:

```typescript
const relativeLoca = "71/02/02";
const firstSegment = chad_GetFirstSegment(relativeLoca);
console.log(firstSegment); // "71"
```

### chad_GetLeadsStatuses()

Gets leads statuses using resolved loca:

```typescript
const statusItems = await chad_GetLeadsStatuses();
// Internally:
// 1. Resolves leads "all items" path to get numeric loca
// 2. Calls GetManyByName with resolved loca
```

## Function Categories by Path Type

### Functions Using Names Path (GetByNames)

These functions work with human-readable name paths and use `GetByNames`:

| Function | Path Example | Description |
|----------|-------------|-------------|
| `GetAllLeads()` | `["leads", "all items"]` | Get all leads |
| `GetLeadByName(name)` | `["leads", leadName]` | Get specific lead by name |
| `chad_ResolveByNames()` | Any name path | Resolve name path to item |

### Functions Using Numeric Loca (GetItem, Put, PostParentItem, FindRecursively)

These functions work with numeric loca and use the corresponding methods:

| Function | Method | Description |
|----------|--------|-------------|
| `TodoLeads()` | `FindRecursively` | Search for todo items in leads |
| `getStatusItem(loca)` | `GetItem` | Get item by numeric loca |
| `putStatusContent(loca, body)` | `Put` | Update item content by numeric loca |
| `createStatusForLead(leadLoca)` | `PostParentItem` | Create child item under parent loca |
| `chad_GetLeadsStatuses()` | `GetManyByName` | Get status items by name in leads folder |

## Methods That Require Numeric Loca

The following methods work with `repo` + `loca`, NOT with name paths:

| Method | Worker | Description |
|--------|--------|-------------|
| `FindRecursively` | `IMethodWorker` | Search recursively for items matching a phrase |
| `GetItem` | `IItemWorker` | Get a single item by loca |
| `Put` | `IItemWorker` | Update an item by loca |
| `PostParentItem` | `IItemWorker` | Create a child item under a parent loca |

### Correct Usage Examples

```typescript
// FindRecursively - 3 arguments after service/method
["IRepoService", "IMethodWorker", "FindRecursively", repoId, loca, phrase]

// GetItem - 2 arguments after service/method
["IRepoService", "IItemWorker", "GetItem", repoId, loca]

// Put - 4 arguments after service/method (repo, loca, type, name, body)
["IRepoService", "IItemWorker", "Put", repoId, loca, type, name, body]

// PostParentItem - 4 arguments after service/method
["IRepoService", "IItemWorker", "PostParentItem", repoId, parentLoca, type, name]
```

## Common Mistakes

### ❌ WRONG: Passing names to FindRecursively

```typescript
// This will fail with "Method FindRecursively not found"
["IRepoService", "IMethodWorker", "FindRecursively", repoId, "leads", "06", "//todo"]
```

Error message:
```
System.InvalidOperationException: Method FindRecursively not found
```

This error occurs because the API tries to interpret extra arguments as part of the method signature.

### ✅ CORRECT: Resolve path first, then use numeric loca

```typescript
// Step 1: Resolve
const item = await invokeContentProvider([
  "IRepoService", "IItemWorker", "GetByNames", repoId, "leads", "all items"
]);
const loca = item.Settings.address.replace(repoId + "/", "");

// Step 2: Use resolved loca
const results = await invokeContentProvider([
  "IRepoService", "IMethodWorker", "FindRecursively", repoId, loca, "//todo"
]);
```

Or using helper functions:

```typescript
const loca = await chad_GetLeadsLoca();
const results = await invokeContentProvider([
  "IRepoService", "IMethodWorker", "FindRecursively", SHARED_REPO_ID, loca, "//todo"
]);
```

## Important Notes

1. **First argument (repo) is always the GUID**, never a name like "girls" or "leads"
2. **GetByNames** is used for resolving name paths to actual items
3. **FindRecursively, GetItem, Put** work with numeric loca only
4. The `repo` parameter is the repository GUID, not part of the path

## Complete Examples

### Example 1: TodoLeads

```typescript
import { 
  SHARED_REPO_ID, 
  chad_GetLeadsLoca, 
  invokeContentProvider 
} from "chad-dba";

export async function TodoLeads(): Promise<any> {
  // Step 1: Resolve the leads "all items" path to get numeric loca
  const leadsLoca = await chad_GetLeadsLoca();
  // leadsLoca might be "03/06"

  // Step 2: Search for todo items using FindRecursively with resolved loca
  return invokeContentProvider([
    "IRepoService",
    "IMethodWorker", 
    "FindRecursively",
    SHARED_REPO_ID,    // Repository GUID
    leadsLoca,         // Numeric loca (e.g., "03/06")
    "//todo"           // Search phrase
  ]);
}
```

#### Request Flow for TodoLeads:

1. **GetByNames Request:**
   ```
   ["IRepoService", "IItemWorker", "GetByNames", "21d11bdc-f1f4-44d1-b61a-3fa6b039c641", "leads", "all items"]
   ```

2. **GetByNames Response:**
   ```json
   {
     "Settings": {
       "address": "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06",
       "name": "all items"
     }
   }
   ```

3. **Resolved Settings.address:**
   ```
   21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06
   ```

4. **Resolved loca:**
   ```
   03/06
   ```

5. **FindRecursively Request:**
   ```
   ["IRepoService", "IMethodWorker", "FindRecursively", "21d11bdc-f1f4-44d1-b61a-3fa6b039c641", "03/06", "//todo"]
   ```

### Example 2: GetLeadsStatuses

```typescript
import { chad_GetLeadsStatuses } from "chad-dba";

export async function GetLeadsStatuses(): Promise<any> {
  return chad_GetLeadsStatuses();
}
```

#### Request Flow for GetLeadsStatuses:

1. **GetByNames Request (to resolve leads loca):**
   ```
   ["IRepoService", "IItemWorker", "GetByNames", "21d11bdc-f1f4-44d1-b61a-3fa6b039c641", "leads", "all items"]
   ```

2. **Resolved loca:**
   ```
   03/06
   ```

3. **GetManyByName Request:**
   ```
   ["IRepoService", "ManyItemsWorker", "GetManyByName", "21d11bdc-f1f4-44d1-b61a-3fa6b039c641", "03/06", "status"]
   ```

### Example 3: Parent Mapping with Relative Loca

When displaying todo items with their parent lead names:

```typescript
import { 
  GetAllLeads, 
  TodoLeads, 
  chad_GetLeadsLoca,
  chad_GetRelativeLoca,
  chad_GetFirstSegment
} from "chad-dba";

async function displayTodoWithParentNames() {
  // Step 1: Get all leads to build name map
  const allLeads = await GetAllLeads();
  const leadsNameMap = allLeads.Body; // { "71": "Marzenka Styk", "72": "Ania", ... }
  
  // Step 2: Get the base leads loca
  const baseLoca = await chad_GetLeadsLoca(); // "03/06"
  
  // Step 3: Get todo items
  const todoItems = await TodoLeads();
  
  // Step 4: For each todo item, extract parent lead name
  for (const item of todoItems) {
    const fullAddress = item.Settings.address; // "girls/06/71/02/02" or numeric address
    const fullLoca = getLocaFromAddress(fullAddress); // "06/71/02/02" or "03/06/71/02/02"
    
    // Get relative loca from base
    const relativeLoca = chad_GetRelativeLoca(fullLoca, baseLoca); // "71/02/02"
    const leadKey = chad_GetFirstSegment(relativeLoca); // "71"
    
    // Get lead name from map
    const leadName = leadsNameMap[leadKey]; // "Marzenka Styk"
    
    console.log(`${fullLoca}; ${leadName}`);
    // Output: "03/06/71/02/02; Marzenka Styk"
  }
}
```
