# Story 86 — Beeper Permissions

## Source

User request (2026-07-25): rebuild Beeper top toolbar per
`examples/beeper_permissions_mockup_v7.html` and implement backend sync
permissions (Include / Exclude / both off) in Mongo + beeper-sync / oplog.

## Goal

- Default view: **Permissions** table (Include | Exclude | Contact)
- Compact toolbar: view select | permission filter | Search
- Persist flags on contact docs; gate message sync accordingly
- Migrate existing contacts to `include=true`, `exclude=false`
