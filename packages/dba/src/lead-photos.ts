/**
 * Lead Details → per-lead CHAD-local photos.
 *
 * Same physical storage as `google-contact-photos.ts` (this user's own
 * `<username>/01_files_photos/` tree on the `cp_1` volume, sidecar JSON
 * metadata, magic-byte-validated JPEG/PNG/WebP) — reuses that module's
 * generic byte/path/username primitives rather than duplicating them.
 * The only real difference is the stable id: a lead's `loca` (its numeric
 * Content Provider path, e.g. `03/06/81` — see `leads.ts`'s own doc
 * comments), never the lead's display name, which can be renamed.
 *
 * This is a genuinely separate attachment point from Google Contacts
 * photos, not a rename of it — a lead and a linked Google Contact are
 * different entities (Links V2 already models them as separate, a lead can
 * have zero or many linked Google Contacts). Both coexist in the same
 * directory; each module's own metadata shape (`leadLoca` vs
 * `contactResourceName`) is what a scan uses to tell them apart, so
 * neither module needs to know the other exists.
 */

import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { getCurrentRepoGuid, getCurrentUsername } from "./repo-context.js";
import {
  assertSafeContactPhotoPath,
  assertSafeUsername,
  buildContactPhotoFileName,
  CONTACT_PHOTO_MAX_BYTES,
  ContactPhotoError,
  detectImageMimeFromBytes,
  getUserContactPhotosDir,
  resolveContactPhotoExtension,
} from "./google-contact-photos.js";

export const LEAD_PHOTO_MAX_BYTES = CONTACT_PHOTO_MAX_BYTES;
export const LEAD_PHOTO_MAX_FILES_PER_REQUEST = 10;

export class LeadPhotoError extends Error {
  constructor(
    public readonly code:
      | "NOT_CONFIGURED"
      | "INVALID_MIME"
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
    this.name = "LeadPhotoError";
  }
}

/** A lead's `loca` is a slash-separated numeric Content Provider path (e.g. `03/06/81`) — never a display name. */
const LEAD_LOCA_PATTERN = /^[0-9]+(\/[0-9]+)*$/;

export function assertValidLeadLoca(loca: string): string {
  const trimmed = loca.trim();
  if (!trimmed || !LEAD_LOCA_PATTERN.test(trimmed)) {
    throw new LeadPhotoError("INVALID_LEAD_LOCA", "Invalid lead loca");
  }
  return trimmed;
}

const LEAD_PHOTO_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export function assertValidLeadPhotoId(id: string): string {
  const trimmed = id.trim();
  if (
    !trimmed ||
    !LEAD_PHOTO_ID_PATTERN.test(trimmed) ||
    trimmed.includes("..") ||
    trimmed.includes("/") ||
    trimmed.includes("\\")
  ) {
    throw new LeadPhotoError("INVALID_ID", "Invalid photo id");
  }
  return trimmed;
}

function metadataPathForId(id: string, dir: string): string {
  return assertSafeContactPhotoPath(dir, `${assertValidLeadPhotoId(id)}.json`);
}

function mimeFamily(mime: string): string {
  return mime === "image/jpg" ? "image/jpeg" : mime;
}

export interface LeadPhotoMetadata {
  id: string;
  repoGuid: string;
  ownerUsername: string;
  leadLoca: string;
  /** File name on disk, relative to the user's photos dir — never exposed as a client-facing path. */
  storageKey: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

function parseMetadata(raw: string): LeadPhotoMetadata | null {
  try {
    const parsed = JSON.parse(raw) as Partial<LeadPhotoMetadata>;
    if (
      !parsed ||
      typeof parsed.id !== "string" ||
      typeof parsed.repoGuid !== "string" ||
      typeof parsed.ownerUsername !== "string" ||
      typeof parsed.leadLoca !== "string" ||
      typeof parsed.storageKey !== "string" ||
      typeof parsed.originalFileName !== "string" ||
      typeof parsed.mimeType !== "string" ||
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
      mimeType: parsed.mimeType,
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
  const base = name.split(/[\\/]/).pop() || "photo";
  const trimmed = stripControlChars(base).trim();
  const safe = trimmed.length > 0 ? trimmed : "photo";
  return safe.length > 180 ? safe.slice(0, 180) : safe;
}

export interface SaveLeadPhotoInput {
  bytes: Uint8Array;
  mimeType: string;
  originalFileName: string;
  leadLoca: string;
  /** Root override for tests/scripts — never from client request. */
  rootDirectory?: string;
  /** Repo/username overrides for tests/scripts — never from client request. */
  repoGuid?: string;
  username?: string;
}

export async function saveLeadPhoto(input: SaveLeadPhotoInput): Promise<LeadPhotoMetadata> {
  const mimeType = input.mimeType.trim().toLowerCase();
  const ext = resolveContactPhotoExtension(mimeType);
  if (!ext) {
    throw new LeadPhotoError("INVALID_MIME", "Unsupported image type");
  }
  if (!input.bytes || input.bytes.byteLength === 0) {
    throw new LeadPhotoError("EMPTY", "Photo is empty");
  }
  if (input.bytes.byteLength > LEAD_PHOTO_MAX_BYTES) {
    throw new LeadPhotoError("TOO_LARGE", "Photo exceeds size limit");
  }
  const detectedMime = detectImageMimeFromBytes(input.bytes);
  if (!detectedMime || mimeFamily(detectedMime) !== mimeFamily(mimeType)) {
    throw new LeadPhotoError("INVALID_MIME", "File content does not match declared image type");
  }

  const leadLoca = assertValidLeadLoca(input.leadLoca);
  const repoGuid = input.repoGuid ?? getCurrentRepoGuid();
  const { username, dir } = resolvePhotosDir(input.username ?? getCurrentUsername(), input.rootDirectory);

  const fileName = buildContactPhotoFileName(ext);
  const fullPath = assertSafeContactPhotoPath(dir, fileName);
  const createdAt = new Date().toISOString();
  const metadata: LeadPhotoMetadata = {
    id: fileName,
    repoGuid,
    ownerUsername: username,
    leadLoca,
    storageKey: fileName,
    originalFileName: sanitizeOriginalFileName(input.originalFileName),
    mimeType,
    sizeBytes: input.bytes.byteLength,
    createdAt,
  };
  const metadataPath = metadataPathForId(metadata.id, dir);

  try {
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, input.bytes, { flag: "wx" });
  } catch {
    throw new LeadPhotoError("WRITE_FAILED", "Could not save photo");
  }
  try {
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2), { flag: "wx" });
  } catch {
    await rm(fullPath, { force: true }).catch(() => {});
    throw new LeadPhotoError("WRITE_FAILED", "Could not save photo metadata");
  }

  return metadata;
}

/** Resolves + validates the per-user photos dir, translating the shared module's `ContactPhotoError` into this module's own error type. */
function resolvePhotosDir(username: string, rootDirectory?: string): { username: string; dir: string } {
  try {
    const safeUsername = assertSafeUsername(username);
    return { username: safeUsername, dir: getUserContactPhotosDir(safeUsername, rootDirectory) };
  } catch (error) {
    if (error instanceof ContactPhotoError) {
      if (error.code === "NOT_CONFIGURED") {
        throw new LeadPhotoError("NOT_CONFIGURED", "Photos directory is not configured");
      }
      throw new LeadPhotoError("INVALID_USERNAME", "Invalid username");
    }
    throw error;
  }
}

async function readAllOwnedMetadata(dir: string, repoGuid: string): Promise<LeadPhotoMetadata[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    console.error("[lead-photos] readAllOwnedMetadata failed:", error instanceof Error ? error.message : error);
    throw new LeadPhotoError("WRITE_FAILED", "Could not list photos");
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
  return owned.filter((m): m is LeadPhotoMetadata => m !== null);
}

export async function listLeadPhotos(
  leadLoca: string,
  options?: { rootDirectory?: string; repoGuid?: string; username?: string },
): Promise<LeadPhotoMetadata[]> {
  const loca = assertValidLeadLoca(leadLoca);
  const repoGuid = options?.repoGuid ?? getCurrentRepoGuid();
  const { dir } = resolvePhotosDir(options?.username ?? getCurrentUsername(), options?.rootDirectory);
  const all = await readAllOwnedMetadata(dir, repoGuid);
  return all.filter((m) => m.leadLoca === loca).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface LeadPhotoReadInfo extends LeadPhotoMetadata {
  filePath: string;
}

export async function getLeadPhotoReadInfo(
  id: string,
  options?: { rootDirectory?: string; repoGuid?: string; username?: string },
): Promise<LeadPhotoReadInfo | null> {
  const safeId = assertValidLeadPhotoId(id);
  const repoGuid = options?.repoGuid ?? getCurrentRepoGuid();
  const { dir } = resolvePhotosDir(options?.username ?? getCurrentUsername(), options?.rootDirectory);
  const metadataPath = metadataPathForId(safeId, dir);
  try {
    const metadata = parseMetadata(await readFile(metadataPath, "utf8"));
    if (!metadata) return null;
    if (metadata.repoGuid !== repoGuid) return null;
    const filePath = assertSafeContactPhotoPath(dir, metadata.storageKey);
    const st = await stat(filePath);
    if (!st.isFile()) return null;
    return { ...metadata, filePath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    if (error instanceof LeadPhotoError && error.code === "INVALID_ID") throw error;
    throw new LeadPhotoError("WRITE_FAILED", "Could not read photo");
  }
}

export async function deleteLeadPhoto(
  id: string,
  options?: { rootDirectory?: string; repoGuid?: string; username?: string },
): Promise<void> {
  const safeId = assertValidLeadPhotoId(id);
  const repoGuid = options?.repoGuid ?? getCurrentRepoGuid();
  const { dir } = resolvePhotosDir(options?.username ?? getCurrentUsername(), options?.rootDirectory);
  const metadataPath = metadataPathForId(safeId, dir);

  let metadata: LeadPhotoMetadata | null;
  try {
    metadata = parseMetadata(await readFile(metadataPath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      throw new LeadPhotoError("NOT_FOUND", "Photo not found");
    }
    throw new LeadPhotoError("WRITE_FAILED", "Could not read photo metadata");
  }
  if (!metadata || metadata.repoGuid !== repoGuid) {
    throw new LeadPhotoError("NOT_FOUND", "Photo not found");
  }

  const filePath = assertSafeContactPhotoPath(dir, metadata.storageKey);
  try {
    await rm(filePath, { force: false });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      throw new LeadPhotoError("WRITE_FAILED", "Could not delete photo file");
    }
  }
  try {
    await rm(metadataPath, { force: false });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.error("[lead-photos] orphan metadata after file delete:", safeId);
      throw new LeadPhotoError("WRITE_FAILED", "Photo file deleted but metadata cleanup failed");
    }
  }
}
