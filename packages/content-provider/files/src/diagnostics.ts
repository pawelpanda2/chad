/**
 * Path diagnostics — for a future /storage/status API endpoint and for
 * manual troubleshooting. Read-only: reports what's there, changes nothing.
 */

import { access } from "node:fs/promises";
import { getStorageRoot, getReposDir } from "./paths.js";
import { listRepoGuids } from "./repos.js";

export interface StorageDiagnostics {
  storageRoot: string;
  reposDir: string;
  reposDirExists: boolean;
  repoCount: number;
}

export async function diagnoseStorage(storageRoot: string = getStorageRoot()): Promise<StorageDiagnostics> {
  const reposDir = getReposDir(storageRoot);
  let reposDirExists = true;
  try {
    await access(reposDir);
  } catch {
    reposDirExists = false;
  }

  const repoCount = reposDirExists ? (await listRepoGuids(storageRoot)).length : 0;

  return { storageRoot, reposDir, reposDirExists, repoCount };
}
