/**
 * Filesystem provider for referenced files (Story 111).
 * Binary on cp_1; metadata via injectable store (Postgres in production).
 */

import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import type {
  FileReadInfo,
  FileStorageProvider,
  ListFilesQuery,
  PutFileInput,
  ReferencedFileMetadata,
} from "./contracts.js";
import {
  createMemoryReferencedFileStore,
  postgresReferencedFileStore,
  type ReferencedFileMetadataStore,
} from "./metadata-store.js";
import { maybeRequestCp1Repair, isCp1StorageFailure } from "./cp1-storage-failure.js";
import {
  buildReadableFileName,
  buildRelativeStoragePath,
  FileStoragePathError,
  resolveAbsoluteFromRelative,
  resolveEntityStorage,
  sanitizeStorageSegment,
} from "./path-policy.js";

export class FileStorageError extends Error {
  constructor(
    public readonly code:
      | "NOT_CONFIGURED"
      | "NOT_FOUND"
      | "WRITE_FAILED"
      | "STORAGE_UNAVAILABLE"
      | "EMPTY"
      | "TOO_LARGE"
      | "INVALID",
    message: string,
  ) {
    super(message);
    this.name = "FileStorageError";
  }
}

function throwMappedFsError(error: unknown, fallbackMessage: string): never {
  maybeRequestCp1Repair(error, "file-storage");
  if (isCp1StorageFailure(error)) {
    throw new FileStorageError(
      "STORAGE_UNAVAILABLE",
      "Storage unavailable — repairing…",
    );
  }
  throw new FileStorageError("WRITE_FAILED", fallbackMessage);
}

function mapPathError(error: unknown): never {
  if (error instanceof FileStoragePathError) {
    if (error.code === "NOT_CONFIGURED") {
      throw new FileStorageError("NOT_CONFIGURED", error.message);
    }
    throw new FileStorageError("INVALID", error.message);
  }
  throw error;
}

async function listDirNames(dir: string): Promise<Set<string>> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return new Set(entries.filter((e) => e.isFile()).map((e) => e.name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return new Set();
    throwMappedFsError(error, "Could not list storage directory");
  }
}

function sha256Of(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function createFilesystemFileStorage(options?: {
  metadataStore?: ReferencedFileMetadataStore;
}): FileStorageProvider {
  const store = options?.metadataStore ?? postgresReferencedFileStore;

  return {
    async putFile(input: PutFileInput): Promise<ReferencedFileMetadata> {
      if (!input.bytes || input.bytes.byteLength === 0) {
        throw new FileStorageError("EMPTY", "File is empty");
      }
      let entityDir: string;
      try {
        entityDir = resolveEntityStorage(
          input.ownerUsername,
          input.feature,
          input.entityNameSnapshot,
          input.rootDirectory,
        );
      } catch (error) {
        mapPathError(error);
      }

      const existing = await listDirNames(entityDir);
      const fileName = buildReadableFileName(input.preferredFileNameStem, input.ext, existing);
      let storagePath: string;
      let fullPath: string;
      try {
        storagePath = buildRelativeStoragePath(
          input.ownerUsername,
          input.feature,
          input.entityNameSnapshot,
          fileName,
        );
        fullPath = resolveAbsoluteFromRelative(storagePath, input.rootDirectory);
      } catch (error) {
        mapPathError(error);
      }

      const id = input.fileId ?? randomUUID();
      const now = new Date().toISOString();
      const meta: ReferencedFileMetadata = {
        id,
        repoGuid: input.repoGuid,
        ownerUsername: input.ownerUsername,
        feature: input.feature,
        entityType: input.entityType,
        entityId: input.entityId,
        entityNameSnapshot: sanitizeStorageSegment(input.entityNameSnapshot, "entity"),
        fileName,
        storagePath,
        originalFileName: input.originalFileName ?? null,
        mimeType: input.mimeType ?? null,
        sizeBytes: input.bytes.byteLength,
        sha256: sha256Of(input.bytes),
        metadata: input.extraMetadata ?? {},
        createdAt: now,
        updatedAt: now,
      };

      const tempPath = `${fullPath}.tmp-${randomUUID()}`;
      try {
        await mkdir(entityDir, { recursive: true });
        await writeFile(tempPath, input.bytes, { flag: "wx" });
        await rename(tempPath, fullPath);
      } catch (error) {
        await rm(tempPath, { force: true }).catch(() => {});
        if (error instanceof FileStorageError) throw error;
        throwMappedFsError(error, "Could not save file");
      }

      try {
        await store.insert(meta);
      } catch (error) {
        await rm(fullPath, { force: true }).catch(() => {});
        console.error(
          "[file-storage] metadata insert failed:",
          error instanceof Error ? error.message : error,
        );
        throw new FileStorageError("WRITE_FAILED", "Could not save file metadata");
      }
      return meta;
    },

    async getFile(id, repoGuid, options): Promise<FileReadInfo | null> {
      const meta = await store.getById(repoGuid, id);
      if (!meta) return null;

      // 1) Canonical path from metadata
      try {
        const filePath = resolveAbsoluteFromRelative(meta.storagePath, options?.rootDirectory);
        const st = await stat(filePath);
        if (st.isFile()) return { ...meta, sizeBytes: st.size, filePath };
      } catch {
        /* fall through to entity-dir scan */
      }

      // 2) Metadata fallback: scan entity directory for file matching size or any single match by id in name
      try {
        const entityDir = resolveEntityStorage(
          meta.ownerUsername,
          meta.feature,
          meta.entityNameSnapshot,
          options?.rootDirectory,
        );
        const names = await listDirNames(entityDir);
        // Prefer exact fileName; else any file (manual rename)
        const candidates = names.has(meta.fileName)
          ? [meta.fileName]
          : [...names].filter((n) => !n.startsWith(".") && !n.endsWith(".tmp"));
        for (const name of candidates) {
          const abs = resolveAbsoluteFromRelative(
            buildRelativeStoragePath(meta.ownerUsername, meta.feature, meta.entityNameSnapshot, name),
            options?.rootDirectory,
          );
          try {
            const st = await stat(abs);
            if (!st.isFile()) continue;
            if (name !== meta.fileName) {
              const newPath = buildRelativeStoragePath(
                meta.ownerUsername,
                meta.feature,
                meta.entityNameSnapshot,
                name,
              );
              const updated = await store.updateStorage(repoGuid, id, {
                fileName: name,
                storagePath: newPath,
              });
              if (updated) return { ...updated, sizeBytes: st.size, filePath: abs };
            }
            return { ...meta, sizeBytes: st.size, filePath: abs };
          } catch {
            continue;
          }
        }
      } catch {
        return null;
      }
      return null;
    },

    async listFiles(query: ListFilesQuery): Promise<ReferencedFileMetadata[]> {
      const fromDb = await store.listByEntity(query.repoGuid, query.feature, query.entityId);
      // Filter to rows whose owner matches (defense in depth)
      return fromDb.filter((r) => r.ownerUsername === query.ownerUsername);
    },

    async deleteFile(id, repoGuid, options): Promise<void> {
      const meta = await store.getById(repoGuid, id);
      if (!meta) throw new FileStorageError("NOT_FOUND", "File not found");
      try {
        const filePath = resolveAbsoluteFromRelative(meta.storagePath, options?.rootDirectory);
        await rm(filePath, { force: false });
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
          throwMappedFsError(error, "Could not delete file");
        }
      }
      const deleted = await store.deleteById(repoGuid, id);
      if (!deleted) {
        throw new FileStorageError("WRITE_FAILED", "File deleted but metadata cleanup failed");
      }
    },

    async exists(storagePath, rootDirectory): Promise<boolean> {
      try {
        await access(resolveAbsoluteFromRelative(storagePath, rootDirectory));
        return true;
      } catch {
        return false;
      }
    },

    async syncFileNameFromDisk(id, repoGuid, newFileName, newStoragePath) {
      return store.updateStorage(repoGuid, id, {
        fileName: newFileName,
        storagePath: newStoragePath,
      });
    },
  };
}

/** Default production provider (Postgres metadata). */
export const filesystemFileStorage = createFilesystemFileStorage();

export { createMemoryReferencedFileStore, postgresReferencedFileStore };
