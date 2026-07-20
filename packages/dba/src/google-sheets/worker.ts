/**
 * Background worker that drains `google_sheets_sync_outbox` (Story 75).
 * Mirrors `data-outbox-worker.ts`'s claim/execute/retry loop shape.
 *
 * Process placement: `runGoogleSheetsSyncWorker` is started from
 * `bootstrap.ts`'s `startGoogleSheetsSyncWorkerIfEnabled()`, called once
 * from `packages/dashboard/instrumentation.ts` at server startup — the
 * already-running Dashboard Next.js process, no separate worker container
 * (Story 75 follow-up, 2026-07-21). See `bootstrap.ts` for the wiring.
 */

import { randomUUID } from "node:crypto";
import type { Clock } from "../data-clock.js";
import { systemClock } from "../data-clock.js";
import {
  claimNextGoogleSheetsJob,
  markGoogleSheetsJobRetry,
  markGoogleSheetsJobSynced,
  recoverStaleGoogleSheetsLocks,
} from "./outbox.js";
import {
  DAILY_TRACKER_SHEET_HEADERS,
  DATE_ENTRIES_SHEET_HEADERS,
  DAILY_TRACKER_HEADER_ROW_COUNT,
  DATE_ENTRIES_HEADER_ROW_COUNT,
  IMMUTABLE_ON_UPDATE_COLUMNS,
  mapDailyEntryToSheetRow,
  mapDateEntryToSheetRow,
  mapDeleteToSheetRow,
} from "./mapper.js";
import type { GoogleSheetsClient, GoogleSheetsTarget, SheetRecordType, SheetRowValues, SheetSyncPayload } from "./types.js";

function headerRowCountFor(recordType: SheetRecordType): number {
  return recordType === "daily-entry" ? DAILY_TRACKER_HEADER_ROW_COUNT : DATE_ENTRIES_HEADER_ROW_COUNT;
}

export interface GoogleSheetsWorkerDeps {
  client: GoogleSheetsClient;
  /**
   * Tab name per record type — shared across every user's own spreadsheet
   * (each user's spreadsheet has its own "daily"/"dates" tabs, same names).
   * The spreadsheet id itself is NOT static config: each job carries its
   * own already-resolved `payload.spreadsheetId` (Story 75 follow-up, one
   * spreadsheet per user — see `config.ts`'s revision note and `sync.ts`),
   * so two jobs for two different users are routed to two different
   * spreadsheets even though they share this one `sheetNames` map.
   */
  sheetNames: Record<SheetRecordType, string>;
  workerId?: string;
  clock?: Clock;
  /**
   * Pause between jobs within one `drainGoogleSheetsSyncOnce` call — 0 (the
   * default, unchanged for every test) means no pause. The real worker
   * (`bootstrap.ts`) sets this to pace requests under the Sheets API's
   * default free-tier quota (60 read requests/minute/user) — a real
   * backfill of ~120 records draining as fast as possible hit
   * `RESOURCE_EXHAUSTED` (HTTP 429) repeatedly even after the header-cache
   * fix in `sheets-api-client.ts` cut reads-per-job from ~4 to ~2 (Story 75
   * follow-up, 2026-07-22).
   */
  minDelayBetweenJobsMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function targetFor(deps: GoogleSheetsWorkerDeps, payload: SheetSyncPayload): GoogleSheetsTarget {
  return {
    spreadsheetId: payload.spreadsheetId,
    sheetName: deps.sheetNames[payload.recordType],
    // 2 header rows on "daily" (decorative merged group-label row + the
    // real column-name row), 1 on "dates" — see types.ts's
    // GoogleSheetsTarget.headerRowCount doc and layout.ts (Story 75
    // visual-layout follow-up, 2026-07-21).
    headerRowCount: headerRowCountFor(payload.recordType),
  };
}

function headersFor(recordType: SheetRecordType): string[] {
  return recordType === "daily-entry" ? DAILY_TRACKER_SHEET_HEADERS : DATE_ENTRIES_SHEET_HEADERS;
}

function mapUpsertFor(recordType: SheetRecordType, payload: SheetSyncPayload, now: string): SheetRowValues {
  return recordType === "daily-entry" ? mapDailyEntryToSheetRow(payload, now) : mapDateEntryToSheetRow(payload, now);
}

/**
 * Claims and processes exactly one due job, if one exists. Returns `false`
 * when there was nothing to do (caller should stop looping).
 */
export async function processGoogleSheetsJobOnce(deps: GoogleSheetsWorkerDeps): Promise<boolean> {
  const clock = deps.clock ?? systemClock;
  const workerId = deps.workerId ?? `gsheets-worker-${randomUUID()}`;
  const job = await claimNextGoogleSheetsJob(workerId, clock);
  if (!job) return false;

  const recordType = job.payload.recordType;
  const target = targetFor(deps, job.payload);

  try {
    if (!target.spreadsheetId) {
      throw new Error(
        `Google Sheets job ${job._id} (recordKey=${job.payload.recordKey}) has no spreadsheetId on its payload — ` +
          "cannot route it to any user's spreadsheet."
      );
    }

    await deps.client.ensureHeaders(target, headersFor(recordType));

    const now = clock.now().toISOString();
    const existingRow = await deps.client.findRowByKey(target, "CHAD_RECORD_KEY", job.payload.recordKey);

    if (job.kind === "delete") {
      if (existingRow !== null) {
        const values = mapDeleteToSheetRow(job.payload, now);
        await deps.client.updateRow(target, existingRow, values);
      }
      // No matching row to mark deleted (e.g. it was removed before its
      // first sync ever ran) — nothing to do, not an error.
    } else if (existingRow !== null) {
      // Update in place: never touch the set-once-at-creation columns on an
      // existing row — see mapper.ts's IMMUTABLE_ON_UPDATE_COLUMNS doc.
      const values = mapUpsertFor(recordType, job.payload, now);
      for (const column of IMMUTABLE_ON_UPDATE_COLUMNS) delete values[column];
      await deps.client.updateRow(target, existingRow, values);
    } else {
      const values = mapUpsertFor(recordType, job.payload, now);
      await deps.client.appendRow(target, values);
    }

    await markGoogleSheetsJobSynced(job._id, clock);
    console.log(
      `[google-sheets-worker] synced recordKey=${job.payload.recordKey} username=${job.payload.username} recordType=${recordType} kind=${job.kind} sheet="${target.sheetName}" attempt=${job.attempts + 1}`
    );
  } catch (error) {
    await markGoogleSheetsJobRetry(job._id, error, clock);
    console.error(
      `[google-sheets-worker] failed recordKey=${job.payload.recordKey} username=${job.payload.username} recordType=${recordType} kind=${job.kind} sheet="${target.sheetName}" attempt=${job.attempts + 1}:`,
      error instanceof Error ? error.message : error
    );
  }

  return true;
}

/** Runs `recoverStaleGoogleSheetsLocks` once, then drains all currently-due jobs. */
export async function drainGoogleSheetsSyncOnce(deps: GoogleSheetsWorkerDeps): Promise<number> {
  await recoverStaleGoogleSheetsLocks(deps.clock ?? systemClock);
  let processed = 0;
  while (await processGoogleSheetsJobOnce(deps)) {
    processed++;
    if (deps.minDelayBetweenJobsMs) await sleep(deps.minDelayBetweenJobsMs);
  }
  return processed;
}

/** Simple interval-based loop for a long-running process — not wired into any process by this Story (see file header). */
export function runGoogleSheetsSyncWorker(deps: GoogleSheetsWorkerDeps, intervalMs = 5000): () => void {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      await drainGoogleSheetsSyncOnce(deps);
    } catch (error) {
      console.error("[runGoogleSheetsSyncWorker] tick failed:", error);
    }
    if (!stopped) setTimeout(tick, intervalMs);
  };
  void tick();
  return () => {
    stopped = true;
  };
}
