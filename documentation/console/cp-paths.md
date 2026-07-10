# Content Provider Paths - Logical Paths Documentation

## Main Repository

The shared repository for leads, reports, and beeper data:

```
21d11bdc-f1f4-44d1-b61a-3fa6b039c641
```

## Paths

### Leads (formerly "girls")

**Path:** `leads/all items`

**Full Request:**
```typescript
[
  "IRepoService",
  "IItemWorker", 
  "GetByNames",
  "21d11bdc-f1f4-44d1-b61a-3fa6b039c641",
  "leads",
  "all items"
]
```

**Function:** `GetAllLeads()`

**Description:** Returns a list of all leads (previously called "girls"). The response Body contains a map like `{ "01": "26-05-11_pn_Luba", ... }`.

### Reports

**Path:** `reports`

**Full Request:**
```typescript
[
  "IRepoService",
  "IItemWorker",
  "GetByNames",
  "21d11bdc-f1f4-44d1-b61a-3fa6b039c641",
  "reports"
]
```

**Function:** `GetReports()`

**Description:** Returns all reports from the shared repository.

### Beeper

**Path:** `beeper`

**Full Request:**
```typescript
[
  "IRepoService",
  "IItemWorker",
  "GetByNames",
  "21d11bdc-f1f4-44d1-b61a-3fa6b039c641",
  "beeper"
]
```

**Function:** `GetBeeper()`

**Description:** Returns all beeper items (messages/data from Beeper) from the shared repository.

## Legacy Paths (Still in Use)

### Girls Statuses

The status system still uses the old `girls` repository path for backward compatibility:

**Path:** `girls/06/{girlId}/status`

**Functions:**
- `GetGirlsStatuses()` - Gets all status items
- `createStatusForGirl(girlLoca)` - Creates a new status item
- `putStatusContent(loca, body)` - Updates status content
- `getStatusItem(loca)` - Gets a specific status item

**Note:** These functions continue to use the `girls` repository as they are tightly coupled with the existing status management system. Migration to the new repository structure should be planned carefully.

## Migration Notes

### From Old to New

| Old Path | New Path | Function Change |
|----------|----------|-----------------|
| `GetByNames("girls", "all items")` | `GetByNames("21d11bdc-f1f4-44d1-b61a-3fa6b039c641", "leads", "all items")` | `GetAllGirls()` → `GetAllLeads()` |

### Backward Compatibility

- CLI menu option `PrintAllGirls` now internally uses `GetAllLeads()` but maintains the same label for backward compatibility
- All status-related functions continue to use the old `girls` path until a full migration is planned

## Shared Library

All these functions are available through the shared `chad-dba` package:

```typescript
import { 
  invokeContentProvider,
  GetAllLeads, 
  GetReports, 
  GetBeeper,
  SHARED_REPO_ID
} from 'chad-dba';