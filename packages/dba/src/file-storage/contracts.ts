import type { FileStorageEntityType, FileStorageFeature } from "./features.js";

export interface ReferencedFileMetadata {
  id: string;
  repoGuid: string;
  ownerUsername: string;
  feature: FileStorageFeature | string;
  entityType: FileStorageEntityType;
  entityId: string;
  entityNameSnapshot: string;
  fileName: string;
  /** Relative: `02_files_refrenced/<user>/<feature…>/<entity>/<file>` */
  storagePath: string;
  originalFileName?: string | null;
  mimeType?: string | null;
  sizeBytes: number;
  sha256?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PutFileInput {
  bytes: Uint8Array;
  repoGuid: string;
  ownerUsername: string;
  feature: FileStorageFeature | string;
  entityType: FileStorageEntityType;
  entityId: string;
  entityNameSnapshot: string;
  /** Preferred human-readable stem; collisions get __2, __3 */
  preferredFileNameStem: string;
  ext: string;
  mimeType?: string;
  originalFileName?: string;
  fileId?: string;
  rootDirectory?: string;
  extraMetadata?: Record<string, unknown>;
}

export interface ListFilesQuery {
  repoGuid: string;
  ownerUsername: string;
  feature: FileStorageFeature | string;
  entityId: string;
  rootDirectory?: string;
}

export interface FileReadInfo extends ReferencedFileMetadata {
  filePath: string;
}

export interface FileStorageProvider {
  putFile(input: PutFileInput): Promise<ReferencedFileMetadata>;
  getFile(
    id: string,
    repoGuid: string,
    options?: { rootDirectory?: string },
  ): Promise<FileReadInfo | null>;
  listFiles(query: ListFilesQuery): Promise<ReferencedFileMetadata[]>;
  deleteFile(id: string, repoGuid: string, options?: { rootDirectory?: string }): Promise<void>;
  exists(storagePath: string, rootDirectory?: string): Promise<boolean>;
  /** Update fileName/storagePath after manual rename discovery (keeps id). */
  syncFileNameFromDisk(
    id: string,
    repoGuid: string,
    newFileName: string,
    newStoragePath: string,
  ): Promise<ReferencedFileMetadata | null>;
}
