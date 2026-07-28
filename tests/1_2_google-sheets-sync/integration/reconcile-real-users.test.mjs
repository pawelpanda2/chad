// Live, READ-ONLY reconciliation for real users (pawel_f, kamil_s) against
// the real QNAP Postgres + their real Google Sheets — 2026-07-28 audit.
// NEVER writes to Postgres or Sheets. Never logs in as pawel_f/kamil_s
// (repoGuid resolved via the read-only chad_admin users-list lookup).
//
// A missing_in_sheet record or a duplicate CHAD_RECORD_KEY is a material
// data-integrity difference and FAILS this test (not a warning) — this is
// exactly the class of bug that shipped silently before this test existed
// (pawel_f's Daily entries, created by the Story 82 Postgres migration,
// never got an initial Google Sheets sync job — see
// tests/release-audit-report.md for the full root-cause writeup).
// extra_in_sheet (a stale row with no matching current PostgreSQL record)
// is reported but does not hard-fail here — it does not represent a
// current sync gap, and deleting/investigating it destructively is
// explicitly out of scope for an automated, non-mutating test.
import { describe, it, expect, afterAll } from "vitest";
import { createRequire } from "node:module";
import { loadQnapEnv } from "../../support/database/qnap-env.mjs";
import { reconcileTable, DAILY_HEADER_ROW_INDEX, SINGLE_HEADER_ROW_INDEX } from "../../support/database/real-user-reconciliation.mjs";

// js-yaml is a `packages/dba` dependency, not hoisted to the repo root under
// pnpm's strict node_modules layout — resolve it relative to dba's own
// package.json rather than a bare specifier, same reason DBA_DIST-style
// resolution is used elsewhere in tests/support.
const requireFromDba = createRequire(new URL("../../../packages/dba/package.json", import.meta.url));
const yaml = requireFromDba("js-yaml");

loadQnapEnv();

const dba = await import("../../../packages/dba/dist/index.js");
const dailySheetName = process.env.GOOGLE_SHEETS_DAILY_TRACKER_SHEET_NAME || "daily";
const datesSheetName = process.env.GOOGLE_SHEETS_DATE_ENTRIES_SHEET_NAME || "dates";
const spreadsheetMap = JSON.parse(process.env.GOOGLE_SHEETS_SPREADSHEET_MAP || "{}");

const credentials = {
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  privateKey: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").includes("\\n")
    ? process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, "\n")
    : process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
};

const credentialsConfigured = Boolean(credentials.email && credentials.privateKey);

let usersByName = {};
if (credentialsConfigured) {
  const usersListBody = await dba.getUsersListBody();
  const usersDoc = yaml.load(usersListBody || "");
  for (const u of usersDoc?.users || []) usersByName[u.username] = u;
}

describe.skipIf(!credentialsConfigured)("Real-user reconciliation — PostgreSQL <-> Google Sheets (read-only)", () => {
  afterAll(async () => {
    await dba.closePostgresConnection().catch(() => {});
  });

  for (const username of ["pawel_f", "kamil_s"]) {
    const user = usersByName[username];

    it.skipIf(!user)(`${username}: Daily — no missing records, no duplicate CHAD_RECORD_KEY`, async () => {
      const repoGuid = user.repoGuid;
      const pgItems = await dba.runWithRepoContext({ repoGuid, username }, () => dba.getAllDailyEntries());
      const result = await reconcileTable({
        dba,
        credentials,
        repoGuid,
        spreadsheetId: spreadsheetMap[username],
        sheetName: dailySheetName,
        headerRowIndex: DAILY_HEADER_ROW_INDEX,
        pgItems,
      });
      console.log(`[reconcile] ${username}/daily:`, result);
      expect(result.missing, `missing_in_sheet for ${username}/daily: ${JSON.stringify(result.missing)}`).toEqual([]);
      expect(result.duplicates, `duplicate CHAD_RECORD_KEY for ${username}/daily`).toEqual([]);
    });

    it.skipIf(!user)(`${username}: Dates — no missing records, no duplicate CHAD_RECORD_KEY`, async () => {
      const repoGuid = user.repoGuid;
      const pgItems = await dba.runWithRepoContext({ repoGuid, username }, () => dba.getAllDateEntries());
      const result = await reconcileTable({
        dba,
        credentials,
        repoGuid,
        spreadsheetId: spreadsheetMap[username],
        sheetName: datesSheetName,
        headerRowIndex: SINGLE_HEADER_ROW_INDEX,
        pgItems,
      });
      console.log(`[reconcile] ${username}/dates:`, result);
      expect(result.missing, `missing_in_sheet for ${username}/dates: ${JSON.stringify(result.missing)}`).toEqual([]);
      expect(result.duplicates, `duplicate CHAD_RECORD_KEY for ${username}/dates`).toEqual([]);
    });
  }
});
