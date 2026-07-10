# Statuses Setup - New UX

## Overview

The Statuses Setup feature (option 3 in main menu) has been redesigned with a modern CLI UI using `@clack/prompts`.

## Features

### 1. Menu Name Change
- Changed from "GetGirlsStatuses" to "Statuses Setup"

### 2. Single Select for Field Selection

After selecting which statuses to edit, users see a **single select** (not checkbox) with all fields showing current and old values:

```
==============================
Edycja statusu: 06/71/03; 26-05-12_pi_Marzenka Styk
==============================

Co chcesz zmienić?
> her-first-msg: true (old: true)
  your-first-message: true (old: true)
  writing-deadline: [empty] (old: [empty])
  priority-today: 1 (old: 1)
  exit and save
  exit without save
```

**Key changes:**
- Only one field can be selected at a time (single select, not multiselect)
- Each option shows: `field: currentValue (old: originalValue)`
- Empty values are displayed as `[empty]`
- After editing a field, user returns to this select menu with updated values

### 3. Field Editing Flow

#### For her-first-msg / your-first-message (boolean fields):
```
--- Pole: her-first-msg ---
current: true

> zostaw bez zmian
  true
  false
```

**Note:** These fields accept only `true` or `false` values. No date option.

#### For writing-deadline (date field):
```
--- Pole: writing-deadline ---
current: [empty]

> zostaw bez zmian
  wybierz datę
```

Date format: YY-MM-DD (e.g., 26-06-18)

#### For priority-today (integer field):
```
--- Pole: priority-today ---
current: 1

> zostaw bez zmian
  wpisz wartość (0-30)
```

**Note:** This field accepts integers from 0 to 30. Invalid values are rejected.

### 4. Loop Back to Select

After editing a field:
1. The value is updated in memory
2. User sees confirmation: `Zaktualizowano {field}: "{newValue}"`
3. User is returned to the "Co chcesz zmienić?" select menu
4. The select now shows the updated value and the original value in parentheses

Example after changing her-first-msg to false:
```
Co chcesz zmienić?
> her-first-msg: false (old: true)
  your-first-message: true (old: true)
  writing-deadline: [empty] (old: [empty])
  priority-today: 1 (old: 1)
  exit and save
  exit without save
```

### 5. Exit and Save Flow

When user selects "exit and save":

1. **Validate required fields** - if any required field is empty, set defaults:
   - `her-first-msg` → `false`
   - `your-first-message` → `false`
   - `writing-deadline` → `99-01-01`
   - `priority-today` → `0`

2. **Show preview:**
```
==============================
Podgląd zmian: 06/71/03; 26-05-12_pi_Marzenka Styk
==============================

Before:
her-first-msg: true
your-first-message: true
writing-deadline:
priority-today: 1

After:
her-first-msg: false
your-first-message: true
writing-deadline: 26-06-18
priority-today: 1

Zapisać? (Yes/No)
```

3. **After confirmation and save:**
```
updated: 06/71/03; 26-05-12_pi_Marzenka Styk
```

4. **Then automatically proceed to next selected girl/status**

### 6. Exit Without Save

When user selects "exit without save":
```
Anulowano zapis.
```
Then proceed to next selected girl/status.

## Default Values

New status template:
```yaml
her-first-msg: false
your-first-message: false
writing-deadline: 99-01-01
priority-today: 0
```

## Field Definitions

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| her-first-msg | boolean (true/false) | false | Did she write the first message? |
| your-first-message | boolean (true/false) | false | Did you write the first message? |
| writing-deadline | date (YY-MM-DD) | 99-01-01 | Deadline for writing |
| priority-today | integer (0-30) | 0 | Priority level for today |

## Parser Rules

- `key:` means empty value (not the next line)
- `key: value` means key with value `value`
- Next line is never treated as value of previous field
- Values are treated as strings
- Empty values are displayed as `[empty]` in the UI
- Dates are validated only when user selects date option

## Migration

Option 4 in submenu allows migrating existing statuses to new format:
- Empty body → full template
- Existing fields → preserve true/false, set defaults for missing
- Old fields (last-verified, convo-started, etc.) are preserved

## Required Fields Validation

Before saving, all required fields must have values. If any are empty:
- `her-first-msg` → defaults to `false`
- `your-first-message` → defaults to `false`
- `writing-deadline` → defaults to `99-01-01`
- `priority-today` → defaults to `0`

This ensures no status is saved with empty required fields.