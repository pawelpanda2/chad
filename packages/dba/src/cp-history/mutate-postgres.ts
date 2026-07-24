/**
 * Story 80 — the PostgreSQL equivalent of `mutate.ts`'s
 * `executeCpMutationWithHistory`. Unlike the Mongo version, most of the
 * actual history-writing work happens inside the database itself (the
 * `cp_items_write_history()` trigger, `../../sql/migrations/0001_init.sql`)
 * — this module's job is to open the transaction, set the transaction-local
 * `app.*` context the trigger reads (`../postgres.js`'s `setMutationContext`),
 * issue the INSERT/UPDATE/DELETE, and read back the one `cp_history` row the
 * trigger just wrote, all on one pooled client/transaction.
 *
 * Idempotency mirrors `mutate.ts` exactly: a fast-path pre-check by
 * `mutation_id` before opening a transaction, and a slow-path fallback that
 * catches a Postgres unique-violation (`23505`) on `cp_history.mutation_id`
 * for a truly-concurrent retry that lost the pre-check race.
 *
 * `MongoCpProvider`'s only callers convention carries over: `PostgresCpProvider`
 * (`../data-providers/postgres-cp-provider.ts`) is this function's only
 * caller.
 */

import type { PoolClient } from "pg";
import { withPostgresClient, setMutationContext, isUniqueViolation } from "../postgres.js";
import { formatCpTimestamp, splitAddress, type CpItem, type CpItemConfig } from "../cp-model.js";
import type { Clock } from "../data-clock.js";
import { systemClock } from "../data-clock.js";

export type CpHistoryActorKind = "user" | "system" | "migration" | "unknown";
export type CpHistoryOperationType = "insert" | "update" | "delete";

export interface CpHistoryActor {
  username: string | null;
  repoGuid: string | null;
  kind: CpHistoryActorKind;
}

export interface PgCpHistoryRow {
  id: string;
  mutationId: string;
  requestId: string | null;
  sourceId: string;
  repoGuid: string;
  address: string;
  itemName: string | null;
  version: number;
  operationType: CpHistoryOperationType;
  actor: CpHistoryActor;
  changedAt: Date;
  beforeHash: string | null;
  afterHash: string | null;
  beforeSnapshot: { config: CpItemConfig; body: string } | null;
  afterSnapshot: { config: CpItemConfig; body: string } | null;
}

export class CpHistoryVersionConflictError extends Error {
  constructor(
    public readonly itemId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number | null
  ) {
    super(`cp_items ${itemId}: expected version ${expectedVersion}, found ${actualVersion ?? "(no row)"}`);
    this.name = "CpHistoryVersionConflictError";
  }
}

/** A second delete of the same id — a controlled, explicit failure, never a fabricated second delete event. */
export class CpItemAlreadyDeletedError extends Error {
  constructor(public readonly itemId: string) {
    super(`cp_items ${itemId} does not exist (already deleted, or never existed).`);
    this.name = "CpItemAlreadyDeletedError";
  }
}

/** Reusing a mutationId across two DIFFERENT items is a caller bug, not a legitimate retry. */
export class CpMutationIdReusedError extends Error {
  constructor(
    public readonly mutationId: string,
    public readonly existingSourceId: string,
    public readonly requestedItemId: string
  ) {
    super(
      `mutationId ${mutationId} was already used for cp_items ${existingSourceId} — refusing to reuse it for a different item (${requestedItemId}).`
    );
    this.name = "CpMutationIdReusedError";
  }
}

export interface CpMutationContext {
  actor: { username: string; repoGuid: string } | null;
  requestId: string | null;
  actorKind?: "user" | "system" | "migration";
}

export type CpMutationInput =
  | { kind: "put"; itemId: string; config: CpItemConfig; body: string; expectedVersion?: number }
  | { kind: "delete"; itemId: string; expectedVersion?: number };

export interface CpMutationResult {
  /** `null` after a delete. */
  item: CpItem | null;
  alreadyExisted: boolean;
  historyRow: PgCpHistoryRow;
  /** `true` when this call short-circuited on an already-committed `mutationId` (idempotent-retry). */
  idempotentReplay: boolean;
}

interface CpItemsRow {
  id: string;
  repo_guid: string;
  address: string;
  name: string;
  type: string;
  config: CpItemConfig;
  body: string;
  history_version: number;
}

function itemsRowToCpItem(row: CpItemsRow): CpItem {
  return { _id: row.id, config: row.config, body: row.body };
}

function rowToHistory(row: Record<string, unknown>): PgCpHistoryRow {
  return {
    id: String(row.id),
    mutationId: row.mutation_id as string,
    requestId: (row.request_id as string) ?? null,
    sourceId: row.source_id as string,
    repoGuid: row.repo_guid as string,
    address: row.address as string,
    itemName: (row.item_name as string) ?? null,
    version: row.version as number,
    operationType: row.operation_type as CpHistoryOperationType,
    actor: {
      username: (row.actor_username as string) ?? null,
      repoGuid: (row.actor_repo_guid as string) ?? null,
      kind: row.actor_kind as CpHistoryActorKind,
    },
    changedAt: row.changed_at as Date,
    beforeHash: (row.before_hash as string) ?? null,
    afterHash: (row.after_hash as string) ?? null,
    beforeSnapshot: (row.before_snapshot as PgCpHistoryRow["beforeSnapshot"]) ?? null,
    afterSnapshot: (row.after_snapshot as PgCpHistoryRow["afterSnapshot"]) ?? null,
  };
}

async function findHistoryByMutationId(client: PoolClient, mutationId: string): Promise<PgCpHistoryRow | null> {
  const { rows } = await client.query("SELECT * FROM cp_history WHERE mutation_id = $1", [mutationId]);
  return rows[0] ? rowToHistory(rows[0]) : null;
}

async function loadCurrentItem(client: PoolClient, itemId: string): Promise<CpItem | null> {
  const { rows } = await client.query<CpItemsRow>("SELECT * FROM cp_items WHERE id = $1", [itemId]);
  return rows[0] ? itemsRowToCpItem(rows[0]) : null;
}

export async function executeCpMutationWithHistoryPostgres(
  mutationId: string,
  input: CpMutationInput,
  context: CpMutationContext,
  clock: Clock = systemClock
): Promise<CpMutationResult> {
  return withPostgresClient(async (client) => {
    // Idempotent retry, fast path — see mutate.ts's identical comment.
    const existingEvent = await findHistoryByMutationId(client, mutationId);
    if (existingEvent) {
      if (existingEvent.sourceId !== input.itemId) {
        throw new CpMutationIdReusedError(mutationId, existingEvent.sourceId, input.itemId);
      }
      const item = await loadCurrentItem(client, existingEvent.sourceId);
      return { item, alreadyExisted: true, historyRow: existingEvent, idempotentReplay: true };
    }

    try {
      await client.query("BEGIN");
      const result = await runCpMutation(client, mutationId, input, context, clock);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {
        /* connection may already be broken; nothing more to do */
      });
      // A truly-concurrent retry of the same mutationId can lose the
      // pre-check race above and hit cp_history's unique constraint inside
      // the trigger instead — same idempotency guarantee, discovered a few
      // ms later via Postgres's own 23505.
      if (isUniqueViolation(error)) {
        const replay = await findHistoryByMutationId(client, mutationId);
        if (replay && replay.sourceId === input.itemId) {
          const item = await loadCurrentItem(client, replay.sourceId);
          return { item, alreadyExisted: true, historyRow: replay, idempotentReplay: true };
        }
      }
      throw error;
    }
  });
}

/**
 * Exported (unlike `mutate.ts`'s private `runMutation`) so
 * `PostgresCpProvider.createChild` can run this same put logic inside its
 * OWN already-open transaction (which is already holding the
 * per-parent-address advisory lock) instead of opening a second, separate
 * transaction — see that method's doc comment.
 */
export async function runCpMutation(
  client: PoolClient,
  mutationId: string,
  input: CpMutationInput,
  context: CpMutationContext,
  clock: Clock
): Promise<CpMutationResult> {
  // Row lock: also what makes the trigger's version read-then-increment
  // race-free for concurrent writers of the SAME item (Story 80 §7).
  const { rows: existingRows } = await client.query<CpItemsRow>(
    "SELECT * FROM cp_items WHERE id = $1 FOR UPDATE",
    [input.itemId]
  );
  const existing = existingRows[0] ?? null;
  const existingVersion = existing ? existing.history_version : null;

  if (input.expectedVersion !== undefined && existingVersion !== input.expectedVersion) {
    throw new CpHistoryVersionConflictError(input.itemId, input.expectedVersion, existingVersion);
  }

  const now = clock.now();
  const actorKind = context.actorKind ?? (context.actor ? "user" : "system");
  const actorUsername = context.actor?.username ?? actorKind;
  const actorRepoGuid = context.actor?.repoGuid ?? null;

  await setMutationContext(client, {
    mutationId,
    requestId: context.requestId,
    actorUsername,
    actorRepoGuid,
    actorKind,
  });

  if (input.kind === "delete") {
    if (!existing) {
      throw new CpItemAlreadyDeletedError(input.itemId);
    }
    await client.query("DELETE FROM cp_items WHERE id = $1", [input.itemId]);
    const historyRow = await findHistoryByMutationId(client, mutationId);
    if (!historyRow) throw new Error(`cp_items_write_history trigger did not produce a history row for mutationId ${mutationId}`);
    return { item: null, alreadyExisted: true, historyRow, idempotentReplay: false };
  }

  // input.kind === "put"
  const address = input.config.address;
  const repoGuid = splitAddress(address).repoGuid;
  const createdAt = existing?.config.created ?? input.config.created ?? formatCpTimestamp(now);
  const finalConfig: CpItemConfig = {
    ...input.config,
    created: createdAt,
    modified: formatCpTimestamp(now),
  };

  let itemRow: CpItemsRow;
  if (!existing) {
    const { rows } = await client.query<CpItemsRow>(
      `INSERT INTO cp_items (id, repo_guid, address, name, type, config, body, created_at, modified_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $8)
       RETURNING *`,
      [input.itemId, repoGuid, address, finalConfig.name, finalConfig.type, JSON.stringify(finalConfig), input.body, now]
    );
    itemRow = rows[0];
  } else {
    const { rows } = await client.query<CpItemsRow>(
      `UPDATE cp_items
       SET repo_guid = $2, address = $3, name = $4, type = $5, config = $6::jsonb, body = $7, modified_at = $8
       WHERE id = $1
       RETURNING *`,
      [input.itemId, repoGuid, address, finalConfig.name, finalConfig.type, JSON.stringify(finalConfig), input.body, now]
    );
    itemRow = rows[0];
  }

  const historyRow = await findHistoryByMutationId(client, mutationId);
  if (!historyRow) throw new Error(`cp_items_write_history trigger did not produce a history row for mutationId ${mutationId}`);

  return {
    item: itemsRowToCpItem(itemRow),
    alreadyExisted: !!existing,
    historyRow,
    idempotentReplay: false,
  };
}
