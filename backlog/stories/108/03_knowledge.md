# Story 108 — Knowledge

## Mounts (source of truth = compose)

| Env | Host | Container |
|-----|------|-----------|
| LOCAL Mac | `/Volumes/cp_1/02_files_refrenced` | `/app/contact-photos` (`CHAD_CONTACT_PHOTOS_DIR`) |
| QNAP TEST/PROD | `/share/cp_1/02_files_refrenced` | `/app/contact-photos` |

Per-user archives: `<CHAD_CONTACT_PHOTOS_DIR>/<username>/02_files_zip/`
(sibling of `01_files_photos`). No new volume.

## Lead id

Stable: `loca` (numeric CP path). Display name is GUI-only.

## Metadata

Sidecar JSON next to file (Photos pattern): id, repoGuid, ownerUsername,
leadLoca, storageKey, originalFileName, fileType (`zip`|`rar`), sizeBytes,
createdAt.
