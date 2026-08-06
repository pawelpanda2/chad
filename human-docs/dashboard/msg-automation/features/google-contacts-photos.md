# Google Contacts → Photos

Status: Story 106 (2026-08-06).

## Cel

CHAD-local photos attached to a Google Contact by its stable
`resourceName` (e.g. `people/c1234567890`) — never the contact's display
name or phone (both mutable/non-unique). **Not** a change to the contact's
actual Google profile photo and **not** a People API write of any kind —
People API access in this package stays strictly read-only (see
`ai-docs/google-contacts/ai-start.md`).

## Storage

`packages/dba/src/google-contact-photos.ts` — files + sidecar JSON
metadata under this CHAD user's own `<username>/01_files_photos/`
directory on the `cp_1` volume (host Mac:
`/Volumes/cp_1/02_files_refrenced/<username>/01_files_photos/`; QNAP:
`/share/cp_1/02_files_refrenced/<username>/01_files_photos/`; spelling
`refrenced` is intentional, see `audio-recordings.ts`). New env var
`CHAD_CONTACT_PHOTOS_DIR` (container path) /
`CHAD_CONTACT_PHOTOS_HOST_PATH` (host bind override, all 4 compose files) —
mounts the `02_files_refrenced` **parent** directory so the app can
create/read any `<username>/01_files_photos/` subtree, unlike the audio
mount which is scoped to a single fixed subfolder.

Sidecar JSON per photo: `id`, `repoGuid`, `ownerUsername`,
`contactResourceName`, `storageKey`, `originalFileName`, `mimeType`,
`sizeBytes`, `createdAt`. Modeled on `audio-recordings.ts`'s
files-plus-sidecar pattern, not on a Content Provider Item (no CP
involvement — plain filesystem, same as audio).

Lead Details has its own, separate attachment point on the same physical
directory — `packages/dba/src/lead-photos.ts` (see
`human-docs/dashboard/leads/features/lead-photos.md`) — keyed by a lead's
stable `loca` instead of a Google Contact's `resourceName`. A lead can
have zero, one, or many linked Google Contacts (Links V2); the two photo
sets are independent.

## Validation (server-side, `saveContactPhoto`)

- MIME allowlist: JPEG/PNG/WebP, checked against **both** the declared
  MIME and the file's actual magic bytes.
- Max 8 MiB per photo, max 10 files per upload request.
- Server-generated collision-resistant filename (`wx` — never overwrites);
  a metadata-write failure after the data file lands deletes the orphan.
- `contactResourceName` validated against `^people/[A-Za-z0-9_-]+$`.

## Isolation

`username`/`repoGuid` come from the session-derived repo context, never
the request. Directory split by username plus a `repoGuid` check on every
read/list/delete.

## GUI

`app/(dashboard)/dashboard/msg-automation/google-contacts/page.tsx` — a
"Photos" section inside the selected contact's detail panel (uses the
shared `PhotosSection` component, `components/shared/photos-section.tsx`),
plus a small photo-count badge on each list row (`GET
/api/google-contacts/photos/counts`, one directory scan for the whole
list rather than N per-contact requests).

## Routes

- `GET/POST /api/google-contacts/photos` (`?resourceName=...` / multipart
  `resourceName` + `photos`)
- `GET /api/google-contacts/photos/counts`
- `GET/DELETE /api/google-contacts/photos/[id]`

Id-based reads only — no host/container path is ever sent to or accepted
from the client.

## Tests

`packages/dba/src/google-contact-photos.test.ts` (25 cases — save/list/
read/delete, magic-byte MIME validation incl. SVG/HTML disguised as an
image, size limit, per-contact isolation, cross-user isolation, path/id/
username/resourceName traversal rejection) and
`google-contact-photos-failure-paths.test.ts` (mocked-fs: metadata-write
failure cleanup, file-delete failure compensation).

## Never

- Never writes to the Google Contacts profile photo or any other People
  API field.
- Never identifies a photo's subject by name/phone.
- Never serves the `cp_1` volume as a public static directory — every read
  goes through the session-scoped, id-based route above.
