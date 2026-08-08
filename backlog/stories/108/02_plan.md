# Story 108 — Plan

Start SHA: `336ebc4`

1. Convert `/msg-workout` into a small hub (REVIEW + MANUALLY ADDED MESSAGES); move current review to `/msg-workout/review`.
2. DBA `lead-archives.ts`: same `CHAD_CONTACT_PHOTOS_DIR` root → `<user>/02_files_zip`, sidecar JSON, magic ZIP/RAR, 50 MiB, orphan cleanup; counts in one scan.
3. Thin APIs: list/upload + counts; session owner; lead ownership via `getAllLeadsWithContacts` + `loca`.
4. GUI master/detail mirroring Message Creator lead list + counts.
5. Tests + local Docker rebuild + smoke; commit only Story 108; no push/PROD.
