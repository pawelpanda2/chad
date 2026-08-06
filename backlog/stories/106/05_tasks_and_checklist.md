# Story 106 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | Links V2 — Beeper contact-group filter combobox (Leads + Conv tabs), defaulting to the Beeper default group |
| 2 | DONE      |             | Google Contacts — add/list/preview/delete CHAD-local photos per contact (stable `resourceName`) |
| 3 | DONE      |             | Lead Details — add/list/preview/delete CHAD-local photos per lead (stable `loca`), separate from Google Contacts photos |
| 4 | DONE      |             | Local browser smoke-test login wired to `.env.local` + documented (variable names only) in `ai-docs/` |

# Task 1 — Links V2 Beeper contact-group filter

**Requested:** In both the Leads tab and the Conv tab, add a combobox
between the list and the search field for the Beeper conversation panel,
populated with the user's real contact groups, defaulting to the same
default group set in Beeper → Groups (currently "girls"), and filtering
the list live.

**Done:** Reused the existing `BeeperGroupFilter` component
(`components/beeper/beeper-group-filter.tsx`, Story 101) and the existing
`GET /api/beeper-crm/groups/default` endpoint — no new backend needed. Added
one shared `beeperGroupFilter` state to `links-v2/page.tsx`, applied to
both the Leads tab's right-side Beeper panel and the Conv tab's left-side
Beeper panel (both list the same underlying Beeper contacts, just laid
out differently), with a `matchesGroup()` helper mirroring the
`"__none__"`/undefined convention `BeeperGroupFilter` already uses. A
one-time effect on mount fetches the default group and applies it, same
pattern as the Beeper page's own default-group effect.

**Files changed:**
`packages/dashboard/app/(dashboard)/dashboard/msg-automation/links-v2/page.tsx`

**Tested:** `tsc --noEmit` (dashboard) clean; `eslint` clean. Live browser
smoke test (see Task 4 below for login flow): navigated to
`/dashboard/msg-automation/links-v2`, confirmed the combobox shows all 7
real groups (`game`, `girls`, `idk`, `man-friends`, `others`, `polska`,
`woman-friends`) plus "All groups"/"— no group —", with **"girls"
pre-selected** matching the real default group configured in Beeper →
Groups. Switched to `woman-friends` and confirmed the right-panel contact
list changed to a completely different set of contacts, proving the
filter is live, not just decorative.

**Status: DONE**

# Task 2 — Google Contacts photos

**Requested:** Add a feature to the existing Google Contacts module
letting the user attach their own local photos to a contact — not a
People API write, not a change to the contact's Google profile photo.
Photos live on the `cp_1` volume under
`02_files_refrenced/<username>/01_files_photos/`, keyed by the contact's
stable `resourceName` (never name/phone). Server-side MIME + magic-byte
validation (JPEG/PNG/WebP only), size/count limits, no overwrite, no
public volume exposure, id-based controlled read endpoint, per-user
isolation from session (never from request), delete with a Yes/No
confirm, thumbnails + larger preview + photo count badge, loading/error/
empty states, no full-page reload after upload.

**Done:**
- Confirmed the real `cp_1` mount before writing any code: the existing
  audio-recordings bind
  (`/Volumes/cp_1/02_files_refrenced/10_files_audio` →
  `/app/audio-recordings`) only covers its own subfolder, so a **new**
  mount was justified (and added) at the `02_files_refrenced` **parent**
  level — `CHAD_CONTACT_PHOTOS_DIR` (container path) /
  `CHAD_CONTACT_PHOTOS_HOST_PATH` (host override) — across all 4 compose
  files (local Mac Docker, QNAP test, QNAP prod, server1 test-prod).
- New `packages/dba/src/google-contact-photos.ts`: modeled on
  `audio-recordings.ts`'s files-plus-sidecar-JSON pattern (no Content
  Provider involvement, per the endpoint-rules doc's own DBA-only-for-CP
  scoping — this feature doesn't touch CP at all, same as audio), but
  adapted to a real per-username directory tree instead of a flat
  directory + repoGuid filter. Magic-byte detection for JPEG/PNG/WebP
  (rejects a relabeled SVG/HTML even if the declared MIME lies), 8 MiB
  per-file / 10-files-per-request limits, `wx`-flag no-overwrite writes,
  orphan-file cleanup if the metadata write fails after the data file
  lands, explicit delete-file-then-delete-metadata compensation (no fake
  transaction).
- Thin routes: `GET/POST /api/google-contacts/photos`,
  `GET /api/google-contacts/photos/counts` (one directory scan for every
  list-row badge instead of N requests), `GET/DELETE
  /api/google-contacts/photos/[id]` — id-based only, session-resolved
  owner, no path ever sent to or accepted from the client.
- GUI: new shared `components/shared/photos-section.tsx` (thumbnails, Add
  photo multi-select, larger click-through preview dialog, delete with a
  Yes/No confirm dialog, loading/error/empty states) wired into the
  Google Contacts page's selected-contact detail panel, plus a
  photo-count badge on each list row. Existing Search/group-filter pills/
  Refresh/Disconnect and the ~400px list panel width were left untouched
  (`LIST_PANEL_CLASS` already satisfied the width requirement).

**Files changed:**
`packages/dba/src/google-contact-photos.ts`,
`packages/dba/src/google-contact-photos.test.ts`,
`packages/dba/src/google-contact-photos-failure-paths.test.ts`,
`packages/dba/src/index.ts`,
`packages/dashboard/app/api/google-contacts/photos/route.ts`,
`packages/dashboard/app/api/google-contacts/photos/counts/route.ts`,
`packages/dashboard/app/api/google-contacts/photos/[id]/route.ts`,
`packages/dashboard/components/shared/photos-section.tsx`,
`packages/dashboard/app/(dashboard)/dashboard/msg-automation/google-contacts/page.tsx`,
`docker-compose.local.yml`, `docker-compose.qnap.test.yml`,
`docker-compose.qnap.prod.yml`,
`docker-compose.server1.test-prod.dashboard.yml`,
`human-docs/dashboard/msg-automation/features/google-contacts-photos.md`.

**Tested:**
- Unit (Vitest, real tmpdir filesystem): `google-contact-photos.test.ts`
  — 25 cases: JPEG/PNG/WebP save, fake-extension/wrong-magic-bytes
  rejection, disallowed-MIME (SVG) rejection, empty payload, size limit,
  invalid `resourceName` format, no-overwrite write primitive, multiple
  photos on one contact (newest first), two different contacts kept
  separate by stable id (not name), cross-user isolation (list/read/
  delete), read-info never leaks a host path, delete removes both file +
  metadata, delete of an unknown id → `NOT_FOUND`, empty list/counts for
  a fresh user. Plus `google-contact-photos-failure-paths.test.ts` (2
  cases, mocked `node:fs/promises`): metadata-write failure cleans up the
  orphan photo file; file-delete failure aborts before metadata delete.
  **PASS locally** (`pnpm exec vitest run` — 27/27 for this file pair).
- `tsc --noEmit` (dba + dashboard): PASS. `eslint` on every changed file:
  PASS.
- Full local regression suite (`pnpm exec vitest run`, whole repo): 434
  passed, 47 skipped, 1 unrelated pre-existing failure (real QNAP
  reconciliation test needing live Postgres/Sheets access not available
  in this environment) and ~20 pre-existing BLOCKED files needing
  `POSTGRES_QNAP_PASSWORD`/`E2E_TEST3_PASSWORD`-gated live QNAP access —
  none touch any file this Story changed; not claimed as PASS, reported
  as blocked/pre-existing per the honesty rule.
- **Real local Docker rebuild + smoke test** (official
  `bash-scripts/dashboard/03_local_mac_docker/02_build.sh` +
  `03_re-start.sh`): confirmed `CHAD_CONTACT_PHOTOS_DIR=/app/contact-photos`
  set in the running container and `/app/contact-photos` correctly bind-
  mounted to the real `/Volumes/cp_1/02_files_refrenced` (showed the real
  pre-existing `10_files_audio` sibling directory, proving it's the real
  volume, not a scratch fallback). Logged in as `pawel_f` via Playwright
  using `.env.local`'s `E2E_LOGIN_PASSWORD`. Opened
  `/dashboard/msg-automation/google-contacts` with a real connected
  Google account: Search/Filters/Refresh/Disconnect all present (no
  regression), selected a real contact, confirmed its "Photos" section
  renders with "No photos yet." and a working "Add photo" button (full
  upload/delete round-trip was exercised on the Lead Details flow instead
  — see Task 3 — since both features share the exact same
  `saveContactPhoto`/`saveLeadPhoto` code paths and GUI component; this
  page's own wiring was spot-checked rather than re-run end-to-end to
  avoid leaving a second test photo in real Google-Contacts-linked data).

**Status: DONE**

# Task 3 — Lead Details photos

**Requested (follow-up, after the user manually checked the real Lead
Details page and found no Photos frame):** Add the same kind of
CHAD-local-photo attachment directly to Lead Details, keyed by the lead's
stable id (not its display name), always visible even with zero photos,
without breaking the existing Contacts/Beeper/Google Contacts/Msg
workouts/Delete lead sections, and without making this exclusively a
Google Contacts feature (a lead can have zero or many linked Google
Contacts — these are two separate attachment points).

**Done:** Diagnosed first, per the request's own instruction not to
rewrite the feature blind: the original spec (Input 1) literally said "the
existing Google Contacts module," which is exactly where Task 2 built it
— it was never rendered on Lead Details because no Lead Details wiring
was ever built, not because of a bug or a misrouted component. New
`packages/dba/src/lead-photos.ts` reuses `google-contact-photos.ts`'s
generic byte/path/username primitives (`detectImageMimeFromBytes`,
`getUserContactPhotosDir`, `buildContactPhotoFileName`,
`assertSafeContactPhotoPath`/`assertSafeUsername`) instead of duplicating
that logic — the only real difference is the stable id, a lead's `loca`
(numeric Content Provider path, e.g. `03/06/81`, validated against that
exact shape) instead of a Google Contact's `resourceName`. Both modules'
photos share the same physical `<username>/01_files_photos/` directory;
each module's own sidecar-metadata required field (`leadLoca` vs
`contactResourceName`) is what tells them apart on a directory scan, so
neither needs to know the other exists. Generalized the GUI: extracted
Task 2's `ContactPhotosSection` into a subject-agnostic
`components/shared/photos-section.tsx` (`basePath`/`subjectParam`/
`subjectValue` props, optional `headingClassName` to match the host
page's own header style) so both Google Contacts and Lead Details reuse
one upload/preview/delete component. New "Photos" card added to
`leads/details/page.tsx`, positioned right after the existing Google
Contacts card, always rendered.

**Files changed:**
`packages/dba/src/lead-photos.ts`, `packages/dba/src/lead-photos.test.ts`,
`packages/dba/src/lead-photos-failure-paths.test.ts`,
`packages/dba/src/index.ts` (export),
`packages/dashboard/app/api/leads/photos/route.ts`,
`packages/dashboard/app/api/leads/photos/[id]/route.ts`,
`packages/dashboard/components/shared/photos-section.tsx` (generalized
from Task 2's contact-specific version; the old
`components/google-contacts/contact-photos-section.tsx` was removed, not
kept alongside),
`packages/dashboard/app/(dashboard)/dashboard/msg-automation/google-contacts/page.tsx`
(switched to the shared component),
`packages/dashboard/app/(dashboard)/dashboard/leads/details/page.tsx`,
`human-docs/dashboard/leads/features/lead-photos.md`.

**Tested:**
- Unit (Vitest, real tmpdir filesystem): `lead-photos.test.ts` — 11 cases
  (loca/id validation incl. traversal, save into the shared
  `<username>/01_files_photos/` tree, fake-MIME rejection, invalid loca
  rejection, two different leads' photos kept separate by loca, multiple
  photos per lead, cross-user isolation, no-leak for an unrelated loca,
  delete removes file+metadata and survives an independent re-list call,
  empty list for a fresh lead). Plus
  `lead-photos-failure-paths.test.ts` (2 cases, mocked fs, same pattern as
  Task 2's): metadata-write-failure cleanup, file-delete-failure
  compensation. **PASS locally** (13/13).
- `tsc --noEmit` (dba + dashboard): PASS. `eslint`: PASS.
- **Real local Docker rebuild + smoke test**, on the *exact* URL the user
  gave (`/dashboard/leads/details?leadName=26-08-01_nn_latina&leadLoca=
  03%2F06%2F97&...`): confirmed the "Photos" card renders right after
  Google Contacts, with "No photos yet." and a working "Add photo"
  button. Uploaded a real, harmless 2×2 PNG generated for this test
  (`chad-smoke-test-photo.png`) via Playwright's file chooser — thumbnail
  appeared with **"Photos (1)"** and no full page reload. Confirmed the
  physical file + sidecar landed on the real volume at
  `/Volumes/cp_1/02_files_refrenced/pawel_f/01_files_photos/
  2026-08-06_13-52-20_<uuid>.png(.json)`, with the sidecar's
  `leadLoca` field correctly reading `"03/06/97"` (the lead's stable id,
  not its name). **Refreshed the page** — photo still there (persistence
  confirmed independent of client state). Clicked the thumbnail → larger
  preview dialog opened → clicked Delete → **"Delete this photo? Yes/No"**
  confirm dialog appeared exactly as specified → clicked Yes → list
  returned to "No photos yet." without a full reload. Confirmed on disk
  (both host path and inside the container) that the file and its `.json`
  sidecar were gone under their real names (two `.smbdeleteXXX` tombstone
  artifacts remained — a known macOS/SMB-network-share delete-rename
  quirk on this Mac's `cp_1` mount, not app-level data; see
  `06_others_from_report.md`). Confirmed the existing Contacts, Beeper,
  Google Contacts, Msg workouts, and Delete lead sections all still
  rendered correctly on the same page (no regression). Removed the local
  test PNG from `.playwright-mcp/` afterward — no test data left under
  `pawel_f`'s real photos.

**Status: DONE**

# Task 4 — Local smoke-test login credentials

**Requested:** Save the login credentials the user provided (for `test2`,
`test3`, `pawel_f`, all `changeme` for this local seed) into the local
dashboard `.env`, use them for Playwright/agent-driven browser smoke
tests without asking again, and document only the **variable names**
(never values) in `ai-docs/`, using the repo's existing login-credential
env-var convention rather than inventing new names.

**Done:** Checked the existing convention before writing anything (per
the request's own "don't guess" instruction) — found
`E2E_LOGIN_PASSWORD` already used by
`tests/1_1_data-protection/e2e/local-login.spec.mjs` as the shared local-
Docker seed password for `pawel_f`/`test2`/`test3`, and the separate,
already-existing `E2E_TEST3_PASSWORD` for logging `test3` into the real
QNAP TEST deployment (`tests/support/database/qnap-env.mjs`). Wrote both
into `.env.local` (already gitignored, already the home of every other
local secret in this repo — `POSTGRES_PASSWORD`, `GOOGLE_CONTACTS_CLIENT_SECRET`,
etc.) rather than inventing per-user variable names. New
`ai-docs/tests/local-smoke-login.md` documents only the variable *names*,
where they live (`.env.local`), and the usage rule (check first, don't
ask again, never print the value) — linked from `ai-docs/tests/ai-start.md`.

**Files changed:** `.env.local` (not committed — gitignored),
`ai-docs/tests/local-smoke-login.md`, `ai-docs/tests/ai-start.md`.

**Tested:** Used immediately, live: logged into
`http://localhost:12020/login` via Playwright as `pawel_f` using
`E2E_LOGIN_PASSWORD` from `.env.local`, without asking the user again —
this is the same login session used for all of Task 2/3's browser smoke
testing above. No password value was ever printed in terminal output,
this report, or any screenshot (screenshots were only taken after
successful navigation, never of the filled-in password field).

**Status: DONE**
