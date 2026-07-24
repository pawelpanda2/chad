/**
 * MongoDB implementation of the Google Sheets sync outbox (Story 75).
 * Dispatched to by `outbox.ts` whenever the configured primary backend
 * isn't `postgres` (Story 80 adds `outbox-postgres.ts`, backing
 * `cp_outbox_google_sheets_sync`) — see that file.
 *
 * Mirrors `data-outbox-mongo.ts`'s proven shape (status enum, attempts/
 * nextAttemptAt/lockedAt/lockedBy/lastError, claim/markSynced/markRetry/
 * recoverStaleLocks) but with its own collection and its own job payload —
 * a `SheetSyncPayload` snapshot, not a `DataWriteCommand` against a
 * `CpCompatibleDataProvider`. See `backlog/stories/75/02_plan.md` §2 for why
 * this is a parallel module rather than a reuse of `data-outbox-mongo.ts`'s
 * types.
 *
 * `_id` is a fresh `operationId` per write (not the record key) — each job
 * is a complete, independently-idempotent snapshot; several queued jobs for
 * the same record are applied in order and each individually converges the
 * target row to that snapshot's values, so no job ever needs to know about
 * or supersede another (see plan §2, "Job identity").
 */

import type { Collection, Db } from "mongodb";
import { getMongoDb } from "../mongo.js";
import type { Clock } from "../data-clock.js";
import { systemClock } from "../data-clock.js";
import { RETRY_BACKOFF_MS, STALE_LOCK_MS } from "../data-outbox.js";
import type { SheetSyncPayload, GoogleSheetsSyncKind } from "./types.js";

export const GOOGLE_SHEETS_OUTBOX_COLLECTION = "google_sheets_sync_outbox";

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

async function collection(): Promise<Collection<GoogleSheetsSyncJob>> {
  const db: Db = await getMongoDb();
  return db.collection<GoogleSheetsSyncJob>(GOOGLE_SHEETS_OUTBOX_COLLECTION);
}

export interface EnqueueGoogleSheetsSyncInput {
  operationId: string;
  kind: GoogleSheetsSyncKind;
  payload: SheetSyncPayload;
}

/**
 * Idempotent per `operationId` — enqueuing the same operationId twice (e.g.
 * a retried caller) is a no-op the second time, matching §15's "no
 * duplicate job" requirement at the queue level (row-level duplicate
 * prevention is the sheets client's job — see plan §2).
 */
export async function enqueueGoogleSheetsSync(
  input: EnqueueGoogleSheetsSyncInput,
  clock: Clock = systemClock
): Promise<void> {
  const col = await collection();
  const now = clock.now().toISOString();

  await col.updateOne(
    { _id: input.operationId },
    {
      $setOnInsert: {
        _id: input.operationId,
        operationId: input.operationId,
        recordKey: input.payload.recordKey,
        kind: input.kind,
        payload: input.payload,
        status: "pending",
        attempts: 0,
        createdAt: now,
        updatedAt: now,
        nextAttemptAt: now,
        lockedAt: null,
        lockedBy: null,
        completedAt: null,
        lastError: null,
      },
    },
    { upsert: true }
  );
}

/**
 * Atomically claims the next eligible job (`pending`/`retry`, due), oldest
 * `nextAttemptAt` first — a single `findOneAndUpdate`, so two worker
 * instances can never claim the same job.
 */
export async function claimNextGoogleSheetsJob(
  workerId: string,
  clock: Clock = systemClock
): Promise<GoogleSheetsSyncJob | null> {
  const col = await collection();
  const now = clock.now().toISOString();

  const result = await col.findOneAndUpdate(
    { status: { $in: ["pending", "retry"] }, nextAttemptAt: { $lte: now } },
    { $set: { status: "processing", lockedAt: now, lockedBy: workerId, updatedAt: now } },
    { returnDocument: "after", sort: { nextAttemptAt: 1 } }
  );

  return result ?? null;
}

export async function markGoogleSheetsJobSynced(jobId: string, clock: Clock = systemClock): Promise<void> {
  const col = await collection();
  const now = clock.now().toISOString();
  await col.updateOne(
    { _id: jobId },
    {
      $set: {
        status: "synced",
        completedAt: now,
        updatedAt: now,
        lockedAt: null,
        lockedBy: null,
        lastError: null,
      },
    }
  );
}

/** Same backoff schedule as `data-outbox.ts` (1m, 5m, 15m, 1h, 6h, then `failed`) — reused, not redefined. */
export async function markGoogleSheetsJobRetry(
  jobId: string,
  error: unknown,
  clock: Clock = systemClock
): Promise<void> {
  const col = await collection();
  const job = await col.findOne({ _id: jobId });
  if (!job) return;

  const now = clock.now();
  const nextAttempts = job.attempts + 1;
  const delayMs = RETRY_BACKOFF_MS[nextAttempts - 1];

  if (delayMs === undefined) {
    await col.updateOne(
      { _id: jobId },
      {
        $set: {
          status: "failed",
          attempts: nextAttempts,
          updatedAt: now.toISOString(),
          lockedAt: null,
          lockedBy: null,
          lastError: sanitizeError(error),
        },
      }
    );
    return;
  }

  await col.updateOne(
    { _id: jobId },
    {
      $set: {
        status: "retry",
        attempts: nextAttempts,
        updatedAt: now.toISOString(),
        nextAttemptAt: new Date(now.getTime() + delayMs).toISOString(),
        lockedAt: null,
        lockedBy: null,
        lastError: sanitizeError(error),
      },
    }
  );
}

/** Crash recovery: resets jobs stuck in `processing` past `STALE_LOCK_MS` back to `retry`. */
export async function recoverStaleGoogleSheetsLocks(clock: Clock = systemClock): Promise<number> {
  const col = await collection();
  const now = clock.now();
  const staleBefore = new Date(now.getTime() - STALE_LOCK_MS).toISOString();

  const result = await col.updateMany(
    { status: "processing", lockedAt: { $lte: staleBefore } },
    {
      $set: {
        status: "retry",
        updatedAt: now.toISOString(),
        nextAttemptAt: now.toISOString(),
        lockedAt: null,
        lockedBy: null,
      },
    }
  );
  return result.modifiedCount;
}

export async function getGoogleSheetsJob(jobId: string): Promise<GoogleSheetsSyncJob | null> {
  const col = await collection();
  return col.findOne({ _id: jobId });
}

function sanitizeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
