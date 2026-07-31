/**
 * Folders-tab repo selection guard (Story 96) — the ONE place that decides
 * which repos a session may browse/edit through the generic Folders
 * browser, now that `chad_shared` exists alongside each user's own repo.
 *
 * Rules (deliberately the smallest possible extension of the Story 60
 * "own repo only" model — no new role system):
 *   - every user may access exactly their own session repo (unchanged);
 *   - an admin session (`role: admin` in the chad_admin users-list — the
 *     same existing guard that already gates `allowSystemFolderWrite`)
 *     may ADDITIONALLY select the shared `chad_shared` repo, for both
 *     reading and editing it in Folders;
 *   - everything else — another user's repo, an arbitrary/forged GUID —
 *     is denied regardless of what the client sends. The allowed list is
 *     derived from the server-side session, never from the request.
 *
 * Non-admin users still see shared knowledge content read-only through the
 * dedicated `/api/knowledge` routes (`knowledge.ts`), which never accept a
 * repo id at all — this guard is only about the Folders editor.
 */

import { CHAD_SHARED_REPO_GUID, CHAD_SHARED_REPO_NAME } from "./knowledge.js";

export interface FoldersSessionLike {
  repoGuid: string;
  username: string;
  isAdmin: boolean;
}

export interface SelectableRepo {
  id: string;
  name: string;
}

export type FoldersRepoAccess =
  | { allowed: true; repoGuid: string; isSharedRepo: boolean }
  | { allowed: false; reason: "FORBIDDEN_REPO" };

/**
 * Resolves the repo an incoming Folders request may actually use.
 * `requestedRepoGuid` is the client's optional selection — empty/absent
 * always means the session's own repo (backward compatible with every
 * pre-Story-96 request shape).
 */
export function resolveFoldersRepoAccess(
  user: FoldersSessionLike,
  requestedRepoGuid?: string | null
): FoldersRepoAccess {
  if (!requestedRepoGuid || requestedRepoGuid === user.repoGuid) {
    return { allowed: true, repoGuid: user.repoGuid, isSharedRepo: false };
  }
  if (requestedRepoGuid === CHAD_SHARED_REPO_GUID && user.isAdmin) {
    return { allowed: true, repoGuid: CHAD_SHARED_REPO_GUID, isSharedRepo: true };
  }
  return { allowed: false, reason: "FORBIDDEN_REPO" };
}

/** The repo dropdown's server-derived contents — own repo always, chad_shared appended for admins only. */
export function listSelectableFoldersRepos(user: FoldersSessionLike): SelectableRepo[] {
  const repos: SelectableRepo[] = [{ id: user.repoGuid, name: `chad_${user.username}` }];
  if (user.isAdmin) {
    repos.push({ id: CHAD_SHARED_REPO_GUID, name: CHAD_SHARED_REPO_NAME });
  }
  return repos;
}
