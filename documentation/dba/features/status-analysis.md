# Status Analysis - GetGirlsStatuses

## Overview

The `GetGirlsStatuses` feature analyzes the status items for all girls in the repository and classifies them into four categories based on the presence and format of the status content.

## Status Categories

### 1. Missing Status Item
The girl does not have a `status` item at all in her directory structure.

**Example:** `girls/06/XX` has no `status` child item.

### 2. Empty Status Body
The `status` item exists, but its Body is empty or contains only whitespace.

**Examples:**
- `Body = ""`
- `Body = "   "`
- Empty JsonElement string

**Known examples from data:**
- `girls/06/73/03` - status exists, but Body is empty
- `girls/06/64/02` - status exists, but Body is empty

### 3. Outdated Status Format
The `status` item exists with content, but uses the old format that lacks the new required fields.

**Old format example:**
```yaml
last-verified: 26-06-11
priority-today: 1
convo-started: false
first-date: false
```

**Known examples from data:**
- `girls/06/80/03`
- `girls/06/75/03`
- `girls/06/79/04`
- `girls/06/77/03`

### 4. Valid Status
The `status` item exists with content that contains all required fields.

**Required fields for valid status (4 fields):**
- `her-first-msg`
- `your-first-message`
- `writing-deadline`
- `priority-today`

**Important:**
- Values can be empty (e.g., `her-first-msg:`)
- Values can be any format (dates, true/false, text)
- Status MAY contain additional fields and still be valid
- Only field existence is checked, NOT value validity

**Example valid status:**
```yaml
her-first-msg: some text
your-first-message:
writing-deadline: 26-09-08
priority-today: 1
extra-field: preserved
```

## Classification Logic

The classification follows this decision tree:

1. **No status item exists** → `Missing status item`
2. **Status item exists:**
   - Body is null, undefined, or empty after trimming → `Empty status body`
   - Body contains all 4 required fields → `Valid status`
   - Body does not contain all 4 required fields → `Outdated status format`

## Summary Output Format

```
Girls total: X
Valid status: X
Missing status item: X
Empty status body: X
Outdated status format: X

Missing status item:
  XX. Girl Name
  ...

Empty status body:
  XX. Girl Name -> girls/06/XX/XX
  ...

Outdated status format:
  XX. Girl Name -> girls/06/XX/XX
  ...

Valid status:
  XX. Girl Name -> girls/06/XX/XX
  ...
```

## Submenu Options

### Option 1: Create Missing Status Items

This option handles only:
- **Missing status item**: Creates new status item using POST, then initializes with template using PUT
- **Empty status body**: Updates existing status item with template using PUT

**Does NOT update outdated status formats** - these require a separate option.

**Template for new/empty statuses:**
```yaml
her-first-msg:
your-first-message:
writing-deadline:
priority-today:
```

### Option 2: Show Status Details by Category

Displays a category selection menu:
1. Empty status body
2. Outdated status format
3. Valid status
4. All existing statuses
0. Return

After selecting a category, shows a list of girls in that category. Selecting a girl displays their status body content. If the body is empty, displays `[empty status body]`.

## Field Name Corrections

**Correct field names (use these):**
- `her-first-msg`
- `your-first-message`
- `writing-deadline`
- `priority-today`

**Incorrect field names (do NOT use):**
- `her-fist-msg`
- `your-fist-message`
- `writing deadline`
- `contact-date` (removed from required fields)

## Update Strategy

When updating an existing status item:

1. **Fetch existing item** using `GetItem`
2. **Read current Body** content
3. **Update only required fields** - preserve all other existing fields
4. **Write back** using `Put`

**Important:** Never replace the entire body if the status already has additional data. Always preserve existing extra fields.

## Implementation Details

### Helper Functions

- `isEmptyBody(body)`: Checks if body is null, undefined, or empty string after trimming
- `hasField(body, field)`: Checks if body contains a YAML field at the start of a line
- `hasAllRequiredFields(body)`: Checks if body contains all 4 required fields
- `classifyStatus(body)`: Main classification function that returns the status category

### Data Structures

```typescript
type StatusCategory = "missing" | "empty" | "outdated" | "valid";

interface GirlStatusInfo {
  id: string;
  name: string;
  category: StatusCategory;
  statusAddress?: string;
  statusItem?: any;
}
```

### Required Fields

```typescript
const requiredFields = [
  "her-first-msg",
  "your-first-message",
  "writing-deadline",
  "priority-today"
];