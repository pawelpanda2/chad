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

### Beeper/Whatsup Conversation for a Lead

**Path:** `beeper, whatsup, [lead name]` (may return Text or Folder)

If the item is a **Folder**, traverse to child: `beeper, whatsup, [lead name], beeper`

**Full Request (initial):**
```typescript
[
  "IRepoService",
  "IItemWorker",
  "GetByNames",
  "21d11bdc-f1f4-44d1-b61a-3fa6b039c641",
  "beeper",
  "whatsup",
  "[lead_name]"
]
```

**If Folder, follow-up request:**
```typescript
[
  "IRepoService",
  "IItemWorker",
  "GetItem",
  "21d11bdc-f1f4-44d1-b61a-3fa6b039c641",
  "03/06/79/01"  // numeric path to the "beeper" child
]
```

**Function:** `chad_FindConversationByLeadName(leadName)`

**Description:** Finds the beeper/whatsup conversation for a specific lead. The path `beeper/whatsup/[lead_name]` may return either:

1. **Text item** — its Body is the conversation directly
2. **Folder item** — has children like `beeper`, `manual`; must traverse into the `beeper` child to get the actual conversation

**Algorithm:**
1. Get the beeper folder
2. Iterate through channels (children of beeper)
3. For each channel, search for the lead name
4. When found, get the lead item at that path
5. Check item type:
   - If **Text**: return its Body as conversation
   - If **Folder**: look for a child named "beeper", get that item, return its Body
6. If folder has no "beeper" child, return diagnostic error with list of children

**Never display the Body of a Folder item as the conversation** — it only contains the folder's children map (e.g., `{"01":"beeper","02":"manual"}`).

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