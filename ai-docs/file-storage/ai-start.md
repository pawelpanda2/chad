# File storage — AI start

Status: Story 111 (2026-08-08).

All business operations on referenced files under `02_files_refrenced` go through:

```
Dashboard / API / Console
        ↓
    packages/dba
        ↓
  file-storage contract (put/get/list/delete/…)
        ↓
  filesystem provider + Postgres metadata (`cp_referenced_files`)
        ↓
  mounted cp_1 (runtime root = `CHAD_CONTACT_PHOTOS_DIR`)
```

**Never** build host paths (`/Volumes`, `/share`) in Dashboard routes.
**Never** use sidecar `.json` as the target metadata system for new writes.

## Canonical path

```
02_files_refrenced/<username>/<feature>/<main-entity>/<fileName>
```

Historical spelling `refrenced` is intentional — do not “fix” it.

| Feature | Path segments |
|---------|----------------|
| Photos Lead Info | `01_files_photos/lead-info/<lead-name>/` |
| Photos Google Contacts | `01_files_photos/google-contacts/<contact-label>/` |
| Audio recordings | `10_files_audio/recordings/<display-or-entity>/` |
| Manually added msg ZIPs | `02_files_zip/manually-added-msg/` (see Story 110; uses `cp_lead_archives`) |

## Identity

| Layer | Role |
|-------|------|
| Postgres `cp_referenced_files.id` | Stable file id |
| `entity_id` | Stable lead/contact/… id |
| `file_name` / path | Human-readable; may be renamed on the volume |
| Lookup | canonical filename first → metadata fallback in entity dir |

## Host vs runtime

| Env | Host root | Container |
|-----|-----------|-----------|
| LOCAL | `/Volumes/cp_1/02_files_refrenced` | `/app/contact-photos` |
| QNAP | `/share/cp_1/02_files_refrenced` | `/app/contact-photos` |

## Migration

Inventory → backup → `--dry-run` → COPY→VERIFY hash → metadata insert → GUI smoke → cleanup only after acceptance.

Tool: `packages/dba/scripts/migrate-referenced-files.mjs`

## Code

- `packages/dba/src/file-storage/` — features, path-policy, contracts, filesystem-provider, metadata-store
- Lead photos writer: `packages/dba/src/lead-photos.ts` (Story 111)
