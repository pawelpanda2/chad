# Story 101 — Plan: Beeper contact groups

## Ground truth (checked before designing)

- No "group" concept exists anywhere in the Beeper CRM schema today
  (`packages/dba/src/beeper-crm.ts`) — every "group" hit there is about
  Beeper/WhatsApp **group chats** (`channels.type === "group"`,
  `groupChannel` on messages), unrelated to CRM contact organization.
- Closest existing analog is `tags: string[]` — a fixed enum
  (`business`/`romantic`/`friends`/`spam`), multi-value. Not reusable as-is:
  the user wants a freeform, user-named, **singular** group per contact
  (a "combobox" — pick one), not a fixed multi-select tag.
- `beeper-permissions-view.tsx` (the only existing contacts-table view) has
  no bulk-selection/shift-click scaffolding at all — building new.

## Data model

New per-user collection `beeper_groups` in `beeper_<repoGuid>` (same
isolation model as everything else in this file — `getBeeperMongoDb`,
never a shared collection): `{ _id, name, createdAt, updatedAt }`, unique
index on `name` (case-insensitive collation) so creating "Family" twice
returns the existing group instead of duplicating.

`contacts` gets one new optional field: `groupId: ObjectId | null`
(singular — matches "combobox z wyborem grupy", one group per contact).

New `packages/dba/src/beeper-groups.ts`: `listBeeperGroups`,
`createBeeperGroup` (idempotent by normalized name), `setBeeperContactGroup`
(single), `setBeeperContactsGroupBulk` (many), `ensureBeeperGroupsIndexes`.
`listBeeperContacts` (beeper-crm.ts) gets an optional `groupId` filter and
`BeeperContactListItem` gains `groupId: string | null`.

## API

- `GET/POST /api/beeper-crm/groups` — list / create.
- `PATCH /api/beeper-crm/contacts/[id]/group` — single assign (`{groupId}`, null clears).
- `POST /api/beeper-crm/contacts/group-bulk` — bulk assign (`{contactIds[], groupId}`).
- `GET /api/beeper-crm/contacts` extended with `&groupId=` (additive, existing callers unaffected).

## GUI

- `beeper-group-filter.tsx` — a `<select>` in the same row as the Tabs,
  to their left ("w zakładkach przed Conversations"), filtering whichever
  of Conversations/Msg workout is active. Synced into the URL (`?group=`)
  alongside the existing `?tab=&contact=`.
- New 4th tab **"Groups"** (after Msg workout, per explicit order) —
  `beeper-groups-view.tsx`: checkbox + shift-range-select per row (classic
  file-manager behavior: shift-click selects everything between the last
  click and this one), a per-row group `<select>` for immediate single
  reassignment, and a top bar with a group `<select>` + a button literally
  labeled **"Do"** (per explicit naming request) that bulk-assigns every
  checked contact. A compact "+ New group" control creates a group inline
  (native `<select>` can't create options itself).
- This tab intentionally ignores the top group-filter combobox (it's a
  management view over *all* contacts, not a filtered read) — keeps the
  two independent, avoids conflating "filter to browse" with "manage
  everything."

## Isolation

Same as every other Beeper CRM feature: `getBeeperMongoDb(getCurrentRepoGuid())`
only, never a caller-supplied repoGuid — established pattern, not repeated
per file here.
