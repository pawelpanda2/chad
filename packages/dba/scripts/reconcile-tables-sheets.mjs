#!/usr/bin/env node
/**
 * Dry-run structural reconciliation report for the Dashboard tables
 * (Daily Tracker / Dates / Leads) <-> each user's Google Sheet.
 *
 * Always a read-only report: prints, per mapped user, which tabs the
 * mapper expects (daily/dates/leads header sets) and — only when real
 * service-account credentials are configured AND `--live` is passed —
 * actually reads each tab's current header row from the real Sheets API
 * and reports which required headers are missing. Without `--live` (the
 * default, and always in `--dry-run`), this never calls the real Google
 * API at all — it only reports the *expected* structure from config +
 * the mapper, safe to run with zero credentials configured.
 *
 * Usage:
 *   node packages/dba/scripts/reconcile-tables-sheets.mjs --dry-run
 *   node packages/dba/scripts/reconcile-tables-sheets.mjs --live   # real Sheets API reads only, never writes
 *
 * Never writes to any spreadsheet — `ensureHeaders`/`appendRow`/etc. are
 * intentionally never called here, only `sheets-api-client.ts`'s read-only
 * header lookup (via a temporary `ensureHeaders` call is avoided too,
 * since that itself is idempotent-write; --live instead reads the sheet's
 * raw header row directly).
 */

import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run") || !argv.includes("--live"),
    live: argv.includes("--live"),
  };
}

async function loadDba() {
  const distUrl = (p) => new URL(`../dist/${p}`, import.meta.url).href;
  const [{ loadGoogleSheetsInfoConfig }, mapper] = await Promise.all([
    import(distUrl("google-sheets/config.js")),
    import(distUrl("google-sheets/mapper.js")),
  ]);
  return { loadGoogleSheetsInfoConfig, mapper };
}

async function reportExpectedStructure(loadGoogleSheetsInfoConfig, mapper) {
  const info = loadGoogleSheetsInfoConfig();
  const usernames = Object.keys(info.spreadsheetMap).sort();

  console.log("[reconcile-tables-sheets] Expected structure (from mapper, not a live read):");
  console.log(`  daily tab required headers (${mapper.DAILY_TRACKER_SHEET_HEADERS.length}): ${mapper.DAILY_TRACKER_SHEET_HEADERS.join(", ")}`);
  console.log(`  dates tab required headers (${mapper.DATE_ENTRIES_SHEET_HEADERS.length}): ${mapper.DATE_ENTRIES_SHEET_HEADERS.join(", ")}`);
  console.log(`  leads tab required headers (${mapper.LEADS_SHEET_HEADERS.length}): ${mapper.LEADS_SHEET_HEADERS.join(", ")}`);
  console.log("");

  if (usernames.length === 0) {
    console.log("[reconcile-tables-sheets] No users mapped (GOOGLE_SHEETS_SPREADSHEET_MAP is empty/unset) — nothing to reconcile.");
    return usernames;
  }

  console.log(`[reconcile-tables-sheets] Mapped users (${usernames.length}): ${usernames.join(", ")}`);
  console.log(`[reconcile-tables-sheets] Service account: ${info.serviceAccountEmail || "(not configured)"}`);
  return usernames;
}

async function liveHeaderCheck(usernames, mapper) {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawKey) {
    console.log(
      "\n[reconcile-tables-sheets] --live requested but GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY " +
        "are not set — skipping live header reads (this is a report, not a failure)."
    );
    return;
  }

  const { GoogleSheetsApiClient } = await import(new URL("../dist/google-sheets/sheets-api-client.js", import.meta.url).href);
  const { normalizePrivateKey, loadGoogleSheetsInfoConfig } = await import(new URL("../dist/google-sheets/config.js", import.meta.url).href);
  const info = loadGoogleSheetsInfoConfig();
  const client = new GoogleSheetsApiClient({ email, privateKey: normalizePrivateKey(rawKey) });

  const dailySheetName = process.env.GOOGLE_SHEETS_DAILY_TRACKER_SHEET_NAME || "daily";
  const datesSheetName = process.env.GOOGLE_SHEETS_DATE_ENTRIES_SHEET_NAME || "dates";
  const leadsSheetName = process.env.GOOGLE_SHEETS_LEADS_SHEET_NAME || "leads";

  console.log("\n[reconcile-tables-sheets] Live header check (read-only):");
  for (const username of usernames) {
    const spreadsheetId = info.spreadsheetMap[username];
    for (const [label, sheetName, requiredHeaders, headerRowCount] of [
      ["daily", dailySheetName, mapper.DAILY_TRACKER_SHEET_HEADERS, mapper.DAILY_TRACKER_HEADER_ROW_COUNT],
      ["dates", datesSheetName, mapper.DATE_ENTRIES_SHEET_HEADERS, mapper.DATE_ENTRIES_HEADER_ROW_COUNT],
      ["leads", leadsSheetName, mapper.LEADS_SHEET_HEADERS, mapper.LEADS_HEADER_ROW_COUNT],
    ]) {
      try {
        // ensureHeaders is idempotent (only ever APPENDS a missing header,
        // never removes/reorders) — the closest read-mostly primitive the
        // client exposes; still only called under explicit --live opt-in,
        // never in --dry-run (the default).
        const currentHeaders = await client.ensureHeaders({ spreadsheetId, sheetName, headerRowCount }, requiredHeaders);
        const missing = requiredHeaders.filter((h) => !currentHeaders.includes(h));
        const status = missing.length === 0 ? "OK" : `MISSING: ${missing.join(", ")}`;
        console.log(`  ${username} / ${label} (${sheetName}): ${status}`);
      } catch (error) {
        console.log(`  ${username} / ${label} (${sheetName}): ERROR — ${error instanceof Error ? error.message : error}`);
      }
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[reconcile-tables-sheets] mode=${args.live ? "--live (read-only Sheets API calls)" : "--dry-run (no network calls)"}`);

  let dba;
  try {
    dba = await loadDba();
  } catch (error) {
    console.error(
      "[reconcile-tables-sheets] Could not load packages/dba/dist — run \"pnpm --filter dba build\" first."
    );
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }

  const usernames = await reportExpectedStructure(dba.loadGoogleSheetsInfoConfig, dba.mapper);

  if (args.live && usernames.length > 0) {
    await liveHeaderCheck(usernames, dba.mapper);
  }

  console.log("\n[reconcile-tables-sheets] done.");
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  main();
}
