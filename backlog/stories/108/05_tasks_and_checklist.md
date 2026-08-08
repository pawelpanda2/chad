# Story 108 — Checklist

Start SHA: `336ebc4`

| # | Status | Task |
|---|--------|------|
| 1 | DONE | DBA lead-archives + counts + tests (9 PASS) |
| 2 | DONE | API list/upload + counts |
| 3 | DONE | Msg Auto hub button + Manually Added Messages GUI (Msg Workout view untouched) |
| 4 | DONE | Local Docker rebuild + smoke on `/Volumes/cp_1/.../test3/02_files_zip` |
| 5 | DONE | Commit (no git push / no PROD / TEST not run) |

## Routes

- `/dashboard/msg-automation` — hub button **MANUALLY ADDED MESSAGES** (same grid as MSG WORKOUT; no nested menu)
- `/dashboard/msg-automation/msg-workout` — original Msg Workout view (restored; no REVIEW hub)
- `/dashboard/msg-automation/msg-workout/manually-added-messages` — archive upload page

## Mounts

- LOCAL host: `/Volumes/cp_1/02_files_refrenced/<user>/02_files_zip`
- Container: `/app/contact-photos/<user>/02_files_zip` (`CHAD_CONTACT_PHOTOS_DIR`)
- QNAP host (compose default): `/share/cp_1/02_files_refrenced/<user>/02_files_zip`
