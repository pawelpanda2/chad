/**
 * Persists the last CP Item address a user visited in Folders, so
 * `/dashboard/folders` (no slug) can restore it on a fresh visit — Story
 * 120, §1.5/1.11. Scoped by BOTH `username` and `repoGuid`, not just
 * `repoGuid`: the shared `chad_shared` repo has the same `repoGuid` for
 * every user, so `repoGuid` alone would mix different users' last
 * addresses on a shared browser profile.
 *
 * Never a source of authorization — every address read back from here is
 * only a hint for what to *try*; the normal `/api/folders` session/repo
 * access check still runs on every fetch (`resolveFoldersRepoAccess`), so
 * a forged/stale localStorage entry can only ever fail closed, never leak
 * access.
 */

import { readLocalStorage, removeLocalStorage, writeLocalStorage } from "@/lib/local-storage-safe";

function storageKey(username: string, repoGuid: string): string {
  return `chad:folders:lastAddress:${username}:${repoGuid}`;
}

export function getLastCpAddress(username: string, repoGuid: string): string | null {
  if (!username || !repoGuid) return null;
  return readLocalStorage(storageKey(username, repoGuid));
}

export function setLastCpAddress(username: string, repoGuid: string, address: string): void {
  if (!username || !repoGuid || !address) return;
  writeLocalStorage(storageKey(username, repoGuid), address);
}

export function clearLastCpAddress(username: string, repoGuid: string): void {
  if (!username || !repoGuid) return;
  removeLocalStorage(storageKey(username, repoGuid));
}
