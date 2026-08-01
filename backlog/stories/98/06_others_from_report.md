# Story 98 — Others

## Architectural decisions

- No synthetic Next.js `route.ts` unit test was written for
  `GET /api/folders/export`. This repo has no prior precedent for testing
  a route handler in isolation (no `vi.mock('dba')`/mocked-session pattern
  anywhere), and Story 95's own sibling route
  (`PUT /api/folders/config`) was verified the same way this Story used:
  real curl smoke tests against the running local Docker stack, documented
  in the checklist. Followed that existing convention rather than
  introducing a new one.
- `EXPORT_LIMIT_EXCEEDED` is checked incrementally (after fetching direct
  children, then again after each Folder's grandchildren in `body-l2`)
  rather than only once at the end — an oversized `body-l2` root is
  rejected before wastefully fetching every child Folder's own children.
- Copy is intentionally absent (not disabled-with-tooltip) for Text items
  — the input prompt allowed either; hiding was simpler and there's no
  existing disabled+tooltip convention specifically for "this control only
  makes sense for one item type" elsewhere in Folders to mirror.

## Problems encountered (both pre-existing, unrelated to this Story's code)

- **Local Docker rebuild blocked by a missing external drive.**
  `docker-compose.local.yml`'s audio-recordings bind mount (Story 93)
  defaults to `/Volumes/cp_1/02_files_refrenced/10_files_audio`, which
  doesn't exist on this Mac (`/Volumes` only has the boot volume mounted
  right now) — Docker Desktop can't auto-create a directory directly under
  `/Volumes`, so the dashboard container refused to start after the
  restart. Worked around with a **local-only, never-committed**
  `.env.local` addition:
  `CHAD_AUDIO_RECORDINGS_HOST_PATH=/Users/pawelfluder/.chad-local-audio-recordings-scratch`
  (a new empty scratch directory), just so the stack could come up for
  this Story's smoke test. **Follow-up for the user:** either mount the
  real `cp_1` drive and remove that `.env.local` line again, or keep the
  scratch override if `cp_1` isn't actually available on this machine
  going forward — this Story's own audio-recordings data isn't affected
  either way (nothing here reads/writes it), but real recordings saved
  during this session (there weren't any) would have gone to the scratch
  path instead of the real drive.
- `03_re-start.sh`'s QNAP-Postgres-sync step logged its own pre-existing,
  unrelated failures during this restart (`Cannot find package 'pg'` in an
  ad-hoc eval, then `ECONNREFUSED` reaching QNAP's Postgres sync port) —
  already flagged as a known, unrelated issue in Story 95's own
  `06_others_from_report.md`; nothing in this Story touches that script,
  and the stack still came up healthy immediately after.
- Local session cookies in this Docker environment are unsigned
  (`SESSION_SIGNING_SECRET` not configured) — used to log in as `test3`
  for the smoke test (see `03_knowledge.md`) since `test3`'s real password
  isn't available to this session and is never committed. This is a
  pre-existing property of the local environment, not something this
  Story changed.

## Follow-up proposals (not implemented this Story)

- Configuring `SESSION_SIGNING_SECRET` for the local Docker environment
  (it's already wired for QNAP TEST/PROD per the session-token module's
  own doc comment) would close the "unsigned session" gap noted above —
  out of scope here, unrelated to Folders.
