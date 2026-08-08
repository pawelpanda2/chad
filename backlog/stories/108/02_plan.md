# Story 108 — Plan

Start SHA: `336ebc4`

1. Keep `/msg-workout` as the original Msg Workout review view (do not nest a second menu).
2. Add one Msg Auto hub button **MANUALLY ADDED MESSAGES** → `/msg-workout/manually-added-messages`.
3. DBA `lead-archives.ts`: same `CHAD_CONTACT_PHOTOS_DIR` root → `<user>/02_files_zip`, sidecar JSON, magic ZIP/RAR, 50 MiB, orphan cleanup; counts in one scan.
4. Thin APIs: list/upload + counts; session owner; lead ownership via `getAllLeadsWithContacts` + `loca`.
5. GUI master/detail mirroring Message Creator lead list + counts.
6. Tests + local Docker rebuild + smoke; commit only Story 108; no push/PROD.
