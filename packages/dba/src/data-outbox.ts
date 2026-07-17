/**
 * Durable outbox for follower-backend writes (Story 72 §12).
 *
 * A `put-item`/`create-child-item` command that the primary has already
 * executed successfully gets enqueued here for the follower to replay
 * later, asynchronously, out of the request path (§11). This is what makes
 * the follower write durable across restarts/crashes/deploys — the
 * alternative (`void followerProvider.executeWrite(command)`) is
 * explicitly forbidden by §34.
 *
 * `_id` is `${operationId}:${followerBackend}` — Mongo's native `_id`
 * uniqueness is exactly the "unique per operationId+follower" key §12
 * asks for, no separate index needed.
 */

import type { Collection, Db } from "mongodb";
import { getMongoDb } from "./mongo.js";
import type { Clock } from "./data-clock.js";
import { systemClock } from "./data-clock.js";
import type { DataBackendName } from "./data-providers/types.js";
import type { DataWriteCommand } from "./data-commands.js";

export const OUTBOX_COLLECTION = "data_sync_outbox";

export type OutboxStatus =
  | "pending"
  | "processing"
  | "retry"
  | "synced"
  | "failed"
  | "conflict";

export interface OutboxJob {
  _id: string;
  operationId: string;
  commandKind: DataWriteCommand["kind"];
  primaryBackend: DataBackendName;
  followerBackend: DataBackendName;
  command: DataWriteCommand;
  status: OutboxStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string;
  lockedAt: string | null;
  lockedBy: string | null;
  completedAt: string | null;
  lastError: string | null;
}

/** Backoff schedule per Story 72 §14: 1m, 5m, 15m, 1h, 6h, then `failed`. */
export const RETRY_BACKOFF_MS = [
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
  6 * 60 * 60_000,
];

/** A job stuck in `processing` longer than this is assumed crashed (§14 point 10). */
export const STALE_LOCK_MS = 10 * 60_000;

function jobId(operationId: string, followerBackend: DataBackendName): string {
  return `${operationId}:${followerBackend}`;
}

async function collection(): Promise<Collection<OutboxJob>> {
  const db: Db = await getMongoDb();
  return db.collection<OutboxJob>(OUTBOX_COLLECTION);
}

export interface EnqueueFollowerOperationInput {
  command: DataWriteCommand;
  primaryBackend: DataBackendName;
  followerBackend: DataBackendName;
}

/**
 * Idempotent — enqueuing the same operationId+follower twice is a no-op
 * (the second call finds the doc already exists via `_id` and does
 * nothing), matching the "no duplicate job" half of §15.
 */
export async function enqueueFollowerOperation(
  input: EnqueueFollowerOperationInput,
  clock: Clock = systemClock
): Promise<void> {
  const col = await collection();
  const now = clock.now().toISOString();
  const _id = jobId(input.command.operationId, input.followerBackend);

  await col.updateOne(
    { _id },
    {
      $setOnInsert: {
        _id,
        operationId: input.command.operationId,
        commandKind: input.command.kind,
        primaryBackend: input.primaryBackend,
        followerBackend: input.followerBackend,
        command: input.command,
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
 * Atomically claims the next eligible job (`pending`/`retry`, due) for
 * this worker instance — a single `findOneAndUpdate`, so two worker
 * instances can never claim the same job (§14 "nie może przetwarzać
 * jednego jobu równolegle w dwóch instancjach").
 */
export async function claimNextJob(
  workerId: string,
  clock: Clock = systemClock
): Promise<OutboxJob | null> {
  const col = await collection();
  const now = clock.now().toISOString();

  const result = await col.findOneAndUpdate(
    {
      status: { $in: ["pending", "retry"] },
      nextAttemptAt: { $lte: now },
    },
    {
      $set: {
        status: "processing",
        lockedAt: now,
        lockedBy: workerId,
        updatedAt: now,
      },
    },
    { returnDocument: "after", sort: { nextAttemptAt: 1 } }
  );

  return result ?? null;
}

export async function markSynced(jobId_: string, clock: Clock = systemClock): Promise<void> {
  const col = await collection();
  const now = clock.now().toISOString();
  await col.updateOne(
    { _id: jobId_ },
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

/**
 * Records a failed attempt and schedules the next retry per
 * `RETRY_BACKOFF_MS`, or marks `failed` once the schedule is exhausted.
 */
export async function markRetry(
  jobId_: string,
  error: unknown,
  clock: Clock = systemClock
): Promise<void> {
  const col = await collection();
  const job = await col.findOne({ _id: jobId_ });
  if (!job) return;

  const now = clock.now();
  const nextAttempts = job.attempts + 1;
  const delayMs = RETRY_BACKOFF_MS[nextAttempts - 1];

  if (delayMs === undefined) {
    await col.updateOne(
      { _id: jobId_ },
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
    { _id: jobId_ },
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

/**
 * The follower's current state under this id/address disagrees with what
 * the command expected — never blindly overwritten (§15). Recorded with a
 * diagnostic message, left for manual/future resolution.
 */
export async function markConflict(
  jobId_: string,
  diagnosticMessage: string,
  clock: Clock = systemClock
): Promise<void> {
  const col = await collection();
  await col.updateOne(
    { _id: jobId_ },
    {
      $set: {
        status: "conflict",
        updatedAt: clock.now().toISOString(),
        lockedAt: null,
        lockedBy: null,
        lastError: diagnosticMessage,
      },
    }
  );
}

/**
 * Resets jobs stuck in `processing` past `STALE_LOCK_MS` back to `retry`
 * (crash recovery, §14 point 10) — run at the start of every worker pass.
 */
export async function recoverStaleLocks(clock: Clock = systemClock): Promise<number> {
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

export async function getJob(jobId_: string): Promise<OutboxJob | null> {
  const col = await collection();
  return col.findOne({ _id: jobId_ });
}

/**
 * Repair step for the non-transactional primary-write + outbox-enqueue
 * gap (Story 72 `02_plan.md` §2.4): given the full set of operationIds
 * that a primary write is known to have committed with a given follower
 * expected, backfills any outbox job that's missing (e.g. the process
 * crashed between the item write and the enqueue call). Not wired into a
 * cron in this Story — see `06_others_from_report.md`.
 */
export async function reconcileMissingOutboxJobs(
  expectedOperations: EnqueueFollowerOperationInput[],
  clock: Clock = systemClock
): Promise<number> {
  const col = await collection();
  let created = 0;
  for (const expected of expectedOperations) {
    const _id = jobId(expected.command.operationId, expected.followerBackend);
    const existing = await col.findOne({ _id });
    if (!existing) {
      await enqueueFollowerOperation(expected, clock);
      created++;
    }
  }
  return created;
}

function sanitizeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
