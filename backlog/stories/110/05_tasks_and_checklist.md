# Story 110 — Checklist

Start SHA: `e63c232`

| # | Status | Task |
|---|--------|------|
| 1 | DONE | PG migration `0003_lead_archives.sql` → `cp_lead_archives` |
| 2 | DONE | DBA rewrite: view subdir, readable names, PG store, sidecar read-compat |
| 3 | DONE | API leadUuid + GUI route `manually-added-msg` + 3-line hub label |
| 4 | DONE | Unit tests 11 PASS; local Docker `260808_143624`; migration applied; FS+PG smoke test3 |
| 5 | DONE | Commit (no PROD / no push unless asked) |

## Paths

- FS: `<CHAD_CONTACT_PHOTOS_DIR>/<user>/02_files_zip/manually-added-msg/<readable>.zip`
- Relative DB: `02_files_refrenced/<user>/02_files_zip/manually-added-msg/<file>.zip`
- Route: `/dashboard/msg-automation/msg-workout/manually-added-msg`
- Menu label: `manually added msg` (hub: three lines)

## Parallel WIP left untouched

- `backlog/stories/109/`, `msg-planner-date-sort.test.ts`, `vitest.config.mjs` date-sort entry
- Story 109 date-sort hunks in `leads.ts` restored after this commit
