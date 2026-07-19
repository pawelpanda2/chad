# Forms in Chad Dashboard

## Overview

The Forms tab contains multiple compact forms for logging different types of data.

## Available Forms

| Form Name | Description | Purpose |
|-----------|-------------|---------|
| Add Lead | New contact | Save a new lead with contacts |
| Actions | Log session | Log a daygame, nightgame, or date session |
| DAILY ENTRY | Daily log | Detailed daily training metrics |
| DATE ENTRY | Date log | Individual date entry tracking |

## Form Menu Layout

The Forms tab menu displays all forms in a compact 4-column grid:

```
┌──────────┬──────────┬──────────────┬────────────┐
│ Add Lead │ Actions  │ DAILY ENTRY  │ DATE ENTRY │
│Newcontact│Logsession│   Dailylog   │  Datelog   │
└──────────┴──────────┴──────────────┴────────────┘
```

Each menu item:
- Minimum height: 70px
- Compact padding: `p-3`
- Small gap: `gap-2` between grid items
- Hover effect with border highlight

---

# DAILY ENTRY Form

## Overview

A compact form for logging detailed daily training metrics (formerly known as "ADD ACTION").

## Form Fields

The form contains 15 fields arranged in a 4-column grid:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| DATE | date | Today's date (YYYY-MM-DD) | The date of the action |
| STATE | text | empty | Current state |
| TRAINING TIME | text | empty | Duration of training |
| VERBAL EXERCISES | text | empty | Verbal exercises done |
| INFIELD | text | empty | Infield notes |
| THEORY | text | empty | Theory studied |
| FIELD REVIEW | text | empty | Field review notes |
| ACTION TIME | text | empty | Time of action |
| APPROACHES | text | empty | Number of approaches |
| LONG INTERACTIONS | text | empty | Long interactions count |
| NUMBERS | text | empty | Numbers received |
| FIRST MESSAGES | text | empty | First messages sent |
| RESPONSES | text | empty | Responses received |
| DATES SET UP | text | empty | Dates scheduled |
| DATES | text | empty | Dates completed |

## UI Design

- **4-column grid**: All fields arranged in 4 columns to minimize vertical space
- **Minimal spacing**: `gap-2` between fields, `space-y-0.5` between label and input
- **Small inputs**: `h-7` (28px) height for all input fields
- **Small labels**: `text-xs` font size with `font-semibold`

---

# DATE ENTRY Form

## Overview

A compact form for logging individual date entries.

## Form Fields

The form contains 7 fields arranged in a 4-column grid:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| DATA | date | Today's date (YYYY-MM-DD) | Date of the entry |
| ŹRÓDŁO | text | empty | Source |
| NAZWA | text | empty | Name |
| LINK | text | empty | Link |
| PULL | select | FALSE | Pull status (TRUE/FALSE) |
| CLOSE | select | NIE | Close status (NIE/TAK) |
| JAKOŚĆ | text | empty | Quality |

## Default Values

- **DATA**: Automatically populated with today's local date in YYYY-MM-DD format
- **PULL**: Defaults to `FALSE`
- **CLOSE**: Defaults to `NIE`

## UI Design

- **4-column grid**: All fields arranged in 4 columns
- **Minimal spacing**: `gap-2` between fields, `space-y-0.5` between label and input
- **Small inputs**: `h-7` (28px) height for all input fields
- **Select dropdowns**: Used for PULL and CLOSE fields with predefined options

## Backend Integration

Both forms currently have placeholder submit handlers. Backend API endpoints need to be implemented.

## Related Files

- `app/(dashboard)/dashboard/forms/page.tsx` - Main forms page component