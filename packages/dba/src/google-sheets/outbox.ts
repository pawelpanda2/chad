/**
 * Google Sheets sync outbox backend dispatcher (Story 80). Story 75 built
 * this durable outbox directly on MongoDB (now `outbox-mongo.ts`); Story 80
 * adds a PostgreSQL-backed implementation (`cp_outbox_google_sheets_sync`,
 * `outbox-postgres.ts`) and turns this module into a thin dispatcher on
 * `loadDataProvidersConfig().primaryBackend`, so `worker.ts`/`bootstrap.ts`
 * need zero changes to work against whichever backend a repo has cut over
 * to.
 *
 * PROD is unaffected by this Story (it never sets `DBA_PRIMARY_BACKEND=
 * postgres`, and the Google Sheets worker is production-guarded to only
 * ever run there) — every call here forwards to the exact same Mongo
 * implementation Story 75 already shipped whenever the primary backend
 * isn't `postgres`.
 */

import { loadDataProvidersConfig } from "../data-providers/config.js";
import type { Clock } from "../data-clock.js";
import { systemClock } from "../data-clock.js";
import * as mongoOutbox from "./outbox-mongo.js";
import * as postgresOutbox from "./outbox-postgres.js";
import type { GoogleSheetsSyncJob, EnqueueGoogleSheetsSyncInput } from "./outbox-mongo.js";

export type { GoogleSheetsSyncJob, GoogleSheetsSyncStatus, EnqueueGoogleSheetsSyncInput } from "./outbox-mongo.js";
export { GOOGLE_SHEETS_OUTBOX_COLLECTION } from "./outbox-mongo.js";

interface GoogleSheetsOutboxBackend {
  enqueueGoogleSheetsSync(input: EnqueueGoogleSheetsSyncInput, clock?: Clock): Promise<void>;
  claimNextGoogleSheetsJob(workerId: string, clock?: Clock): Promise<GoogleSheetsSyncJob | null>;
  markGoogleSheetsJobSynced(jobId: string, clock?: Clock): Promise<void>;
  markGoogleSheetsJobRetry(jobId: string, error: unknown, clock?: Clock): Promise<void>;
  recoverStaleGoogleSheetsLocks(clock?: Clock): Promise<number>;
  getGoogleSheetsJob(jobId: string): Promise<GoogleSheetsSyncJob | null>;
}

function backend(): GoogleSheetsOutboxBackend {
  return loadDataProvidersConfig().primaryBackend === "postgres" ? postgresOutbox : mongoOutbox;
}

export async function enqueueGoogleSheetsSync(input: EnqueueGoogleSheetsSyncInput, clock: Clock = systemClock): Promise<void> {
  return backend().enqueueGoogleSheetsSync(input, clock);
}

export async function claimNextGoogleSheetsJob(workerId: string, clock: Clock = systemClock): Promise<GoogleSheetsSyncJob | null> {
  return backend().claimNextGoogleSheetsJob(workerId, clock);
}

export async function markGoogleSheetsJobSynced(jobId: string, clock: Clock = systemClock): Promise<void> {
  return backend().markGoogleSheetsJobSynced(jobId, clock);
}

export async function markGoogleSheetsJobRetry(jobId: string, error: unknown, clock: Clock = systemClock): Promise<void> {
  return backend().markGoogleSheetsJobRetry(jobId, error, clock);
}

export async function recoverStaleGoogleSheetsLocks(clock: Clock = systemClock): Promise<number> {
  return backend().recoverStaleGoogleSheetsLocks(clock);
}

export async function getGoogleSheetsJob(jobId: string): Promise<GoogleSheetsSyncJob | null> {
  return backend().getGoogleSheetsJob(jobId);
}
