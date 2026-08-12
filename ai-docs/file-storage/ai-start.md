# File storage — AI start

Status: Story 112 (2026-08-08) — root under `chad-data`; audio per-user.

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
**Never** use sidecar `.json` as the target metadata system for new photo writes.

## Canonical path (relative / Postgres)

```
02_files_refrenced/<username>/<feature>/<main-entity>/<fileName>
```

Historical spelling `refrenced` is intentional — do not “fix” it.

## Host location (Story 112)

Referenced files live **under `chad-data`** on the cp_1 volume:

| Env | Host root | Container |
|-----|-----------|------------|
| LOCAL | `/Volumes/cp_1/chad-data/02_files_refrenced` | `/app/contact-photos` |
| QNAP | `/share/cp_1/chad-data/02_files_refrenced` | `/app/contact-photos` |

Compose: `CHAD_CONTACT_PHOTOS_HOST_PATH` (default above).  
DB relative keys still start with `02_files_refrenced/…` (no `chad-data` in Postgres).

| Feature | Path segments under `<user>/` |
|---------|-------------------------------|
| Photos Lead Info | `01_files_photos/lead-info/<lead-name>/` |
| Photos Google Contacts | `01_files_photos/google-contacts/<contact-label>/` |
| Audio recordings | `10_files_audio/recordings/` |
| Audio drafts | `10_files_audio/drafts/<draftId>/` |
| Manually added msg ZIPs | `02_files_zip/manually-added-msg/` |

## Identity

| Layer | Role |
|-------|------|
| Postgres `cp_referenced_files.id` | Stable file id |
| `entity_id` | Stable lead/contact/… id |
| `file_name` / path | Human-readable; may be renamed on the volume |
| Lookup | canonical filename first → metadata fallback in entity dir |

## Migration

Inventory → backup → `--dry-run` → COPY→VERIFY hash → metadata / path switch → GUI smoke → cleanup only after acceptance.

Tools:

- Photos decoy/flat → lead-info: `packages/dba/scripts/migrate-referenced-files.mjs`
- Root → `chad-data` + audio user-scope: `packages/dba/scripts/migrate-referenced-root-to-chad-data.mjs`

## Code

- `packages/dba/src/file-storage/` — features, path-policy, contracts, filesystem-provider, metadata-store
- Lead photos: `packages/dba/src/lead-photos.ts`
- Audio: `packages/dba/src/audio-recordings.ts` + `audio-recording-drafts.ts`
