# Story 86 — Tasks and checklist

## Tasks

### T1–T5 — DONE

## Checklist

- [x] Toolbar: Permissions | filter | Search (compact)
- [x] Permissions table: Include, Exclude, Contact only
- [x] Filters All / Include / Exclude / Permission
- [x] Mutual-exclusive checkboxes; both can be off
- [x] Mongo persistence via DBA/API
- [x] Migration include=true exclude=false
- [x] Sync: include=full, exclude=skip, both=false=metadata only (REST, SQLite, oplog)
- [x] No app restart required for next sync cycle
- [x] Local dashboard deploy `260725_013027`
- [x] Unit tests for resolveBeeperSyncMode

## Note

Full live beeper-sync against production Beeper was not re-run in this
session (Mac sync process). Gates are in code paths; next sync cycle on Mac
picks them up without restarting the dashboard.
