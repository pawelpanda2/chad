/**
 * Transaction-scoped buffer for Google Sheets outbox jobs.
 *
 * When a Postgres cp_items mutation runs inside `runWithGoogleSheetsTxnBuffer`,
 * callers register either a concrete job or a factory (needed for create,
 * where `loca` is only known after address allocation).
 * `flushPendingGoogleSheetsJobs` inserts on the same `PoolClient` before
 * COMMIT — cp_items + cp_history + outbox commit or roll back together.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { PoolClient } from "pg";
import type { CpItem } from "../cp-model.js";
import { addressToRepoAndLoca } from "../cp-model.js";
import type { EnqueueGoogleSheetsSyncInput } from "./outbox-postgres.js";
import { enqueueGoogleSheetsSyncOnClient, enqueueBlockedGoogleSheetsSyncOnClient } from "./outbox-postgres.js";

export interface GoogleSheetsFlushContext {
  mutationId: string;
  /** Present for put/create; null after delete. */
  item: CpItem | null;
}

/**
 * When set, `flushPendingGoogleSheetsJobs` inserts this job as an already-
 * `failed` row with this `lastError` instead of a normal `pending` one —
 * used when a record IS supposed to sync but couldn't even be enqueued
 * (config/guard/mapping failure), so the mutation still commits with a
 * visible, non-silent sync record instead of none at all.
 */
type BlockableInput = EnqueueGoogleSheetsSyncInput & { blockedReason?: string };

type PendingFactory = (ctx: GoogleSheetsFlushContext) => BlockableInput | null;

interface SheetTxnStore {
  pending: BlockableInput[];
  factories: PendingFactory[];
}

const als = new AsyncLocalStorage<SheetTxnStore>();

export function runWithGoogleSheetsTxnBuffer<T>(fn: () => Promise<T>): Promise<T> {
  return als.run({ pending: [], factories: [] }, fn);
}

/** Returns true when the job was buffered for the open mutation transaction. */
export function deferGoogleSheetsJob(input: BlockableInput): boolean {
  const store = als.getStore();
  if (!store) return false;
  store.pending.push(input);
  return true;
}

/**
 * Register a factory resolved at flush time — use for creates where loca
 * is only known after the mutation allocates an address.
 */
export function deferGoogleSheetsJobFactory(factory: PendingFactory): boolean {
  const store = als.getStore();
  if (!store) return false;
  store.factories.push(factory);
  return true;
}

/**
 * Inserts every deferred job on `client` (same transaction as the mutation).
 * Forces `operationId` to `mutationId` so History can join by mutation id.
 */
export async function flushPendingGoogleSheetsJobs(
  client: PoolClient,
  mutationId: string,
  item: CpItem | null = null
): Promise<number> {
  const store = als.getStore();
  if (!store) return 0;

  const jobs: BlockableInput[] = [];
  while (store.pending.length) jobs.push(store.pending.shift()!);
  while (store.factories.length) {
    const factory = store.factories.shift()!;
    const built = factory({ mutationId, item });
    if (built) jobs.push(built);
  }

  for (const job of jobs) {
    let payload = { ...job.payload, mutationId };
    // If factory/caller left loca blank, fill from the mutated item.
    if ((!payload.loca || !payload.recordKey.includes(":")) && item) {
      const { loca } = addressToRepoAndLoca(item.config.address);
      payload = {
        ...payload,
        loca,
        itemName: payload.itemName || item.config.name,
        recordKey: `${payload.repoGuid}:${loca}`,
      };
    }
    if (job.blockedReason) {
      await enqueueBlockedGoogleSheetsSyncOnClient(client, {
        ...job,
        operationId: mutationId,
        payload,
        reason: job.blockedReason,
      });
    } else {
      await enqueueGoogleSheetsSyncOnClient(client, {
        ...job,
        operationId: mutationId,
        payload,
      });
    }
  }
  return jobs.length;
}

export function discardPendingGoogleSheetsJobs(): void {
  const store = als.getStore();
  if (store) {
    store.pending = [];
    store.factories = [];
  }
}

export function hasGoogleSheetsTxnBuffer(): boolean {
  return !!als.getStore();
}
