/**
 * Background worker that drains `data_sync_outbox` (Story 72 §14).
 *
 * Process placement (which long-lived Node process actually runs
 * `runOutboxWorker`) is a deploy-time decision, out of this Story's scope
 * (§27) — this module is complete and independently testable/invocable on
 * its own; wiring it into a specific running process is left as a
 * documented follow-up (`06_others_from_report.md`).
 */

import { randomUUID } from "node:crypto";
import {
  claimNextJob,
  markConflict,
  markRetry,
  markSynced,
  recoverStaleLocks,
  type OutboxJob,
} from "./data-outbox.js";
import type { CpCompatibleDataProvider, DataBackendName } from "./data-providers/types.js";
import type { CpItem } from "./cp-model.js";

export interface OutboxWorkerDeps {
  providers: Partial<Record<DataBackendName, CpCompatibleDataProvider>>;
  workerId?: string;
}

/**
 * Claims and processes exactly one job, if one is due. Returns `false`
 * when there was nothing to do (caller should stop looping).
 */
export async function processOutboxJobsOnce(deps: OutboxWorkerDeps): Promise<boolean> {
  const workerId = deps.workerId ?? `worker-${randomUUID()}`;
  const job = await claimNextJob(workerId);
  if (!job) return false;

  const follower = deps.providers[job.followerBackend];
  if (!follower) {
    await markRetry(
      job._id,
      new Error(`No provider registered for follower backend "${job.followerBackend}"`)
    );
    return true;
  }

  try {
    const result = await follower.executeWrite(job.command);
    const conflict = detectConflict(job, result.item);
    if (conflict) {
      await markConflict(job._id, conflict);
    } else {
      await markSynced(job._id);
    }
  } catch (error) {
    await markRetry(job._id, error);
  }

  return true;
}

/**
 * §15: if the follower's state disagrees with what the command expected,
 * this is a conflict, not a silent overwrite. `id` is intentionally
 * excluded from the comparison for the `content-provider` follower — see
 * the audited limitation in `data-providers/legacy-cp-provider.ts` (CP
 * always assigns its own GUID on every write; that alone is not a
 * conflict, only an address/type/name mismatch is).
 */
function detectConflict(job: OutboxJob, actual: CpItem): string | null {
  const expected =
    job.command.kind === "put-item" ? job.command.item : job.command.item;
  if (!expected) return null;

  const problems: string[] = [];
  if (actual.config.address !== expected.config.address) {
    problems.push(`address mismatch: expected "${expected.config.address}", got "${actual.config.address}"`);
  }
  if (job.followerBackend !== "content-provider" && actual._id !== expected._id) {
    problems.push(`id mismatch: expected "${expected._id}", got "${actual._id}"`);
  }
  if (actual.config.type !== expected.config.type) {
    problems.push(`type mismatch: expected "${expected.config.type}", got "${actual.config.type}"`);
  }

  return problems.length > 0 ? problems.join("; ") : null;
}

/**
 * Runs `recoverStaleLocks` once, then drains all currently-due jobs
 * (repeated `processOutboxJobsOnce` until nothing's left).
 */
export async function drainOutboxOnce(deps: OutboxWorkerDeps): Promise<number> {
  await recoverStaleLocks();
  let processed = 0;
  while (await processOutboxJobsOnce(deps)) {
    processed++;
  }
  return processed;
}

/** Simple interval-based loop for a long-running process. */
export function runOutboxWorker(deps: OutboxWorkerDeps, intervalMs = 5000): () => void {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      await drainOutboxOnce(deps);
    } catch (error) {
      console.error("[runOutboxWorker] tick failed:", error);
    }
    if (!stopped) setTimeout(tick, intervalMs);
  };
  void tick();
  return () => {
    stopped = true;
  };
}
