/**
 * Filesystem-only Content Provider reader.
 *
 * Reads `config.yaml`/`body.txt` straight off the same repo directory tree
 * Content Provider itself owns (`Workers/System/PathWorker.cs` — audited in
 * Story 72 `03_knowledge.md`: `contentFileName = "body.txt"`,
 * `configFileName = "config.yaml"`, path = `repoPath + "/" + loca`),
 * without ever going through CP's `/invoke` HTTP wire protocol.
 *
 * Added because the original `/invoke`-based traversal (`NetFileCpProvider`
 * + `getFolderChildren`, one round trip per item) is slow on a Dropbox/SMB
 * network mount — thousands of requests for a large repo, each paying HTTP +
 * reflection-dispatch + JSON-serialization overhead on top of the same
 * underlying disk read this module does directly. CP itself is left
 * completely untouched by this module: it remains the legacy read/write
 * application for normal request traffic, just no longer the migrator's own
 * read path.
 *
 * Deliberately produces the exact same `CpItem` shape
 * `NetFileCpProvider.getItem` does, so callers (the migrator)
 * don't need to know or care which reader is behind the `getItem`-shaped
 * function they were given — same validators (`validateCpItem`), same
 * `PutItemCommand` building, same Mongo import logic.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { parseChildIndex, type CpItem, type CpItemConfig } from "../cp-model.js";

const CONFIG_FILE = "config.yaml";
const BODY_FILE = "body.txt";
const CHILD_DIR_PATTERN = /^\d{2,3}$/;

/**
 * The two host search roots CP itself scans (Story 68's second repo share),
 * read from the exact same env vars the container's own bind mounts use
 * (`docker-compose.local.yml`: `CP_REPOS_HOST_PATH`/`CP_REPOS_HOST_PATH_2`)
 * — this module runs on the host (via `tsx`), so it needs the same host
 * paths, not the container-internal `/data/repos`/`/data/repos2`. Each root
 * is the PARENT of a `repos/` folder, matching CP's own mount contract (see
 * the comment above that compose entry).
 */
export function getCpFsSearchRootsFromEnv(): string[] {
  return [process.env.CP_REPOS_HOST_PATH, process.env.CP_REPOS_HOST_PATH_2].filter(
    (p): p is string => !!p && p.length > 0
  );
}

/**
 * Finds which configured search root physically contains `repoGuid`,
 * mirroring CP's own multi-root search (first match wins — a repo is
 * expected to live under exactly one of the configured roots).
 */
export async function resolveRepoRoot(repoGuid: string, searchRoots: string[]): Promise<string> {
  for (const root of searchRoots) {
    const candidate = path.join(root, "repos", repoGuid);
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) return candidate;
    } catch {
      // not under this root, try the next one
    }
  }
  throw new Error(
    `Repo "${repoGuid}" not found under any configured CP filesystem search root ` +
      `(${searchRoots.length ? searchRoots.join(", ") : "none configured"}). ` +
      `Check CP_REPOS_HOST_PATH/CP_REPOS_HOST_PATH_2.`
  );
}

/**
 * Reads one item directly from disk. Returns `null` if there is simply no
 * `config.yaml` at this path (nothing to migrate here — same "not found"
 * meaning as `NetFileCpProvider.getItem` returning `null` for a
 * nonexistent item); throws on a genuinely corrupt/unreadable item so the
 * caller can count it as a real failure instead of silently skipping it.
 */
export async function readCpItemFromDisk(dirPath: string, address: string): Promise<CpItem | null> {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(dirPath, CONFIG_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }

  const parsed = yaml.load(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`"${address}": ${CONFIG_FILE} did not parse to an object`);
  }
  const config = parsed as CpItemConfig;

  // Folders have no body file at all (their "Body" over the wire is the
  // computed children map, not a string — see `03_knowledge.md`); only Text
  // items have `body.txt`. Missing body.txt on a non-Folder is treated the
  // same way the legacy adapter treats a non-string wire `Body`: "" .
  let body = "";
  if (config.type !== "Folder") {
    try {
      body = await fs.readFile(path.join(dirPath, BODY_FILE), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  return { _id: String(config.id), config, body };
}

/**
 * Lists a Folder's direct children as physical subdirectory names, sorted
 * in CP's own numeric index order (not lexicographic — "100" must sort
 * after "99", not before it). Non-numeric entries (`.DS_Store`, stray
 * files, `config.yaml`/`body.txt` themselves) are ignored, matching
 * `ReadFolderWorker`'s own "ignore non-index siblings" behavior
 * (`cp-model.ts`'s `nextChildIndexFromSiblings` doc comment).
 */
export async function listChildLocaSegments(dirPath: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((e) => e.isDirectory() && CHILD_DIR_PATTERN.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => parseChildIndex(a) - parseChildIndex(b));
}

/**
 * `getItem`-shaped function bound to one resolved repo root — same
 * signature `NetFileCpProvider.getItem` exposes, so it's a
 * drop-in replacement wherever a `(input: { address }) => Promise<CpItem
 * | null>` is expected (the migrator's `MigrateRepoDeps.getItem`).
 */
export function makeFsGetItem(
  repoGuid: string,
  repoRoot: string
): (input: { address: string }) => Promise<CpItem | null> {
  return async ({ address }) => {
    const { loca } = repoAddressToLoca(repoGuid, address);
    const dirPath = loca ? path.join(repoRoot, ...loca.split("/")) : repoRoot;
    return readCpItemFromDisk(dirPath, address);
  };
}

/**
 * `getFolderChildren`-shaped function bound to one resolved repo root —
 * same `(repo, loca) => Promise<{ index, name }[]>` signature the migrator
 * already depends on (`MigrateRepoDeps.getFolderChildren`). `name` is left
 * `""`: nothing in the migrator reads it (only `child.index` drives
 * traversal) and the real name is read anyway on the very next recursive
 * `getItem` call — fetching it here too would just be a second read.
 */
export function makeFsGetFolderChildren(
  repoRoot: string
): (repo: string, loca: string) => Promise<{ index: string; name: string }[]> {
  return async (_repo: string, loca: string) => {
    const dirPath = loca ? path.join(repoRoot, ...loca.split("/")) : repoRoot;
    const segments = await listChildLocaSegments(dirPath);
    return segments.map((index) => ({ index, name: "" }));
  };
}

function repoAddressToLoca(repoGuid: string, address: string): { loca: string } {
  const prefix = `${repoGuid}/`;
  if (address === repoGuid) return { loca: "" };
  if (!address.startsWith(prefix)) {
    throw new Error(`Address "${address}" does not belong to repo "${repoGuid}"`);
  }
  return { loca: address.slice(prefix.length) };
}

/** Convenience match against `repoAndLocaToAddress`, kept for symmetry/tests. */
export function locaFromAddress(repoGuid: string, address: string): string {
  return repoAddressToLoca(repoGuid, address).loca;
}
