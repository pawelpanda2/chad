import { withPostgresClient } from "../postgres.js";
import type { ReferencedFileMetadata } from "./contracts.js";
import type { FileStorageEntityType } from "./features.js";

export interface ReferencedFileMetadataStore {
  insert(row: ReferencedFileMetadata): Promise<void>;
  getById(repoGuid: string, id: string): Promise<ReferencedFileMetadata | null>;
  listByEntity(
    repoGuid: string,
    feature: string,
    entityId: string,
  ): Promise<ReferencedFileMetadata[]>;
  deleteById(repoGuid: string, id: string): Promise<boolean>;
  updateStorage(
    repoGuid: string,
    id: string,
    patch: { fileName: string; storagePath: string },
  ): Promise<ReferencedFileMetadata | null>;
}

type DbRow = {
  id: string;
  repo_guid: string;
  owner_username: string;
  feature: string;
  entity_type: string;
  entity_id: string;
  entity_name_snapshot: string;
  file_name: string;
  storage_path: string;
  original_file_name: string | null;
  mime_type: string | null;
  size_bytes: string | number;
  sha256: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function toIso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

function rowToMeta(row: DbRow): ReferencedFileMetadata {
  return {
    id: row.id,
    repoGuid: row.repo_guid,
    ownerUsername: row.owner_username,
    feature: row.feature,
    entityType: row.entity_type as FileStorageEntityType,
    entityId: row.entity_id,
    entityNameSnapshot: row.entity_name_snapshot,
    fileName: row.file_name,
    storagePath: row.storage_path,
    originalFileName: row.original_file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256,
    metadata: row.metadata ?? {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function createMemoryReferencedFileStore(
  seed: ReferencedFileMetadata[] = [],
): ReferencedFileMetadataStore {
  const rows = new Map<string, ReferencedFileMetadata>();
  for (const r of seed) rows.set(`${r.repoGuid}:${r.id}`, { ...r });

  return {
    async insert(row) {
      const key = `${row.repoGuid}:${row.id}`;
      if (rows.has(key)) throw new Error("duplicate file id");
      for (const existing of rows.values()) {
        if (existing.repoGuid === row.repoGuid && existing.storagePath === row.storagePath) {
          throw new Error("duplicate storage_path");
        }
      }
      rows.set(key, { ...row });
    },
    async getById(repoGuid, id) {
      return rows.get(`${repoGuid}:${id}`) ?? null;
    },
    async listByEntity(repoGuid, feature, entityId) {
      return [...rows.values()]
        .filter(
          (r) => r.repoGuid === repoGuid && r.feature === feature && r.entityId === entityId,
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async deleteById(repoGuid, id) {
      return rows.delete(`${repoGuid}:${id}`);
    },
    async updateStorage(repoGuid, id, patch) {
      const key = `${repoGuid}:${id}`;
      const cur = rows.get(key);
      if (!cur) return null;
      const next = {
        ...cur,
        fileName: patch.fileName,
        storagePath: patch.storagePath,
        updatedAt: new Date().toISOString(),
      };
      rows.set(key, next);
      return next;
    },
  };
}

export const postgresReferencedFileStore: ReferencedFileMetadataStore = {
  async insert(row) {
    await withPostgresClient((client) =>
      client.query(
        `INSERT INTO cp_referenced_files (
           id, repo_guid, owner_username, feature, entity_type, entity_id,
           entity_name_snapshot, file_name, storage_path, original_file_name,
           mime_type, size_bytes, sha256, metadata, created_at, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::timestamptz,$16::timestamptz
         )`,
        [
          row.id,
          row.repoGuid,
          row.ownerUsername,
          row.feature,
          row.entityType,
          row.entityId,
          row.entityNameSnapshot,
          row.fileName,
          row.storagePath,
          row.originalFileName ?? null,
          row.mimeType ?? null,
          row.sizeBytes,
          row.sha256 ?? null,
          JSON.stringify(row.metadata ?? {}),
          row.createdAt,
          row.updatedAt,
        ],
      ),
    );
  },

  async getById(repoGuid, id) {
    return withPostgresClient(async (client) => {
      const { rows } = await client.query<DbRow>(
        `SELECT * FROM cp_referenced_files WHERE repo_guid = $1 AND id = $2 LIMIT 1`,
        [repoGuid, id],
      );
      return rows[0] ? rowToMeta(rows[0]) : null;
    });
  },

  async listByEntity(repoGuid, feature, entityId) {
    return withPostgresClient(async (client) => {
      const { rows } = await client.query<DbRow>(
        `SELECT * FROM cp_referenced_files
         WHERE repo_guid = $1 AND feature = $2 AND entity_id = $3
         ORDER BY created_at DESC`,
        [repoGuid, feature, entityId],
      );
      return rows.map(rowToMeta);
    });
  },

  async deleteById(repoGuid, id) {
    return withPostgresClient(async (client) => {
      const result = await client.query(
        `DELETE FROM cp_referenced_files WHERE repo_guid = $1 AND id = $2`,
        [repoGuid, id],
      );
      return (result.rowCount ?? 0) > 0;
    });
  },

  async updateStorage(repoGuid, id, patch) {
    return withPostgresClient(async (client) => {
      const { rows } = await client.query<DbRow>(
        `UPDATE cp_referenced_files
         SET file_name = $3, storage_path = $4, updated_at = now()
         WHERE repo_guid = $1 AND id = $2
         RETURNING *`,
        [repoGuid, id, patch.fileName, patch.storagePath],
      );
      return rows[0] ? rowToMeta(rows[0]) : null;
    });
  },
};
