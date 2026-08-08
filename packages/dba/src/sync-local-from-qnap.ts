/**
 * Story 89 — mirror QNAP Postgres (production/shared) into the local Mac
 * Docker volume so `DBA_MONGO_MODE=local` / Dev Panel "Local Postgres" is a
 * copy of real data, not a test-fixture dump under pawel_f's GUID.
 *
 * Copies: cp_items, cp_history, outboxes. Disables history triggers during
 * bulk load so we do not double-write history.
 *
 * NEVER invents users or items — production is the source of truth.
 * Test mutations stay under test3 only (see ai-docs/begin_here/01_ai_start.md).
 */

import pg from "pg";
import { QNAP_TAILSCALE_HOST, QNAP_POSTGRES_PORT, LOCAL_POSTGRES_HOST_PORT } from "./dev-db-hosts.js";

const { Client } = pg;

export interface SyncLocalFromQnapResult {
  itemsCopied: number;
  historyCopied: number;
  outboxDataCopied: number;
  outboxSheetsCopied: number;
  leadArchivesCopied: number;
  referencedFilesCopied: number;
  sourceHostPort: string;
  destHostPort: string;
  syncedAt: string;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required for QNAP→local Postgres sync`);
  return v;
}

/** QNAP URI built from env (never from the runtime Dev Panel override). */
export function buildQnapPostgresUri(): string {
  const user = process.env.POSTGRES_USER || "chad";
  const db = process.env.POSTGRES_DB || "chad";
  const pass = process.env.POSTGRES_QNAP_PASSWORD || process.env.POSTGRES_PASSWORD;
  if (!pass) {
    throw new Error("POSTGRES_QNAP_PASSWORD (or POSTGRES_PASSWORD) required to read QNAP Postgres");
  }
  return `postgres://${user}:${pass}@${QNAP_TAILSCALE_HOST}:${QNAP_POSTGRES_PORT}/${db}`;
}

/** Local sibling Postgres URI (docker service or host-published port). */
export function buildLocalPostgresUri(): string {
  const user = process.env.POSTGRES_USER || "chad";
  const db = process.env.POSTGRES_DB || "chad";
  const pass = requireEnv("POSTGRES_PASSWORD");
  const inLocalDocker =
    process.env.CHAD_ENVIRONMENT === "local" && process.env.NODE_ENV === "production";
  if (inLocalDocker) {
    return `postgres://${user}:${pass}@postgres:5432/${db}`;
  }
  const hostPort = LOCAL_POSTGRES_HOST_PORT;
  return `postgres://${user}:${pass}@127.0.0.1:${hostPort}/${db}`;
}

function hostPortOf(uri: string): string {
  try {
    return new URL(uri.replace(/^postgres(ql)?:\/\//, "http://")).host;
  } catch {
    return "(unparsed)";
  }
}

async function copyTable(
  src: pg.Client,
  dst: pg.Client,
  table: string,
  columns: string[],
  jsonbColumns: Set<string> = new Set()
): Promise<number> {
  const colList = columns.join(", ");
  const { rows } = await src.query(`SELECT ${colList} FROM ${table}`);
  if (rows.length === 0) return 0;

  const placeholders = columns
    .map((c, i) => (jsonbColumns.has(c) ? `$${i + 1}::jsonb` : `$${i + 1}`))
    .join(", ");
  const sql = `INSERT INTO ${table} (${colList}) VALUES (${placeholders})`;
  for (const row of rows) {
    const values = columns.map((c) => {
      const v = row[c];
      if (v == null) return null;
      if (jsonbColumns.has(c)) {
        return typeof v === "string" ? v : JSON.stringify(v);
      }
      return v;
    });
    await dst.query(sql, values);
  }
  return rows.length;
}

/**
 * Full replace of local CHAD tables with a snapshot from QNAP.
 * Safe to call from local Dev Panel / host scripts only.
 */
export async function syncLocalPostgresFromQnap(): Promise<SyncLocalFromQnapResult> {
  const chadEnv = process.env.CHAD_ENVIRONMENT;
  const allowed =
    chadEnv === "local" ||
    (chadEnv !== "test" && chadEnv !== "prod" && process.env.NODE_ENV !== "production");
  if (!allowed) {
    throw new Error("syncLocalPostgresFromQnap is local-only");
  }

  const sourceUri = buildQnapPostgresUri();
  const destUri = buildLocalPostgresUri();
  if (sourceUri === destUri || hostPortOf(sourceUri) === hostPortOf(destUri)) {
    throw new Error("Refusing to sync: source and destination resolve to the same host");
  }

  const src = new Client({ connectionString: sourceUri });
  const dst = new Client({ connectionString: destUri });
  await src.connect();
  await dst.connect();

  const [{ rows: srcCountRows }, { rows: destCountRows }] = await Promise.all([
    src.query<{ count: string }>("SELECT count(*)::text AS count FROM cp_items"),
    dst.query<{ count: string }>("SELECT count(*)::text AS count FROM cp_items"),
  ]);
  const srcCount = Number(srcCountRows[0]?.count ?? 0);
  const destCount = Number(destCountRows[0]?.count ?? 0);
  if (srcCount < destCount) {
    throw new Error(
      `Refusing QNAP→local Postgres sync: source has ${srcCount} cp_items but destination has ${destCount} ` +
        `(would destroy newer local data). Use migrate-mongo-to-postgres or refresh offline-readonly-backup instead.`
    );
  }

  try {
    await dst.query("BEGIN");
    // Stop history trigger + immutability while we bulk-load a mirror.
    await dst.query("ALTER TABLE cp_items DISABLE TRIGGER ALL");
    await dst.query("ALTER TABLE cp_history DISABLE TRIGGER ALL");

    await dst.query(
      "TRUNCATE cp_referenced_files, cp_lead_archives, cp_outbox_google_sheets_sync, cp_outbox_data_sync, cp_history, cp_items RESTART IDENTITY CASCADE"
    );

    const itemsCopied = await copyTable(
      src,
      dst,
      "cp_items",
      [
        "id",
        "repo_guid",
        "address",
        "name",
        "type",
        "config",
        "body",
        "created_at",
        "modified_at",
        "history_version",
        "last_mutation_id",
        "last_request_id",
        "last_actor_username",
        "last_actor_repo_guid",
        "last_actor_kind",
      ],
      new Set(["config"])
    );

    const historyCopied = await copyTable(
      src,
      dst,
      "cp_history",
      [
        "id",
        "mutation_id",
        "request_id",
        "source_id",
        "repo_guid",
        "address",
        "item_name",
        "version",
        "operation_type",
        "actor_username",
        "actor_repo_guid",
        "actor_kind",
        "changed_at",
        "before_hash",
        "after_hash",
        "config_diff",
        "body_diff",
        "before_snapshot",
        "after_snapshot",
      ],
      new Set(["config_diff", "body_diff", "before_snapshot", "after_snapshot"])
    );

    const outboxDataCopied = await copyTable(
      src,
      dst,
      "cp_outbox_data_sync",
      [
        "id",
        "operation_id",
        "command_kind",
        "primary_backend",
        "follower_backend",
        "command",
        "status",
        "attempts",
        "created_at",
        "updated_at",
        "next_attempt_at",
        "locked_at",
        "locked_by",
        "completed_at",
        "last_error",
      ],
      new Set(["command"])
    );

    const outboxSheetsCopied = await copyTable(
      src,
      dst,
      "cp_outbox_google_sheets_sync",
      [
        "id",
        "operation_id",
        "record_key",
        "kind",
        "payload",
        "status",
        "attempts",
        "created_at",
        "updated_at",
        "next_attempt_at",
        "locked_at",
        "locked_by",
        "completed_at",
        "last_error",
      ],
      new Set(["payload"])
    );

    const leadArchivesCopied = await copyTable(
      src,
      dst,
      "cp_lead_archives",
      [
        "id",
        "repo_guid",
        "owner_username",
        "lead_uuid",
        "lead_name_at_export",
        "file_name",
        "storage_path",
        "view_key",
        "file_type",
        "size_bytes",
        "original_file_name",
        "created_at",
        "updated_at",
      ],
    );

    const referencedFilesCopied = await copyTable(
      src,
      dst,
      "cp_referenced_files",
      [
        "id",
        "repo_guid",
        "owner_username",
        "feature",
        "entity_type",
        "entity_id",
        "entity_name_snapshot",
        "file_name",
        "storage_path",
        "original_file_name",
        "mime_type",
        "size_bytes",
        "sha256",
        "metadata",
        "created_at",
        "updated_at",
      ],
      new Set(["metadata"]),
    );
    await dst.query(
      `SELECT setval(pg_get_serial_sequence('cp_history', 'id'), COALESCE((SELECT MAX(id) FROM cp_history), 1))`
    );

    await dst.query("ALTER TABLE cp_items ENABLE TRIGGER ALL");
    await dst.query("ALTER TABLE cp_history ENABLE TRIGGER ALL");
    await dst.query("COMMIT");

    return {
      itemsCopied,
      historyCopied,
      outboxDataCopied,
      outboxSheetsCopied,
      leadArchivesCopied,
      referencedFilesCopied,
      sourceHostPort: hostPortOf(sourceUri),
      destHostPort: hostPortOf(destUri),
      syncedAt: new Date().toISOString(),
    };
  } catch (err) {
    await dst.query("ROLLBACK").catch(() => {});
    try {
      await dst.query("ALTER TABLE cp_items ENABLE TRIGGER ALL");
      await dst.query("ALTER TABLE cp_history ENABLE TRIGGER ALL");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    await src.end().catch(() => {});
    await dst.end().catch(() => {});
  }
}
