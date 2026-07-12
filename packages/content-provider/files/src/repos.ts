/**
 * Repo discovery. Matches .NET's `GuidGroupsHelper.IsUniRepoGroupFolder`
 * (`Path.Combine(searchFolders.First(), "repos")`, then `Guid.TryParse` on
 * each direct child folder name) — repos live ONE level under `repos/`,
 * named by GUID. Verified against real local data
 * (/Users/pawelfluder/Dropbox/repos/<guid>/...) — no extra "group" layer.
 */

import { readdir } from "node:fs/promises";
import { getReposDir, getRepoDir, isValidRepoGuid, getStorageRoot } from "./paths.js";
import { readConfig } from "./config.js";
import { ContentProviderError } from "cp-core";

export interface FileRepoInfo {
  repoGuid: string;
  name: string;
}

export async function listRepoGuids(storageRoot: string = getStorageRoot()): Promise<string[]> {
  const reposDir = getReposDir(storageRoot);
  let entries: string[];
  try {
    entries = await readdir(reposDir);
  } catch (err) {
    throw new ContentProviderError(`repos directory not found or unreadable at "${reposDir}"`, { cause: err });
  }
  return entries.filter(isValidRepoGuid);
}

export async function listRepos(storageRoot: string = getStorageRoot()): Promise<FileRepoInfo[]> {
  const guids = await listRepoGuids(storageRoot);
  const repos: FileRepoInfo[] = [];
  for (const repoGuid of guids) {
    try {
      const config = await readConfig(getRepoDir(repoGuid, storageRoot));
      repos.push({ repoGuid, name: config.name });
    } catch {
      // A repo folder that exists but has no valid config.yaml is skipped,
      // not fatal to the whole listing — matches read-only, non-destructive
      // Stage 2 scope (no repair, no crash on one bad repo).
      continue;
    }
  }
  return repos;
}
