/**
 * MongoDB implementation of the durable follower outbox (Story 72 §12).
 * Dispatched to by `data-outbox.ts` whenever the configured primary backend
 * isn't `postgres` (Story 80) — see that file. Unchanged in behavior from
 * before Story 80; only relocated (was `data-outbox.ts` itself) and now
 * importing its shared types/constants from `data-outbox-shared.ts` instead
 * of defining them locally.
 *
 * `_id` is `${operationId}:${followerBackend}` — Mongo's native `_id`
 * uniqueness is exactly the "unique per operationId+follower" key needed,
 * no separate index required.
 */

import type { Collection, Db } from "mongodb";
import { getMongoDb } from "./mongo.js";
import type { Clock } from "./data-clock.js";
import { systemClock } from "./data-clock.js";
import {
  outboxJobId,
  sanitizeOutboxError,
  RETRY_BACKOFF_MS,
  STALE_LOCK_MS,
  type EnqueueFollowerOperationInput,
  type OutboxJob,
} from "./data-outbox-shared.js";

export const OUTBOX_COLLECTION = "data_sync_outbox";

async function collection(): Promise<Collection<OutboxJob>> {
  const db: Db = await getMongoDb();
  return db.collection<OutboxJob>(OUTBOX_COLLECTION);
}

/**
 * Idempotent — enqueuing the same operationId+follower twice is a no-op
 * (the second call finds the doc already exists via `_id` and does
 * nothing).
 */
export async function enqueueFollowerOperation(
  input: EnqueueFollowerOperationInput,
  clock: Clock = systemClock
): Promise<void> {
  const col = await collection();
  const now = clock.now().toISOString();
  const _id = outboxJobId(input.command.operationId, input.followerBackend);

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
 * Atomically claims the next eligible job (`pending`/`retry`, due) for this
 * worker instance — a single `findOneAndUpdate`, so two worker instances
 * can never claim the same job.
 */
export async function claimNextJob(workerId: string, clock: Clock = systemClock): Promise<OutboxJob | null> {
  const col = await collection();
  const now = clock.now().toISOString();

  const result = await col.findOneAndUpdate(
    { status: { $in: ["pending", "retry"] }, nextAttemptAt: { $lte: now } },
    { $set: { status: "processing", lockedAt: now, lockedBy: workerId, updatedAt: now } },
    { returnDocument: "after", sort: { nextAttemptAt: 1 } }
  );

  return result ?? null;
}

export async function markSynced(jobId: string, clock: Clock = systemClock): Promise<void> {
  const col = await collection();
  const now = clock.now().toISOString();
  await col.updateOne(
    { _id: jobId },
    { $set: { status: "synced", completedAt: now, updatedAt: now, lockedAt: null, lockedBy: null, lastError: null } }
  );
}

/** Records a failed attempt and schedules the next retry per `RETRY_BACKOFF_MS`, or marks `failed` once exhausted. */
export async function markRetry(jobId: string, error: unknown, clock: Clock = systemClock): Promise<void> {
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
          lastError: sanitizeOutboxError(error),
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
        lastError: sanitizeOutboxError(error),
      },
    }
  );
}

/** The follower's current state disagrees with what the command expected — never blindly overwritten, recorded for manual/future resolution. */
export async function markConflict(jobId: string, diagnosticMessage: string, clock: Clock = systemClock): Promise<void> {
  const col = await collection();
  await col.updateOne(
    { _id: jobId },
    { $set: { status: "conflict", updatedAt: clock.now().toISOString(), lockedAt: null, lockedBy: null, lastError: diagnosticMessage } }
  );
}

/** Resets jobs stuck in `processing` past `STALE_LOCK_MS` back to `retry` (crash recovery) — run at the start of every worker pass. */
export async function recoverStaleLocks(clock: Clock = systemClock): Promise<number> {
  const col = await collection();
  const now = clock.now();
  const staleBefore = new Date(now.getTime() - STALE_LOCK_MS).toISOString();

  const result = await col.updateMany(
    { status: "processing", lockedAt: { $lte: staleBefore } },
    { $set: { status: "retry", updatedAt: now.toISOString(), nextAttemptAt: now.toISOString(), lockedAt: null, lockedBy: null } }
  );
  return result.modifiedCount;
}

export async function getJob(jobId: string): Promise<OutboxJob | null> {
  const col = await collection();
  return col.findOne({ _id: jobId });
}

/**
 * Repair step for the non-transactional primary-write + outbox-enqueue gap
 * (Story 72): given operationIds a primary write is known to have committed
 * with a given follower expected, backfills any missing outbox job.
 */
export async function reconcileMissingOutboxJobs(
  expectedOperations: EnqueueFollowerOperationInput[],
  clock: Clock = systemClock
): Promise<number> {
  const col = await collection();
  let created = 0;
  for (const expected of expectedOperations) {
    const _id = outboxJobId(expected.command.operationId, expected.followerBackend);
    const existing = await col.findOne({ _id });
    if (!existing) {
      await enqueueFollowerOperation(expected, clock);
      created++;
    }
  }
  return created;
}
