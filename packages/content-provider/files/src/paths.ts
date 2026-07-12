/**
 * Root resolution + physical addressing for the filesystem storage backend.
 *
 * Physical layout (verified 2026-07-12 against real local data at
 * /Users/pawelfluder/Dropbox/repos — 12630 config.yaml files inspected):
 *
 *   <storageRoot>/repos/<repo-guid>/<numeric>/<numeric>/.../config.yaml
 *
 * - repo-guid: a real UUID (8-4-4-4-12 hex) OR a legacy 32-hex-chars form
 *   with no dashes (both seen on disk, e.g. some Dropbox folder pairs).
 * - children are STRICTLY numeric folder names ("01", "02", ..., "10",
 *   "003" — width varies, always digits only). Never logical names
 *   ("leads", "reports", etc.) — see documentation/content-provider/content-provider.md.
 * - `loca` (the address parameter GetItem/GetByNames/etc. take) is those
 *   numeric segments SLASH-joined, e.g. "01/02/003/02" — confirmed by
 *   documentation/dba/resolve-paths.md (the real, already-working contract
 *   used by cp-net-adapter/dba) and by .NET's own
 *   `ValidationWorker.ValidateItemLocaBeforePut`, which does
 *   `adrTuple.Loca.Split('/')`. NOT the dash-joined form
 *   ("01-02-003-02") — that convention belongs only to
 *   packages/cp-plugin's own separate local HTTP URL scheme (see its
 *   ADDRESS_FORMATS.md), which is unrelated to the ContentProviderStorage
 *   `loca` parameter. Do not conflate the two.
 *
 * `storageRoot` is the PARENT of "repos" (matches the .NET convention —
 * PreparerModule__NoSqlRepoSearchPaths__0 / QNAP_REPOS_HOST_PATH, see
 * packages/net-content-provider/.env.qnap-test.example), NOT
 * packages/cp-plugin's PLUGIN_ROOT convention, which points at "repos"
 * itself. Two different, already-existing conventions in this codebase —
 * intentionally following the .NET one here since cp-files' whole point is
 * behavioral parity with the .NET backend, not with cp-plugin.
 *
 * Deliberately NOT hardcoding /Volumes/cp_1, /share/cp_1, or any other path
 * (see the migration prompt's explicit ban on those legacy mounts).
 */

import path from "node:path";

/**
 * Matches .NET's `ValidationWorker`/`IndexOperations.TryStringToIndex`
 * semantics for "is this a valid loca segment": digits only, length <= 3
 * (TryStringToIndex is actually `int.TryParse` + length<=3, which would
 * technically also accept a leading "-", but real segments are always
 * plain digits per the write path (`IndexOperations.IndexToString`) and
 * every address example in the codebase — so digits-only is the faithful,
 * safe restriction here, not a looser reimplementation).
 */
const NUMERIC_SEGMENT = /^\d{1,3}$/;
/**
 * Matches .NET's `ConfigWorker.cs` child-folder-listing regex
 * (`^\d{2,3}$`) exactly — used when enumerating which subfolders look like
 * item folders worth reading config.yaml from. Real folders are always
 * 2-3 digit zero-padded (`IndexOperations.IndexToString` never emits a
 * single digit), so this is stricter than NUMERIC_SEGMENT on purpose.
 */
const CHILD_FOLDER_NAME = /^\d{2,3}$/;
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const HEX32_PATTERN = /^[0-9a-fA-F]{32}$/;

export class ContentProviderPathError extends Error {}

export function isValidRepoGuid(repoGuid: string): boolean {
  return UUID_PATTERN.test(repoGuid) || HEX32_PATTERN.test(repoGuid);
}

/** For validating an incoming loca's segments (e.g. before building a path). */
export function isValidNumericSegment(segment: string): boolean {
  return NUMERIC_SEGMENT.test(segment);
}

/** For deciding whether a directory entry is an item's child folder (vs. .git, .DS_Store, etc.). */
export function isChildFolderName(name: string): boolean {
  return CHILD_FOLDER_NAME.test(name);
}

/** Splits a slash-joined `loca` into numeric segments; `""`/undefined -> []. */
export function locaToSegments(loca: string | undefined | null): string[] {
  if (!loca) return [];
  return loca.split("/");
}

export function segmentsToLoca(segments: string[]): string {
  return segments.join("/");
}

export function validateSegments(segments: string[]): void {
  for (const segment of segments) {
    if (!isValidNumericSegment(segment)) {
      throw new ContentProviderPathError(
        `Invalid child folder name "${segment}" — Content Provider children must be strictly numeric (e.g. "01", "02"), never logical names.`
      );
    }
  }
}

/**
 * Reads the storage root from the environment. Must be the PARENT of
 * "repos" (e.g. locally: /Users/pawelfluder/Dropbox). No default — an
 * unset root is a configuration error, not something to silently guess at.
 */
export function getStorageRoot(): string {
  const root = process.env.CP_FILES_STORAGE_ROOT;
  if (!root) {
    throw new ContentProviderPathError(
      "CP_FILES_STORAGE_ROOT environment variable is not set. It must point at the PARENT of the \"repos\" folder (e.g. /Users/pawelfluder/Dropbox locally)."
    );
  }
  return root;
}

export function getReposDir(storageRoot: string = getStorageRoot()): string {
  return path.join(storageRoot, "repos");
}

export function getRepoDir(repoGuid: string, storageRoot: string = getStorageRoot()): string {
  if (!isValidRepoGuid(repoGuid)) {
    throw new ContentProviderPathError(`Invalid repo GUID: "${repoGuid}"`);
  }
  return path.join(getReposDir(storageRoot), repoGuid);
}

/**
 * Resolves the physical directory for an item, validating every numeric
 * segment along the way and guarding against path traversal (defense in
 * depth — segments are already validated as numeric-only, which rules out
 * "..", but the containment check stays as an explicit invariant).
 */
export function getItemDir(repoGuid: string, loca: string | undefined | null, storageRoot: string = getStorageRoot()): string {
  const repoDir = getRepoDir(repoGuid, storageRoot);
  const segments = locaToSegments(loca);
  validateSegments(segments);

  const itemDir = path.join(repoDir, ...segments);
  const normalizedRepoDir = path.normalize(repoDir);
  const normalizedItemDir = path.normalize(itemDir);
  if (normalizedItemDir !== normalizedRepoDir && !normalizedItemDir.startsWith(normalizedRepoDir + path.sep)) {
    throw new ContentProviderPathError(`Resolved path escapes repo directory: "${itemDir}"`);
  }
  return itemDir;
}
