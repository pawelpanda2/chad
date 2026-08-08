/**
 * Msg Workout → Manually Added Messages — per-lead WhatsApp export archives
 * (.zip / .rar) on the shared `cp_1` volume.
 *
 * Same storage root as photos (`CHAD_CONTACT_PHOTOS_DIR` → container
 * `/app/contact-photos` = host `…/02_files_refrenced`), but a sibling
 * directory: `<username>/02_files_zip/`. Sidecar JSON metadata; never unpack.
 *
 * Host Mac: `/Volumes/cp_1/02_files_refrenced/<user>/02_files_zip`
 * QNAP:     `/share/cp_1/02_files_refrenced/<user>/02_files_zip`
 * Business code uses only the container/runtime root — never host paths.
 */

import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentRepoGuid, getCurrentUsername } from "./repo-context.js";
import {
  assertSafeContactPhotoPath,
  assertSafeUsername,
  buildContactPhotoFileName,
  ContactPhotoError,
  getContactPhotosRootDir,
} from "./google-contact-photos.js";
import { assertValidLeadLoca } from "./lead-photos.js";

/** Match audio-recordings order of magnitude — WhatsApp exports with media. */
export const LEAD_ARCHIVE_MAX_BYTES = 50 * 1024 * 1024;
export const LEAD_ARCHIVE_MAX_FILES_PER_REQUEST = 5;

export type LeadArchiveFileType = "zip" | "rar";

export class LeadArchiveError extends Error {
  constructor(
    public readonly code:
      | "NOT_CONFIGURED"
      | "INVALID_TYPE"
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

function resolveArchivesDir(username: string, rootDirectory?: string): { username: string; dir: string } {
  try {
    const safeUsername = assertSafeUsername(username);
    return { username: safeUsername, dir: getUserLeadArchivesDir(safeUsername, rootDirectory) };
  } catch (error) {
    if (error instanceof LeadArchiveError) throw error;
    if (error instanceof ContactPhotoError) {
      if (error.code === "NOT_CONFIGURED") {
        throw new LeadArchiveError("NOT_CONFIGURED", "Archives directory is not configured");
      }
      throw new LeadArchiveError("INVALID_USERNAME", "Invalid username");
    }
    throw error;
  }
}

/**
 * Detect ZIP / RAR from magic bytes. Extension alone is never enough.
 * ZIP: local file header / empty archive / spanned.
 * RAR: "Rar!\x1a\x07" (v4 and v5).
 */
export function detectArchiveTypeFromBytes(bytes: Uint8Array): LeadArchiveFileType | null {
  if (!bytes || bytes.byteLength < 4) return null;
  // ZIP
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    if (
      (bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08)
    ) {
      return "zip";
    }
  }
  // RAR
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
  leadLoca: string;
  /** File name on disk relative to the user's archives dir — never a host path. */
  storageKey: string;
  originalFileName: string;
  fileType: LeadArchiveFileType;
  sizeBytes: number;
  createdAt: string;
}

function metadataPathForId(id: string, dir: string): string {
  return assertSafeContactPhotoPath(dir, `${assertValidLeadArchiveId(id)}.json`);
}

function parseMetadata(raw: string): LeadArchiveMetadata | null {
  try {
    const parsed = JSON.parse(raw) as Partial<LeadArchiveMetadata>;
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

export interface SaveLeadArchiveInput {
  bytes: Uint8Array;
  originalFileName: string;
  leadLoca: string;
  /** Declared extension hint (optional); magic bytes are authoritative. */
  declaredExt?: string;
  rootDirectory?: string;
  repoGuid?: string;
  username?: string;
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

  let leadLoca: string;
  try {
    leadLoca = assertValidLeadLoca(input.leadLoca);
  } catch {
    throw new LeadArchiveError("INVALID_LEAD_LOCA", "Invalid lead loca");
  }

  const repoGuid = input.repoGuid ?? getCurrentRepoGuid();
  const { username, dir } = resolveArchivesDir(input.username ?? getCurrentUsername(), input.rootDirectory);

  const ext = resolveArchiveExtension(detected);
  const fileName = buildContactPhotoFileName(ext);
  const fullPath = assertSafeContactPhotoPath(dir, fileName);
  const createdAt = new Date().toISOString();
  const metadata: LeadArchiveMetadata = {
    id: fileName,
    repoGuid,
    ownerUsername: username,
    leadLoca,
    storageKey: fileName,
    originalFileName: sanitizeOriginalFileName(input.originalFileName),
    fileType: detected,
    sizeBytes: input.bytes.byteLength,
    createdAt,
  };
  const metadataPath = metadataPathForId(metadata.id, dir);

  try {
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, input.bytes, { flag: "wx" });
  } catch {
    throw new LeadArchiveError("WRITE_FAILED", "Could not save archive");
  }
  try {
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2), { flag: "wx" });
  } catch {
    await rm(fullPath, { force: true }).catch(() => {});
    throw new LeadArchiveError("WRITE_FAILED", "Could not save archive metadata");
  }

  return metadata;
}

async function readAllOwnedMetadata(dir: string, repoGuid: string): Promise<LeadArchiveMetadata[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    console.error("[lead-archives] readAllOwnedMetadata failed:", error instanceof Error ? error.message : error);
    throw new LeadArchiveError("WRITE_FAILED", "Could not list archives");
  }
  const parsed = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        try {
          return parseMetadata(await readFile(assertSafeContactPhotoPath(dir, entry.name), "utf8"));
        } catch {
          return null;
        }
      }),
  );
  const owned = await Promise.all(
    parsed.map(async (metadata) => {
      if (!metadata || metadata.repoGuid !== repoGuid) return null;
      try {
        const st = await stat(assertSafeContactPhotoPath(dir, metadata.storageKey));
        if (!st.isFile()) return null;
      } catch {
        return null;
      }
      return metadata;
    }),
  );
  return owned.filter((m): m is LeadArchiveMetadata => m !== null);
}

export async function listLeadArchives(
  leadLoca: string,
  options?: { rootDirectory?: string; repoGuid?: string; username?: string },
): Promise<LeadArchiveMetadata[]> {
  let loca: string;
  try {
    loca = assertValidLeadLoca(leadLoca);
  } catch {
    throw new LeadArchiveError("INVALID_LEAD_LOCA", "Invalid lead loca");
  }
  const repoGuid = options?.repoGuid ?? getCurrentRepoGuid();
  const { dir } = resolveArchivesDir(options?.username ?? getCurrentUsername(), options?.rootDirectory);
  const all = await readAllOwnedMetadata(dir, repoGuid);
  return all.filter((m) => m.leadLoca === loca).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** One directory scan → `{ [leadLoca]: count }` (only locas with count > 0). */
export async function listLeadArchiveCounts(options?: {
  rootDirectory?: string;
  repoGuid?: string;
  username?: string;
}): Promise<Record<string, number>> {
  const repoGuid = options?.repoGuid ?? getCurrentRepoGuid();
  const { dir } = resolveArchivesDir(options?.username ?? getCurrentUsername(), options?.rootDirectory);
  const all = await readAllOwnedMetadata(dir, repoGuid);
  const counts: Record<string, number> = {};
  for (const m of all) {
    counts[m.leadLoca] = (counts[m.leadLoca] ?? 0) + 1;
  }
  return counts;
}

export async function deleteLeadArchive(
  id: string,
  options?: { rootDirectory?: string; repoGuid?: string; username?: string },
): Promise<void> {
  const safeId = assertValidLeadArchiveId(id);
  const repoGuid = options?.repoGuid ?? getCurrentRepoGuid();
  const { dir } = resolveArchivesDir(options?.username ?? getCurrentUsername(), options?.rootDirectory);
  const metadataPath = metadataPathForId(safeId, dir);

  let metadata: LeadArchiveMetadata | null;
  try {
    metadata = parseMetadata(await readFile(metadataPath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      throw new LeadArchiveError("NOT_FOUND", "Archive not found");
    }
    throw new LeadArchiveError("WRITE_FAILED", "Could not read archive metadata");
  }
  if (!metadata || metadata.repoGuid !== repoGuid) {
    throw new LeadArchiveError("NOT_FOUND", "Archive not found");
  }

  const filePath = assertSafeContactPhotoPath(dir, metadata.storageKey);
  try {
    await rm(filePath, { force: false });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      throw new LeadArchiveError("WRITE_FAILED", "Could not delete archive file");
    }
  }
  try {
    await rm(metadataPath, { force: false });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.error("[lead-archives] orphan metadata after file delete:", safeId);
      throw new LeadArchiveError("WRITE_FAILED", "Archive file deleted but metadata cleanup failed");
    }
  }
}
