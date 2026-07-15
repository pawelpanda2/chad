/**
 * Strict per-user repo resolution for the dashboard's "Folders" Content
 * Provider browser (documentation/stories/60 — critical fix; supersedes the
 * Story 57 `pawel_f`-is-special exception that let that one login see and
 * fetch ANY repo known to the Content Provider, including other users' and
 * other apps' private repos, via the raw `getAllRepos()` call below).
 *
 * `getAllRepos()` (`packages/dba/src/client.ts`) is intentionally NOT
 * exported further than this module for repo-browsing purposes: callers
 * outside `dba` never see the full CP repo list, only the single repo (if
 * any) that exactly matches the caller's own username. There is no
 * fallback to "first repo", no partial/substring matching, and no
 * distinction by role/username — every user, including `pawel_f`, goes
 * through the same strict check.
 */

import { getAllRepos } from "./client.js";

export class RepoAccessDeniedError extends Error {
  constructor(message: string = "REPO_ACCESS_DENIED") {
    super(message);
    this.name = "RepoAccessDeniedError";
  }
}

export interface RepoInfo {
  id: string;
  name: string;
}

/**
 * Extracts `{id, name}` pairs from `getAllRepos()`'s raw `/invoke` shape
 * (`[{Body, Settings: {id, name, ...}}, ...]`). Pure/no I/O — exported so
 * tests can feed it fixture CP responses directly.
 */
export function extractRepoInfos(raw: unknown): RepoInfo[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry) => (entry as { Settings?: { id?: string; name?: string } })?.Settings)
    .filter((settings): settings is { id: string; name: string } => !!settings?.id && !!settings?.name)
    .map(({ id, name }) => ({ id, name }));
}

/**
 * The strict matching rule itself, pure/no I/O so it can be unit-tested
 * without a real Content Provider: given the full list of repos the
 * Content Provider knows about (which may include other users' repos and
 * other apps' repos entirely), returns the one repo whose name is EXACTLY
 * `chad_<username>` (case-sensitive, full string equality — no
 * `includes`/`startsWith`/prefix matching). Denies (throws
 * `RepoAccessDeniedError`) when:
 *   - `username` is empty/missing,
 *   - no repo's name matches exactly,
 *   - more than one repo's name matches exactly (ambiguous).
 * Never returns the full list, never falls back to another repo.
 */
export function pickOwnRepo(repos: RepoInfo[], username: string | null | undefined): RepoInfo {
  if (!username) {
    throw new RepoAccessDeniedError("NO_USERNAME");
  }

  const expectedName = `chad_${username}`;
  const matches = repos.filter((repo) => repo.name === expectedName);

  if (matches.length !== 1) {
    throw new RepoAccessDeniedError("NO_MATCHING_REPO");
  }

  return matches[0];
}

/**
 * Resolves the single Content Provider repo a given username may access
 * (see `pickOwnRepo` for the matching rule) by fetching the real, current
 * repo list from the Content Provider. Never returns the full repo list to
 * its caller, never falls back to another repo.
 */
export async function resolveOwnRepo(username: string | null | undefined): Promise<RepoInfo> {
  const raw = await getAllRepos();
  return pickOwnRepo(extractRepoInfos(raw), username);
}

/**
 * Resolves the caller's own repo (see `resolveOwnRepo`) and, if the client
 * also supplied a repo id of its own (e.g. a query param), requires it to
 * match exactly. Any mismatch is denied — this is what makes a manually
 * edited request (DevTools, curl) unable to read another repo even though
 * the endpoint still accepts a `repoGuid`/`repoId` parameter for its own
 * (matching) value.
 */
export async function assertOwnRepo(
  username: string | null | undefined,
  requestedRepoId?: string | null
): Promise<RepoInfo> {
  const own = await resolveOwnRepo(username);
  if (requestedRepoId && requestedRepoId !== own.id) {
    throw new RepoAccessDeniedError("FORBIDDEN_REPO");
  }
  return own;
}

/**
 * Pure counterpart of `assertOwnRepo`'s override check, for unit tests that
 * don't want to fetch a real repo list — takes the already-resolved own
 * repo directly.
 */
export function checkRequestedRepo(own: RepoInfo, requestedRepoId?: string | null): RepoInfo {
  if (requestedRepoId && requestedRepoId !== own.id) {
    throw new RepoAccessDeniedError("FORBIDDEN_REPO");
  }
  return own;
}
