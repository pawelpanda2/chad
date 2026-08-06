# Story 106 — Plan

No formal Plan Mode was used for this Story (fully-specified prompts,
executed directly per Input 1 §2.12 "autonomy" — don't stop after a plan
when the user asked for execution). This file records the approach taken,
written as work progressed rather than presented for approval beforehand.

## Task A — Links V2 group filter (Input 2)

1. Read `links-v2.md` and `page.tsx` to find the Leads/Conv tabs' Beeper
   panels.
2. Find the existing reusable `BeeperGroupFilter` component and the
   `GET /api/beeper-crm/groups/default` endpoint (Story 101) — reuse both
   rather than building a new combobox from scratch.
3. Add one shared `beeperGroupFilter` state to `page.tsx`, applied via a
   `matchesGroup()` filter to both the Leads tab's right panel and the
   Conv tab's left panel (same underlying Beeper contact list, just two
   layouts) — default it from the user's Beeper default group on mount,
   same one-time-effect pattern the Beeper page itself uses.

## Task B — Google Contacts photos (Input 1)

1. Read `ai-docs/begin_here/` (already done earlier this session),
   `05_endpoint-rules.md` (dba-only Content Provider access, thin routes),
   `ai-docs/google-contacts/ai-start.md`.
2. Find the real `cp_1` mount: `docker-compose.local.yml`'s audio-recording
   bind (`/Volumes/cp_1/02_files_refrenced/10_files_audio` →
   `/app/audio-recordings`) is the closest precedent — confirmed the real
   directory tree on disk (`ls /Volumes/cp_1/02_files_refrenced/`) before
   writing any code.
3. Model storage on `packages/dba/src/audio-recordings.ts` (files + sidecar
   JSON, no Content Provider involved) but adapted to the spec's required
   **per-user subdirectory** tree (`<username>/01_files_photos/`), unlike
   audio's flat-directory-plus-repoGuid-filter model — this requires a new
   volume mount at the `02_files_refrenced` **parent** level (audio's mount
   is scoped to its own single subfolder and can't reach sibling
   `<username>/` trees), justified per Input 1 §1.2's "concrete reason"
   requirement.
4. New module `packages/dba/src/google-contact-photos.ts`: MIME allowlist
   + magic-byte detection, path-traversal guards, collision-resistant
   filenames, `assertValidGoogleContactResourceName`.
5. Thin routes under `/api/google-contacts/photos*`; shared
   `PhotosSection` GUI component wired into the Google Contacts detail
   panel + a batch photo-count endpoint for list-row badges.
6. Tests, docker rebuild, live browser smoke test (see Task D).

## Task C — Lead Details photos (Input 4, follow-up)

The user manually found the Photos frame missing from Lead Details — Input
1's own spec had said "Google Contacts module," which is exactly where it
was built, but the user's actual expectation was the Lead Details page,
keyed by the lead itself (a lead can have zero or many linked Google
Contacts, so these are two different attachment points, not a relocation).

1. Read `leads/details/page.tsx` — confirms `LeadDetailsData.loca` is
   already the stable per-lead identifier used elsewhere on that same page
   (Links V2's Beeper/Google Contacts cards).
2. New module `packages/dba/src/lead-photos.ts`, reusing
   `google-contact-photos.ts`'s generic byte/path/username primitives
   (`detectImageMimeFromBytes`, `getUserContactPhotosDir`, etc.) instead of
   duplicating them — only the subject-id shape differs (`leadLoca`,
   validated as a numeric CP path, vs `contactResourceName`).
3. Generalized the GUI: extracted the Google-Contacts-specific
   `ContactPhotosSection` into a subject-agnostic
   `components/shared/photos-section.tsx` (`basePath`/`subjectParam`
   props) so both attachment points share one upload/preview/delete
   component instead of duplicating the UI.
4. New routes `/api/leads/photos*`; new "Photos" card on Lead Details,
   positioned after the existing Google Contacts card, always rendered.
5. Local `.env.local` smoke-login credentials (`E2E_LOGIN_PASSWORD`,
   `E2E_TEST3_PASSWORD`) — found the existing convention already in
   `tests/1_1_data-protection/e2e/local-login.spec.mjs` rather than
   inventing new variable names, per Input 4 §1.4's explicit instruction
   not to guess.
6. `ai-docs/tests/local-smoke-login.md` — variable names + usage rule only,
   no values, linked from `ai-docs/tests/ai-start.md`.

## Task D — Verification (both photo attachment points + combobox)

- Unit tests (Vitest) for both DBA modules, including two mocked-fs files
  for the metadata-write-failure and file-delete-failure paths that can't
  be forced deterministically through the real filesystem.
- `tsc --noEmit` (dba + dashboard) and `eslint` on every changed file.
- Official local Docker rebuild (`03_local_mac_docker/02_build.sh` +
  `03_re-start.sh`), then a real Playwright browser session logged in as
  `pawel_f` from `.env.local`: uploaded/verified/persisted-after-refresh/
  deleted a real test photo on the exact URL the user gave, confirmed the
  physical file+sidecar on `/Volumes/cp_1/02_files_refrenced/pawel_f/
  01_files_photos/` both appearing and disappearing, confirmed the Links
  V2 combobox defaults to "girls" and actually filters the list, spot-
  checked the Google Contacts page's own Photos section and its Search/
  Filters/Refresh/Disconnect regression.
