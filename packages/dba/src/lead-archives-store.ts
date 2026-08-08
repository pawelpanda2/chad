/**
 * Story 110 — Postgres metadata store for lead ZIP/RAR archives.
 * Binary files stay on the filesystem; this table is the index.
 */

import { withPostgresClient } from "./postgres.js";
import type { LeadArchiveFileType, LeadArchiveMetadata } from "./lead-archives.js";

export interface LeadArchiveMetadataStore {
  insert(row: LeadArchiveMetadata): Promise<void>;
  listByLeadUuid(repoGuid: string, leadUuid: string): Promise<LeadArchiveMetadata[]>;
  listAllForRepo(repoGuid: string, viewKey: string): Promise<LeadArchiveMetadata[]>;
  getById(repoGuid: string, id: string): Promise<LeadArchiveMetadata | null>;
  deleteById(repoGuid: string, id: string): Promise<boolean>;
}

type DbRow = {
  id: string;
  repo_guid: string;
  owner_username: string;
  lead_uuid: string;
  lead_name_at_export: string;
  file_name: string;
  storage_path: string;
  view_key: string;
  file_type: string;
  size_bytes: string | number;
  original_file_name: string;
  created_at: Date | string;
};

function rowToMetadata(row: DbRow): LeadArchiveMetadata {
  const createdAt =
    row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);
  return {
    id: row.id,
    repoGuid: row.repo_guid,
    ownerUsername: row.owner_username,
    leadUuid: row.lead_uuid,
    leadNameAtExport: row.lead_name_at_export,
    fileName: row.file_name,
    storagePath: row.storage_path,
    view: row.view_key,
    fileType: row.file_type as LeadArchiveFileType,
    sizeBytes: Number(row.size_bytes),
    originalFileName: row.original_file_name,
    createdAt,
  };
}

/** In-memory store for unit tests (no Postgres required). */
export function createMemoryLeadArchiveStore(
  seed: LeadArchiveMetadata[] = [],
): LeadArchiveMetadataStore {
  const rows = new Map<string, LeadArchiveMetadata>();
  for (const row of seed) rows.set(`${row.repoGuid}:${row.id}`, row);

  return {
    async insert(row) {
      const key = `${row.repoGuid}:${row.id}`;
      if (rows.has(key)) throw new Error("duplicate archive id");
      for (const existing of rows.values()) {
        if (existing.repoGuid === row.repoGuid && existing.storagePath === row.storagePath) {
          throw new Error("duplicate storage_path");
        }
      }
      rows.set(key, { ...row });
    },
    async listByLeadUuid(repoGuid, leadUuid) {
      return [...rows.values()]
        .filter((r) => r.repoGuid === repoGuid && r.leadUuid === leadUuid)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async listAllForRepo(repoGuid, viewKey) {
      return [...rows.values()]
        .filter((r) => r.repoGuid === repoGuid && r.view === viewKey)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async getById(repoGuid, id) {
      return rows.get(`${repoGuid}:${id}`) ?? null;
    },
    async deleteById(repoGuid, id) {
      return rows.delete(`${repoGuid}:${id}`);
    },
  };
}

export const postgresLeadArchiveStore: LeadArchiveMetadataStore = {
  async insert(row) {
    await withPostgresClient((client) =>
      client.query(
        `INSERT INTO cp_lead_archives (
           id, repo_guid, owner_username, lead_uuid, lead_name_at_export,
           file_name, storage_path, view_key, file_type, size_bytes,
           original_file_name, created_at, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::timestamptz,$12::timestamptz
         )`,
        [
          row.id,
          row.repoGuid,
          row.ownerUsername,
          row.leadUuid,
          row.leadNameAtExport,
          row.fileName,
          row.storagePath,
          row.view,
          row.fileType,
          row.sizeBytes,
          row.originalFileName,
          row.createdAt,
        ],
      ),
    );
  },

  async listByLeadUuid(repoGuid, leadUuid) {
    return withPostgresClient(async (client) => {
      const { rows } = await client.query<DbRow>(
        `SELECT * FROM cp_lead_archives
         WHERE repo_guid = $1 AND lead_uuid = $2
         ORDER BY created_at DESC`,
        [repoGuid, leadUuid],
      );
      return rows.map(rowToMetadata);
    });
  },

  async listAllForRepo(repoGuid, viewKey) {
    return withPostgresClient(async (client) => {
      const { rows } = await client.query<DbRow>(
        `SELECT * FROM cp_lead_archives
         WHERE repo_guid = $1 AND view_key = $2
         ORDER BY created_at DESC`,
        [repoGuid, viewKey],
      );
      return rows.map(rowToMetadata);
    });
  },

  async getById(repoGuid, id) {
    return withPostgresClient(async (client) => {
      const { rows } = await client.query<DbRow>(
        `SELECT * FROM cp_lead_archives WHERE repo_guid = $1 AND id = $2 LIMIT 1`,
        [repoGuid, id],
      );
      return rows[0] ? rowToMetadata(rows[0]) : null;
    });
  },

  async deleteById(repoGuid, id) {
    return withPostgresClient(async (client) => {
      const result = await client.query(
        `DELETE FROM cp_lead_archives WHERE repo_guid = $1 AND id = $2`,
        [repoGuid, id],
      );
      return (result.rowCount ?? 0) > 0;
    });
  },
};
