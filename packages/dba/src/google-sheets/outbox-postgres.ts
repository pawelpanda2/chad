/**
 * PostgreSQL implementation of the Google Sheets sync outbox (Story 80),
 * backing `cp_outbox_google_sheets_sync` — dispatched to by `outbox.ts`
 * whenever the configured primary backend is `postgres`. Mirrors
 * `data-outbox-postgres.ts`'s `FOR UPDATE SKIP LOCKED` claim pattern.
 */

import { withPostgresClient } from "../postgres.js";
import type { Clock } from "../data-clock.js";
import { systemClock } from "../data-clock.js";
import { RETRY_BACKOFF_MS, STALE_LOCK_MS, sanitizeOutboxError } from "../data-outbox-shared.js";
import type { SheetSyncPayload, GoogleSheetsSyncKind } from "./types.js";

export type GoogleSheetsSyncStatus = "pending" | "processing" | "retry" | "synced" | "failed";

export interface GoogleSheetsSyncJob {
  _id: string;
  operationId: string;
  recordKey: string;
  kind: GoogleSheetsSyncKind;
  payload: SheetSyncPayload;
  status: GoogleSheetsSyncStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string;
  lockedAt: string | null;
  lockedBy: string | null;
  completedAt: string | null;
  lastError: string | null;
}

interface OutboxRow {
  id: string;
  operation_id: string;
  record_key: string;
  kind: GoogleSheetsSyncKind;
  payload: SheetSyncPayload;
  status: GoogleSheetsSyncStatus;
  attempts: number;
  created_at: Date;
  updated_at: Date;
  next_attempt_at: Date;
  locked_at: Date | null;
  locked_by: string | null;
  completed_at: Date | null;
  last_error: string | null;
}

function rowToJob(row: OutboxRow): GoogleSheetsSyncJob {
  return {
    _id: row.id,
    operationId: row.operation_id,
    recordKey: row.record_key,
    kind: row.kind,
    payload: row.payload,
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

export interface EnqueueGoogleSheetsSyncInput {
  operationId: string;
  kind: GoogleSheetsSyncKind;
  payload: SheetSyncPayload;
}

export async function enqueueGoogleSheetsSync(input: EnqueueGoogleSheetsSyncInput, clock: Clock = systemClock): Promise<void> {
  const now = clock.now();
  await withPostgresClient((client) =>
    client.query(
      `INSERT INTO cp_outbox_google_sheets_sync
         (id, operation_id, record_key, kind, payload, status, attempts, created_at, updated_at, next_attempt_at)
       VALUES ($1, $1, $2, $3, $4::jsonb, 'pending', 0, $5, $5, $5)
       ON CONFLICT (id) DO NOTHING`,
      [input.operationId, input.payload.recordKey, input.kind, JSON.stringify(input.payload), now]
    )
  );
}

export async function claimNextGoogleSheetsJob(workerId: string, clock: Clock = systemClock): Promise<GoogleSheetsSyncJob | null> {
  const now = clock.now();
  return withPostgresClient(async (client) => {
    const { rows } = await client.query<OutboxRow>(
      `UPDATE cp_outbox_google_sheets_sync
       SET status = 'processing', locked_at = $1, locked_by = $2, updated_at = $1
       WHERE id = (
         SELECT id FROM cp_outbox_google_sheets_sync
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

export async function markGoogleSheetsJobSynced(jobId: string, clock: Clock = systemClock): Promise<void> {
  const now = clock.now();
  await withPostgresClient((client) =>
    client.query(
      `UPDATE cp_outbox_google_sheets_sync
       SET status = 'synced', completed_at = $2, updated_at = $2, locked_at = NULL, locked_by = NULL, last_error = NULL
       WHERE id = $1`,
      [jobId, now]
    )
  );
}

export async function markGoogleSheetsJobRetry(jobId: string, error: unknown, clock: Clock = systemClock): Promise<void> {
  await withPostgresClient(async (client) => {
    const { rows } = await client.query<OutboxRow>("SELECT * FROM cp_outbox_google_sheets_sync WHERE id = $1", [jobId]);
    const job = rows[0];
    if (!job) return;

    const now = clock.now();
    const nextAttempts = job.attempts + 1;
    const delayMs = RETRY_BACKOFF_MS[nextAttempts - 1];

    if (delayMs === undefined) {
      await client.query(
        `UPDATE cp_outbox_google_sheets_sync
         SET status = 'failed', attempts = $2, updated_at = $3, locked_at = NULL, locked_by = NULL, last_error = $4
         WHERE id = $1`,
        [jobId, nextAttempts, now, sanitizeOutboxError(error)]
      );
      return;
    }

    await client.query(
      `UPDATE cp_outbox_google_sheets_sync
       SET status = 'retry', attempts = $2, updated_at = $3, next_attempt_at = $4, locked_at = NULL, locked_by = NULL, last_error = $5
       WHERE id = $1`,
      [jobId, nextAttempts, now, new Date(now.getTime() + delayMs), sanitizeOutboxError(error)]
    );
  });
}

export async function recoverStaleGoogleSheetsLocks(clock: Clock = systemClock): Promise<number> {
  const now = clock.now();
  const staleBefore = new Date(now.getTime() - STALE_LOCK_MS);
  return withPostgresClient(async (client) => {
    const result = await client.query(
      `UPDATE cp_outbox_google_sheets_sync
       SET status = 'retry', updated_at = $2, next_attempt_at = $2, locked_at = NULL, locked_by = NULL
       WHERE status = 'processing' AND locked_at <= $1`,
      [staleBefore, now]
    );
    return result.rowCount ?? 0;
  });
}

export async function getGoogleSheetsJob(jobId: string): Promise<GoogleSheetsSyncJob | null> {
  return withPostgresClient(async (client) => {
    const { rows } = await client.query<OutboxRow>("SELECT * FROM cp_outbox_google_sheets_sync WHERE id = $1", [jobId]);
    return rows[0] ? rowToJob(rows[0]) : null;
  });
}
