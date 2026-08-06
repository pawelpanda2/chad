# Lead Details → Photos

Status: Story 106 (2026-08-06).

## Cel

CHAD-local photos attached directly to a lead — not a Google Contacts
photo, not synced anywhere external. A lead may have zero or many linked
Google Contacts (Links V2); this is a separate attachment point that
exists even when no Google Contact is linked at all.

## Stable identity

Photos are keyed by the lead's `loca` — its numeric Content Provider path
(e.g. `03/06/81`, see `leads.ts`'s own doc comments) — never by the lead's
display name, which can be renamed. `LeadDetailsData.loca` (already used by
Links V2 elsewhere on this same page) is the value passed through.

## Storage

Same physical tree as Google Contacts photos
(`packages/dba/src/google-contact-photos.ts`) — this CHAD user's own
`<username>/01_files_photos/` directory on the `cp_1` volume (host Mac:
`/Volumes/cp_1/02_files_refrenced/<username>/01_files_photos/`; QNAP:
`/share/cp_1/02_files_refrenced/<username>/01_files_photos/`; spelling
`refrenced` is intentional, see `audio-recordings.ts`'s own note). New env
var `CHAD_CONTACT_PHOTOS_DIR` (container path) / `CHAD_CONTACT_PHOTOS_HOST_PATH`
(host bind override) — mounts the **parent** `02_files_refrenced` directory
(not a single subfolder like the audio mount), since the app needs to
create/read arbitrary `<username>/01_files_photos/` subtrees underneath it.

Lead photos and Google Contacts photos share this same directory —
`packages/dba/src/lead-photos.ts` reuses `google-contact-photos.ts`'s
generic byte/path/username primitives (magic-byte MIME detection,
collision-resistant filenames, path-traversal guards) rather than
duplicating them. Each module's own sidecar metadata shape (`leadLoca` vs
`contactResourceName`) is what tells the two apart when scanning the
directory — neither module needs to know the other exists.

Sidecar JSON per photo: `id`, `repoGuid`, `ownerUsername`, `leadLoca`,
`storageKey`, `originalFileName`, `mimeType`, `sizeBytes`, `createdAt`.

## Validation (server-side, `saveLeadPhoto`)

- MIME allowlist: JPEG/PNG/WebP, checked against **both** the declared MIME
  and the file's actual magic bytes (rejects a relabeled SVG/HTML/etc.).
- Max 8 MiB per photo, max 10 files per upload request.
- Server-generated collision-resistant filename (`wx` flag — never
  overwrites); a metadata-write failure after the data file already landed
  deletes the orphan file.
- `leadLoca` validated against the numeric-path pattern; a bare lead name
  is rejected.

## Isolation

`username`/`repoGuid` always come from the session-derived repo context
(`getCurrentUsername()`/`getCurrentRepoGuid()`), never from the request.
Directory-level split (`<username>/01_files_photos/`) plus a `repoGuid`
check on every read/list/delete — cross-user access reads as 404/empty,
never leaks another user's photos.

## GUI

`app/(dashboard)/dashboard/leads/details/page.tsx` — a "Photos" card,
positioned after the existing Google Contacts card, always rendered (even
with zero photos). Uses the shared `PhotosSection` component
(`components/shared/photos-section.tsx`) — thumbnails, "Add photo" (multi-
select), larger click-through preview, delete with a Yes/No confirm
dialog. The same component also backs the Google Contacts page's own
Photos section (`basePath`/`subjectParam` swapped) — see
`google-contacts-photos.md`.

## Routes

- `GET/POST /api/leads/photos` (`?loca=...` / multipart `loca` + `photos`)
- `GET/DELETE /api/leads/photos/[id]`

Id-based reads only — no host/container path is ever sent to or accepted
from the client.

## Never

- Never a Google People API write — this is purely a CHAD-local
  attachment, independent of whether the lead has any linked Google
  Contact.
- Never identifies a photo's subject by lead name/phone — always `loca`.

## Tests

`packages/dba/src/lead-photos.test.ts` — save/list/read/delete, magic-byte
MIME validation, stable-loca isolation between leads, cross-user isolation,
persistence across independent list calls (refresh-equivalent).
`packages/dba/src/lead-photos-failure-paths.test.ts` — mocked-fs coverage
for the two paths the real filesystem can't force deterministically
(metadata-write failure cleaning up the orphan photo file; file-delete
failure aborting before metadata delete), mirroring
`google-contact-photos-failure-paths.test.ts`'s pattern.
