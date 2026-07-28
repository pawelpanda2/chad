/**
 * Google Sheets sync outbox backend dispatcher (Story 80). Story 75 built
 * this durable outbox directly on MongoDB (now `outbox-mongo.ts`); Story 80
 * adds a PostgreSQL-backed implementation (`cp_outbox_google_sheets_sync`,
 * `outbox-postgres.ts`) and turns this module into a thin dispatcher on
 * `loadDataProvidersConfig().primaryBackend`.
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
  getLatestGoogleSheetsJobForUsername(username: string): Promise<GoogleSheetsSyncJob | null>;
  getGoogleSheetsJobByMutationId?(mutationId: string): Promise<GoogleSheetsSyncJob | null>;
  getLatestGoogleSheetsJobForRecordKey?(recordKey: string): Promise<GoogleSheetsSyncJob | null>;
}

function backend(): GoogleSheetsOutboxBackend {
  return loadDataProvidersConfig().primaryBackend === "postgres" ? postgresOutbox : mongoOutbox;
}

export async function enqueueGoogleSheetsSync(input: EnqueueGoogleSheetsSyncInput, clock: Clock = systemClock): Promise<void> {
  return backend().enqueueGoogleSheetsSync(input, clock);
}

/**
 * Postgres-only (CHAD's real primary — see `outbox-postgres.ts`'s own doc
 * comment for why this exists). No-ops on the legacy Mongo backend, which
 * isn't live for CHAD's own cp_items/cp_history since 2026-07-27.
 */
export async function enqueueBlockedGoogleSheetsSync(
  input: EnqueueGoogleSheetsSyncInput & { reason: string },
  clock: Clock = systemClock
): Promise<void> {
  if (loadDataProvidersConfig().primaryBackend !== "postgres") return;
  return postgresOutbox.enqueueBlockedGoogleSheetsSync(input, clock);
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

export async function getLatestGoogleSheetsJobForUsername(
  username: string
): Promise<GoogleSheetsSyncJob | null> {
  return backend().getLatestGoogleSheetsJobForUsername(username);
}

export async function getGoogleSheetsJobByMutationId(
  mutationId: string
): Promise<GoogleSheetsSyncJob | null> {
  const b = backend();
  if (b.getGoogleSheetsJobByMutationId) {
    return b.getGoogleSheetsJobByMutationId(mutationId);
  }
  return getGoogleSheetsJob(mutationId);
}

export async function getLatestGoogleSheetsJobForRecordKey(
  recordKey: string
): Promise<GoogleSheetsSyncJob | null> {
  const b = backend();
  if (b.getLatestGoogleSheetsJobForRecordKey) {
    return b.getLatestGoogleSheetsJobForRecordKey(recordKey);
  }
  return null;
}

export type GoogleSheetsUserSyncKind = "ok" | "failed" | "pending" | "none" | "not_configured";

export interface GoogleSheetsUserSyncStatus {
  kind: GoogleSheetsUserSyncKind;
  /** Short UI label after `status = `. */
  label: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  lastAttemptAt?: string | null;
  status?: string | null;
}

/**
 * Compact sync status for History → Google Sheets (under the spreadsheet link).
 * Derived from the user's most recent outbox job — not from GOOGLE_SHEETS_ENABLED.
 */
export async function getGoogleSheetsUserSyncStatus(
  username: string
): Promise<GoogleSheetsUserSyncStatus> {
  let job: GoogleSheetsSyncJob | null = null;
  try {
    job = await getLatestGoogleSheetsJobForUsername(username);
  } catch (err) {
    console.warn(
      "[google-sheets] getLatestGoogleSheetsJobForUsername failed:",
      err instanceof Error ? err.message : err
    );
    return {
      kind: "none",
      label: "no sync yet",
      lastSyncedAt: null,
      lastError: null,
    };
  }

  if (!job) {
    return {
      kind: "none",
      label: "no sync yet",
      lastSyncedAt: null,
      lastError: null,
    };
  }

  return mapJobToSyncStatus(job);
}

export interface GoogleSheetsMutationSyncStatus extends GoogleSheetsUserSyncStatus {
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
  sheetTab: string | null;
  recordKey: string | null;
  kindJob: string | null;
  jobId: string | null;
}

function mapJobToSyncStatus(job: GoogleSheetsSyncJob): GoogleSheetsUserSyncStatus {
  if (job.status === "synced") {
    return {
      kind: "ok",
      label: "synced",
      status: "synced",
      lastSyncedAt: job.completedAt ?? job.updatedAt,
      lastAttemptAt: job.updatedAt,
      lastError: null,
    };
  }

  if (job.status === "failed") {
    return {
      kind: "failed",
      label: "failed",
      status: "failed",
      lastSyncedAt: null,
      lastAttemptAt: job.updatedAt,
      lastError: job.lastError,
    };
  }

  return {
    kind: "pending",
    label: job.status,
    status: job.status,
    lastSyncedAt: null,
    lastAttemptAt: job.updatedAt,
    lastError: job.lastError,
  };
}

/**
 * Per-history-entry Google Sheets status: prefer mutationId join, then recordKey.
 */
export async function getGoogleSheetsSyncStatusForHistoryEntry(input: {
  mutationId: string;
  repoGuid: string;
  address: string;
  username?: string | null;
  spreadsheetConfigured: boolean;
}): Promise<GoogleSheetsMutationSyncStatus> {
  if (!input.spreadsheetConfigured) {
    return {
      kind: "not_configured",
      label: "not configured",
      status: "not configured",
      lastSyncedAt: null,
      lastError: null,
      spreadsheetId: null,
      spreadsheetUrl: null,
      sheetTab: null,
      recordKey: null,
      kindJob: null,
      jobId: null,
    };
  }

  const loca = input.address.startsWith(`${input.repoGuid}/`)
    ? input.address.slice(input.repoGuid.length + 1)
    : input.address === input.repoGuid
      ? ""
      : input.address;
  const recordKey = `${input.repoGuid}:${loca}`;

  const job =
    (await getGoogleSheetsJobByMutationId(input.mutationId)) ??
    (await getLatestGoogleSheetsJobForRecordKey(recordKey));

  if (!job) {
    return {
      kind: "none",
      label: "no sync yet",
      status: "no sync yet",
      lastSyncedAt: null,
      lastError: null,
      spreadsheetId: null,
      spreadsheetUrl: null,
      sheetTab: null,
      recordKey,
      kindJob: null,
      jobId: null,
    };
  }

  const base = mapJobToSyncStatus(job);
  const spreadsheetId = job.payload.spreadsheetId ?? null;
  return {
    ...base,
    spreadsheetId,
    spreadsheetUrl: spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/` : null,
    sheetTab: null,
    recordKey: job.recordKey,
    kindJob: job.kind,
    jobId: job._id,
  };
}
