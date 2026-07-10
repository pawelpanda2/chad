# Statuses Dashboard Feature

## Overview

The Statuses Dashboard is a new tab in chad-dashboard that allows users to view and manage lead statuses. It provides a list view of all leads with their status categories, and an editor for modifying individual lead statuses.

## Location

- **Tab**: Left sidebar under "Pages" section, immediately after "Todo msg"
- **Route**: `/dashboard/statuses`
- **API Routes**: 
  - `GET /api/statuses` - Get leads with status information
  - `GET /api/statuses/edit?leadKey=...` - Get status editor data
  - `POST /api/statuses/edit` - Save status

## Poprawna metoda pobierania statusów

**`GetManyByName` jest poprawną metodą** do zbiorczego pobierania statusów wszystkich leadów.

Flow wzorowany na działającym teście C#:
```
IItemWorker.PostByNames(repoId, "Folder", "leads", "all items")
  → allItems (Body = mapa leadów, Settings.address = loca)
IManyItemsWorker.GetManyByName(repoId, allItems.AdrTuple.Loca, "status")
  → lista statusów
```

**KRYTYCZNE:** Worker musi być nazwany `IManyItemsWorker` (interfejs, z `I`).
NIE `ManyItemsWorker` (implementacja bez `I`). Content Provider nie rozpoznaje
implementacji po nazwie — tylko interfejsy.

## Architecture

This feature follows the established pattern:
- **Client UI** → **Local API Route** → **chad-dba** (server-side)

All business logic is encapsulated in `chad-dba` public functions. The dashboard is a thin UI layer that calls API routes.

### chad-dba Functions

The following functions were added to `chad-dba/src/statuses-dashboard.ts`:

| Function | Description |
|----------|-------------|
| `getStatusesDashboardList(range?)` | Returns leads with status info, sorted newest first |
| `getLeadStatusEditor(leadKey)` | Returns status data for editing a specific lead |
| `saveLeadStatus(leadKey, fields)` | Saves status fields for a lead |
| `createLeadStatus(leadKey)` | Creates a default status for a lead |
| `classifyStatus(body)` | Classifies status as missing/empty/valid/outdated |
| `parseStatusFields(body)` | Parses YAML body into StatusFields object |
| `serializeStatusFields(fields, existingBody?)` | Serializes StatusFields back to YAML |
| `parseRange(rangeStr, totalItems)` | Parses range filter string |

## List View

### Features

- Shows all leads with their status category badges
- Sorted by newest first (descending by lead ID)
- Compact single-line display per lead

### Filter/Range Input

The text input at the top supports multiple formats:

| Format | Example | Description |
|--------|---------|-------------|
| Empty | (blank) | Show all leads |
| Negative | `-10` | Show last 10 newest leads |
| Range | `1-20` | Show leads 1 to 20 |
| Specific | `1,2,8,7` | Show specific lead positions |

### Status Categories

Each lead displays a badge indicating their status:

| Category | Label (PL) | Color | Description |
|----------|------------|-------|-------------|
| `valid` | ważny | Green | All required fields present and valid |
| `outdated` | nieaktualny | Orange | Missing required fields or old format |
| `empty` | pusty | Yellow | Status exists but body is empty |
| `missing` | brak statusu | Gray | No status item exists |

## Editor View

### Features

- Click any lead to open its status editor
- Shows lead name and current status category
- Displays all status fields for editing
- "Save" button persists changes
- After save, shows "Saved!" message and stays in editor
- "Cancel" button returns to list view

### Status Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `city` | text | (empty) | City name |
| `only-friends` | checkbox | false | Friends-only indicator |
| `her-first-msg` | checkbox | false | Did she write first message? |
| `your-first-message` | checkbox | false | Did you write first message? |
| `writing-deadline` | date | 2099-01-01 | Deadline for writing |
| `priority-today` | number (0-30) | 0 | Priority level for today |

### Missing Status Handling

If a lead has no status (`[brak statusu]`), clicking on it will:
1. Open the editor with empty/default fields
2. On save, automatically create the status item first
3. Then save the field values

## Implementation Details

### Sorting

Unlike chad-console where newest leads are at the bottom, the dashboard sorts newest leads at the TOP (descending order by lead ID). This is more intuitive for dashboard usage.

### Status Classification

The same classification logic from chad-console is used:
- **Missing**: No status item exists
- **Empty**: Status exists but body is empty
- **Outdated**: Missing required fields or uses old field names
- **Valid**: All required fields present with valid values

### Additional Fields

Any non-standard fields in the status body are preserved during save operations.

## Files Modified/Created

### chad-dba
- `src/statuses-dashboard.ts` (new) - Main business logic
- `src/index.ts` (modified) - Export new module

### chad-dashboard
- `app/api/statuses/route.ts` (new) - List API endpoint
- `app/api/statuses/edit/route.ts` (new) - Editor API endpoints
- `app/(dashboard)/dashboard/statuses/page.tsx` (new) - UI page
- `components/shared/sidebar.tsx` (modified) - Added Statuses tab

## Usage Example

1. Navigate to Statuses tab in sidebar
2. Use filter input to narrow down leads:
   - Type `-20` and press Enter to see last 20 newest leads
   - Type `10-30` to see leads 10 through 30
3. Click on any lead to open the editor
4. Modify fields as needed
5. Click "Save" to persist changes
6. See "Saved!" confirmation
7. Click "Back to list" to return or continue editing

## Future Improvements

- Add bulk status operations
- Add status migration tools
- Add diagnostic information (counts by category)
- Add keyboard navigation in list view