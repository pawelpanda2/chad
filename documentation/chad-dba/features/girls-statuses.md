# Girls Statuses

## Overview

Each girl in the system can have a status item that tracks various metadata about the conversation and relationship. The status is stored as a YAML-formatted text body in a dedicated item under the girl's directory.

## Status Item Location

The status item is located at:
```
girls/{repo}/{loca}/status
```

Example: `girls/06/71/03/status`

## Valid Status Format

A valid status requires all of the following fields in this order:

```yaml
city:
only-friends: false
her-first-msg: false
your-first-message: false
writing-deadline: 2099-01-01
priority-today: 0
```

### Required Fields

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
- **Cannot be empty**: All other fields must have a value. If missing or empty, defaults are applied.

### Field Order

The standard fields must appear at the top of the body in the order listed above. Additional (non-standard) fields may follow.

## Status Categories

Statuses are classified into four categories:

1. **Missing**: No status item exists for the girl
2. **Empty**: Status item exists but body is empty
3. **Outdated**: Status item exists but is missing required fields or uses old field names
4. **Valid**: Status item has all required fields in the correct format

## Additional Fields

Additional (non-standard) fields may be present in the status body. These fields:
- Are preserved during migrations
- Are not validated or modified
- Appear after the standard fields
- Examples: `last-verified`, `convo-started`, etc.

## Old Field Names (Deprecated)

The following old field names are mapped to new names during migration:

| Old Field Name | New Field Name |
|----------------|----------------|
| `her-fist-msg` | `her-first-msg` |
| `your-fist-message` | `your-first-message` |
| `writing deadline` | `writing-deadline` |

## Date Format

The status uses the **YYYY-MM-DD** format for dates (e.g., `2026-06-18`), not the old YY-MM-DD format (e.g., `26-06-18`).

- Old format: `26-06-18`
- New format: `2026-06-18`

The default far-future date is `2099-01-01`.

## Parser Rules

- `key:` means empty value
- `key: value` means key with value `value`
- Next line is never treated as value of previous field
- Values are treated as strings
- Each line is independent

## Status Management

The Statuses Setup menu (option 3 in main menu) provides the following operations:

1. **Create missing status items** - Creates status items for girls without them
2. **Show status details** - View the content of existing statuses
3. **Complete statuses** - Edit and fill in missing values
4. **Migrate statuses** - Basic migration to new format
5. **Surgical migration** - Precise migration with Before/After preview

## Migration

See [status-migration.md](status-migration.md) for detailed information about the surgical migration process.