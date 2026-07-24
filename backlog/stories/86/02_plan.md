# Story 86 — Plan

Status: **DONE — local dashboard `260725_013027`.**

## Sync modes

| include | exclude | Sync behavior |
|---|---|---|
| true | false | Full contact + messages |
| false | true | Skip contact updates and messages |
| false | false | Contact metadata only (no message history) |

Unset fields (pre-migration) treated as include until migration runs.
New contacts `$setOnInsert`: `include: true`, `exclude: false`.

## Touch points

- `packages/dba/src/beeper-crm.ts` — fields, migrate, list, update
- `PATCH /api/beeper-crm/contacts/[id]/permissions`
- `GET /api/beeper-crm/contacts?view=permissions&permissionFilter=`
- `beeper-sync` + `beeper-oplog` — gate message upserts
- `beeper/page.tsx` — mockup toolbar + table

## Out of scope

- TEST/PROD deploy unless asked
- Deleting historical messages when Include is turned off
