# Statuses Matrix

## Overview

The Statuses page in the dashboard now supports two modes of operation: **Matrix** and **Migration**. This document describes the Matrix mode feature.

## Cel (Goal)

The Matrix mode provides a spreadsheet-like view for efficiently editing status fields across multiple leads simultaneously. Instead of opening each lead individually, users can view and edit all leads in a single table.

## Tryby (Modes)

### 1. Matrix Mode (default)

A table view showing all leads with their status fields as editable columns.

### 2. Migration Mode

The original list view for managing statuses one lead at a time. This mode preserves the existing UI for users who prefer the traditional approach.

## UI Components

### Header Bar (left-aligned elements)

1. **Filter input** - Text filter that searches across:
   - Lead name
   - Lead ID/key
   - Status body values

2. **Mode selector (combobox)** - Options:
   - `Matrix` (default)
   - `Migration`

3. **Global Save button** - Saves all changed rows (optional, for batch saves)

4. **Status indicators** - Shows "Saved!" or error messages

5. **Lead count** - Shows filtered/total leads count

### Matrix Table Columns

| Column | Type | Editor |
|--------|------|--------|
| Save | Button | Per-row save button (green when no changes, red when dirty) |
| Lead | Text | Display only (lead name only, truncated) |
| City | String | Input with datalist (editable combobox) |
| Friends | Boolean | Select (true/false) |
| Her Msg | Boolean | Select (true/false) |
| Your Msg | Boolean | Select (true/false) |
| Deadline | Date | Date input (YYYY-MM-DD format) |
| Priority | Number (0-30) | Number input with datalist suggestions |

## Per-Row Save Button

Each row has its own save button in the first column:

- **Green (default)**: No changes in this row, button is disabled
- **Red**: Row has unsaved changes, button is enabled
- **Spinning icon**: Currently saving
- **Checkmark + "saved" text**: Successfully saved (disappears after 2 seconds)

Clicking the save button:
1. Saves only that specific row's changes
2. Updates the original data to match current values
3. Button returns to green state
4. "saved" text appears briefly then disappears

This allows users to save changes incrementally, row by row, rather than saving all changes at once.

## Status Model

Each lead's status contains the following fields:

```yaml
city: ""                    # String, can be empty
only-friends: false         # Boolean
her-first-msg: false        # Boolean
your-first-message: false   # Boolean
writing-deadline: "2099-01-01"  # Date (YYYY-MM-DD)
priority-today: 0           # Integer (0-30)
```

### Field Descriptions

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `city` | string | (empty) | City name, can be empty |
| `only-friends` | boolean | `false` | Friends-only indicator |
| `her-first-msg` | boolean | `false` | Did she write the first message? |
| `your-first-message` | boolean | `false` | Did you write the first message? |
| `writing-deadline` | date | `2099-01-01` | Deadline for writing |
| `priority-today` | integer | `0` | Priority level (0-30) |

## Cell Editors

### Boolean Fields

Boolean fields (`only-friends`, `her-first-msg`, `your-first-message`) use a Select component with `true`/`false` options.

### City Field

The city field uses an Input with a datalist for suggestions. Users can:
- Select from predefined cities (Warszawa, Kraków, Gdańsk, etc.)
- Type any custom value

### Priority Field

The priority field uses a number input (0-30) with datalist suggestions for common values (0, 5, 10, 15, 20, 25, 30).

### Date Fields

The `writing-deadline` uses a native HTML5 date input.

## Save Flow

1. User edits cells in the Matrix table
2. Changes are stored locally in component state
3. User clicks "Save" button
4. System saves all visible (filtered) leads:
   - For leads with missing status: creates status first, then saves
   - For existing statuses: updates the status
5. On success: shows "Saved!" indicator and refreshes the list
6. On error: shows error message

### API Used

- `POST /api/statuses/edit` - Creates or updates status for a lead

## Filter

The filter input supports text search across:
- Lead name (case-insensitive)
- Lead ID/key
- Status body content (case-insensitive)

Example: typing `-10` will match leads with `-10` in their name, ID, or status values.

## Edge Cases

1. **Missing status**: When a lead has no status, the Matrix shows default values. Saving creates the status.

2. **Concurrent edits**: If multiple users edit the same lead, last save wins.

3. **Large datasets**: The Matrix loads all leads within the current range filter. For very large datasets, use the range filter in Migration mode first.

4. **Browser back/refresh**: Unsaved changes are lost on page refresh.

## Dev Panel Integration

The API responses include `_traces` array with Content Provider request details for debugging.

## Test Manualny (Manual Test)

1. Navigate to Statuses page
2. Verify header shows:
   - Filter input
   - Mode selector with Matrix/Migration options
   - Save button
3. Verify Matrix mode is default
4. Verify table shows columns: Lead, City, Only Friends, Her First Msg, Your First Msg, Writing Deadline, Priority
5. Change a boolean value using the select dropdown
6. Change city by typing or selecting from suggestions
7. Change priority by typing a number 0-30
8. Enter a filter (e.g., `-10`) and verify table filters correctly
9. Click Save
10. Verify "Saved!" indicator appears
11. Refresh page
12. Verify changes persist
13. Switch to Migration mode
14. Verify original list view appears
15. Switch back to Matrix mode
16. Verify data is preserved