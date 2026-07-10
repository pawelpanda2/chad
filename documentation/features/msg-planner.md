# Msg Planner Feature

## Overview

The Msg Planner feature provides a dedicated interface for viewing and editing message planning content organized by dates. It reads data from the Content Provider's `leads/msg planner` folder structure and allows users to manage message plans for specific dates.

## Goal

- Add a new "Msg Planner" tab to the dashboard
- Rename existing "Todo msg" tab to "Msg Todo"
- Provide date-based navigation for message planning content
- Offer both preview and editor views for body.txt files
- Allow creating new date folders (plan items) under the same logical path

## Data Source

### Content Provider Path

The feature reads data from the Content Provider using logical names defined in `config.yaml`:

```
leads / msg planner / [date folders]
```

### Date Folder Structure

- Parent folder: `leads` → `msg planner` (logical names)
- Child folders: Named with dates in `YY-MM-DD` format (e.g., `26-06-19`)
- Each date folder contains a `body.txt` file with the message plan content

### Important: Logical vs Physical Names

**CRITICAL**: The paths `leads`, `msg planner`, and date names like `26-06-19` are **logical names** from `config.yaml`, NOT physical folder names. Physical folders are always numeric (e.g., `03/06/71/02`).

All Content Provider API calls must use:
- `GetByNames` for resolving logical paths
- `GetManyByName` for finding items by logical name
- Numeric `loca` paths for operations like `GetItem`, `Put`

## Flow

1. **Load Date Folders**
   - User navigates to Msg Planner page
   - Dashboard calls `GET /api/msg-planner`
   - API uses `getMsgPlannerDateFolders()` from chad-dba
   - Returns list of date folders with YY-MM-DD names

2. **Select Date**
   - User selects a date from the dropdown
   - Dashboard calls `GET /api/msg-planner?date=YY-MM-DD`
   - API finds the date folder and retrieves `body.txt` content

3. **View/Edit Content**
   - User switches between Preview and Editor tabs
   - Preview renders the structured content
   - Editor allows text editing with CodeMirror

4. **Save Changes**
   - User clicks Save button
   - Dashboard calls `POST /api/msg-planner`
   - API uses `saveMsgPlannerBody()` to persist changes

5. **Create New Date Folder**
   - User clicks "new" button in the toolbar
   - A panel appears with a date input pre-filled with today's date (YY-MM-DD)
   - User can modify the date or keep the default
   - User clicks "create" or presses Enter
   - Dashboard calls `POST /api/msg-planner` with `action: "create"`
   - API uses `createMsgPlannerDateFolder(date, true)` to:
     1. Create the date folder via `PostParentItem`
     2. Generate plan content from MsgTodo data
     3. Save the generated content to the new date folder
   - The new date folder appears in the dropdown and is auto-selected
   - The generated body contains sections for "Todo" and "Your first msg"

## API Reference

### chad-dba Functions

#### `getMsgPlannerDateFolders(): Promise<MsgPlannerDateFolder[]>`

Retrieves all date folders from `leads/msg planner` path.

**Returns:**
```typescript
interface MsgPlannerDateFolder {
  date: string;    // YY-MM-DD format (logical name)
  loca: string;    // Numeric path (e.g., "03/06/71/02")
}
```

**Process:**
1. Resolves `leads/all items` to get base loca
2. Uses `GetManyByName` to find `msg planner` folder
3. Gets children of msg planner folder
4. Filters children by YY-MM-DD format using regex `/^\d{2}-\d{2}-\d{2}$/`
5. Sorts by date descending (newest first)

#### `getMsgPlannerBodyForDate(date: string, dateFolderLoca: string): Promise<MsgPlannerBodyData | null>`

Retrieves body.txt content for a specific date folder.

**Returns:**
```typescript
interface MsgPlannerBodyData {
  date: string;    // YY-MM-DD format
  loca: string;    // Numeric path of body.txt item
  body: string;    // File content
}
```

#### `saveMsgPlannerBody(dateFolderLoca: string, content: string): Promise<boolean>`

Saves content to body.txt in a date folder.

**Process:**
1. Uses `PostParentItem` to ensure body.txt exists (create-or-get)
2. Uses `Put` to save the content

#### `generatePlanContent(): Promise<GeneratedPlanContent>`

Generates plan content from MsgTodo data sources.

**Returns:**
```typescript
interface GeneratedPlanContent {
  body: string;              // The generated body content in //with; format
  todoEntries: PlanContentEntry[];    // Entries for "Todo" section
  firstMsgEntries: PlanContentEntry[]; // Entries for "Your first msg" section
}
```

**Process:**
1. Fetches leads from `getTodoMsgLeads()` (//todo marker)
2. Fetches leads from `getFirstMsgLeads()` (your-first-message: true)
3. Formats into sections:
   ```
   //with; Todo
   	[loca]; [leadName]
   
   //with; Your first msg
   	[loca]; [leadName]
   ```

#### `createMsgPlannerDateFolder(date: string, generateBody?: boolean): Promise<MsgPlannerDateFolder & { generatedBody?: string }>`

Creates a new date folder under the msg planner parent and optionally generates body content.

**Parameters:**
- `date`: The date string in YY-MM-DD format (logical name)
- `generateBody`: Whether to generate and save body content (default: true)

**Returns:**
```typescript
interface MsgPlannerDateFolder {
  date: string;    // YY-MM-DD format (logical name)
  loca: string;    // Numeric path (e.g., "03/06/71/02/01")
  generatedBody?: string; // The generated body content (if generateBody=true)
}
```

**Process:**
1. Validates date format using `isValidDateFolderName()`
2. Resolves `leads/msg planner` path using `GetByNames`
3. Uses `PostParentItem` to create-or-get the date folder under msg planner
4. If `generateBody=true`:
   - Calls `generatePlanContent()` to get current MsgTodo data
   - Saves the generated content to the date item using `saveMsgPlannerBody()`
5. Returns the created/retrieved folder info

**Note:** Uses `PostParentItem` for create-or-get semantics - if the date folder already exists, it returns the existing item without error. If body generation fails, the date folder is still created but without auto-generated content.

#### `isValidDateFolderName(name: string): boolean`

Validates if a string matches YY-MM-DD format.

## Editor Behavior

The Msg Planner uses the shared `BodyTextEditor` component (CodeMirror-based) for text editing.

### Tab Key Handling

- **Tab character insertion**: When the user presses the Tab key, the editor inserts a tab character (`\t`) rather than spaces
- **Tab rendering**: Tab characters are rendered as 4 spaces width (standard `tab-size: 4`)
- **Consistency**: Both auto-generated content and manually typed content use the same `\t` character for indentation, ensuring visual and data consistency

### Whitespace Markers in Edit Mode

- Tab markers are currently disabled in edit mode
- This was done intentionally to keep caret position and click-hit testing aligned with the real text model
- The underlying body content still stores real `\t` characters
- Debugging raw whitespace should rely on raw-value inspection, not editor overlays

This behavior is consistent across all features using the `BodyTextEditor` component.

## Preview Parser

The preview renderer parses the body text into structured sections:

### Parsing Rules

1. **Main Headers**: Lines starting with `//` at indentation 0
   - Rendered as large bordered sections
   - Example: `//sorted`

2. **Sub Headers**: Lines starting with `//` with indentation > 0
   - Rendered as smaller bordered subsections within parent
   - Example: `    //1; obowiązkowo nowe`

3. **Content Lines**: All other non-empty lines
   - Rendered as pre-formatted text
   - Preserves original indentation

### Example

Input:
```
//sorted
    //1; obowiązkowo nowe
        - nowe kontakty; brak pierwszej wiadomości
        d; 26-05-12_pi_Marzenka_Styk

//with todo; wrong
    03/06/80/02/01; 26-06-07_pt_Ariadna
```

Output structure:
- Main section: "sorted"
  - Sub section: "1; obowiązkowo nowe"
    - Content: "- nowe kontakty; brak pierwszej wiadomości"
    - Content: "d; 26-05-12_pi_Marzenka_Styk"
- Main section: "with todo; wrong"
  - Content: "03/06/80/02/01; 26-06-07_pt_Ariadna"

## Edge Cases

### Handled Scenarios

1. **No leads folder exists**
   - Returns empty date list
   - Shows "Select a date" placeholder

2. **No msg planner folder exists**
   - Returns empty date list
   - Shows "Select a date" placeholder

3. **No date folders match YY-MM-DD format**
   - Returns empty date list
   - All non-matching folders are ignored

4. **Empty body.txt**
   - Shows "Empty content" in preview
   - Editor shows empty textarea

5. **Save error**
   - Displays error message
   - Does not clear unsaved changes

6. **Date change without saving**
   - Current implementation loads new content immediately
   - Unsaved changes are lost (potential improvement)

7. **Reload after save**
   - Preview automatically shows updated content
   - "Saved" indicator shows for 3 seconds

## Files Modified

### chad-dba (`/Users/pawelfluder/03_synch/01_files_programming/08_nodejs/chad-dba`)

1. **src/leads.ts**
   - Added `MsgPlannerDateFolder` interface
   - Added `MsgPlannerBodyData` interface
   - Added `DATE_PATTERN` regex constant
   - Added `isValidDateFolderName()` function
   - Added `stripRepoGuid()` helper function
   - Added `getMsgPlannerDateFolders()` function
   - Added `getMsgPlannerBody()` function
   - Added `getMsgPlannerBodyForDate()` function
   - Added `saveMsgPlannerBody()` function

### chad-dashboard (`/Users/pawelfluder/03_synch/01_files_programming/08_nodejs/chad-dashbord`)

1. **app/api/msg-planner/route.ts** (NEW)
   - GET endpoint for listing dates and fetching body content
   - POST endpoint for saving body content (`action: "save"` or default)
   - POST endpoint for creating date folders (`action: "create"`)

2. **app/(dashboard)/dashboard/msg-planner/page.tsx** (NEW)
   - Main Msg Planner page component
   - Date selector dropdown
   - Preview/Editor tabs
   - "new" button for creating date folders
   - Create panel with date input (pre-filled with today's date)
   - parseBodyText() function for preview rendering
   - PreviewContent component for structured display

2. **app/(dashboard)/dashboard/msg-planner/page.tsx** (NEW)
   - Main Msg Planner page component
   - Date selector dropdown
   - Preview/Editor tabs
   - parseBodyText() function for preview rendering
   - PreviewContent component for structured display

3. **components/shared/sidebar.tsx**
   - Added "Msg Planner" navigation item
   - Renamed "Todo msg" to "Msg Todo"

## Future Improvements

1. **Unsaved changes warning**: Detect when user navigates away with unsaved edits
2. **Auto-save**: Optionally save changes automatically after typing stops
3. **Diff view**: Show changes between current and saved content
4. **Multiple body files**: Support additional files beyond body.txt
5. **Date range filter**: Filter dates by range for large datasets
6. **Keyboard shortcuts**: Add Ctrl+S for save, etc.

## Manual Testing

### Test: Create New Date Folder

1. Run `chad-dashboard`: `npm run dev`
2. Navigate to "Msg Planner" tab
3. Click the "new" button (with + icon) in the toolbar
4. Verify the create panel appears below the toolbar
5. Verify the input is pre-filled with today's date in YY-MM-DD format (e.g., "26-07-08")
6. Either keep the default date or modify it
7. Click "create" or press Enter
8. Verify:
   - The new date folder is created in Content Provider
   - The list refreshes automatically
   - The new date appears in the dropdown
   - The new date is auto-selected
9. Open the newly created plan
10. Verify the body contains sections:
    - `//with; Todo` with todo leads
    - `//with; Your first msg` with first-msg leads
11. Compare the entries with what's shown in MsgTodo tab
12. Check Dev Panel > Requests tab to see raw POST request and response

### Test: Error Handling

1. Try to create a date folder with an invalid format (e.g., "invalid")
2. Verify error message is displayed in the create panel
3. Verify the panel stays open for correction

### Test: Auto-Generated Content

1. Navigate to "MsgTodo" tab first
2. Note the current entries for "Todo" and "Your first msg" filters
3. Go to "Msg Planner" tab
4. Create a new plan with today's date
5. Open the newly created plan
6. Verify the body content matches the MsgTodo data:
   - "Todo" section has same leads as MsgTodo > Todo filter
   - "Your first msg" section has same leads as MsgTodo > Your first msg filter
   - Addresses/locas match what's displayed in MsgTodo
