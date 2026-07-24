// Re-exports dba's FakeGoogleSheetsClient (Google's own API must never be
// called by this suite) plus a couple of small builders shared by the
// google-sheets/*.test.mjs files, so each test file doesn't repeat the
// same payload/target boilerplate already established in
// packages/dba/src/google-sheets/worker.test.ts.
import { DBA_DIST, TABLES_SYNC_TEST_PREFIX } from "./env.mjs";

const fakeClientModule = await import(`${DBA_DIST}/google-sheets/fake-client.js`);
const mapperModule = await import(`${DBA_DIST}/google-sheets/mapper.js`);

export const { FakeGoogleSheetsClient } = fakeClientModule;
export const {
  DAILY_TRACKER_HEADER_ROW_COUNT,
  DATE_ENTRIES_HEADER_ROW_COUNT,
  DAILY_TRACKER_SHEET_HEADERS,
  DATE_ENTRIES_SHEET_HEADERS,
} = mapperModule;

/** A synthetic repoGuid/username this suite owns end-to-end — never a real CHAD user. */
export function testRepoGuid(suffix) {
  return `${TABLES_SYNC_TEST_PREFIX}-repo-${suffix}`;
}

/** Builds a minimal, valid `SheetSyncPayload` for a daily-entry or date-entry job. */
export function buildPayload({ recordType, loca, fields, repoGuid, spreadsheetId = "tables-sync-test-spreadsheet" }) {
  return {
    recordType,
    recordKey: `${repoGuid}:${loca}`,
    repoGuid,
    username: repoGuid,
    spreadsheetId,
    loca,
    itemName: loca,
    fields,
  };
}

export const SHEET_NAMES = {
  "daily-entry": "daily-tracker-tables-sync-test",
  "date-entry": "dates-tables-sync-test",
  lead: "leads-tables-sync-test",
};

export function dailyTarget(spreadsheetId = "tables-sync-test-spreadsheet") {
  return { spreadsheetId, sheetName: SHEET_NAMES["daily-entry"], headerRowCount: DAILY_TRACKER_HEADER_ROW_COUNT };
}

export function datesTarget(spreadsheetId = "tables-sync-test-spreadsheet") {
  return { spreadsheetId, sheetName: SHEET_NAMES["date-entry"], headerRowCount: DATE_ENTRIES_HEADER_ROW_COUNT };
}
