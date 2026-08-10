# Story 115 — Plan

**Note:** this Story folder was created retroactively, after the diagnosis
and after the user had already confirmed scope via a clarifying question —
not before starting investigation, as the standard prefers. Backfilled here
per `ai-docs/begin_here/03_story-standard.md`'s "if you notice mid-task"
rule, as soon as it was noticed. Continuing from Story 114's session
(same conversation), unrelated feature area — new Story rather than folded
into 114.

## Baseline

- HEAD before this Story's own commit: `f4c7faca47518f384c0008431c6ee9f23fc08a1a`
  (Story 114's follow-up commit). Same pre-existing concurrent-session WIP
  noted in Story 114 was still present and untouched; this Story's commit
  stages only its own files, same discipline as 114.

## Root cause (confirmed by reading code, not guessed)

- `packages/dba/src/cp-import.ts`'s `importCpFolderFromZip` computed the
  import's target repo via `getCurrentRepoGuid()` (the session's OWN repo,
  from the login token) instead of the repo the caller had already been
  authorized to write into (`resolveFoldersRepoAccess`'s result, which the
  Folders repo-picker lets a session select as something other than its
  own — `chad_shared`). Every cross-repo import therefore failed with
  `PARENT_NOT_FOUND` / "Address ... does not belong to the current repo",
  regardless of whether the write was otherwise authorized.
- Every other Folders write path (`folders.ts`) never calls
  `getCurrentRepoGuid()` at all — it builds/uses the full address directly
  — which is why only ZIP import hit this and plain create/update/delete
  into `chad_shared` already worked.
- `chad_shared` write access was additionally admin-only
  (`resolveFoldersRepoAccess`/`listSelectableFoldersRepos` in
  `shared-repo-access.ts`) — the user, after the diagnosis, explicitly
  asked to open this to every authenticated user, not just admins.

## Design decision — don't weaken existing defense-in-depth

`cp-import.test.ts` already had a "cross-user isolation" test asserting
that `importCpFolderFromZip` rejects a `parentAddress` that doesn't match
the resolved repo — a deliberate second check, independent of the route's
own authorization. Blindly trusting `input.parentAddress` (deriving
`repoGuid` purely from its own prefix) would have silently deleted that
protection. Fix instead: add an explicit `targetRepoGuid` input field
(the route's already-authorized `access.repoGuid`), used for
repo-resolution instead of `getCurrentRepoGuid()`; the session's own
`repoGuid`/`username` keep meaning "the acting user's own identity" for
staging paths and history/audit stamping, unchanged. The isolation check
still runs, now correctly comparing against the caller-declared authorized
target instead of the session's own (frequently different) repo.

## Implementation

1. `packages/dba/src/shared-repo-access.ts` — `resolveFoldersRepoAccess`/
   `listSelectableFoldersRepos`: drop the `user.isAdmin` gate for
   `chad_shared`; every session gets it. Removed `isAdmin` from
   `FoldersSessionLike` (no longer used by this file).
2. `packages/dba/src/cp-import.ts` — `ImportCpFolderFromZipInput` gains
   `targetRepoGuid: string`; `importCpFolderFromZip` uses it instead of
   `getCurrentRepoGuid()` for `assertRepoAllowlisted`, `entry.GetItem`,
   and `importFolderFromZip`'s `repoGuid`.
3. `packages/dashboard/app/api/folders/import/route.ts` — passes
   `targetRepoGuid: access.repoGuid` (the value it already computes via
   `resolveFoldersRepoAccess`) through to `importCpFolderFromZip`.
4. Tests: `shared-repo-access.test.ts` rewritten for the new policy;
   `cp-import.test.ts`'s isolation test reworked around the new field +
   a new regression test proving an authorized cross-repo import (session
   repo ≠ target repo) now succeeds — the exact scenario that used to fail.
5. Docs: `human-docs/dashboard/knowledge/features/knowledge-cp-items.md`
   ("Folders — wybór chad_shared" section) + a few `folders/page.tsx`
   comments updated for the new "every user" policy.

## Verification

- `tsc --noEmit` (dashboard + dba) clean.
- `vitest run packages/dashboard packages/dba/src/shared-repo-access.test.ts
  packages/dba/src/folders.test.ts packages/dba/src/knowledge.test.ts` —
  all pass (235 tests).
- `cp-import.test.ts` (real-Postgres) could NOT be run in this local
  environment — `getEffectivePostgresUri()` always resolves to the real
  QNAP server by default here (`dev-db-override.ts`), ignoring the test's
  own `localhost:5433` override, so it can't reach the local throwaway DB
  it expects; this is a pre-existing test-infra gap (same underlying
  mechanism `leads-postgres.test.ts` also depends on), not something this
  Story introduced, and it isn't part of the project's own
  `test:integration:local-postgres` script either. Disclosed, not silently
  skipped — see `06_others_from_report.md`.
- Local Docker rebuilt (`--no-cache`, same reason as Story 114) + restarted.
- **Live end-to-end reproduction of the user's exact bug**, via Playwright,
  logged in as `test3` (a non-admin account): selected `chad_shared` in the
  Folders repo dropdown (now listed for a non-admin — confirms the policy
  change), navigated to its root (address
  `31275a71-3dd0-41a2-8874-2d12dac01590`, the exact address from the user's
  error), imported a minimal real ZIP — succeeded, new Folder appeared as
  child `03`. Cleaned up the test folder afterward (real shared repo, not
  a throwaway).
