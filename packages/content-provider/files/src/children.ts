/**
 * Lists an item's numeric child folders. Matches .NET's ConfigWorker.cs
 * listing regex (`^\d{2,3}$`) — see paths.ts's isChildFolderName.
 */

import { readdir } from "node:fs/promises";
import path from "node:path";
import { isChildFolderName, isValidNumericSegment, formatIndex, ContentProviderPathError } from "./paths.js";

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
 * Matches .NET's `ValidationWorker.ValidateParentBeforeCreateChild`
 * (`Workers/Validation/ValidationWorker.cs:66-103`, confirmed via the
 * 2026-07-12 source audit): every direct subfolder of `itemDir` (except
 * dotfiles, e.g. `.git`) must be numeric — a non-numeric one means repo
 * corruption or a manually-created logical-name folder, and creating a
 * new child on top of that is refused rather than silently proceeding.
 */
export async function validateAllChildrenNumeric(itemDir: string): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(itemDir, { withFileTypes: true });
  } catch {
    return; // Directory doesn't exist yet — nothing to validate, matches .NET (no children to check).
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue; // config.yaml/body.txt are files, not children — only subfolders count.
    if (entry.name.startsWith(".")) continue;
    if (!isValidNumericSegment(entry.name)) {
      throw new ContentProviderPathError(
        `Repository structure violation: non-numeric child folder "${entry.name}" under "${itemDir}" — indicates repo corruption or a manually-created logical-name folder.`
      );
    }
  }
}

/**
 * Next free numeric child index — `max(existing) + 1`, or `0` if none —
 * formatted via `formatIndex` (matches .NET's `ReadFolderWorker.GetNextAdrTuple`/
 * `GetFolderLastNumber` + `IndexOperations.IndexToString`).
 */
export async function getNextChildIndex(itemDir: string): Promise<string> {
  const names = await listChildNames(itemDir);
  const max = names.reduce((acc, name) => Math.max(acc, Number(name)), -1);
  return formatIndex(max + 1);
}
