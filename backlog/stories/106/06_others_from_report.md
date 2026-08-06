# Story 106 — Other notes

## Git starting point

Working tree was clean at the start of this session (`git status --short`
→ nothing). Starting commit SHA: `52fbd39a20a2e6379cc9cbd0f330b05f349dd617`
("fix(links-v2): wire Links V2 into Message Creator; show conv name in
Conv tab"). No baseline commit was needed per the "clean tree → just
record the SHA" rule.

## Architectural decisions

- **Two separate photo attachment points on purpose, not a duplication
  mistake.** Google Contacts photos (keyed by `resourceName`) and Lead
  photos (keyed by `loca`) are independent — a lead can have zero, one, or
  many linked Google Contacts via Links V2, so "the lead's photos" and
  "this particular linked contact's photos" are genuinely different sets.
  Both share the same physical per-user directory and the same low-level
  primitives (`google-contact-photos.ts` exports the generic byte/path/
  username helpers that `lead-photos.ts` imports) to avoid duplicating the
  actual validation/storage logic, while keeping each module's own
  metadata shape and public API separate.
- **New volume mount, justified by a concrete gap, not guessed.** The
  existing audio-recordings mount is deliberately scoped to its own single
  subfolder (`10_files_audio`); it has no visibility into sibling
  `<username>/` directories. Rather than mount the same narrow scope again
  for photos, the new mount targets the `02_files_refrenced` **parent**
  directory once, letting the app create/read any user's
  `01_files_photos/` subtree underneath it — one mount for the whole
  feature instead of per-user mounts (which wouldn't scale and would need
  a compose change per new user).
- **Filesystem-only storage, no Content Provider involvement**, matching
  the audio-recordings precedent and the endpoint-rules doc's own scoping
  (dba is for Content Provider access; this feature never touches CP at
  all, same as audio). Metadata lives in a sidecar `.json` per photo, not
  a database row — chosen because that's the repo's one existing, working
  precedent for "a file plus its metadata" (audio recordings), and Input
  1 §1.5 explicitly said to use the repo's existing standard rather than
  invent a new one.

## Known limitation — macOS SMB "delete tombstone" artifacts

After a successful delete (both file and metadata correctly removed under
their real names, confirmed from both the host and the container's own
view), two zero-content-under-their-real-name files remain briefly:
`.smbdeleteAAA...`/`.smbdeleteBAA...`. This is a documented macOS Finder/
SMB-client behavior when unlinking a file on a network share while some
other process (Finder, Spotlight `mdworker`) may have it open/cached — the
OS renames-then-defers the actual removal. It is **not** a bug in
`deleteContactPhoto`/`deleteLeadPhoto` (the app-level delete already
succeeded, and neither the GUI nor any read/list endpoint can access the
content under those tombstone names — `readAllOwnedMetadata` only reads
`.json`-suffixed files, and no photo id ever resolves to a `.smbdelete*`
name). Nothing to fix in this Story; flagged here in case a future Story
sees these lingering on the real `cp_1` mount and wonders where they came
from.

## Follow-up proposals (not implemented, out of this Story's scope)

- `lead-photos.ts` currently has no per-contact-style "photo count badge"
  anywhere in the Leads list (Views → Leads) — only Lead Details itself
  shows the count. Not requested by either input; worth asking about if a
  future Story wants a `📷 N` badge on the leads list the same way Google
  Contacts now has one.
- No total per-user storage quota beyond the existing 8 MiB/photo,
  10-files/request limits — not requested, and the existing per-file/
  per-request caps already bound the worst case reasonably.
- Google Contacts photos were spot-checked live (Photos section renders,
  empty state correct) rather than given a full second upload/delete
  round-trip in the browser, to avoid leaving a second test photo mixed
  into `pawel_f`'s real, already-connected Google Contacts data — the
  underlying code path is identical to the one fully round-tripped on
  Lead Details (same `PhotosSection` component, same
  save/list/read/delete primitives shared via `google-contact-photos.ts`),
  and is additionally covered by 27 passing unit tests specific to that
  module. If a dedicated test/disposable Google-connected contact becomes
  available, a full live round-trip there would close this gap.
