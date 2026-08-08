/**
 * Central path policy for referenced files (Story 111).
 * Business code never joins host paths — only feature/entity/file segments.
 */

import path from "node:path";
import {
  assertSafeContactPhotoPath,
  assertSafeUsername,
  ContactPhotoError,
  getContactPhotosRootDir,
} from "../google-contact-photos.js";
import { FILES_REFERENCED_SEGMENT, type FileStorageFeature } from "./features.js";

export class FileStoragePathError extends Error {
  constructor(
    public readonly code: "NOT_CONFIGURED" | "INVALID_SEGMENT" | "INVALID_USERNAME" | "TRAVERSAL",
    message: string,
  ) {
    super(message);
    this.name = "FileStoragePathError";
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

/** Sanitize one path segment (entity name, feature piece, filename stem). */
export function sanitizeStorageSegment(raw: string, fallback = "item"): string {
  const stripped = stripControlChars(raw)
    .replace(/[\\/]/g, "-")
    .replace(/\0/g, "")
    .replace(/\.\./g, ".")
    .trim();
  const spaced = stripped.replace(/\s+/g, "_");
  let out = "";
  for (const ch of spaced) {
    if (/[A-Za-z0-9._\-]/.test(ch) || ch.charCodeAt(0) > 127) out += ch;
    else out += "_";
  }
  out = out.replace(/_+/g, "_").replace(/^[._-]+|[._-]+$/g, "");
  if (!out) out = fallback;
  return out.length > 160 ? out.slice(0, 160) : out;
}

export function splitFeatureSegments(feature: FileStorageFeature | string): string[] {
  return feature
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => sanitizeStorageSegment(s, "feature"));
}

/** Runtime root = mounted `02_files_refrenced` (CHAD_CONTACT_PHOTOS_DIR). */
export function getReferencedFilesRootDir(rootDirectory?: string): string {
  try {
    return rootDirectory ? path.resolve(rootDirectory) : getContactPhotosRootDir();
  } catch (error) {
    if (error instanceof ContactPhotoError && error.code === "NOT_CONFIGURED") {
      throw new FileStoragePathError("NOT_CONFIGURED", "Referenced files directory is not configured");
    }
    throw error;
  }
}

export function resolveUserStorageRoot(username: string, rootDirectory?: string): string {
  try {
    const root = getReferencedFilesRootDir(rootDirectory);
    const safeUser = assertSafeUsername(username);
    return assertSafeContactPhotoPath(root, safeUser);
  } catch (error) {
    if (error instanceof FileStoragePathError) throw error;
    if (error instanceof ContactPhotoError) {
      if (error.code === "NOT_CONFIGURED") {
        throw new FileStoragePathError("NOT_CONFIGURED", "Referenced files directory is not configured");
      }
      throw new FileStoragePathError("INVALID_USERNAME", "Invalid username");
    }
    throw error;
  }
}

export function resolveFeatureStorage(
  username: string,
  feature: FileStorageFeature | string,
  rootDirectory?: string,
): string {
  let current = resolveUserStorageRoot(username, rootDirectory);
  for (const segment of splitFeatureSegments(feature)) {
    current = assertSafeContactPhotoPath(current, segment);
  }
  return current;
}

export function resolveEntityStorage(
  username: string,
  feature: FileStorageFeature | string,
  entityDisplayName: string,
  rootDirectory?: string,
): string {
  const featureDir = resolveFeatureStorage(username, feature, rootDirectory);
  const entitySeg = sanitizeStorageSegment(entityDisplayName, "entity");
  return assertSafeContactPhotoPath(featureDir, entitySeg);
}

/**
 * Relative storage key stored in Postgres (never a host absolute path):
 * `02_files_refrenced/<user>/<feature…>/<entity>/<fileName>`
 */
export function buildRelativeStoragePath(
  username: string,
  feature: FileStorageFeature | string,
  entityDisplayName: string,
  fileName: string,
): string {
  const safeUser = assertSafeUsername(username);
  const entitySeg = sanitizeStorageSegment(entityDisplayName, "entity");
  const safeFile = path.basename(fileName);
  if (safeFile !== fileName || fileName.includes("..")) {
    throw new FileStoragePathError("INVALID_SEGMENT", "Invalid file name");
  }
  const parts = [FILES_REFERENCED_SEGMENT, safeUser, ...splitFeatureSegments(feature), entitySeg, safeFile];
  return parts.join("/");
}

/** Resolve DB relative path against the photos/referenced root. */
export function resolveAbsoluteFromRelative(
  storagePath: string,
  rootDirectory?: string,
): string {
  const normalized = storagePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const prefix = `${FILES_REFERENCED_SEGMENT}/`;
  if (!normalized.startsWith(prefix)) {
    throw new FileStoragePathError("TRAVERSAL", "Invalid storage path");
  }
  const relativeToRoot = normalized.slice(prefix.length);
  const root = getReferencedFilesRootDir(rootDirectory);
  let current = root;
  for (const part of relativeToRoot.split("/").filter(Boolean)) {
    if (part === ".." || part.includes("\0")) {
      throw new FileStoragePathError("TRAVERSAL", "Invalid storage path segment");
    }
    current = assertSafeContactPhotoPath(current, part);
  }
  return current;
}

/**
 * Collision-safe readable filename: `base.ext`, then `base__2.ext`, `base__3.ext`, …
 */
export function buildReadableFileName(
  displayName: string,
  ext: string,
  existingFileNames: ReadonlySet<string>,
): string {
  const base = sanitizeStorageSegment(displayName, "file");
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const primary = `${base}.${safeExt}`;
  if (!existingFileNames.has(primary)) return primary;
  let n = 2;
  while (existingFileNames.has(`${base}__${n}.${safeExt}`)) n += 1;
  return `${base}__${n}.${safeExt}`;
}
