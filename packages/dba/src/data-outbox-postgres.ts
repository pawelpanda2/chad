/**
 * PostgreSQL implementation of the durable follower outbox (Story 80),
 * backing `cp_outbox_data_sync` — the Postgres translation of Story 72's
 * Mongo `data_sync_outbox` (`data-outbox-mongo.ts`). Dispatched to by
 * `data-outbox.ts` whenever the configured primary backend is `postgres`.
 *
 * Claim uses `FOR UPDATE SKIP LOCKED` (Story 80 §3.3/§12) instead of Mongo's
 * atomic `findOneAndUpdate` — the direct Postgres equivalent for "two
 * workers must never claim the same job".
 */

import { withPostgresClient } from "./postgres.js";
import type { Clock } from "./data-clock.js";
import { systemClock } from "./data-clock.js";
import {
  outboxJobId,
  sanitizeOutboxError,
  RETRY_BACKOFF_MS,
  STALE_LOCK_MS,
  type EnqueueFollowerOperationInput,
  type OutboxJob,
  type OutboxStatus,
} from "./data-outbox-shared.js";

interface OutboxRow {
  id: string;
  operation_id: string;
  command_kind: string;
  primary_backend: string;
  follower_backend: string;
  command: unknown;
  status: OutboxStatus;
  attempts: number;
  created_at: Date;
  updated_at: Date;
  next_attempt_at: Date;
  locked_at: Date | null;
  locked_by: string | null;
  completed_at: Date | null;
  last_error: string | null;
}

function rowToJob(row: OutboxRow): OutboxJob {
  return {
    _id: row.id,
    operationId: row.operation_id,
    commandKind: row.command_kind as OutboxJob["commandKind"],
    primaryBackend: row.primary_backend as OutboxJob["primaryBackend"],
    followerBackend: row.follower_backend as OutboxJob["followerBackend"],
    command: row.command as OutboxJob["command"],
    status: row.status,
    attempts: row.attempts,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    nextAttemptAt: row.next_attempt_at.toISOString(),
    lockedAt: row.locked_at ? row.locked_at.toISOString() : null,
    lockedBy: row.locked_by,
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    lastError: row.last_error,
  };
}

export async function enqueueFollowerOperation(
  input: EnqueueFollowerOperationInput,
  clock: Clock = systemClock
): Promise<void> {
  const id = outboxJobId(input.command.operationId, input.followerBackend);
  const now = clock.now();
  await withPostgresClient((client) =>
    client.query(
      `INSERT INTO cp_outbox_data_sync
         (id, operation_id, command_kind, primary_backend, follower_backend, command, status, attempts,
          created_at, updated_at, next_attempt_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'pending', 0, $7, $7, $7)
       ON CONFLICT (id) DO NOTHING`,
      [id, input.command.operationId, input.command.kind, input.primaryBackend, input.followerBackend, JSON.stringify(input.command), now]
    )
  );
}

export async function claimNextJob(workerId: string, clock: Clock = systemClock): Promise<OutboxJob | null> {
  const now = clock.now();
  return withPostgresClient(async (client) => {
    const { rows } = await client.query<OutboxRow>(
      `UPDATE cp_outbox_data_sync
       SET status = 'processing', locked_at = $1, locked_by = $2, updated_at = $1
       WHERE id = (
         SELECT id FROM cp_outbox_data_sync
         WHERE status IN ('pending','retry') AND next_attempt_at <= $1
         ORDER BY next_attempt_at
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [now, workerId]
    );
    return rows[0] ? rowToJob(rows[0]) : null;
  });
}

export async function markSynced(jobId: string, clock: Clock = systemClock): Promise<void> {
  const now = clock.now();
  await withPostgresClient((client) =>
    client.query(
      `UPDATE cp_outbox_data_sync
       SET status = 'synced', completed_at = $2, updated_at = $2, locked_at = NULL, locked_by = NULL, last_error = NULL
       WHERE id = $1`,
      [jobId, now]
    )
  );
}

export async function markRetry(jobId: string, error: unknown, clock: Clock = systemClock): Promise<void> {
  await withPostgresClient(async (client) => {
    const { rows } = await client.query<OutboxRow>("SELECT * FROM cp_outbox_data_sync WHERE id = $1", [jobId]);
    const job = rows[0];
    if (!job) return;

    const now = clock.now();
    const nextAttempts = job.attempts + 1;
    const delayMs = RETRY_BACKOFF_MS[nextAttempts - 1];

    if (delayMs === undefined) {
      await client.query(
        `UPDATE cp_outbox_data_sync
         SET status = 'failed', attempts = $2, updated_at = $3, locked_at = NULL, locked_by = NULL, last_error = $4
         WHERE id = $1`,
        [jobId, nextAttempts, now, sanitizeOutboxError(error)]
      );
      return;
    }

    await client.query(
      `UPDATE cp_outbox_data_sync
       SET status = 'retry', attempts = $2, updated_at = $3, next_attempt_at = $4, locked_at = NULL, locked_by = NULL, last_error = $5
       WHERE id = $1`,
      [jobId, nextAttempts, now, new Date(now.getTime() + delayMs), sanitizeOutboxError(error)]
    );
  });
}

export async function markConflict(jobId: string, diagnosticMessage: string, clock: Clock = systemClock): Promise<void> {
  const now = clock.now();
  await withPostgresClient((client) =>
    client.query(
      `UPDATE cp_outbox_data_sync
       SET status = 'conflict', updated_at = $2, locked_at = NULL, locked_by = NULL, last_error = $3
       WHERE id = $1`,
      [jobId, now, diagnosticMessage]
    )
  );
}

export async function recoverStaleLocks(clock: Clock = systemClock): Promise<number> {
  const now = clock.now();
  const staleBefore = new Date(now.getTime() - STALE_LOCK_MS);
  return withPostgresClient(async (client) => {
    const result = await client.query(
      `UPDATE cp_outbox_data_sync
       SET status = 'retry', updated_at = $2, next_attempt_at = $2, locked_at = NULL, locked_by = NULL
       WHERE status = 'processing' AND locked_at <= $1`,
      [staleBefore, now]
    );
    return result.rowCount ?? 0;
  });
}

export async function getJob(jobId: string): Promise<OutboxJob | null> {
  return withPostgresClient(async (client) => {
    const { rows } = await client.query<OutboxRow>("SELECT * FROM cp_outbox_data_sync WHERE id = $1", [jobId]);
    return rows[0] ? rowToJob(rows[0]) : null;
  });
}

export async function reconcileMissingOutboxJobs(
  expectedOperations: EnqueueFollowerOperationInput[],
  clock: Clock = systemClock
): Promise<number> {
  let created = 0;
  for (const expected of expectedOperations) {
    const existing = await getJob(outboxJobId(expected.command.operationId, expected.followerBackend));
    if (!existing) {
      await enqueueFollowerOperation(expected, clock);
      created++;
    }
  }
  return created;
}
