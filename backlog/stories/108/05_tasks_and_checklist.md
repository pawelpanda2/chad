# Story 108 — Checklist

Start SHA: `336ebc4`

| # | Status | Task |
|---|--------|------|
| 1 | DONE | DBA lead-archives + counts + tests (9 PASS) |
| 2 | DONE | API list/upload + counts |
| 3 | DONE | Msg Workout hub + Review + Manually Added Messages GUI |
| 4 | DONE | Local Docker rebuild + smoke on `/Volumes/cp_1/.../test3/02_files_zip` |
| 5 | DONE | Commit (no git push / no PROD / TEST not run) |

## Routes

- `/dashboard/msg-automation/msg-workout` — hub (REVIEW + MANUALLY ADDED MESSAGES)
- `/dashboard/msg-automation/msg-workout/review` — previous Msg Workout
- `/dashboard/msg-automation/msg-workout/manually-added-messages` — new page

## Mounts

- LOCAL host: `/Volumes/cp_1/02_files_refrenced/<user>/02_files_zip`
- Container: `/app/contact-photos/<user>/02_files_zip` (`CHAD_CONTACT_PHOTOS_DIR`)
- QNAP host (compose default): `/share/cp_1/02_files_refrenced/<user>/02_files_zip`
