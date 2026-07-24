/**
 * `data_sync_outbox` backend dispatcher (Story 80). Story 72 built this
 * durable follower outbox directly on MongoDB (now `data-outbox-mongo.ts`);
 * Story 80 adds a PostgreSQL-backed implementation (`cp_outbox_data_sync`,
 * `data-outbox-postgres.ts`) and turns this module into a thin dispatcher on
 * `loadDataProvidersConfig().primaryBackend`, so `data-outbox-worker.ts` and
 * `DbaDataRouter`'s `enqueueFollowerOperation` call need zero changes to
 * work against whichever backend a repo has cut over to.
 *
 * PROD is unaffected by this Story (it never sets `DBA_PRIMARY_BACKEND=
 * postgres`) — every call here forwards to the exact same Mongo
 * implementation Story 72 already shipped whenever the primary backend
 * isn't `postgres`.
 */

import { loadDataProvidersConfig } from "./data-providers/config.js";
import type { Clock } from "./data-clock.js";
import { systemClock } from "./data-clock.js";
import * as mongoOutbox from "./data-outbox-mongo.js";
import * as postgresOutbox from "./data-outbox-postgres.js";

export type { OutboxJob, OutboxStatus, EnqueueFollowerOperationInput } from "./data-outbox-shared.js";
export { RETRY_BACKOFF_MS, STALE_LOCK_MS } from "./data-outbox-shared.js";
export { OUTBOX_COLLECTION } from "./data-outbox-mongo.js";

import type { EnqueueFollowerOperationInput, OutboxJob } from "./data-outbox-shared.js";

interface OutboxBackend {
  enqueueFollowerOperation(input: EnqueueFollowerOperationInput, clock?: Clock): Promise<void>;
  claimNextJob(workerId: string, clock?: Clock): Promise<OutboxJob | null>;
  markSynced(jobId: string, clock?: Clock): Promise<void>;
  markRetry(jobId: string, error: unknown, clock?: Clock): Promise<void>;
  markConflict(jobId: string, diagnosticMessage: string, clock?: Clock): Promise<void>;
  recoverStaleLocks(clock?: Clock): Promise<number>;
  getJob(jobId: string): Promise<OutboxJob | null>;
  reconcileMissingOutboxJobs(expectedOperations: EnqueueFollowerOperationInput[], clock?: Clock): Promise<number>;
}

function backend(): OutboxBackend {
  return loadDataProvidersConfig().primaryBackend === "postgres" ? postgresOutbox : mongoOutbox;
}

export async function enqueueFollowerOperation(input: EnqueueFollowerOperationInput, clock: Clock = systemClock): Promise<void> {
  return backend().enqueueFollowerOperation(input, clock);
}

export async function claimNextJob(workerId: string, clock: Clock = systemClock): Promise<OutboxJob | null> {
  return backend().claimNextJob(workerId, clock);
}

export async function markSynced(jobId: string, clock: Clock = systemClock): Promise<void> {
  return backend().markSynced(jobId, clock);
}

export async function markRetry(jobId: string, error: unknown, clock: Clock = systemClock): Promise<void> {
  return backend().markRetry(jobId, error, clock);
}

export async function markConflict(jobId: string, diagnosticMessage: string, clock: Clock = systemClock): Promise<void> {
  return backend().markConflict(jobId, diagnosticMessage, clock);
}

export async function recoverStaleLocks(clock: Clock = systemClock): Promise<number> {
  return backend().recoverStaleLocks(clock);
}

export async function getJob(jobId: string): Promise<OutboxJob | null> {
  return backend().getJob(jobId);
}

export async function reconcileMissingOutboxJobs(
  expectedOperations: EnqueueFollowerOperationInput[],
  clock: Clock = systemClock
): Promise<number> {
  return backend().reconcileMissingOutboxJobs(expectedOperations, clock);
}
