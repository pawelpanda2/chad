# Msg Planner Feature

## Overview

The Msg Planner feature provides a dedicated interface for viewing and editing message planning content organized by dates. It reads data from the Content Provider's `leads/msg planner` folder structure and allows users to manage message plans for specific dates.

## Goal

- Add a new "Msg Planner" tab to the dashboard
- Provide date-based navigation for message planning content
- Offer both Preview and Editor views for body.txt files
- Enable users to plan and organize messages by date

## Data Source

### Content Provider Path

The feature reads data from the Content Provider using logical names defined in `config.yaml`:

```
leads / msg planner / [date folders]
```

### Date Folder Structure

- Parent folder: `leads` → `msg planner` (logical names from config.yaml)
- Child folders: Named with dates in `YY-MM-DD` format (e.g., `26-06-19`)
- Each date folder contains a `body.txt` file with the message plan content

### Important: Logical vs Physical Names

**CRITICAL**: The paths `leads`, `msg planner`, and date names like `26-06-19` are **logical names** from `config.yaml`, NOT physical folder names. Physical folders are always numeric (e.g., `03/06/71/02`).

All Content Provider API calls must use:
- `IItemWorker.GetByNames` for resolving logical paths
- `IManyItemsWorker.GetManyByName` for finding items by logical name
- Numeric `loca` paths for operations like `GetItem`, `Put`

## Content Provider API Usage

### /invoke Format

The dashboard uses the Content Provider's `/invoke` endpoint with the following argument format:

```json
[
  "IRepoService",
  "IItemWorker",
  "GetByNames",
  "21d11bdc-f1f4-44d1-b61a-3fa6b039c641",
  "leads",
  "msg planner"
]
```

### Key Methods Used

1. **GetByNames** - Resolves logical path to item with numeric loca
2. **GetItem** - Retrieves item details including children
3. **GetManyByName** - Finds child items by logical name
4. **PostParentItem** - Creates or gets an item (for ensuring existence)
5. **Put** - Saves content to an item

## Flow

Canonical flow path:

```
Content Provider → GetByNames → folder → children → date items → body.txt → Preview / Editor
```

### 1. Load Date Folders

```
User navigates to Msg Planner
    ↓
Dashboard calls GET /api/msg-planner
    ↓
API calls getMsgPlannerDateFolders() from chad-dba
    ↓
chad-dba calls IItemWorker.GetByNames(repoId, "leads", "msg planner")
    ↓
GetByNames returns item with Settings.address containing numeric loca
    ↓
chad-dba calls IItemWorker.GetItem(repoId, msgPlannerLoca)
    ↓
GetItem returns item with Children array
    ↓
Filter children by logical name using regex: /^\d{2}-\d{2}-\d{2}$/
    ↓
Sort by date descending (newest first)
    ↓
Return array of { date, loca } to frontend
    ↓
Populate date selector combobox
```

### 2. Select Date and Load Content

```
User selects date from combobox
    ↓
Dashboard calls GET /api/msg-planner?date=YY-MM-DD
    ↓
API finds date folder by matching date string
    ↓
API calls getMsgPlannerBodyForDate(date, dateFolderLoca)
    ↓
chad-dba calls IManyItemsWorker.GetManyByName(repoId, dateFolderLoca, "body.txt")
    ↓
Returns body.txt item with Body content
    ↓
Return { date, loca, body } to frontend
    ↓
Display content in Preview or Editor tab
```

### 3. Save Changes

```
User edits content in Editor tab
    ↓
User clicks Save button
    ↓
Dashboard calls POST /api/msg-planner with { date, loca, content }
    ↓
API calls saveMsgPlannerBody(dateFolderLoca, content)
    ↓
chad-dba calls IItemWorker.PostParentItem(repoId, dateFolderLoca, "Text", "body.txt")
    ↓
PostParentItem creates or gets body.txt item
    ↓
chad-dba calls IItemWorker.Put(repoId, bodyLoca, "Text", "body.txt", content)
    ↓
Put saves the content
    ↓
Return success to frontend
    ↓
Show "Saved" indicator
```

## UI Components

### Toolbar

The toolbar contains (left to right):
- **Save button** - Saves current content (only visible when content is loaded)
- **Preview/Editor tabs** - Switch between view modes
- **Date selector** - Combobox with available dates
- **Refresh button** - Reloads date folders

### Preview Tab

Renders the body.txt content with structured formatting:
- Main headers (`//` at indent 0) → Large bordered sections
- Sub headers (`//` with indent > 0) → Smaller bordered subsections
- Content lines → Pre-formatted text preserving indentation

### Parser

Preview uses the header parser/renderer pipeline from dashboard shared UI components:

- Input: raw `body.txt` text
- Tokenization: split lines and detect header markers (`//`) with indentation depth
- Grouping: build hierarchical sections from indentation + header level
- Rendering:
    - main sections for top-level headers,
    - nested blocks for indented headers,
    - plain text blocks with preserved whitespace for non-header lines.

Parser output is deterministic and text-only: no direct filesystem reads, no path assumptions, and no dependency on physical folders.

### Editor Tab

CodeMirror-based text editor with:
- Line wrapping enabled
- Tab character visualization (→)
- Local scrolling (scrollbar inside editor only)
- No line numbers
- 3-character tab size
- Shared page shell (`EditorPageShell`) to enforce viewport-height layout with local content scrolling

## Date Filtering

### Regex Pattern

```typescript
/^\d{2}-\d{2}-\d{2}$/
```

### Valid Examples
- `26-06-19` ✓
- `25-12-01` ✓
- `00-01-01` ✓

### Invalid Examples
- `2026-06-19` ✗ (4-digit year)
- `26/06/19` ✗ (slashes instead of dashes)
- `msg-workout` ✗ (not a date)
- `all items` ✗ (not a date)

## Rules and Constraints

### What NOT to Do

1. **Do NOT read filesystem directly** - All access must go through Content Provider API
2. **Do NOT use physical paths** - Never hardcode numeric paths like `03/06/71`
3. **Do NOT assume folder structure** - Always resolve via GetByNames
4. **Do NOT skip date validation** - Always filter children by regex

### What TO Do

1. **Always use logical names** from config.yaml
2. **Always resolve paths** via GetByNames first
3. **Always validate dates** with the YY-MM-DD regex
4. **Always use numeric loca** for GetItem, Put operations

## Edge Cases

### Handled Scenarios

1. **No leads folder exists**
   - GetByNames returns empty/no address
   - Returns empty date list
   - Shows "Select a date" placeholder

2. **No msg planner folder exists**
   - GetByNames returns empty/no address
   - Returns empty date list
   - Shows "Select a date" placeholder

3. **No date folders match YY-MM-DD format**
   - All children filtered out
   - Returns empty date list
   - Combobox shows no options

4. **Empty body.txt**
   - Returns empty string for body
   - Preview shows "Empty content"
   - Editor shows empty textarea

5. **Save error**
   - Displays error message
   - Does not clear unsaved changes
   - User can retry

6. **Date change without saving**
   - Current implementation loads new content immediately
   - Unsaved changes are lost (known limitation)

## Bugs

Historical references used as baseline for this fix:

- `architecture/bugs/text-editor-overflows-page.md`
- `architecture/bugs/text-editor-internal-scroll-missing.md`
- `../../../../chad-dashbord/architecture/bugs/msg-planner-editor-internal-scroll-missing.md`

### Planner Editor Scroll Leak (Fixed Architecturally)

**Symptom**: In Msg Planner Editor, scrolling appeared on the whole dashboard page (right-side page scrollbar) instead of being local to the editor pane.

**Technical Cause**: Msg Planner and Msg Todo used similar but duplicated full-height shell code. Planner used a variant that did not enforce the exact same height/overflow contract as the proven editor layout, so flex children could force page-level overflow.

**Where It Occurred**: Msg Planner page editor mode (`/dashboard/msg-planner`, Editor tab).

**Reference for Correct Behavior**: Msg Todo edit screen (`/dashboard/todo-msg/edit`) where scrolling was correctly local inside the editor area.

**How It Was Fixed**:

- Introduced a shared full-height shell component for editor-like pages.
- Both Msg Planner and Msg Todo edit now use this same shell.
- The shell enforces the scroll contract once:
    - fixed viewport height (`h-[calc(100dvh-4rem-20px)]`),
    - flex safety (`min-h-0`),
    - page overflow lock (`overflow-hidden`).

**Why This Is Architectural (Not a Local Workaround)**:

- The scroll behavior is now centralized in one reusable component.
- Future editor screens can reuse the same shell and inherit the correct scrolling semantics.
- It removes class duplication and prevents divergence between tabs/screens.

## Files Modified

### chad-dba

| File | Changes |
|------|---------|
| `src/leads.ts` | Added getMsgPlannerDateFolders(), getMsgPlannerBodyForDate(), saveMsgPlannerBody(), isValidDateFolderName() |

### chad-dashboard

| File | Changes |
|------|---------|
| `lib/chad-dba/leads.ts` | Added Msg Planner functions (local copy) |
| `app/api/msg-planner/route.ts` | New API endpoint |
| `app/(dashboard)/dashboard/msg-planner/page.tsx` | New page component |
| `app/(dashboard)/dashboard/todo-msg/edit/page.tsx` | Switched to shared editor page shell |
| `components/shared/editor-page-shell.tsx` | New shared full-height editor layout shell |
| `components/shared/sidebar.tsx` | Added navigation item |
| `components/shared/headers-renderer.tsx` | Added PreviewContent component |

## Manual Verification

To verify the fix works correctly:

1. Start the dashboard dev server
2. Navigate to Msg Planner tab
3. Observe that:
   - The page does NOT have a scrollbar on the right edge
   - When content is long, the scrollbar appears INSIDE the editor/preview area
   - The toolbar stays fixed at the top
   - Scrolling only affects the content area

## Future Improvements

1. **Unsaved changes warning** - Detect when user navigates away with unsaved edits
2. **Auto-save** - Optionally save changes automatically after typing stops
3. **Diff view** - Show changes between current and saved content
4. **Multiple body files** - Support additional files beyond body.txt
5. **Date range filter** - Filter dates by range for large datasets
6. **Keyboard shortcuts** - Add Ctrl+S for save, etc.