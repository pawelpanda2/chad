/**
 * Folders-tab repo selection guard (Story 96; opened to every user in a
 * later follow-up) — the ONE place that decides which repos a session may
 * browse/edit through the generic Folders browser, now that `chad_shared`
 * exists alongside each user's own repo.
 *
 * Rules (deliberately the smallest possible extension of the Story 60
 * "own repo only" model — no new role system):
 *   - every user may access exactly their own session repo (unchanged);
 *   - every user may ADDITIONALLY select the shared `chad_shared` repo,
 *     for both reading and editing it in Folders — originally an
 *     admin-only exception (Story 96), opened to all authenticated users
 *     since `chad_shared` is meant as genuinely shared/collaborative
 *     content, not admin-owned data;
 *   - everything else — another user's PRIVATE repo, an arbitrary/forged
 *     GUID — is denied regardless of what the client sends. The allowed
 *     list is derived from the server-side session, never from the
 *     request.
 */

import { CHAD_SHARED_REPO_GUID, CHAD_SHARED_REPO_NAME } from "./knowledge.js";

export interface FoldersSessionLike {
  repoGuid: string;
  username: string;
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
  if (requestedRepoGuid === CHAD_SHARED_REPO_GUID) {
    return { allowed: true, repoGuid: CHAD_SHARED_REPO_GUID, isSharedRepo: true };
  }
  return { allowed: false, reason: "FORBIDDEN_REPO" };
}

/** The repo dropdown's server-derived contents — own repo plus chad_shared, for every user. */
export function listSelectableFoldersRepos(user: FoldersSessionLike): SelectableRepo[] {
  return [
    { id: user.repoGuid, name: `chad_${user.username}` },
    { id: CHAD_SHARED_REPO_GUID, name: CHAD_SHARED_REPO_NAME },
  ];
}
