/**
 * Lists an item's numeric child folders. Matches .NET's ConfigWorker.cs
 * listing regex (`^\d{2,3}$`) — see paths.ts's isChildFolderName.
 */

import { readdir } from "node:fs/promises";
import path from "node:path";
import { isChildFolderName } from "./paths.js";
import { readConfig } from "./config.js";

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

/**
 * Folder-type items' `Body` in the real .NET API is a map of
 * `{ childFolderIndex: childLogicalName }` (confirmed 2026-07-12 against
 * the live, real API at localhost:12024 — e.g. GetItem on a "leads"
 * folder returns `Body: { "06": "all items", "07": "all missing", ... }`,
 * matching documentation/dba/resolve-paths.md's `leadsNameMap` example).
 * Children whose config.yaml can't be read are silently skipped, not
 * fatal — matches cp-files' general "don't crash a whole listing over one
 * bad item" stance.
 */
export async function buildChildNameMap(itemDir: string): Promise<Record<string, string>> {
  const childNames = await listChildNames(itemDir);
  const map: Record<string, string> = {};
  for (const childName of childNames) {
    const config = await readConfig(path.join(itemDir, childName)).catch(() => undefined);
    if (config) {
      map[childName] = config.name;
    }
  }
  return map;
}
