# Story 115 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | ZIP Folder import into `chad_shared` no longer fails with "Address ... does not belong to the current repo" |
| 2 | DONE      |             | Any authenticated user (not just admin) can select `chad_shared` in the Folders repo picker and read/write there, including ZIP import |

# Task 1 — Fix the ZIP-import cross-repo bug

**Requested:** User's ZIP import into `chad_shared` failed with `error: Address "31275a71-3dd0-41a2-8874-2d12dac01590" does not belong to the current repo`. Diagnose and fix.

**Done:** Root cause was `packages/dba/src/cp-import.ts` resolving the import's target repo from `getCurrentRepoGuid()` (the session's own repo) instead of the caller's already-authorized target. Added an explicit `targetRepoGuid` field to `ImportCpFolderFromZipInput`, populated by the route from `resolveFoldersRepoAccess`'s result (`access.repoGuid`), and used it everywhere the function previously used `getCurrentRepoGuid()` (`assertRepoAllowlisted`, `entry.GetItem`, `importFolderFromZip`'s `repoGuid`). The session's own identity is still used for the staging directory path and the actor stamped onto history — unrelated concerns, unchanged. Kept the existing defense-in-depth check (`parentAddressToLoca`, still comparing `parentAddress` against the resolved repoGuid) rather than removing it, since a pre-existing test explicitly protects it.

**Files changed:** `packages/dba/src/cp-import.ts`, `packages/dashboard/app/api/folders/import/route.ts`, `packages/dba/src/cp-import.test.ts`.

**Tested:** `tsc --noEmit` clean. `cp-import.test.ts` itself could not be executed in this local environment (pre-existing Postgres-source-resolution gap unrelated to this fix — see `06_others_from_report.md`), but is updated to compile/type-check against the new signature and includes a new regression test for the exact "target repo ≠ session repo" scenario. **Verified live instead**, end to end, via Playwright against the real running app: logged in as `test3`, selected `chad_shared`, imported a real ZIP into its root (the exact address from the user's error) — succeeded, cleaned up afterward.

**Status: DONE**

# Task 2 — Open chad_shared to every user, not just admins

**Requested (user, after seeing the diagnosis):** "to blad architektoniczny do chad_shared powinny moc tez zwykle osoby pisac i importowac rzeczy, a ja jestem adminem to tym bardziej powinienm moc" — regular (non-admin) users should also be able to write to/import into `chad_shared`.

**Done:** `packages/dba/src/shared-repo-access.ts` — `resolveFoldersRepoAccess` and `listSelectableFoldersRepos` no longer gate `chad_shared` on `user.isAdmin`; every authenticated session gets it, same as their own repo. Access to another user's PRIVATE repo, or a forged GUID, is still denied unconditionally — unaffected. Removed the now-unused `isAdmin` field from the local `FoldersSessionLike` interface (was only read by the two removed checks).

**Files changed:** `packages/dba/src/shared-repo-access.ts`, `packages/dba/src/shared-repo-access.test.ts`, `packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx` (comments only).

**Tested:** `vitest run packages/dba/src/shared-repo-access.test.ts` — 7/7 pass, rewritten for the new policy (regular user now gets chad_shared; admin-only case removed; "another user's private repo still denied for everyone" kept). Live Playwright verification: logged in as `test3` (non-admin) — `chad_shared` now appears in the Folders repo dropdown and is selectable, matching the fix.

**Status: DONE**
