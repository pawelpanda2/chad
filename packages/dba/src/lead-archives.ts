/**
 * Msg Auto → manually added msg — per-lead WhatsApp export archives (.zip / .rar).
 *
 * Story 110: binary on cp_1 under
 *   `<CHAD_CONTACT_PHOTOS_DIR>/<user>/02_files_zip/manually-added-msg/<readable>.zip`
 * Metadata in PostgreSQL (`cp_lead_archives`). No new sidecar `.zip.json`.
 * Old Story 108 sidecars under `02_files_zip/` remain readable (compat only).
 */

import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentRepoGuid, getCurrentUsername } from "./repo-context.js";
import {
  assertSafeContactPhotoPath,
  assertSafeUsername,
  ContactPhotoError,
  getContactPhotosRootDir,
} from "./google-contact-photos.js";
import {
  createMemoryLeadArchiveStore,
  postgresLeadArchiveStore,
  type LeadArchiveMetadataStore,
} from "./lead-archives-store.js";

export { createMemoryLeadArchiveStore };

/** Match audio-recordings order of magnitude — WhatsApp exports with media. */
export const LEAD_ARCHIVE_MAX_BYTES = 50 * 1024 * 1024;
export const LEAD_ARCHIVE_MAX_FILES_PER_REQUEST = 5;
export const LEAD_ARCHIVE_VIEW = "manually-added-msg";
export const FILES_REFERENCED_SEGMENT = "02_files_refrenced";

export type LeadArchiveFileType = "zip" | "rar";

export class LeadArchiveError extends Error {
  constructor(
    public readonly code:
      | "NOT_CONFIGURED"
      | "INVALID_TYPE"
      | "INVALID_LEAD"
      | "INVALID_LEAD_LOCA"
      | "INVALID_ID"
      | "INVALID_USERNAME"
      | "EMPTY"
      | "TOO_LARGE"
      | "WRITE_FAILED"
      | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "LeadArchiveError";
  }
}

const ARCHIVE_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export function assertValidLeadArchiveId(id: string): string {
  const trimmed = id.trim();
  if (
    !trimmed ||
    !ARCHIVE_ID_PATTERN.test(trimmed) ||
    trimmed.includes("..") ||
    trimmed.includes("/") ||
    trimmed.includes("\\")
  ) {
    throw new LeadArchiveError("INVALID_ID", "Invalid archive id");
  }
  return trimmed;
}

export function assertValidLeadUuid(leadUuid: string): string {
  const trimmed = leadUuid.trim();
  if (
    !trimmed ||
    trimmed.length > 128 ||
    trimmed.includes("..") ||
    trimmed.includes("/") ||
    trimmed.includes("\\")
  ) {
    throw new LeadArchiveError("INVALID_LEAD", "Invalid lead uuid");
  }
  return trimmed;
}

/** `<root>/<username>/02_files_zip` — sibling of `01_files_photos`. */
export function getUserLeadArchivesDir(username: string, rootDirectory?: string): string {
  try {
    const root = rootDirectory ? path.resolve(rootDirectory) : getContactPhotosRootDir();
    const safeUsername = assertSafeUsername(username);
    const userDir = assertSafeContactPhotoPath(root, safeUsername);
    return assertSafeContactPhotoPath(userDir, "02_files_zip");
  } catch (error) {
    if (error instanceof ContactPhotoError) {
      if (error.code === "NOT_CONFIGURED") {
        throw new LeadArchiveError("NOT_CONFIGURED", "Archives directory is not configured");
      }
      throw new LeadArchiveError("INVALID_USERNAME", "Invalid username");
    }
    throw error;
  }
}

/** `<root>/<username>/02_files_zip/manually-added-msg` */
export function getUserLeadArchiveViewDir(username: string, rootDirectory?: string): string {
  const zipDir = getUserLeadArchivesDir(username, rootDirectory);
  return assertSafeContactPhotoPath(zipDir, LEAD_ARCHIVE_VIEW);
}

export function buildRelativeArchiveStoragePath(username: string, fileName: string): string {
  const safeUsername = assertSafeUsername(username);
  const safeName = path.basename(fileName);
  if (safeName !== fileName || fileName.includes("..")) {
    throw new LeadArchiveError("WRITE_FAILED", "Invalid archive file name");
  }
  return `${FILES_REFERENCED_SEGMENT}/${safeUsername}/02_files_zip/${LEAD_ARCHIVE_VIEW}/${safeName}`;
}

/** Resolve DB relative storage_path against the photos root (which IS 02_files_refrenced). */
export function resolveArchiveAbsolutePath(
  storagePath: string,
  rootDirectory?: string,
): string {
  const normalized = storagePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const prefix = `${FILES_REFERENCED_SEGMENT}/`;
  if (!normalized.startsWith(prefix)) {
    throw new LeadArchiveError("WRITE_FAILED", "Invalid storage path");
  }
  const relativeToRoot = normalized.slice(prefix.length);
  const root = rootDirectory ? path.resolve(rootDirectory) : getContactPhotosRootDir();
  const parts = relativeToRoot.split("/").filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = assertSafeContactPhotoPath(current, part);
  }
  return current;
}

function stripControlChars(value: string): string {
  let result = "";
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    result += code >= 32 && code !== 127 ? value[i] : " ";
  }
  return result;
}

function sanitizeOriginalFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() || "archive";
  const trimmed = stripControlChars(base).trim();
  const safe = trimmed.length > 0 ? trimmed : "archive";
  return safe.length > 180 ? safe.slice(0, 180) : safe;
}

/**
 * Sanitize lead display name into a single path segment for the ZIP filename.
 * Keeps letters (incl. Polish), digits, `.`, `_`, `-`; spaces → `_`.
 */
export function sanitizeLeadNameForArchiveFile(leadName: string): string {
  const stripped = stripControlChars(leadName)
    .replace(/[\\/]/g, "-")
    .replace(/\.\./g, ".")
    .trim();
  const spaced = stripped.replace(/\s+/g, "_");
  let out = "";
  for (const ch of spaced) {
    if (/[A-Za-z0-9._\-]/.test(ch) || ch.charCodeAt(0) > 127) {
      out += ch;
    } else {
      out += "_";
    }
  }
  out = out.replace(/_+/g, "_").replace(/^[._-]+|[._-]+$/g, "");
  if (!out) out = "lead";
  return out.length > 160 ? out.slice(0, 160) : out;
}

export function buildReadableArchiveFileName(
  leadName: string,
  ext: LeadArchiveFileType,
  existingFileNames: ReadonlySet<string>,
): string {
  const base = sanitizeLeadNameForArchiveFile(leadName);
  const primary = `${base}.${ext}`;
  if (!existingFileNames.has(primary)) return primary;
  let n = 2;
  while (existingFileNames.has(`${base}_${n}.${ext}`)) n += 1;
  return `${base}_${n}.${ext}`;
}

/**
 * Detect ZIP / RAR from magic bytes. Extension alone is never enough.
 */
export function detectArchiveTypeFromBytes(bytes: Uint8Array): LeadArchiveFileType | null {
  if (!bytes || bytes.byteLength < 4) return null;
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    if (
      (bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08)
    ) {
      return "zip";
    }
  }
  if (
    bytes.byteLength >= 7 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x61 &&
    bytes[2] === 0x72 &&
    bytes[3] === 0x21 &&
    bytes[4] === 0x1a &&
    bytes[5] === 0x07
  ) {
    return "rar";
  }
  return null;
}

export function resolveArchiveExtension(fileType: LeadArchiveFileType): string {
  return fileType;
}

export interface LeadArchiveMetadata {
  id: string;
  repoGuid: string;
  ownerUsername: string;
  leadUuid: string;
  leadNameAtExport: string;
  fileName: string;
  /** Relative key, e.g. `02_files_refrenced/<user>/02_files_zip/manually-added-msg/x.zip` */
  storagePath: string;
  view: string;
  fileType: LeadArchiveFileType;
  sizeBytes: number;
  originalFileName: string;
  createdAt: string;
  /** Present only for legacy Story 108 sidecars (compat). */
  leadLoca?: string;
  /** @deprecated use fileName — kept for older API clients */
  storageKey?: string;
}

/** Legacy sidecar shape (Story 108). */
interface LegacySidecar {
  id: string;
  repoGuid: string;
  ownerUsername: string;
  leadLoca: string;
  storageKey: string;
  originalFileName: string;
  fileType: LeadArchiveFileType;
  sizeBytes: number;
  createdAt: string;
}

function parseLegacySidecar(raw: string): LegacySidecar | null {
  try {
    const parsed = JSON.parse(raw) as Partial<LegacySidecar>;
    if (
      !parsed ||
      typeof parsed.id !== "string" ||
      typeof parsed.repoGuid !== "string" ||
      typeof parsed.ownerUsername !== "string" ||
      typeof parsed.leadLoca !== "string" ||
      typeof parsed.storageKey !== "string" ||
      typeof parsed.originalFileName !== "string" ||
      (parsed.fileType !== "zip" && parsed.fileType !== "rar") ||
      typeof parsed.sizeBytes !== "number" ||
      typeof parsed.createdAt !== "string"
    ) {
      return null;
    }
    return {
      id: parsed.id,
      repoGuid: parsed.repoGuid,
      ownerUsername: parsed.ownerUsername,
      leadLoca: parsed.leadLoca,
      storageKey: parsed.storageKey,
      originalFileName: parsed.originalFileName,
      fileType: parsed.fileType,
      sizeBytes: parsed.sizeBytes,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

function legacyToMetadata(legacy: LegacySidecar): LeadArchiveMetadata {
  return {
    id: legacy.id,
    repoGuid: legacy.repoGuid,
    ownerUsername: legacy.ownerUsername,
    leadUuid: "", // unknown in legacy sidecar — relation via leadLoca only
    leadNameAtExport: legacy.originalFileName.replace(/\.(zip|rar)$/i, "") || legacy.id,
    fileName: legacy.storageKey,
    storagePath: `${FILES_REFERENCED_SEGMENT}/${legacy.ownerUsername}/02_files_zip/${legacy.storageKey}`,
    view: LEAD_ARCHIVE_VIEW,
    fileType: legacy.fileType,
    sizeBytes: legacy.sizeBytes,
    originalFileName: legacy.originalFileName,
    createdAt: legacy.createdAt,
    leadLoca: legacy.leadLoca,
    storageKey: legacy.storageKey,
  };
}

async function listExistingViewFileNames(viewDir: string): Promise<Set<string>> {
  try {
    const entries = await readdir(viewDir, { withFileTypes: true });
    return new Set(entries.filter((e) => e.isFile()).map((e) => e.name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return new Set();
    throw new LeadArchiveError("WRITE_FAILED", "Could not list archive directory");
  }
}

async function readLegacySidecars(
  zipDir: string,
  repoGuid: string,
): Promise<LeadArchiveMetadata[]> {
  let entries;
  try {
    entries = await readdir(zipDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    return [];
  }
  const out: LeadArchiveMetadata[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    // Skip nested view dir names accidentally listed as files — only top-level json
    try {
      const raw = await readFile(assertSafeContactPhotoPath(zipDir, entry.name), "utf8");
      const legacy = parseLegacySidecar(raw);
      if (!legacy || legacy.repoGuid !== repoGuid) continue;
      try {
        const st = await stat(assertSafeContactPhotoPath(zipDir, legacy.storageKey));
        if (!st.isFile()) continue;
      } catch {
        continue;
      }
      out.push(legacyToMetadata(legacy));
    } catch {
      /* skip corrupt */
    }
  }
  return out;
}

export interface SaveLeadArchiveInput {
  bytes: Uint8Array;
  originalFileName: string;
  leadUuid: string;
  leadNameAtExport: string;
  /** Declared extension hint (optional); magic bytes are authoritative. */
  declaredExt?: string;
  rootDirectory?: string;
  repoGuid?: string;
  username?: string;
  /** Inject for tests; production uses Postgres. */
  metadataStore?: LeadArchiveMetadataStore;
}

export async function saveLeadArchive(input: SaveLeadArchiveInput): Promise<LeadArchiveMetadata> {
  if (!input.bytes || input.bytes.byteLength === 0) {
    throw new LeadArchiveError("EMPTY", "Archive is empty");
  }
  if (input.bytes.byteLength > LEAD_ARCHIVE_MAX_BYTES) {
    throw new LeadArchiveError("TOO_LARGE", "Archive exceeds size limit");
  }

  const detected = detectArchiveTypeFromBytes(input.bytes);
  if (!detected) {
    throw new LeadArchiveError("INVALID_TYPE", "File is not a valid ZIP or RAR archive");
  }

  const declared = (input.declaredExt || "").replace(/^\./, "").toLowerCase();
  if (declared && declared !== detected) {
    throw new LeadArchiveError("INVALID_TYPE", "File content does not match declared archive type");
  }

  const leadUuid = assertValidLeadUuid(input.leadUuid);
  const leadNameAtExport = stripControlChars(input.leadNameAtExport).trim() || "lead";
  const repoGuid = input.repoGuid ?? getCurrentRepoGuid();
  let username: string;
  try {
    username = assertSafeUsername(input.username ?? getCurrentUsername());
  } catch {
    throw new LeadArchiveError("INVALID_USERNAME", "Invalid username");
  }

  const store = input.metadataStore ?? postgresLeadArchiveStore;
  const viewDir = getUserLeadArchiveViewDir(username, input.rootDirectory);
  const ext = resolveArchiveExtension(detected) as LeadArchiveFileType;
  const existing = await listExistingViewFileNames(viewDir);
  const fileName = buildReadableArchiveFileName(leadNameAtExport, ext, existing);
  const storagePath = buildRelativeArchiveStoragePath(username, fileName);
  const fullPath = resolveArchiveAbsolutePath(storagePath, input.rootDirectory);
  const tempPath = `${fullPath}.tmp-${randomUUID()}`;
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const metadata: LeadArchiveMetadata = {
    id,
    repoGuid,
    ownerUsername: username,
    leadUuid,
    leadNameAtExport,
    fileName,
    storagePath,
    view: LEAD_ARCHIVE_VIEW,
    fileType: detected,
    sizeBytes: input.bytes.byteLength,
    originalFileName: sanitizeOriginalFileName(input.originalFileName),
    createdAt,
    storageKey: fileName,
  };

  try {
    await mkdir(viewDir, { recursive: true });
    await writeFile(tempPath, input.bytes, { flag: "wx" });
    // Verify still looks like an archive after write
    const verify = detectArchiveTypeFromBytes(new Uint8Array(await readFile(tempPath)));
    if (verify !== detected) {
      await rm(tempPath, { force: true }).catch(() => {});
      throw new LeadArchiveError("INVALID_TYPE", "File is not a valid ZIP or RAR archive");
    }
    await rename(tempPath, fullPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    if (error instanceof LeadArchiveError) throw error;
    if ((error as NodeJS.ErrnoException)?.code === "EEXIST") {
      throw new LeadArchiveError("WRITE_FAILED", "Archive file already exists");
    }
    throw new LeadArchiveError("WRITE_FAILED", "Could not save archive");
  }

  try {
    await store.insert(metadata);
  } catch (error) {
    await rm(fullPath, { force: true }).catch(() => {});
    console.error(
      "[lead-archives] metadata insert failed:",
      error instanceof Error ? error.message : error,
    );
    throw new LeadArchiveError("WRITE_FAILED", "Could not save archive metadata");
  }

  return metadata;
}

export async function listLeadArchives(
  leadUuid: string,
  options?: {
    rootDirectory?: string;
    repoGuid?: string;
    username?: string;
    /** Optional loca — used only to merge legacy Story 108 sidecars. */
    leadLoca?: string;
    metadataStore?: LeadArchiveMetadataStore;
  },
): Promise<LeadArchiveMetadata[]> {
  const uuid = assertValidLeadUuid(leadUuid);
  const repoGuid = options?.repoGuid ?? getCurrentRepoGuid();
  const store = options?.metadataStore ?? postgresLeadArchiveStore;
  const fromDb = await store.listByLeadUuid(repoGuid, uuid);

  let legacy: LeadArchiveMetadata[] = [];
  if (options?.leadLoca) {
    try {
      const username = assertSafeUsername(options.username ?? getCurrentUsername());
      const zipDir = getUserLeadArchivesDir(username, options.rootDirectory);
      legacy = (await readLegacySidecars(zipDir, repoGuid)).filter(
        (m) => m.leadLoca === options.leadLoca,
      );
    } catch {
      legacy = [];
    }
  }

  const byId = new Map<string, LeadArchiveMetadata>();
  for (const row of [...fromDb, ...legacy]) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Counts keyed by leadUuid (legacy sidecar counts keyed by loca are not included unless mapped by caller). */
export async function listLeadArchiveCounts(options?: {
  rootDirectory?: string;
  repoGuid?: string;
  username?: string;
  metadataStore?: LeadArchiveMetadataStore;
  /** Map leadLoca → leadUuid to include legacy sidecars in counts. */
  locaToLeadUuid?: Record<string, string>;
}): Promise<Record<string, number>> {
  const repoGuid = options?.repoGuid ?? getCurrentRepoGuid();
  const store = options?.metadataStore ?? postgresLeadArchiveStore;
  const all = await store.listAllForRepo(repoGuid, LEAD_ARCHIVE_VIEW);
  const counts: Record<string, number> = {};
  for (const m of all) {
    counts[m.leadUuid] = (counts[m.leadUuid] ?? 0) + 1;
  }

  if (options?.locaToLeadUuid) {
    try {
      const username = assertSafeUsername(options.username ?? getCurrentUsername());
      const zipDir = getUserLeadArchivesDir(username, options.rootDirectory);
      const legacy = await readLegacySidecars(zipDir, repoGuid);
      for (const m of legacy) {
        if (!m.leadLoca) continue;
        const uuid = options.locaToLeadUuid[m.leadLoca];
        if (!uuid) continue;
        counts[uuid] = (counts[uuid] ?? 0) + 1;
      }
    } catch {
      /* ignore */
    }
  }

  return counts;
}

export interface LeadArchiveReadInfo extends LeadArchiveMetadata {
  filePath: string;
  mimeType: string;
}

function mimeForArchiveType(fileType: LeadArchiveFileType): string {
  return fileType === "rar" ? "application/vnd.rar" : "application/zip";
}

/**
 * Resolve an owned archive for streaming download. Lookup is by archive id +
 * session repoGuid only — never by client-supplied path.
 */
export async function getLeadArchiveReadInfo(
  id: string,
  options?: {
    rootDirectory?: string;
    repoGuid?: string;
    username?: string;
    metadataStore?: LeadArchiveMetadataStore;
  },
): Promise<LeadArchiveReadInfo | null> {
  const safeId = assertValidLeadArchiveId(id);
  const repoGuid = options?.repoGuid ?? getCurrentRepoGuid();
  const store = options?.metadataStore ?? postgresLeadArchiveStore;
  const metadata = await store.getById(repoGuid, safeId);

  if (metadata) {
    try {
      const filePath = resolveArchiveAbsolutePath(metadata.storagePath, options?.rootDirectory);
      const st = await stat(filePath);
      if (!st.isFile()) return null;
      return {
        ...metadata,
        sizeBytes: st.size,
        filePath,
        mimeType: mimeForArchiveType(metadata.fileType),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
      throw new LeadArchiveError("WRITE_FAILED", "Could not read archive");
    }
  }

  // Legacy Story 108 sidecar
  try {
    const username = assertSafeUsername(options?.username ?? getCurrentUsername());
    const zipDir = getUserLeadArchivesDir(username, options?.rootDirectory);
    const legacy = parseLegacySidecar(
      await readFile(assertSafeContactPhotoPath(zipDir, `${safeId}.json`), "utf8"),
    );
    if (!legacy || legacy.repoGuid !== repoGuid) return null;
    const filePath = assertSafeContactPhotoPath(zipDir, legacy.storageKey);
    const st = await stat(filePath);
    if (!st.isFile()) return null;
    return {
      ...legacyToMetadata(legacy),
      sizeBytes: st.size,
      filePath,
      mimeType: mimeForArchiveType(legacy.fileType),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    if (error instanceof LeadArchiveError) throw error;
    throw new LeadArchiveError("WRITE_FAILED", "Could not read archive");
  }
}

export async function deleteLeadArchive(
  id: string,
  options?: {
    rootDirectory?: string;
    repoGuid?: string;
    username?: string;
    metadataStore?: LeadArchiveMetadataStore;
  },
): Promise<void> {
  const safeId = assertValidLeadArchiveId(id);
  const repoGuid = options?.repoGuid ?? getCurrentRepoGuid();
  const store = options?.metadataStore ?? postgresLeadArchiveStore;
  const metadata = await store.getById(repoGuid, safeId);

  if (metadata) {
    try {
      const filePath = resolveArchiveAbsolutePath(metadata.storagePath, options?.rootDirectory);
      await rm(filePath, { force: false });
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
        throw new LeadArchiveError("WRITE_FAILED", "Could not delete archive file");
      }
    }
    const deleted = await store.deleteById(repoGuid, safeId);
    if (!deleted) {
      throw new LeadArchiveError("WRITE_FAILED", "Archive file deleted but metadata cleanup failed");
    }
    return;
  }

  // Legacy sidecar delete (Story 108)
  const username = assertSafeUsername(options?.username ?? getCurrentUsername());
  const zipDir = getUserLeadArchivesDir(username, options?.rootDirectory);
  const metadataPath = assertSafeContactPhotoPath(zipDir, `${safeId}.json`);
  let legacy: LegacySidecar | null;
  try {
    legacy = parseLegacySidecar(await readFile(metadataPath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      throw new LeadArchiveError("NOT_FOUND", "Archive not found");
    }
    throw new LeadArchiveError("WRITE_FAILED", "Could not read archive metadata");
  }
  if (!legacy || legacy.repoGuid !== repoGuid) {
    throw new LeadArchiveError("NOT_FOUND", "Archive not found");
  }
  try {
    await rm(assertSafeContactPhotoPath(zipDir, legacy.storageKey), { force: false });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      throw new LeadArchiveError("WRITE_FAILED", "Could not delete archive file");
    }
  }
  try {
    await rm(metadataPath, { force: false });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.error("[lead-archives] orphan legacy metadata after file delete:", safeId);
      throw new LeadArchiveError("WRITE_FAILED", "Archive file deleted but metadata cleanup failed");
    }
  }
}

/** Exists check used by tests / smoke. */
export async function archiveFileExists(
  storagePath: string,
  rootDirectory?: string,
): Promise<boolean> {
  try {
    await access(resolveArchiveAbsolutePath(storagePath, rootDirectory));
    return true;
  } catch {
    return false;
  }
}
