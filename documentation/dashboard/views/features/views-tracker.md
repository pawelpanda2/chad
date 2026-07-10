# Views / TRACKER - Feature Documentation

## Overview

The TRACKER view displays daily entries from the Content Provider in a tabular format. It reads data from the `actions/daily` folder structure.

## Architecture

### Data Flow

```
Views (frontend)
    ↓
GET /api/views (dashboard route)
    ↓
chad-dba.getAllDailyEntries()
    ↓
Content Provider API
```

### Key Components

1. **chad-dba** (`src/leads.ts`):
   - `getAllDailyEntries()` - Fetches all daily entries from Content Provider
   - Uses `SHARED_REPO_ID` (`21d11bdc-f1f4-44d1-b61a-3fa6b039c641`)
   - Uses `IManyItemsWorker.GetList` to retrieve children of the `daily` folder

2. **Dashboard Route** (`app/api/views/route.ts`):
   - Calls `chad-dba.getAllDailyEntries()`
   - Parses YAML bodies using `js-yaml`
   - Returns structured data to frontend

## Content Provider Structure

```
actions/                    (Folder)
  daily/                    (Folder)
    26-07-10               (Text item with YAML body)
    26-07-10b              (Text item with YAML body)
    26-07-10c              (Text item with YAML body)
```

## API Calls

### Step 1: Get the daily folder loca

```json
["IRepoService", "IItemWorker", "GetByNames", "21d11bdc-f1f4-44d1-b61a-3fa6b039c641", "actions", "daily"]
```

Returns the folder item with `Settings.address` containing the numeric loca.

### Step 2: Get children using IManyItemsWorker

```json
["IRepoService", "IManyItemsWorker", "GetList", "21d11bdc-f1f4-44d1-b61a-3fa6b039c641", "{folderLoca}"]
```

Returns a JSON array of child items (the daily entries).

**IMPORTANT**: Use `IManyItemsWorker` (interface), NOT `ManyItemsWorker` (implementation). The Content Provider only recognizes the interface prefix `I`.

### Step 3: Get each item's body

```json
["IRepoService", "IItemWorker", "GetItem", "21d11bdc-f1f4-44d1-b61a-3fa6b039c641", "{childLoca}"]
```

Returns the item with `Body` containing the YAML string.

## YAML Parsing

The `getAllDailyEntries()` function returns raw YAML strings. The dashboard route parses these using `js-yaml`:

```typescript
const dailyEntries = dailyEntriesRaw.map(entry => ({
  itemName: entry.itemName,
  body: entry.body ? parseYaml(entry.body) || undefined : undefined,
}));
```

## Debug Logging

The function includes extensive debug logging:

```
[chad-dba] getAllDailyEntries: Starting...
[chad-dba] getAllDailyEntries: Folder result: {...}
[chad-dba] getAllDailyEntries: folderLoca: 03/06/71/02
[chad-dba] getAllDailyEntries: GetList raw response: [...]
[chad-dba] getAllDailyEntries: Found 3 children
[chad-dba] getAllDailyEntries: Children names: ['26-07-10', '26-07-10b', '26-07-10c']
[chad-dba] getAllDailyEntries: Returning 3 entries
```

## Related Patterns

This pattern is similar to how statuses are fetched:

```typescript
// Statuses pattern (path-resolver.ts)
const result = await invokeContentProvider([
  "IRepoService",
  "IManyItemsWorker",
  "GetManyByName",
  SHARED_REPO_ID,
  leadsLoca,
  "status",
]);
```

Both use `IManyItemsWorker` to fetch multiple items at once.

## Future: DATES View

The same pattern will be used for the DATES view:

```
actions/
  dates/
    26-07-10
    26-07-10b
```

The `getAllDateEntries()` function already exists and uses a similar approach.