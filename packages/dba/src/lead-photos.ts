/**
 * Lead Details → per-lead CHAD-local photos (Story 111).
 *
 * Canonical path:
 *   `<root>/<user>/01_files_photos/lead-info/<lead-name>/<lead-name>[__N].<ext>`
 * Metadata: PostgreSQL `cp_referenced_files` via file-storage (no new sidecars).
 * Legacy flat `01_files_photos/*.json` sidecars remain readable until migrated.
 */

import { readFile, readdir, rm, stat } from "node:fs/promises";
import { getCurrentRepoGuid, getCurrentUsername } from "./repo-context.js";
import {
  assertSafeContactPhotoPath,
  assertSafeUsername,
  CONTACT_PHOTO_MAX_BYTES,
  ContactPhotoError,
  detectImageMimeFromBytes,
  getUserContactPhotosDir,
  resolveContactPhotoExtension,
} from "./google-contact-photos.js";
import { FILE_STORAGE_FEATURES } from "./file-storage/features.js";
import {
  createFilesystemFileStorage,
  FileStorageError,
} from "./file-storage/filesystem-provider.js";
import type { ReferencedFileMetadataStore } from "./file-storage/metadata-store.js";
import type { ReferencedFileMetadata } from "./file-storage/contracts.js";

export const LEAD_PHOTO_MAX_BYTES = CONTACT_PHOTO_MAX_BYTES;
export const LEAD_PHOTO_MAX_FILES_PER_REQUEST = 10;

export class LeadPhotoError extends Error {
  constructor(
    public readonly code:
      | "NOT_CONFIGURED"
      | "INVALID_MIME"
      | "INVALID_LEAD_LOCA"
      | "INVALID_LEAD"
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

function mimeFamily(mime: string): string {
  return mime === "image/jpg" ? "image/jpeg" : mime;
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

/** Public DTO kept for API compatibility (id is stable file UUID for new rows). */
export interface LeadPhotoMetadata {
  id: string;
  repoGuid: string;
  ownerUsername: string;
  leadLoca: string;
  leadUuid?: string;
  storageKey: string;
  fileName?: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

function fromReferenced(
  row: ReferencedFileMetadata,
  leadLoca: string,
): LeadPhotoMetadata {
  return {
    id: row.id,
    repoGuid: row.repoGuid,
    ownerUsername: row.ownerUsername,
    leadLoca,
    leadUuid: row.entityId,
    storageKey: row.fileName,
    fileName: row.fileName,
    originalFileName: row.originalFileName || row.fileName,
    mimeType: row.mimeType || "application/octet-stream",
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
  };
}

function mapFsError(error: unknown): never {
  if (error instanceof FileStorageError) {
    const code =
      error.code === "NOT_CONFIGURED"
        ? "NOT_CONFIGURED"
        : error.code === "EMPTY"
          ? "EMPTY"
          : error.code === "TOO_LARGE"
            ? "TOO_LARGE"
            : error.code === "NOT_FOUND"
              ? "NOT_FOUND"
              : "WRITE_FAILED";
    throw new LeadPhotoError(code, error.message);
  }
  throw error;
}

export interface SaveLeadPhotoInput {
  bytes: Uint8Array;
  mimeType: string;
  originalFileName: string;
  /** Stable CP item id — preferred relation key (Story 111). */
  leadUuid: string;
  leadName: string;
  /** Kept for legacy listing merge / migration mapping. */
  leadLoca: string;
  rootDirectory?: string;
  repoGuid?: string;
  username?: string;
  metadataStore?: ReferencedFileMetadataStore;
}

export async function saveLeadPhoto(input: SaveLeadPhotoInput): Promise<LeadPhotoMetadata> {
  const mimeType = input.mimeType.trim().toLowerCase();
  const ext = resolveContactPhotoExtension(mimeType);
  if (!ext) throw new LeadPhotoError("INVALID_MIME", "Unsupported image type");
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
  const leadUuid = input.leadUuid?.trim();
  if (!leadUuid) throw new LeadPhotoError("INVALID_LEAD", "leadUuid is required");
  const leadName = input.leadName?.trim() || "lead";
  const repoGuid = input.repoGuid ?? getCurrentRepoGuid();
  let username: string;
  try {
    username = assertSafeUsername(input.username ?? getCurrentUsername());
  } catch {
    throw new LeadPhotoError("INVALID_USERNAME", "Invalid username");
  }

  const storage = createFilesystemFileStorage(
    input.metadataStore ? { metadataStore: input.metadataStore } : undefined,
  );

  try {
    const saved = await storage.putFile({
      bytes: input.bytes,
      repoGuid,
      ownerUsername: username,
      feature: FILE_STORAGE_FEATURES.PHOTOS_LEAD_INFO,
      entityType: "lead",
      entityId: leadUuid,
      entityNameSnapshot: leadName,
      preferredFileNameStem: leadName,
      ext,
      mimeType,
      originalFileName: sanitizeOriginalFileName(input.originalFileName),
      rootDirectory: input.rootDirectory,
      extraMetadata: { leadLoca },
    });
    return fromReferenced(saved, leadLoca);
  } catch (error) {
    mapFsError(error);
  }
}

/** Legacy sidecar shape (Story 106). */
interface LegacySidecar {
  id: string;
  repoGuid: string;
  ownerUsername: string;
  leadLoca: string;
  storageKey: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

function parseLegacy(raw: string): LegacySidecar | null {
  try {
    const p = JSON.parse(raw) as Partial<LegacySidecar>;
    if (
      !p ||
      typeof p.id !== "string" ||
      typeof p.repoGuid !== "string" ||
      typeof p.ownerUsername !== "string" ||
      typeof p.leadLoca !== "string" ||
      typeof p.storageKey !== "string" ||
      typeof p.originalFileName !== "string" ||
      typeof p.mimeType !== "string" ||
      typeof p.sizeBytes !== "number" ||
      typeof p.createdAt !== "string"
    ) {
      return null;
    }
    return p as LegacySidecar;
  } catch {
    return null;
  }
}

async function listLegacyByLoca(
  leadLoca: string,
  repoGuid: string,
  username: string,
  rootDirectory?: string,
): Promise<LeadPhotoMetadata[]> {
  let dir: string;
  try {
    dir = getUserContactPhotosDir(username, rootDirectory);
  } catch (error) {
    if (error instanceof ContactPhotoError && error.code === "NOT_CONFIGURED") {
      throw new LeadPhotoError("NOT_CONFIGURED", "Photos directory is not configured");
    }
    return [];
  }
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    return [];
  }
  const out: LeadPhotoMetadata[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const legacy = parseLegacy(await readFile(assertSafeContactPhotoPath(dir, entry.name), "utf8"));
      if (!legacy || legacy.repoGuid !== repoGuid || legacy.leadLoca !== leadLoca) continue;
      try {
        await stat(assertSafeContactPhotoPath(dir, legacy.storageKey));
      } catch {
        continue;
      }
      out.push({
        id: legacy.id,
        repoGuid: legacy.repoGuid,
        ownerUsername: legacy.ownerUsername,
        leadLoca: legacy.leadLoca,
        storageKey: legacy.storageKey,
        fileName: legacy.storageKey,
        originalFileName: legacy.originalFileName,
        mimeType: legacy.mimeType,
        sizeBytes: legacy.sizeBytes,
        createdAt: legacy.createdAt,
      });
    } catch {
      /* skip */
    }
  }
  return out;
}

export async function listLeadPhotos(
  leadLoca: string,
  options?: {
    rootDirectory?: string;
    repoGuid?: string;
    username?: string;
    leadUuid?: string;
    metadataStore?: ReferencedFileMetadataStore;
  },
): Promise<LeadPhotoMetadata[]> {
  const loca = assertValidLeadLoca(leadLoca);
  const repoGuid = options?.repoGuid ?? getCurrentRepoGuid();
  let username: string;
  try {
    username = assertSafeUsername(options?.username ?? getCurrentUsername());
  } catch {
    throw new LeadPhotoError("INVALID_USERNAME", "Invalid username");
  }

  const byId = new Map<string, LeadPhotoMetadata>();

  const storage = createFilesystemFileStorage(
    options?.metadataStore ? { metadataStore: options.metadataStore } : undefined,
  );
  // Modern rows use leadUuid as entity_id; Story 111 migrator may temporarily
  // store leadLoca as entity_id until a UUID backfill runs.
  const entityKeys = [options?.leadUuid, loca].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  for (const entityId of entityKeys) {
    const rows = await storage.listFiles({
      repoGuid,
      ownerUsername: username,
      feature: FILE_STORAGE_FEATURES.PHOTOS_LEAD_INFO,
      entityId,
      rootDirectory: options?.rootDirectory,
    });
    for (const row of rows) byId.set(row.id, fromReferenced(row, loca));
  }

  for (const legacy of await listLegacyByLoca(loca, repoGuid, username, options?.rootDirectory)) {
    if (!byId.has(legacy.id)) byId.set(legacy.id, legacy);
  }

  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface LeadPhotoReadInfo extends LeadPhotoMetadata {
  filePath: string;
}

export async function getLeadPhotoReadInfo(
  id: string,
  options?: {
    rootDirectory?: string;
    repoGuid?: string;
    username?: string;
    metadataStore?: ReferencedFileMetadataStore;
  },
): Promise<LeadPhotoReadInfo | null> {
  const safeId = assertValidLeadPhotoId(id);
  const repoGuid = options?.repoGuid ?? getCurrentRepoGuid();
  const storage = createFilesystemFileStorage(
    options?.metadataStore ? { metadataStore: options.metadataStore } : undefined,
  );

  const modern = await storage.getFile(safeId, repoGuid, { rootDirectory: options?.rootDirectory });
  if (modern) {
    const leadLoca =
      typeof modern.metadata?.leadLoca === "string" ? modern.metadata.leadLoca : "";
    return { ...fromReferenced(modern, leadLoca), filePath: modern.filePath };
  }

  // Legacy sidecar
  let username: string;
  try {
    username = assertSafeUsername(options?.username ?? getCurrentUsername());
  } catch {
    return null;
  }
  try {
    const dir = getUserContactPhotosDir(username, options?.rootDirectory);
    const legacy = parseLegacy(
      await readFile(assertSafeContactPhotoPath(dir, `${safeId}.json`), "utf8"),
    );
    if (!legacy || legacy.repoGuid !== repoGuid) return null;
    const filePath = assertSafeContactPhotoPath(dir, legacy.storageKey);
    const st = await stat(filePath);
    if (!st.isFile()) return null;
    return {
      id: legacy.id,
      repoGuid: legacy.repoGuid,
      ownerUsername: legacy.ownerUsername,
      leadLoca: legacy.leadLoca,
      storageKey: legacy.storageKey,
      fileName: legacy.storageKey,
      originalFileName: legacy.originalFileName,
      mimeType: legacy.mimeType,
      sizeBytes: st.size,
      createdAt: legacy.createdAt,
      filePath,
    };
  } catch {
    return null;
  }
}

export async function deleteLeadPhoto(
  id: string,
  options?: {
    rootDirectory?: string;
    repoGuid?: string;
    username?: string;
    metadataStore?: ReferencedFileMetadataStore;
  },
): Promise<void> {
  const safeId = assertValidLeadPhotoId(id);
  const repoGuid = options?.repoGuid ?? getCurrentRepoGuid();
  const storage = createFilesystemFileStorage(
    options?.metadataStore ? { metadataStore: options.metadataStore } : undefined,
  );

  try {
    await storage.deleteFile(safeId, repoGuid, { rootDirectory: options?.rootDirectory });
    return;
  } catch (error) {
    if (!(error instanceof FileStorageError) || error.code !== "NOT_FOUND") {
      mapFsError(error);
    }
  }

  // Legacy delete
  let username: string;
  try {
    username = assertSafeUsername(options?.username ?? getCurrentUsername());
  } catch {
    throw new LeadPhotoError("INVALID_USERNAME", "Invalid username");
  }
  const dir = getUserContactPhotosDir(username, options?.rootDirectory);
  let legacy: LegacySidecar | null;
  try {
    legacy = parseLegacy(
      await readFile(assertSafeContactPhotoPath(dir, `${safeId}.json`), "utf8"),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      throw new LeadPhotoError("NOT_FOUND", "Photo not found");
    }
    throw new LeadPhotoError("WRITE_FAILED", "Could not read photo metadata");
  }
  if (!legacy || legacy.repoGuid !== repoGuid) {
    throw new LeadPhotoError("NOT_FOUND", "Photo not found");
  }
  try {
    await rm(assertSafeContactPhotoPath(dir, legacy.storageKey), { force: false });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      throw new LeadPhotoError("WRITE_FAILED", "Could not delete photo file");
    }
  }
  try {
    await rm(assertSafeContactPhotoPath(dir, `${safeId}.json`), { force: false });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      throw new LeadPhotoError("WRITE_FAILED", "Photo file deleted but metadata cleanup failed");
    }
  }
}
