# Status Migration

## Overview

The surgical status migration feature (option 5 in the Statuses Setup submenu) performs precise, controlled migration of status items from old formats to the new standard format. Unlike a blind replace, this migration analyzes the existing body content and only changes what needs to be changed, preserving all additional fields and values.

## Goal

- Migrate status items to the new standard format
- Preserve all existing values
- Do not lose any data
- Do not remove additional (non-standard) fields
- Only change field names that need to be changed
- Add missing new standard fields with appropriate defaults
- Maintain the new standard field order at the top

## New Status Standard

The new status format requires the following fields in this order:

```yaml
city:
only-friends: false
her-first-msg: false
your-first-message: false
writing-deadline: 2099-01-01
priority-today: 0
```

### Field Definitions

| Field | Type | Default | Can Be Empty | Description |
|-------|------|---------|--------------|-------------|
| `city` | string | (empty) | Yes | City name |
| `only-friends` | boolean | `false` | No | Friends-only indicator |
| `her-first-msg` | boolean | `false` | No | Did she write the first message? |
| `your-first-message` | boolean | `false` | No | Did you write the first message? |
| `writing-deadline` | date | `2099-01-01` | No | Deadline for writing (YYYY-MM-DD format) |
| `priority-today` | integer | `0` | No | Priority level for today (0-30) |

### Empty Value Rules

- **Can be empty**: `city` - may have an empty value (`city:`)
- **Cannot be empty**: All other fields must have a value. If missing or empty during migration, defaults are applied.

### Default Values (Applied During Migration)

If a field is missing or empty:
- `city` → remains empty
- `only-friends` → `false`
- `her-first-msg` → `false`
- `your-first-message` → `false`
- `writing-deadline` → `2099-01-01`
- `priority-today` → `0`

## Field Name Mapping

Old field names are mapped to new field names:

| Old Field Name | New Field Name |
|----------------|----------------|
| `her-fist-msg` | `her-first-msg` |
| `your-fist-message` | `your-first-message` |
| `writing deadline` | `writing-deadline` |

## Surgical Migration Rules

### 1. Analyze Existing Body

The migration parses the existing body into key-value pairs. Each line is treated independently:
- `key: value` → key = "value"
- `key:` → key = "" (empty value)

### 2. Field Name Mapping

For each old field name that exists in the body:
1. Map it to the new field name
2. Handle conflicts with existing new field names (see below)
3. Remove the old field from top-level standard fields

### 3. Conflict Resolution

When both old and new field names exist simultaneously:

1. **New field has non-empty value**: Keep the new field value, discard old field
2. **New field is empty, old field has value**: Copy value from old field to new field, discard old field
3. **Both are empty**: Use the default value for the new field

The old field is always removed from the top-level standard fields to avoid duplicates.

### 4. Adding Missing Fields

If any new standard field is missing or empty (except `city` which can remain empty):
- `city`: Add with empty value (`city:`)
- `only-friends`: Add with default `false`
- `her-first-msg`: Add with default `false`
- `your-first-message`: Add with default `false`
- `writing-deadline`: Add with default `2099-01-01`
- `priority-today`: Add with default `0`

### 5. Preserving Additional Fields

All non-standard fields (fields not in the new standard) are:
- Preserved with their original names
- Preserved with their original values
- Placed after the standard fields
- Not modified in any way

### 6. Field Order

The final body order is:
1. Standard fields in the defined order (city, only-friends, her-first-msg, your-first-message, writing-deadline, priority-today)
2. Additional (non-standard) fields in their original order
3. Other content (comments, etc.)

## Migration Options

There are two migration options in the Statuses Setup menu, both using the same underlying migration logic:

### Option 4: Migration without preview

- User selects range (single number, comma-separated, range, or `all`)
- Migration executes immediately on all selected statuses
- No Before/After preview shown for each record
- No per-record confirmation (`Zapisać?`)
- At the end, shows a summary:
  - `zmigrowano: X` (migrated)
  - `pominięto: X` (skipped)
  - `nieudane: X` (failed)
- If a single Put returns an error, the migration continues with the next record

### Option 5: Migration with preview (details)

- User selects range (single number, comma-separated, range, or `all`)
- For each status, shows:
  - Before (original body)
  - After (migrated body)
  - `Zapisać? (t/n)` confirmation prompt
- If user confirms, executes Put; if not, skips the record
- At the end, shows a summary:
  - `zmigrowano: X` (migrated)
  - `pominięto: X` (skipped)
  - `nieudane: X` (failed)

### Shared Migration Logic

Both options use the same `buildMigratedStatusBody()` function from `src/statusMigration.ts`. This ensures consistent migration results regardless of which option is chosen.

The migration flow:

1. **Fetch current statuses** - Get all status items from the API
2. **Show list of statuses** - Display all available statuses for selection
3. **User selects range** - User can select:
   - Single number: `71`
   - Multiple numbers: `71,75,80`
   - Range: `71-80`
   - All: `all`
   - Go back: `0`
4. **For each selected status**:
   - Parse the existing body
   - Apply surgical migration using `buildMigratedStatusBody()`
   - (Option 5 only) Show Before/After preview and ask for confirmation
   - If confirmed (or option 4), save via Put
5. **Show summary** - Display migrated/skipped/failed counts
6. **Refresh data** - After all migrations, refresh the cached data

## Before/After Preview

Before saving, the migration shows a preview for each status. Empty values may be displayed as `[empty]` in the UI, but the actual body saves them as empty:

```
==============================
Migracja statusu: 06/71/03; 26-05-12_pi_Marzenka Styk
==============================

Before:
her-fist-msg: true
your-fist-message:
writing deadline: 26-06-20
priority-today: 2
last-verified: 26-06-11

After:
city: [empty]
only-friends: false
her-first-msg: true
your-first-message: false
writing-deadline: 26-06-20
priority-today: 2
last-verified: 26-06-11

Zapisać? (t/n):
```

## API Update

The migration uses the Put operation to update status content:

```
[
  "IRepoService",
  "IItemWorker",
  "Put",
  "girls",
  STATUS_LOCA,
  "Text",
  "status",
  UPDATED_BODY
]
```

### STATUS_LOCA Format

The STATUS_LOCA is derived from the status address:
- Full address: `girls/06/71/03`
- STATUS_LOCA: `06/71/03` (remove the first segment "girls")

## Example Migration

### Input (Before)
```yaml
her-fist-msg: true
your-fist-message:
writing deadline: 26-06-20
priority-today: 2
last-verified: 26-06-11
```

### Output (After)
```yaml
city:
only-friends: false
her-first-msg: true
your-first-message: false
writing-deadline: 26-06-20
priority-today: 2
last-verified: 26-06-11
```

### Changes Made
1. `her-fist-msg` → `her-first-msg` (name mapped, value preserved)
2. `your-fist-message` → `your-first-message` (name mapped, default `false` applied since empty)
3. `writing deadline` → `writing-deadline` (name mapped, value preserved)
4. `city` added (new field, empty)
5. `only-friends` added (new field, default `false` applied)
6. `last-verified` preserved (additional field)

## Date Format

The new status standard uses the **YYYY-MM-DD** format for dates (e.g., `2026-06-18`), not the old YY-MM-DD format (e.g., `26-06-18`).

- Old format: `26-06-18`
- New format: `2026-06-18`

The default far-future date is `2099-01-01`.

## Key Principles

1. **Surgical precision**: Only change what needs to be changed
2. **No data loss**: All values are preserved or migrated
3. **No blind replace**: The entire body is not replaced
4. **User confirmation**: Each migration requires explicit approval
5. **Selective migration**: User can choose which statuses to migrate
6. **Preserve additional fields**: Non-standard fields are never removed