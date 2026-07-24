/**
 * PostgreSQL implementation of the `cp_history` read side (Story 80).
 * Dispatched to by `cp-history.ts` whenever the configured primary backend
 * is `postgres`. Returns the exact same `cp-history-types.ts` shapes as
 * `cp-history-mongo.ts` so the Dashboard History UI/API routes need zero
 * changes.
 *
 * `config`/`body` diffs are computed HERE, at read time, from the always-
 * fully-stored `before_snapshot`/`after_snapshot` columns (Story 80's schema
 * stores a full snapshot on every event, unlike Mongo's every-20th cadence —
 * see `sql/migrations/0001_init.sql`'s doc comment), reusing the same
 * DB-agnostic `diffConfig`/`diffBody` (`./cp-history/diff.js`) Mongo's
 * mutate.ts uses at write time. `mutation_id` (not the internal bigserial
 * `id`) is this backend's public "id" — the same external identifier shape
 * Mongo exposes (its `_id` IS `mutationId`), so URLs like
 * `/dashboard/history/entry/[id]` work unchanged regardless of backend.
 */

import { withPostgresClient } from "./postgres.js";
import { getPostgresProvider } from "./data-router-instance.js";
import { diffConfig, diffBody } from "./cp-history/diff.js";
import {
  fallbackItemNameFromAddress,
  type CpHistoryActorKind,
  type CpHistoryConfigOp,
  type CpHistoryBodyHunk,
  type CpHistoryDetail,
  type CpHistoryListItem,
  type ListCpHistoryInput,
  type ListCpHistoryResult,
} from "./cp-history-types.js";

interface CpHistoryRow {
  id: string;
  mutation_id: string;
  request_id: string | null;
  source_id: string;
  repo_guid: string;
  address: string;
  item_name: string | null;
  version: number;
  operation_type: string;
  actor_username: string | null;
  actor_repo_guid: string | null;
  actor_kind: CpHistoryActorKind;
  changed_at: Date;
  before_hash: string | null;
  after_hash: string | null;
  /**
   * Only ever populated by the migrator (`migrate-mongo-to-postgres.mjs`)
   * for a row carried over from Mongo's own `changes.config`/`changes.body`
   * — the native `cp_items_write_history` trigger never writes these
   * columns, leaving them SQL NULL. `config_diff` is therefore a reliable
   * discriminator: Mongo's `diffConfig` always returns an array (possibly
   * empty), never `null`, so "column is non-null" unambiguously means
   * "this is a migrated row with a precomputed diff" — see `toListItem`.
   */
  config_diff: unknown[] | null;
  body_diff: unknown[] | null;
  before_snapshot: { config: unknown; body: string } | null;
  after_snapshot: { config: unknown; body: string } | null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The point-in-time snapshot exposed as this event's public `afterSnapshot`
 * — for insert/update this is genuinely the after-state; for delete there
 * is no after-state, so (matching Mongo's own naming convention, see
 * `cp-history/mutate.ts`'s `CpHistoryDoc.afterSnapshot` doc comment) it's
 * the pre-delete state instead.
 */
function exposedSnapshot(row: CpHistoryRow): { config: unknown; body: string } | null {
  return row.operation_type === "delete" ? row.before_snapshot : row.after_snapshot;
}

/**
 * Prefers a migrated row's precomputed Mongo diff (`config_diff`) over a
 * snapshot-derived one — some migrated `update` events have no snapshot at
 * all (Mongo only snapshotted every 20th update, and never stored a
 * `beforeSnapshot`), so computing `diffConfig(null, null)` for those would
 * silently produce an empty ("no changes") diff, which is a fabrication,
 * not a fact. Native Postgres-trigger rows always have this column SQL
 * NULL, so they always fall through to the snapshot-derived computation
 * (always accurate for them, since Postgres stores full snapshots on every
 * event — see `sql/migrations/0001_init.sql`).
 */
function resolveChanges(row: CpHistoryRow): { config: CpHistoryConfigOp[]; body: CpHistoryBodyHunk[] | null } {
  if (row.config_diff !== null) {
    return {
      config: row.config_diff as CpHistoryConfigOp[],
      body: row.body_diff as CpHistoryBodyHunk[] | null,
    };
  }
  return {
    config: diffConfig(row.before_snapshot?.config ?? null, row.after_snapshot?.config ?? null),
    body: diffBody(row.before_snapshot?.body ?? null, row.after_snapshot?.body ?? null),
  };
}

function toListItem(row: CpHistoryRow): CpHistoryListItem {
  const snapshot = exposedSnapshot(row);
  const changes = resolveChanges(row);

  return {
    id: row.mutation_id,
    mutationId: row.mutation_id,
    sourceId: row.source_id,
    address: row.address,
    itemName: row.item_name ?? fallbackItemNameFromAddress(row.address),
    version: row.version,
    operationType: row.operation_type,
    changedAt: row.changed_at.toISOString(),
    actor: {
      username: row.actor_username ?? row.actor_kind,
      repoGuid: row.actor_repo_guid ?? row.repo_guid,
      kind: row.actor_kind,
    },
    changedConfigPaths: changes.config.map((op) => op.path),
    bodyChanged: changes.body !== null,
    hasSnapshot: snapshot !== null,
  };
}

function toDetail(row: CpHistoryRow): CpHistoryDetail {
  const snapshot = exposedSnapshot(row);
  return {
    ...toListItem(row),
    requestId: row.request_id,
    beforeHash: row.before_hash,
    afterHash: row.after_hash,
    changes: resolveChanges(row),
    afterSnapshot: snapshot,
    metadata: {},
  };
}

export async function listCpHistory(input: ListCpHistoryInput): Promise<ListCpHistoryResult> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, input.pageSize ?? 50));

  if (input.addressPrefix && !input.addressPrefix.startsWith(input.repoGuid)) {
    return { items: [], total: 0, page, pageSize };
  }

  const conditions: string[] = ["repo_guid = $1"];
  const params: unknown[] = [input.repoGuid];

  if (input.sourceId) {
    params.push(input.sourceId);
    conditions.push(`source_id = $${params.length}`);
  }
  if (input.addressPrefix) {
    params.push(`^${escapeRegex(input.addressPrefix)}(/|$)`);
    conditions.push(`address ~ $${params.length}`);
  }
  if (input.operationType) {
    params.push(input.operationType);
    conditions.push(`operation_type = $${params.length}`);
  }
  if (input.dateFrom) {
    params.push(input.dateFrom);
    conditions.push(`changed_at >= $${params.length}`);
  }
  if (input.dateTo) {
    params.push(input.dateTo);
    conditions.push(`changed_at <= $${params.length}`);
  }

  const where = conditions.join(" AND ");
  const orderBy = input.sourceId ? "version DESC" : "changed_at DESC, mutation_id DESC";

  return withPostgresClient(async (client) => {
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;
    const [{ rows }, { rows: countRows }] = await Promise.all([
      client.query<CpHistoryRow>(
        `SELECT * FROM cp_history WHERE ${where} ORDER BY ${orderBy} LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        [...params, pageSize, (page - 1) * pageSize]
      ),
      client.query<{ count: string }>(`SELECT count(*) FROM cp_history WHERE ${where}`, params),
    ]);

    return { items: rows.map(toListItem), total: Number(countRows[0].count), page, pageSize };
  });
}

export async function getCpHistoryEntry(id: string, repoGuid: string): Promise<CpHistoryDetail | null> {
  return withPostgresClient(async (client) => {
    const { rows } = await client.query<CpHistoryRow>("SELECT * FROM cp_history WHERE mutation_id = $1", [id]);
    const row = rows[0];
    if (!row) return null;
    if (row.repo_guid !== repoGuid) return null;
    return toDetail(row);
  });
}

export async function resolveDailyTrackerAddressPrefix(repoGuid: string): Promise<string | null> {
  const provider = getPostgresProvider();
  const folder = await provider.getByNames({ repoGuid, names: ["views", "daily"] });
  return folder?.config.address ?? null;
}

export async function listDailyTrackerHistory(
  input: Omit<ListCpHistoryInput, "addressPrefix">
): Promise<ListCpHistoryResult> {
  const addressPrefix = await resolveDailyTrackerAddressPrefix(input.repoGuid);
  if (!addressPrefix) {
    return { items: [], total: 0, page: input.page ?? 1, pageSize: input.pageSize ?? 50 };
  }
  return listCpHistory({ ...input, addressPrefix });
}

export async function resolveDateEntriesAddressPrefix(repoGuid: string): Promise<string | null> {
  const provider = getPostgresProvider();
  const folder = await provider.getByNames({ repoGuid, names: ["views", "dates"] });
  return folder?.config.address ?? null;
}

export async function listDateEntriesHistory(
  input: Omit<ListCpHistoryInput, "addressPrefix">
): Promise<ListCpHistoryResult> {
  const addressPrefix = await resolveDateEntriesAddressPrefix(input.repoGuid);
  if (!addressPrefix) {
    return { items: [], total: 0, page: input.page ?? 1, pageSize: input.pageSize ?? 50 };
  }
  return listCpHistory({ ...input, addressPrefix });
}

export async function getCpHistoryForItem(sourceId: string, repoGuid: string): Promise<CpHistoryDetail[]> {
  return withPostgresClient(async (client) => {
    const { rows } = await client.query<CpHistoryRow>(
      "SELECT * FROM cp_history WHERE source_id = $1 AND repo_guid = $2 ORDER BY version ASC",
      [sourceId, repoGuid]
    );
    return rows.map(toDetail);
  });
}
