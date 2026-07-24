# Feature: Beeper contacts — Permissions

## Purpose

Contact-level sync permissions (Story 86) control what `beeper-sync` /
`beeper-oplog` store for each person.

## Toolbar (mockup)

Joined controls, no gaps:

1. **View** — Permissions (default) / All / Business / Romantic / Friends
2. **Permission filter** (only in Permissions view) — All / Include / Exclude / Permission
3. **Search**

Permissions view is a table: Include | Exclude | Contact — no last message,
Inbox, or Merge suggestions on this screen.

## Sync modes

| Include | Exclude | Behavior |
|---|---|---|
| ✓ | | Full contact + messages |
| | ✓ | Ignored entirely |
| | | Metadata only (name/avatar/etc., no messages) |

Flags live on Mongo `contacts` documents. Existing contacts are migrated to
`include=true`, `exclude=false` on first Permissions load.

## API

- `GET /api/beeper-crm/contacts?view=permissions&permissionFilter=…`
- `PATCH /api/beeper-crm/contacts/[id]/permissions` `{ include, exclude }`

## Route

`/dashboard/beeper`
