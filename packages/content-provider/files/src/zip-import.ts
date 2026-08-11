/**
 * ZIP → CpImportPlan — stage, safely unzip, and fully validate an uploaded
 * Folder-CP-item archive before anything is ever written to a backend. See
 * ai-docs/content-provider/zip-import.md for the full contract.
 *
 * Security/resource limits (entry count, sizes, ratio, depth, encrypted/
 * symlink/device entries, Zip Slip) are enforced fail-fast while streaming
 * entries — a violation aborts the whole import immediately, never
 * partially processed. Structural/config validation (config.yaml schema,
 * body.txt presence, unexpected files, folder naming, single-root rule)
 * is collected as a list so a caller can report every problem at once.
 *
 * Never writes extracted entries back out to individual files — only the
 * uploaded ZIP itself is staged to disk (so `stagingDir` has an on-disk
 * artifact to inspect if something goes wrong before cleanup), everything
 * else lives in memory as a `CpImportPlan`. `stagingDir` is always removed
 * (try/finally) before this function returns, success or failure — it is
 * never the commit step's job to know about it.
 */

import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import yauzl from "yauzl";
import { parse as parseYaml } from "yaml";
import type {
  CpImportNode,
  CpImportPlan,
  CpImportSkipPolicy,
  CpImportSkippedEntry,
  CpImportValidationError,
  CpImportValidationResult,
  ImportFolderLimits,
} from "cp-core";
import { isChildFolderName } from "./paths.js";

export const DEFAULT_IMPORT_LIMITS: ImportFolderLimits = {
  maxZipBytes: 50 * 1024 * 1024,
  maxEntries: 2000,
  maxTotalUncompressedBytes: 200 * 1024 * 1024,
  maxEntryUncompressedBytes: 10 * 1024 * 1024,
  maxCompressionRatioCheckThresholdBytes: 1024 * 1024,
  maxCompressionRatio: 100,
  maxTreeDepth: 20,
  maxItemCount: 500,
};

const CONFIG_FILE_NAME = "config.yaml";
const BODY_FILE_NAME = "body.txt";
/**
 * `name` is a display label, never used to build a path — CP addresses are
 * purely numeric segments (see cp-model.ts / this file's own commit path).
 * Only empty (after trim) names are rejected. Characters like "/", "\\",
 * and ".." are allowed in `name` — real exports contain them (e.g.
 * "pomysły / todo", titles ending with ".."). Path traversal is enforced
 * separately on ZIP entry *paths* (Zip Slip), not on the display label.
 * (Manual Folders "Add" still has its own `validateChildName` in folders.ts.)
 */

/** Fail-fast abort — security/resource violations, never a partial result. */
class ZipImportAbortError extends Error {
  constructor(
    public readonly code: string,
    public readonly path: string,
    message: string
  ) {
    super(message);
    this.name = "ZipImportAbortError";
  }
}

interface TreeDirEntry {
  files: Map<string, Buffer>;
  subdirs: Set<string>;
}

function openZip(filePath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, decodeStrings: true }, (err, zipfile) => {
      if (err) return reject(err);
      if (!zipfile) return reject(new Error("yauzl.open returned no zipfile"));
      resolve(zipfile);
    });
  });
}

function readEntryBuffer(zipfile: yauzl.ZipFile, entry: yauzl.Entry, hardCapBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, readStream) => {
      if (err) return reject(err);
      const chunks: Buffer[] = [];
      let total = 0;
      readStream.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > hardCapBytes) {
          readStream.destroy();
          reject(
            new ZipImportAbortError(
              "ENTRY_TOO_LARGE",
              entry.fileName,
              `Entry exceeded the ${hardCapBytes}-byte limit while reading (declared size may not match actual content)`
            )
          );
          return;
        }
        chunks.push(chunk);
      });
      readStream.on("end", () => resolve(Buffer.concat(chunks)));
      readStream.on("error", reject);
    });
  });
}

async function walkZipEntries(
  zipfile: yauzl.ZipFile,
  onEntry: (entry: yauzl.Entry) => Promise<void>
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      zipfile.close();
      reject(err);
    };
    zipfile.on("error", fail);
    zipfile.on("end", () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    });
    zipfile.on("entry", (entry: yauzl.Entry) => {
      onEntry(entry)
        .then(() => {
          if (!settled) zipfile.readEntry();
        })
        .catch(fail);
    });
    zipfile.readEntry();
  });
}

/** Zip Slip guard: normalizes and rejects absolute paths, `..`, empty segments, backslashes, NUL bytes. */
function normalizeAndValidateEntryPath(rawFileName: string): string[] {
  if (rawFileName.includes("\0")) {
    throw new ZipImportAbortError("MALFORMED_ENTRY_PATH", rawFileName, "Entry path contains a NUL byte");
  }
  if (rawFileName.includes("\\")) {
    throw new ZipImportAbortError("MALFORMED_ENTRY_PATH", rawFileName, "Entry path contains a backslash");
  }
  const trimmedTrailingSlash = rawFileName.endsWith("/") ? rawFileName.slice(0, -1) : rawFileName;
  if (trimmedTrailingSlash.startsWith("/")) {
    throw new ZipImportAbortError("ABSOLUTE_PATH_ENTRY", rawFileName, "Entry uses an absolute path");
  }
  const segments = trimmedTrailingSlash.split("/");
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") {
      throw new ZipImportAbortError("ZIP_SLIP", rawFileName, `Entry path contains an unsafe segment ("${segment || "(empty)"}")`);
    }
  }
  return segments;
}

/** Unix mode from external file attributes; only meaningful when versionMadeBy's host OS byte is 3 (Unix). */
function isUnixSymlinkOrSpecial(entry: yauzl.Entry): boolean {
  const hostOs = (entry.versionMadeBy >> 8) & 0xff;
  if (hostOs !== 3) return false; // not Unix-authored — no reliable mode bits (common for Windows-zipped archives)
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  const fileTypeBits = unixMode & 0xf000;
  if (fileTypeBits === 0) return false; // no type info recorded
  if (fileTypeBits === 0x8000) return false; // S_IFREG — regular file
  if (fileTypeBits === 0x4000) return false; // S_IFDIR — directory
  return true; // symlink (0xA000), device, fifo, socket — reject
}

function isEncrypted(entry: yauzl.Entry): boolean {
  return (entry.generalPurposeBitFlag & 0x1) !== 0;
}

/**
 * macOS Finder's "Compress" always adds a `__MACOSX/` sibling directory
 * (AppleDouble resource-fork sidecars, `._<name>`) and scatters `.DS_Store`
 * folder-metadata files throughout real content directories — neither is
 * user data, both are unconditional Finder/Archive-Utility byproducts. Real
 * exported CP trees zipped on a Mac (the expected common case for this
 * feature) always carry these; without skipping them, `__MACOSX` reads as a
 * second sibling root (MULTIPLE_ROOT_ITEMS) and every `.DS_Store` reads as
 * an UNEXPECTED_FILE, rejecting nearly every Mac-zipped archive outright —
 * found via a real user-provided fixture, not a hypothetical.
 */
function isMacOsJunkEntry(segments: string[]): boolean {
  if (segments[0] === "__MACOSX") return true;
  if (segments[segments.length - 1] === ".DS_Store") return true;
  return false;
}

function ensureDir(tree: Map<string, TreeDirEntry>, dirPath: string): TreeDirEntry {
  let dir = tree.get(dirPath);
  if (!dir) {
    dir = { files: new Map(), subdirs: new Set() };
    tree.set(dirPath, dir);
  }
  return dir;
}

/** Registers `childPath` (a directory) as a subdir of its parent, creating ancestor entries as needed. */
function registerDir(tree: Map<string, TreeDirEntry>, dirPath: string): void {
  ensureDir(tree, dirPath);
  const parentSegs = dirPath.split("/");
  parentSegs.pop();
  if (parentSegs.length === 0) return;
  const parentPath = parentSegs.join("/");
  const parent = ensureDir(tree, parentPath);
  parent.subdirs.add(dirPath.split("/").pop()!);
  registerDir(tree, parentPath);
}

/**
 * Phase 1 — stream every entry, enforcing every fail-fast security/resource
 * limit, and build an in-memory directory tree (`config.yaml`/`body.txt`
 * content captured; any other file recorded by name only).
 */
async function scanZipIntoTree(
  zipFilePath: string,
  limits: ImportFolderLimits
): Promise<{ tree: Map<string, TreeDirEntry>; topLevelSegments: Set<string> }> {
  const zipfile = await openZip(zipFilePath);
  const tree = new Map<string, TreeDirEntry>();
  const topLevelSegments = new Set<string>();
  let entryCount = 0;
  let totalUncompressedBytes = 0;
  let itemCount = 0; // config.yaml occurrences

  await walkZipEntries(zipfile, async (entry) => {
    entryCount += 1;
    if (entryCount > limits.maxEntries) {
      throw new ZipImportAbortError("TOO_MANY_ENTRIES", entry.fileName, `Archive exceeds the ${limits.maxEntries}-entry limit`);
    }

    const isDirEntry = entry.fileName.endsWith("/");
    const segments = normalizeAndValidateEntryPath(entry.fileName);
    if (segments.length > limits.maxTreeDepth) {
      throw new ZipImportAbortError("TREE_TOO_DEEP", entry.fileName, `Entry exceeds the ${limits.maxTreeDepth}-level depth limit`);
    }

    if (isEncrypted(entry)) {
      throw new ZipImportAbortError("ENCRYPTED_ENTRY", entry.fileName, "Encrypted archive entries are not supported");
    }
    if (isUnixSymlinkOrSpecial(entry)) {
      throw new ZipImportAbortError("SYMLINK_OR_SPECIAL_ENTRY", entry.fileName, "Symlinks and special files are not allowed");
    }

    // Resource-limit checks still apply to macOS junk entries (defense in depth —
    // never let a "__MACOSX/" name exempt an entry from size/ratio limits), but
    // they're excluded below from topLevelSegments/tree/content — see isMacOsJunkEntry.
    if (!isDirEntry) {
      totalUncompressedBytes += entry.uncompressedSize;
      if (totalUncompressedBytes > limits.maxTotalUncompressedBytes) {
        throw new ZipImportAbortError(
          "TOTAL_SIZE_EXCEEDED",
          entry.fileName,
          `Archive's total uncompressed size exceeds the ${limits.maxTotalUncompressedBytes}-byte limit`
        );
      }
      if (entry.uncompressedSize > limits.maxEntryUncompressedBytes) {
        throw new ZipImportAbortError(
          "ENTRY_TOO_LARGE",
          entry.fileName,
          `Entry declared size exceeds the ${limits.maxEntryUncompressedBytes}-byte per-entry limit`
        );
      }
      if (
        entry.uncompressedSize > limits.maxCompressionRatioCheckThresholdBytes &&
        entry.uncompressedSize / Math.max(entry.compressedSize, 1) > limits.maxCompressionRatio
      ) {
        throw new ZipImportAbortError("ZIP_BOMB_SUSPECTED", entry.fileName, "Entry's compression ratio looks like a zip bomb");
      }
    }

    if (isMacOsJunkEntry(segments)) {
      return;
    }
    topLevelSegments.add(segments[0]);

    if (isDirEntry) {
      registerDir(tree, segments.join("/"));
      return;
    }

    const dirSegs = segments.slice(0, -1);
    const dirPath = dirSegs.join("/");
    const baseName = segments[segments.length - 1];
    registerDir(tree, dirPath);
    const dir = ensureDir(tree, dirPath);

    if (baseName === CONFIG_FILE_NAME) {
      itemCount += 1;
      if (itemCount > limits.maxItemCount) {
        throw new ZipImportAbortError("TOO_MANY_ITEMS", entry.fileName, `Archive exceeds the ${limits.maxItemCount}-item limit`);
      }
      dir.files.set(baseName, await readEntryBuffer(zipfile, entry, limits.maxEntryUncompressedBytes));
    } else if (baseName === BODY_FILE_NAME) {
      dir.files.set(baseName, await readEntryBuffer(zipfile, entry, limits.maxEntryUncompressedBytes));
    } else {
      // Unexpected file — recorded (empty buffer, content irrelevant) so phase 2 can report UNEXPECTED_FILE with the right path.
      dir.files.set(baseName, Buffer.alloc(0));
    }
  });

  return { tree, topLevelSegments };
}

/** Applies the single-technical-wrapper-directory rule (see zip-import.md). Returns the (possibly stripped) tree + confirmed root path. */
function resolveRoot(
  tree: Map<string, TreeDirEntry>,
  topLevelSegments: Set<string>
): { tree: Map<string, TreeDirEntry>; rootPath: string } | { errors: CpImportValidationError[] } {
  let effectiveTree = tree;
  let effectiveTop = topLevelSegments;

  if (effectiveTop.size === 1) {
    const only = [...effectiveTop][0];
    const onlyEntry = effectiveTree.get(only);
    // Only strip when `only` is purely a container (no files of its own) — if
    // it carries a config.yaml/body.txt directly, it might genuinely be a
    // badly-named-but-real root item, not a wrapper; stripping would silently
    // discard those files. Safer to not guess: leave it unstripped, which
    // then fails root validation below with a clear INVALID_CHILD_FOLDER_NAME
    // instead of silently dropping data.
    if (!isChildFolderName(only) && (!onlyEntry || onlyEntry.files.size === 0)) {
      // Technical wrapper — strip it by re-rooting at that single subdir.
      const stripped = new Map<string, TreeDirEntry>();
      for (const [dirPath, entry] of effectiveTree) {
        if (dirPath === only) {
          stripped.set("", entry);
        } else if (dirPath.startsWith(`${only}/`)) {
          stripped.set(dirPath.slice(only.length + 1), entry);
        }
        // entries outside the wrapper (shouldn't exist if topLevelSegments.size === 1, but defensive) are dropped intentionally — caught by the recount below.
      }
      const newTop = new Set<string>();
      const rootEntry = stripped.get("");
      if (rootEntry) {
        for (const sub of rootEntry.subdirs) newTop.add(sub);
      }
      effectiveTree = stripped;
      effectiveTop = newTop;
    }
  }

  if (effectiveTop.size === 0) {
    return { errors: [{ code: "NO_ROOT_ITEM", path: "", message: "Archive contains no root CP item" }] };
  }
  if (effectiveTop.size > 1) {
    return {
      errors: [
        {
          code: "MULTIPLE_ROOT_ITEMS",
          path: "",
          message: `Archive has ${effectiveTop.size} sibling root items (${[...effectiveTop].join(", ")}) — exactly one is required`,
        },
      ],
    };
  }
  const rootPath = [...effectiveTop][0];
  if (!isChildFolderName(rootPath)) {
    return {
      errors: [
        {
          code: "INVALID_CHILD_FOLDER_NAME",
          path: rootPath,
          message: `Root item folder name "${rootPath}" is not a valid CP index (must match ^\\d{2,3}$)`,
        },
      ],
    };
  }
  return { tree: effectiveTree, rootPath };
}

interface RequiredConfigFields {
  id: string;
  type: string;
  name: string;
}

type ParseConfigResult =
  | { kind: "ok"; fields: RequiredConfigFields; extraConfig: Record<string, unknown> }
  | { kind: "error" }
  | { kind: "skip"; entry: CpImportSkippedEntry };

function parseAndValidateConfig(
  raw: Buffer | undefined,
  dirPath: string,
  errors: CpImportValidationError[],
  skipPolicy: CpImportSkipPolicy | undefined
): ParseConfigResult {
  if (!raw) {
    errors.push({ code: "MISSING_CONFIG", path: dirPath, message: `Missing ${CONFIG_FILE_NAME}` });
    return { kind: "error" };
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(raw.toString("utf8"));
  } catch (err) {
    errors.push({ code: "INVALID_CONFIG", path: dirPath, message: `Could not parse ${CONFIG_FILE_NAME}: ${err instanceof Error ? err.message : String(err)}` });
    return { kind: "error" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    errors.push({ code: "INVALID_CONFIG", path: dirPath, message: `${CONFIG_FILE_NAME} must be a YAML object` });
    return { kind: "error" };
  }
  const obj = parsed as Record<string, unknown>;
  const missing: string[] = [];
  // "address" is deliberately NOT required here, unlike cp-core's CpConfigRequired: its
  // value is never trusted or reused regardless (always recomputed at commit time — see
  // the module doc comment), and real on-disk config.yaml commonly omits it — the real
  // .NET model self-heals a missing address on READ (MigrationWorker.TryMigrateConfig,
  // see cp-core's types.ts), which a raw filesystem export/backup never goes through.
  // Confirmed against a real user-provided export archive, not a guess.
  for (const field of ["id", "type", "name"] as const) {
    if (typeof obj[field] !== "string" || (obj[field] as string).trim() === "") missing.push(field);
  }
  if (missing.length > 0) {
    errors.push({ code: "INVALID_CONFIG", path: dirPath, message: `${CONFIG_FILE_NAME} is missing required field(s): ${missing.join(", ")}` });
    return { kind: "error" };
  }
  const type = obj.type as string;
  if (type !== "Folder" && type !== "Text") {
    if (type === "Ref" && skipPolicy?.skipRefItems) {
      return {
        kind: "skip",
        entry: { code: "REF_ITEM_SKIPPED", path: dirPath, message: `Ref item "${String(obj.name ?? dirPath)}" skipped (not imported) — no confirmed import contract for Ref` },
      };
    }
    errors.push({ code: "UNSUPPORTED_TYPE", path: dirPath, message: `Unsupported type "${type}" (only "Folder" and "Text" are accepted; "Ref" is never accepted)` });
    return { kind: "error" };
  }
  const name = (obj.name as string).trim();
  if (name === "") {
    errors.push({ code: "INVALID_NAME", path: dirPath, message: `Invalid name "${obj.name as string}" (must not be empty)` });
    return { kind: "error" };
  }

  const extraConfig: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "id" || key === "address" || key === "type" || key === "name") continue;
    if (key === "refAddress" || key === "refGuid") {
      errors.push({ code: "REF_NOT_SUPPORTED", path: dirPath, message: `"${key}" is not supported — Ref items cannot be imported` });
      continue;
    }
    extraConfig[key] = value;
  }

  return { kind: "ok", fields: { id: obj.id as string, type, name }, extraConfig };
}

function buildNode(
  tree: Map<string, TreeDirEntry>,
  dirPath: string,
  depth: number,
  limits: ImportFolderLimits,
  errors: CpImportValidationError[],
  nodeCounter: { count: number },
  skipPolicy: CpImportSkipPolicy | undefined,
  skipped: CpImportSkippedEntry[]
): CpImportNode | null {
  const dir = tree.get(dirPath) ?? { files: new Map(), subdirs: new Set() };
  const parsed = parseAndValidateConfig(dir.files.get(CONFIG_FILE_NAME), dirPath, errors, skipPolicy);

  if (parsed.kind === "skip") {
    // Whole subtree intentionally omitted — never validated further (a skipped Ref's
    // "children" in a real export are typically stale wrapper artifacts, not real content).
    skipped.push(parsed.entry);
    return null;
  }

  const skippableExtensions = new Set((skipPolicy?.skipUnexpectedFileExtensions ?? []).map((e: string) => e.toLowerCase()));
  const knownFiles = new Set([CONFIG_FILE_NAME, BODY_FILE_NAME]);
  for (const fileName of dir.files.keys()) {
    if (knownFiles.has(fileName)) continue;
    const ext = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase() : "";
    if (ext && skippableExtensions.has(ext)) {
      skipped.push({ code: "UNEXPECTED_FILE_SKIPPED", path: `${dirPath}/${fileName}`, message: `Unexpected file "${fileName}" skipped (not imported)` });
      continue;
    }
    errors.push({ code: "UNEXPECTED_FILE", path: `${dirPath}/${fileName}`, message: `Unexpected file "${fileName}" — only ${CONFIG_FILE_NAME}/${BODY_FILE_NAME} are allowed` });
  }

  const childNames = [...dir.subdirs];
  const children: CpImportNode[] = [];
  for (const childName of childNames) {
    if (!isChildFolderName(childName)) {
      errors.push({ code: "INVALID_CHILD_FOLDER_NAME", path: `${dirPath}/${childName}`, message: `Child folder name "${childName}" is not a valid CP index (must match ^\\d{2,3}$)` });
      continue;
    }
    const childNode = buildNode(tree, `${dirPath}/${childName}`, depth + 1, limits, errors, nodeCounter, skipPolicy, skipped);
    if (childNode) children.push(childNode);
  }

  if (parsed.kind === "error") return null;
  const { fields, extraConfig } = parsed;

  if (fields.type === "Folder") {
    if (dir.files.has(BODY_FILE_NAME)) {
      errors.push({ code: "UNEXPECTED_FILE", path: `${dirPath}/${BODY_FILE_NAME}`, message: `Folder items never carry ${BODY_FILE_NAME}` });
    }
    nodeCounter.count += 1;
    return { sourcePath: dirPath, type: "Folder", name: fields.name, body: "", extraConfig, children };
  }

  // type === "Text"
  if (children.length > 0) {
    errors.push({ code: "UNEXPECTED_CHILD_UNDER_TEXT", path: dirPath, message: "Text items cannot have child items" });
  }
  const bodyBuf = dir.files.get(BODY_FILE_NAME);
  if (!bodyBuf) {
    errors.push({ code: "MISSING_BODY", path: dirPath, message: `Text item is missing ${BODY_FILE_NAME}` });
    return null;
  }
  nodeCounter.count += 1;
  return { sourcePath: dirPath, type: "Text", name: fields.name, body: bodyBuf.toString("utf8"), extraConfig, children: [] };
}

export interface StageAndValidateZipImportInput {
  /** Absolute directory this import's temp files may use — already resolved/authorized by the caller (DBA). Created and always removed by this function. */
  stagingDir: string;
  zipBytes: Buffer;
  limits?: Partial<ImportFolderLimits>;
  /** Opt-in only — never set by default. See CpImportSkipPolicy's doc comment (cp-core). */
  skipPolicy?: CpImportSkipPolicy;
}

/**
 * Stages `zipBytes` under `stagingDir/upload.zip`, safely unzips and fully
 * validates it into a `CpImportPlan`, and always removes `stagingDir`
 * before returning — regardless of outcome. Never throws for an expected
 * validation failure (returns `{ok:false, errors}`); only throws for a
 * genuine infrastructure error (e.g. cannot create the staging directory).
 */
export async function stageAndValidateZipImport(input: StageAndValidateZipImportInput): Promise<CpImportValidationResult> {
  const limits: ImportFolderLimits = { ...DEFAULT_IMPORT_LIMITS, ...(input.limits ?? {}) };

  if (!path.isAbsolute(input.stagingDir)) {
    throw new Error("stageAndValidateZipImport: stagingDir must be an absolute path");
  }
  if (input.zipBytes.byteLength === 0) {
    return { ok: false, errors: [{ code: "EMPTY_ARCHIVE", path: "", message: "Uploaded file is empty" }] };
  }
  if (input.zipBytes.byteLength > limits.maxZipBytes) {
    return { ok: false, errors: [{ code: "ARCHIVE_TOO_LARGE", path: "", message: `Archive exceeds the ${limits.maxZipBytes}-byte limit` }] };
  }

  const zipFilePath = path.join(input.stagingDir, "upload.zip");
  try {
    await mkdir(input.stagingDir, { recursive: true });
    await writeFile(zipFilePath, input.zipBytes, { flag: "wx" });
    const staged = await stat(zipFilePath);
    if (staged.size !== input.zipBytes.byteLength) {
      // Defense in depth — never trust Content-Length/the buffer alone; confirm what actually landed on disk.
      return { ok: false, errors: [{ code: "STAGING_SIZE_MISMATCH", path: "", message: "Staged file size did not match the uploaded content" }] };
    }

    let scanResult: { tree: Map<string, TreeDirEntry>; topLevelSegments: Set<string> };
    try {
      scanResult = await scanZipIntoTree(zipFilePath, limits);
    } catch (err) {
      if (err instanceof ZipImportAbortError) {
        return { ok: false, errors: [{ code: err.code, path: err.path, message: err.message }] };
      }
      // yauzl validates entry names itself (before our own entry handler ever runs) and
      // emits these exact prefixes for the same Zip-Slip-style cases our own
      // normalizeAndValidateEntryPath also guards — map them to the same structured codes
      // instead of a generic bucket.
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith("absolute path: ")) {
        return { ok: false, errors: [{ code: "ABSOLUTE_PATH_ENTRY", path: "", message }] };
      }
      if (message.startsWith("invalid relative path: ") || message.startsWith("invalid characters in fileName: ")) {
        return { ok: false, errors: [{ code: "ZIP_SLIP", path: "", message }] };
      }
      return { ok: false, errors: [{ code: "UNREADABLE_ARCHIVE", path: "", message }] };
    }

    const rootResolution = resolveRoot(scanResult.tree, scanResult.topLevelSegments);
    if ("errors" in rootResolution) {
      return { ok: false, errors: rootResolution.errors };
    }

    const errors: CpImportValidationError[] = [];
    const nodeCounter = { count: 0 };
    const skipped: CpImportSkippedEntry[] = [];
    const root = buildNode(rootResolution.tree, rootResolution.rootPath, 1, limits, errors, nodeCounter, input.skipPolicy, skipped);
    if (!root) {
      if (errors.length === 0) {
        // Only reachable if the ROOT item itself was skipped (e.g. root type is "Ref") —
        // there is always something wrong to report; skipping is only ever valid for a
        // descendant, never the one item that would anchor the whole import.
        errors.push({ code: "ROOT_ITEM_SKIPPED", path: rootResolution.rootPath, message: "The root item itself cannot be skipped — nothing left to import" });
      }
      return { ok: false, errors };
    }
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    const plan: CpImportPlan = { root, totalItemCount: nodeCounter.count };
    return { ok: true, plan, skipped };
  } finally {
    await rm(input.stagingDir, { recursive: true, force: true }).catch(() => {
      /* best-effort cleanup — nothing more useful to do if this fails */
    });
  }
}
