/**
 * Google Contacts → per-contact CHAD-local photos.
 *
 * NOT a change to the contact's Google profile photo and NOT a People API
 * write — these are local files CHAD associates with a stable Google
 * contact id (`resourceName`, e.g. `people/c1234567890`). Modeled on
 * `audio-recordings.ts` (files + sidecar JSON metadata, no Content
 * Provider involved) but, unlike audio, isolation is at the directory
 * level: each CHAD user gets their own `<username>/01_files_photos/`
 * subtree, not a shared flat directory filtered by `repoGuid` alone — the
 * sidecar `repoGuid` check below is still enforced on every read/list/
 * delete as defense in depth on top of that directory split.
 *
 * Host Mac root target: `/Volumes/cp_1/02_files_refrenced/<username>/01_files_photos/`
 * (spelling `refrenced` is intentional — do not "fix", see audio-recordings.ts
 * for the same note about the sibling `10_files_audio` tree).
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentRepoGuid, getCurrentUsername } from "./repo-context.js";

export const CONTACT_PHOTO_MAX_BYTES = 8 * 1024 * 1024; // 8 MiB per photo
export const CONTACT_PHOTO_MAX_FILES_PER_REQUEST = 10;

/** Only these are accepted — checked against both declared MIME and magic bytes. */
export const CONTACT_PHOTO_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export class ContactPhotoError extends Error {
  constructor(
    public readonly code:
      | "NOT_CONFIGURED"
      | "INVALID_MIME"
      | "INVALID_CONTACT_ID"
      | "INVALID_ID"
      | "INVALID_USERNAME"
      | "EMPTY"
      | "TOO_LARGE"
      | "WRITE_FAILED"
      | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "ContactPhotoError";
  }
}

export function getContactPhotosRootDir(): string {
  const dir = process.env.CHAD_CONTACT_PHOTOS_DIR?.trim();
  if (!dir) {
    throw new ContactPhotoError("NOT_CONFIGURED", "Contact photos directory is not configured");
  }
  return path.resolve(dir);
}

const USERNAME_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Defense in depth: username always comes from the server-side repo context, never a request, but is still validated before touching the filesystem. */
export function assertSafeUsername(username: string): string {
  const trimmed = username.trim();
  if (!trimmed || !USERNAME_PATTERN.test(trimmed) || trimmed.includes("..")) {
    throw new ContactPhotoError("INVALID_USERNAME", "Invalid username");
  }
  return trimmed;
}

export function assertSafeContactPhotoPath(dir: string, fileName: string): string {
  const resolvedDir = path.resolve(dir);
  const full = path.resolve(resolvedDir, fileName);
  if (full !== resolvedDir && !full.startsWith(resolvedDir + path.sep)) {
    throw new ContactPhotoError("WRITE_FAILED", "Invalid photo path");
  }
  if (path.basename(fileName) !== fileName || fileName.includes("..")) {
    throw new ContactPhotoError("WRITE_FAILED", "Invalid photo name");
  }
  return full;
}

/** `<root>/<username>/01_files_photos` — the exact tree the feature spec requires. */
export function getUserContactPhotosDir(username: string, rootDirectory?: string): string {
  const root = rootDirectory ? path.resolve(rootDirectory) : getContactPhotosRootDir();
  const safeUsername = assertSafeUsername(username);
  const userDir = assertSafeContactPhotoPath(root, safeUsername);
  return assertSafeContactPhotoPath(userDir, "01_files_photos");
}

const GOOGLE_CONTACT_RESOURCE_NAME_PATTERN = /^people\/[A-Za-z0-9_-]+$/;

export function assertValidGoogleContactResourceName(resourceName: string): string {
  const trimmed = resourceName.trim();
  if (!trimmed || !GOOGLE_CONTACT_RESOURCE_NAME_PATTERN.test(trimmed)) {
    throw new ContactPhotoError("INVALID_CONTACT_ID", "Invalid Google contact id");
  }
  return trimmed;
}

/** Sniffs the real file type from bytes — never trust the declared MIME/extension alone. */
export function detectImageMimeFromBytes(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function mimeFamily(mime: string): string {
  return mime === "image/jpg" ? "image/jpeg" : mime;
}

export function resolveContactPhotoExtension(mimeType: string): string | null {
  const raw = mimeType.trim().toLowerCase();
  return CONTACT_PHOTO_MIME_TO_EXT[raw] ?? null;
}

/** `YYYY-MM-DD_HH-mm-ss_<uuid>.<ext>` — collision-resistant; never from client. */
export function buildContactPhotoFileName(ext: string, now: Date = new Date()): string {
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `${y}-${mo}-${d}_${h}-${mi}-${s}_${randomUUID()}.${safeExt}`;
}

const CONTACT_PHOTO_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export function assertValidContactPhotoId(id: string): string {
  const trimmed = id.trim();
  if (
    !trimmed ||
    !CONTACT_PHOTO_ID_PATTERN.test(trimmed) ||
    trimmed.includes("..") ||
    trimmed.includes("/") ||
    trimmed.includes("\\")
  ) {
    throw new ContactPhotoError("INVALID_ID", "Invalid photo id");
  }
  return trimmed;
}

function metadataPathForId(id: string, dir: string): string {
  return assertSafeContactPhotoPath(dir, `${assertValidContactPhotoId(id)}.json`);
}

export interface ContactPhotoMetadata {
  id: string;
  repoGuid: string;
  ownerUsername: string;
  contactResourceName: string;
  /** File name on disk, relative to the user's photos dir — never exposed as a client-facing path. */
  storageKey: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

function parseMetadata(raw: string): ContactPhotoMetadata | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ContactPhotoMetadata>;
    if (
      !parsed ||
      typeof parsed.id !== "string" ||
      typeof parsed.repoGuid !== "string" ||
      typeof parsed.ownerUsername !== "string" ||
      typeof parsed.contactResourceName !== "string" ||
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
      contactResourceName: parsed.contactResourceName,
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

/** Strips control characters (incl. NUL) without touching normal punctuation like spaces/dashes. */
function stripControlChars(value: string): string {
  let result = "";
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 32 && code !== 127) {
      result += value[i];
    } else {
      result += " ";
    }
  }
  return result;
}

function sanitizeOriginalFileName(name: string): string {
  const base = path.basename(name || "photo");
  const trimmed = stripControlChars(base).trim();
  const safe = trimmed.length > 0 ? trimmed : "photo";
  return safe.length > 180 ? safe.slice(0, 180) : safe;
}

export interface SaveContactPhotoInput {
  bytes: Uint8Array;
  mimeType: string;
  originalFileName: string;
  contactResourceName: string;
  /** Root override for tests/scripts — never from client request. */
  rootDirectory?: string;
  /** Repo/username overrides for tests/scripts — never from client request. */
  repoGuid?: string;
  username?: string;
}

export async function saveContactPhoto(input: SaveContactPhotoInput): Promise<ContactPhotoMetadata> {
  const mimeType = input.mimeType.trim().toLowerCase();
  const ext = resolveContactPhotoExtension(mimeType);
  if (!ext) {
    throw new ContactPhotoError("INVALID_MIME", "Unsupported image type");
  }
  if (!input.bytes || input.bytes.byteLength === 0) {
    throw new ContactPhotoError("EMPTY", "Photo is empty");
  }
  if (input.bytes.byteLength > CONTACT_PHOTO_MAX_BYTES) {
    throw new ContactPhotoError("TOO_LARGE", "Photo exceeds size limit");
  }
  const detectedMime = detectImageMimeFromBytes(input.bytes);
  if (!detectedMime || mimeFamily(detectedMime) !== mimeFamily(mimeType)) {
    throw new ContactPhotoError("INVALID_MIME", "File content does not match declared image type");
  }

  const contactResourceName = assertValidGoogleContactResourceName(input.contactResourceName);
  const repoGuid = input.repoGuid ?? getCurrentRepoGuid();
  const username = assertSafeUsername(input.username ?? getCurrentUsername());
  const dir = getUserContactPhotosDir(username, input.rootDirectory);

  const fileName = buildContactPhotoFileName(ext);
  const fullPath = assertSafeContactPhotoPath(dir, fileName);
  const createdAt = new Date().toISOString();
  const metadata: ContactPhotoMetadata = {
    id: fileName,
    repoGuid,
    ownerUsername: username,
    contactResourceName,
    storageKey: fileName,
    originalFileName: sanitizeOriginalFileName(input.originalFileName),
    mimeType,
    sizeBytes: input.bytes.byteLength,
    createdAt,
  };
  const metadataPath = metadataPathForId(metadata.id, dir);

  try {
    await mkdir(dir, { recursive: true });
    // wx: fail if exists — never overwrite.
    await writeFile(fullPath, input.bytes, { flag: "wx" });
  } catch {
    throw new ContactPhotoError("WRITE_FAILED", "Could not save photo");
  }
  try {
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2), { flag: "wx" });
  } catch {
    // Metadata write failed after the file landed — clean up the orphan so
    // it never sits on disk as an ownerless, unlisted file.
    await rm(fullPath, { force: true }).catch(() => {});
    throw new ContactPhotoError("WRITE_FAILED", "Could not save photo metadata");
  }

  return metadata;
}

/** Every metadata entry owned by `repoGuid` whose backing file still exists — shared by list-for-contact and counts. */
async function readAllOwnedMetadata(dir: string, repoGuid: string): Promise<ContactPhotoMetadata[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    console.error(
      "[google-contact-photos] readAllOwnedMetadata failed:",
      error instanceof Error ? error.message : error,
    );
    throw new ContactPhotoError("WRITE_FAILED", "Could not list photos");
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
  return owned.filter((m): m is ContactPhotoMetadata => m !== null);
}

export async function listContactPhotosForContact(
  contactResourceName: string,
  options?: { rootDirectory?: string; repoGuid?: string; username?: string },
): Promise<ContactPhotoMetadata[]> {
  const resource = assertValidGoogleContactResourceName(contactResourceName);
  const repoGuid = options?.repoGuid ?? getCurrentRepoGuid();
  const username = assertSafeUsername(options?.username ?? getCurrentUsername());
  const dir = getUserContactPhotosDir(username, options?.rootDirectory);
  const all = await readAllOwnedMetadata(dir, repoGuid);
  return all
    .filter((m) => m.contactResourceName === resource)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** `{ [contactResourceName]: count }` for every contact with at least one photo — one directory scan for the whole list's badges. */
export async function listContactPhotoCounts(options?: {
  rootDirectory?: string;
  repoGuid?: string;
  username?: string;
}): Promise<Record<string, number>> {
  const repoGuid = options?.repoGuid ?? getCurrentRepoGuid();
  const username = assertSafeUsername(options?.username ?? getCurrentUsername());
  const dir = getUserContactPhotosDir(username, options?.rootDirectory);
  const all = await readAllOwnedMetadata(dir, repoGuid);
  const counts: Record<string, number> = {};
  for (const m of all) {
    counts[m.contactResourceName] = (counts[m.contactResourceName] ?? 0) + 1;
  }
  return counts;
}

export interface ContactPhotoReadInfo extends ContactPhotoMetadata {
  filePath: string;
}

export async function getContactPhotoReadInfo(
  id: string,
  options?: { rootDirectory?: string; repoGuid?: string; username?: string },
): Promise<ContactPhotoReadInfo | null> {
  const safeId = assertValidContactPhotoId(id);
  const repoGuid = options?.repoGuid ?? getCurrentRepoGuid();
  const username = assertSafeUsername(options?.username ?? getCurrentUsername());
  const dir = getUserContactPhotosDir(username, options?.rootDirectory);
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
    if (error instanceof ContactPhotoError && error.code === "INVALID_ID") throw error;
    throw new ContactPhotoError("WRITE_FAILED", "Could not read photo");
  }
}

export async function deleteContactPhoto(
  id: string,
  options?: { rootDirectory?: string; repoGuid?: string; username?: string },
): Promise<void> {
  const safeId = assertValidContactPhotoId(id);
  const repoGuid = options?.repoGuid ?? getCurrentRepoGuid();
  const username = assertSafeUsername(options?.username ?? getCurrentUsername());
  const dir = getUserContactPhotosDir(username, options?.rootDirectory);
  const metadataPath = metadataPathForId(safeId, dir);

  let metadata: ContactPhotoMetadata | null;
  try {
    metadata = parseMetadata(await readFile(metadataPath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      throw new ContactPhotoError("NOT_FOUND", "Photo not found");
    }
    throw new ContactPhotoError("WRITE_FAILED", "Could not read photo metadata");
  }
  if (!metadata || metadata.repoGuid !== repoGuid) {
    // Another user's photo (or none at all) reads as not-found — never
    // reveal whether an id exists in someone else's directory.
    throw new ContactPhotoError("NOT_FOUND", "Photo not found");
  }

  const filePath = assertSafeContactPhotoPath(dir, metadata.storageKey);
  // Delete the file first: if this fails, abort before touching metadata so
  // the photo keeps showing up (safe/retryable) instead of silently
  // orphaning bytes on disk with no owner/contact reference left — the
  // explicit compensation this feature's spec calls for instead of a real
  // filesystem+metadata transaction.
  try {
    await rm(filePath, { force: false });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      throw new ContactPhotoError("WRITE_FAILED", "Could not delete photo file");
    }
  }
  try {
    await rm(metadataPath, { force: false });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.error("[google-contact-photos] orphan metadata after file delete:", safeId);
      throw new ContactPhotoError("WRITE_FAILED", "Photo file deleted but metadata cleanup failed");
    }
  }
}
