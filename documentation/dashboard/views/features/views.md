# Views Feature

## Overview

The Views page provides a read-only tabular display of data saved by the DATE ENTRY and DAILY ENTRY forms. Data is stored in the Content Provider under the `actions/dates` and `actions/daily` paths as text-items with YAML body content.

## Navigation

A new "Views" menu item was added to the main sidebar navigation under the "MESSAGES / LEADS" group, between "Forms" and "Folders". It uses the `Table` icon from lucide-react and links to `/dashboard/views`.

## Page Structure

The Views page works similarly to the Forms page - it first shows a selection menu, then displays only one view at a time.

### View Selection Menu (`/dashboard/views`)

When entering the Views page, users see a compact grid of available views:

```
Views

DATES        TRACKER      Coming soon
Date entries Daily tracker More views
```

### DATES View (`/dashboard/views?view=dates`)

After selecting DATES, users see:
- A header with "Views / DATES"
- A Back button to return to the selection menu
- A Refresh button to reload data
- A single large table displaying all date entries

**Columns:**
- `item` - The item name (e.g., `26-07-10`, `26-07-10b`)
- `DATA` - Date of the entry
- `ŹRÓDŁO` - Source (e.g., Tinder)
- `NAZWA` - Name
- `LINK` - Link
- `PULL` - Pull status (TRUE/FALSE)
- `CLOSE` - Close status (NIE/TAK)
- `JAKOŚĆ` - Quality rating

### TRACKER View (`/dashboard/views?view=tracker`)

After selecting TRACKER, users see:
- A header with "Views / TRACKER"
- A Back button to return to the selection menu
- A Refresh button to reload data
- A single large table displaying all daily entries

**Columns:**
- `item` - The item name (e.g., `26-07-10`, `26-07-10b`)
- `DATE` - Date
- `STATE` - State
- `TRAINING TIME` - Training time
- `VERBAL EXERCISES` - Verbal exercises
- `INFIELD` - Infield activities
- `THEORY` - Theory study
- `FIELD REVIEW` - Field review
- `ACTION TIME` - Action time
- `APPROACHES` - Number of approaches
- `LONG INTERACTIONS` - Long interactions count
- `NUMBERS` - Numbers obtained
- `FIRST MESSAGES` - First messages sent
- `RESPONSES` - Responses received
- `DATES SET UP` - Dates set up
- `DATES` - Dates completed

## Data Storage

### Path Structure

```
repoId/
  actions/
    dates/
      [text-items for DATE ENTRY]
    daily/
      [text-items for DAILY ENTRY]
```

### Item Naming

Items are named based on the date in `YY-MM-DD` format. If an item with the same date already exists, a letter suffix is added:
- First entry of the day: `26-07-10`
- Second entry of the day: `26-07-10b`
- Third entry of the day: `26-07-10c`
- etc.

Note: No `a` suffix is used for the first entry.

### Body Format

Each item's body is stored as YAML with key-value pairs matching the form fields.

#### DATE ENTRY Body Example

```yaml
DATA: "2026-07-10"
ŹRÓDŁO: "Tinder"
NAZWA: "Basia"
LINK: "https://..."
PULL: "FALSE"
CLOSE: "NIE"
JAKOŚĆ: "7"
```

#### DAILY ENTRY Body Example

```yaml
DATE: "2026-07-10"
STATE: ""
TRAINING TIME: ""
VERBAL EXERCISES: ""
INFIELD: ""
THEORY: ""
FIELD REVIEW: ""
ACTION TIME: ""
APPROACHES: ""
LONG INTERACTIONS: ""
NUMBERS: ""
FIRST MESSAGES: ""
RESPONSES: ""
DATES SET UP: ""
DATES: ""
```

## API Routes

### GET /api/views

Retrieves all date entries and daily entries for the current user.

**Response:**
```json
{
  "success": true,
  "dateEntries": [
    { "itemName": "26-07-10", "body": { "DATA": "2026-07-10", ... } }
  ],
  "dailyEntries": [
    { "itemName": "26-07-10", "body": { "DATE": "2026-07-10", ... } }
  ]
}
```

### POST /api/forms/date-entry

Saves a DATE ENTRY form submission.

**Request Body:**
```json
{
  "DATA": "2026-07-10",
  "ŹRÓDŁO": "Tinder",
  "NAZWA": "Basia",
  "LINK": "https://...",
  "PULL": "FALSE",
  "CLOSE": "NIE",
  "JAKOŚĆ": "7"
}
```

**Response:**
```json
{
  "success": true,
  "itemName": "26-07-10",
  "path": "actions/dates"
}
```

### POST /api/forms/daily-entry

Saves a DAILY ENTRY form submission.

**Request Body:**
```json
{
  "DATE": "2026-07-10",
  "STATE": "",
  "TRAINING TIME": "",
  ...
}
```

**Response:**
```json
{
  "success": true,
  "itemName": "26-07-10",
  "path": "actions/daily"
}
```

## Content Provider Flow

### Saving an Entry (Technical Implementation)

The save flow uses `PostParentItem` to properly create folders and text items. Note: `repoKey` (username like `kamil_s`) is used for all operations, not the user GUID.

1. **Ensure "actions" folder exists**:
   - Try `GetByNames(repoKey, "actions")` to get existing folder
   - If not found, `PostParentItem(repoKey, "", "Folder", "actions")` to create it
   - Get the LOCA (address) of the actions folder

2. **Ensure "dates" folder exists**:
   - Try `GetByNames(repoKey, "actions", "dates")` to get existing folder
   - If not found, `PostParentItem(repoKey, actionsLoca, "Folder", "dates")` to create it
   - Get the LOCA (address) of the dates folder

3. **Create text item**:
   - `PostParentItem(repoKey, datesLoca, "Text", itemName)` - Creates the text item

4. **Get item address**:
   - `GetByNames(repoKey, "actions", "dates", itemName)` - Gets the item LOCA

5. **Save body**:
   - `Put(repoKey, itemLoca, bodyYaml)` - Saves the YAML body

### Retrieving Entries

1. `GetByNames(repoKey, "actions", "dates")` - Gets all items in the dates folder
2. For each item: `GetByNames(repoKey, "actions", "dates", itemName)` - Gets the item body

## UI Design

The Views page is designed to be compact:
- No large margins
- Compact tables with small padding
- Minimal whitespace
- Small text (xs size)
- Truncated cell content with max-width

### View Selection

- Grid layout with 3 columns
- Compact buttons with title and subtitle
- Hover effects with accent background

### Refresh Button

A refresh button in the top-right corner allows users to manually reload data. The button shows a spinning animation while loading.

## Save Confirmation

After successfully saving a form, the success message includes:
- The item name (e.g., `26-07-10`)
- The path where it was saved (e.g., `actions/dates`)

This helps users verify where their data was actually stored.

## Manual Testing

1. Navigate to Forms page
2. Open DATE ENTRY form
3. Fill in the form fields and submit
4. Verify the success message shows item name and path
5. Check in Content Provider that a text-item was created under `actions/dates`
6. Navigate to Views page
7. Select DATES view
8. Verify the entry appears in the table
9. Open DAILY ENTRY form
10. Fill in the form fields and submit
11. Verify the success message shows item name and path
12. Check in Content Provider that a text-item was created under `actions/daily`
13. Navigate to Views page
14. Select TRACKER view
15. Verify the entry appears in the table
16. Add a second entry for the same day
17. Verify the item name has a `b` suffix (e.g., `26-07-10b`)
18. Run typecheck to ensure no TypeScript errors

## Files Modified/Created

### New Files
- `app/(dashboard)/dashboard/views/page.tsx` - Views page component with view selection
- `app/api/views/route.ts` - API route for retrieving views data
- `app/api/forms/date-entry/route.ts` - API route for saving DATE ENTRY
- `app/api/forms/daily-entry/route.ts` - API route for saving DAILY ENTRY

### Modified Files
- `components/shared/sidebar.tsx` - Added Views navigation item
- `app/(dashboard)/dashboard/forms/page.tsx` - Updated form submissions to use new API routes and show path info
- `app/api/flow/cp-flow.ts` - Added functions for date/daily entry operations

## Key Differences from Previous Implementation

1. **View Selection**: Views now works like Forms - first shows a selection menu, then displays only one view at a time
2. **No Simultaneous Display**: DATES and TRACKER are never shown on the same page
3. **URL Parameters**: View selection is reflected in URL (`?view=dates` or `?view=tracker`)
4. **Save Confirmation**: Success messages now include the path where data was saved
5. **Compact Design**: View selection grid is compact with 3 columns