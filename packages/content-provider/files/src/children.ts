/**
 * Lists an item's numeric child folders. Matches .NET's ConfigWorker.cs
 * listing regex (`^\d{2,3}$`) — see paths.ts's isChildFolderName.
 */

import { readdir } from "node:fs/promises";
import path from "node:path";
import { isChildFolderName } from "./paths.js";

/** Numerically sorted (not lexicographic — "2" must sort before "10"). */
export async function listChildNames(itemDir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(itemDir);
  } catch {
    return [];
  }

  return entries
    .filter(isChildFolderName)
    .sort((a, b) => Number(a) - Number(b));
}

export async function listChildDirs(itemDir: string): Promise<string[]> {
  const names = await listChildNames(itemDir);
  return names.map((name) => path.join(itemDir, name));
}
