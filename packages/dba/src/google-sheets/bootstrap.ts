/**
 * Starts the Google Sheets sync worker inside whatever process calls this —
 * no separate container (Story 75 follow-up, 2026-07-21). Called once from
 * `packages/dashboard/instrumentation.ts` at Dashboard server startup, so
 * the worker runs as a background interval loop inside the already-running
 * Dashboard Next.js process, entirely out of the request path — a Sheets
 * outage or slow API call can never block a Daily Entry/Date Entry save
 * (those only ever enqueue a job, synchronously, into Mongo; this loop is
 * the only thing that ever talks to Google).
 *
 * No-ops (returns `null`, logs why) when the integration is disabled or
 * misconfigured — never throws, so a Sheets config problem can never crash
 * Dashboard startup. Idempotent against being called more than once in the
 * same process (e.g. Next.js dev-mode module re-evaluation) — only the
 * first call actually starts a loop.
 */

import { loadGoogleSheetsConfig, type GoogleSheetsConfig } from "./config.js";
import { checkGoogleSheetsProductionGuard } from "./production-guard.js";
import { GoogleSheetsApiClient } from "./sheets-api-client.js";
import { runGoogleSheetsSyncWorker } from "./worker.js";
import { ensureDailyTrackerLayout, ensureDatesLayout } from "./layout.js";
import { DAILY_TRACKER_HEADER_ROW_COUNT, DATE_ENTRIES_HEADER_ROW_COUNT } from "./mapper.js";
import type { GoogleSheetsClient } from "./types.js";

let started = false;

/**
 * Lays out (or confirms already-laid-out, via `CHAD_SHEET_LAYOUT_VERSION`)
 * every configured user's own "daily"/"dates" tabs — once per user, at
 * worker startup, deliberately separate from the per-record sync loop
 * (`layout.ts`'s own header comment). Fire-and-forget from the caller's
 * point of view (never awaited by `startGoogleSheetsSyncWorkerIfEnabled`,
 * see below) — a slow/failing Sheets API call here must never delay
 * Dashboard startup or block the sync loop from starting; each user's
 * layout is independent, so one user's failure never stops another's.
 */
async function ensureLayoutsForAllUsers(client: GoogleSheetsClient, config: GoogleSheetsConfig): Promise<void> {
  for (const [username, spreadsheetId] of Object.entries(config.spreadsheetMap)) {
    try {
      const changedDaily = await ensureDailyTrackerLayout(client, {
        spreadsheetId,
        sheetName: config.dailyTrackerSheetName,
        headerRowCount: DAILY_TRACKER_HEADER_ROW_COUNT,
      });
      const changedDates = await ensureDatesLayout(client, {
        spreadsheetId,
        sheetName: config.dateEntriesSheetName,
        headerRowCount: DATE_ENTRIES_HEADER_ROW_COUNT,
      });
      if (changedDaily || changedDates) {
        console.log(`[google-sheets] layout ensured for username=${username} (daily=${changedDaily ? "applied" : "already current"}, dates=${changedDates ? "applied" : "already current"})`);
      }
    } catch (error) {
      console.error(`[google-sheets] layout ensure failed for username=${username}:`, error instanceof Error ? error.message : error);
    }
  }
}

export function startGoogleSheetsSyncWorkerIfEnabled(intervalMs = 5000): (() => void) | null {
  if (started) {
    console.log("[google-sheets] startGoogleSheetsSyncWorkerIfEnabled called again — already running, ignoring.");
    return null;
  }

  let config;
  try {
    config = loadGoogleSheetsConfig();
  } catch (error) {
    console.error(
      "[google-sheets] sync worker NOT started — invalid config:",
      error instanceof Error ? error.message : error
    );
    return null;
  }

  if (!config.enabled) {
    console.log("[google-sheets] sync worker not started — GOOGLE_SHEETS_ENABLED is not true.");
    return null;
  }

  // Defense-in-depth (2026-07-22, independent of GOOGLE_SHEETS_ENABLED) —
  // the worker itself must refuse to run unless this is genuinely the real
  // production environment connected to the real production Mongo. See
  // production-guard.ts's own doc comment for the full reasoning (this is
  // the check that matters even if GOOGLE_SHEETS_ENABLED were mistakenly
  // left on in a local/test/staging context).
  const guard = checkGoogleSheetsProductionGuard();
  if (!guard.allowed) {
    console.warn(`[google-sheets] sync worker NOT started — production guard blocked it: ${guard.reason}`);
    return null;
  }

  started = true;
  const client = new GoogleSheetsApiClient({
    email: config.serviceAccountEmail,
    privateKey: config.serviceAccountPrivateKey,
  });

  console.log(
    `[google-sheets] sync worker starting (intervalMs=${intervalMs}, users configured=${Object.keys(config.spreadsheetMap).length})`
  );

  void ensureLayoutsForAllUsers(client, config);

  return runGoogleSheetsSyncWorker(
    {
      client,
      sheetNames: {
        "daily-entry": config.dailyTrackerSheetName,
        "date-entry": config.dateEntriesSheetName,
      },
      // Paces requests under the Sheets API's default free-tier quota (60
      // read requests/minute/user) — see worker.ts's own doc comment.
      minDelayBetweenJobsMs: 1200,
    },
    intervalMs
  );
}
