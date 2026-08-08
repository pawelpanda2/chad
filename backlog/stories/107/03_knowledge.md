# Story 106 — Knowledge

Pointers to documentation/code that were actually needed for this Story,
and why — not a description of what was built (that's
`05_tasks_and_checklist.md`).

- `ai-docs/begin_here/01_ai_start.md`, `02_what-and-where.md`,
  `05_endpoint-rules.md` — read first per every Story's own rule; confirmed
  the dba-only Content Provider access rule, thin-route convention, and
  that this repo's docs entry point is `ai-docs/begin_here/` (not
  `start_here/`/README/CLAUDE.md, as Input 1 warned not to assume).
- `packages/dba/src/audio-recordings.ts` +
  `human-docs/dashboard/forms/features/add-recording.md` +
  `human-docs/dashboard/views/features/recordings.md` — the only existing
  "referenced files on `cp_1`" precedent in this repo (files + sidecar
  JSON metadata, no Content Provider, magic-byte-free but MIME-allowlisted,
  server-generated collision-resistant filenames, `wx`-flag no-overwrite,
  path-traversal guards via `assertSafeResolvedPath`). Explicitly the
  reference pattern Input 1 §1.9 pointed at — reused the shape, not copied
  verbatim (audio's isolation is flat-directory + sidecar `repoGuid`
  filter; this feature's spec required an actual per-username subdirectory
  tree instead).
- `docker-compose.local.yml` (dashboard service env/volumes),
  `docker-compose.qnap.test.yml`, `docker-compose.qnap.prod.yml`,
  `docker-compose.server1.test-prod.dashboard.yml` — exact existing bind-
  mount pattern for `CHAD_AUDIO_RECORDINGS_HOST_PATH` /
  `CHAD_AUDIO_RECORDINGS_DIR`, replicated for the new
  `CHAD_CONTACT_PHOTOS_HOST_PATH` / `CHAD_CONTACT_PHOTOS_DIR` pair — but
  mounted at the `02_files_refrenced` **parent** dir instead of a single
  subfolder, since the per-user tree needs access to sibling
  `<username>/` directories the audio mount can't see.
- `ls /Volumes/cp_1/02_files_refrenced/` (real host filesystem, not
  assumed) — confirmed `10_files_audio` is the only existing subtree, no
  `pawel_f/` yet; confirmed the exact spelling `refrenced` is real, not a
  typo to "fix" (also independently confirmed by `audio-recordings.ts`'s
  own doc comment making the same point).
- `packages/dba/src/repo-context.ts` — `getCurrentUsername()` (not just
  `getCurrentRepoGuid()`) already exists and is exactly the session-derived
  value needed for the per-user folder name; no new session plumbing
  needed.
- `ai-docs/google-contacts/ai-start.md`,
  `packages/dashboard/app/(dashboard)/dashboard/msg-automation/google-contacts/page.tsx`
  — existing read-only People API GUI/routes this feature attaches to,
  confirmed `LIST_PANEL_CLASS = "w-full max-w-[400px]"` already satisfies
  Input 1 §1.4's ~400px panel-width requirement (no layout change needed
  there).
- `packages/dashboard/app/(dashboard)/dashboard/leads/details/page.tsx` —
  `LeadDetailsData.loca` (already used by the page's own Links V2
  Beeper/Google-Contacts cards) is the stable per-lead id; confirmed via
  `leads.ts`'s own doc comments that `loca` is a slash-separated numeric
  Content Provider path (`03/06/81`), never a display name.
- `human-docs/dashboard/msg-automation/features/links-v2.md`,
  `packages/dashboard/app/(dashboard)/dashboard/msg-automation/links-v2/page.tsx`
  — Leads/Conv tab layout; `components/beeper/beeper-group-filter.tsx` +
  `GET /api/beeper-crm/groups/default` (Story 101) already exist and were
  reused as-is for the new combobox rather than rebuilt.
- `tests/1_1_data-protection/e2e/local-login.spec.mjs`,
  `tests/support/database/qnap-env.mjs`, `ai-docs/tests/ai-start.md` —
  found the **existing** `E2E_LOGIN_PASSWORD` (local Docker seed password,
  shared by `pawel_f`/`test2`/`test3`) and `E2E_TEST3_PASSWORD` (real QNAP
  TEST HTTP login) conventions before writing any new env var names, per
  Input 4 §1.4's explicit "don't guess" instruction.
- `ai-docs/begin_here/03_story-standard.md` — this Story folder itself was
  created retroactively, after most of the implementation work; noted
  plainly here per that file's own "backfill honestly" rule.
