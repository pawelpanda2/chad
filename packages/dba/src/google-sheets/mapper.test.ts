/**
 * google-sheets/mapper.ts tests — pure, no Mongo/Google I/O.
 * Run via: cd packages/dba && npx tsc && node dist/google-sheets/mapper.test.js
 */

import {
  DAILY_ENTRY_DOMAIN_COLUMNS,
  DAILY_TRACKER_SHEET_HEADERS,
  DATE_ENTRIES_SHEET_HEADERS,
  DATE_ENTRY_DOMAIN_COLUMNS,
  IMMUTABLE_ON_UPDATE_COLUMNS,
  ITEM_NUMBER_COLUMN,
  SHEET_SCHEMA_VERSION,
  TECHNICAL_COLUMNS,
  mapDailyEntryToSheetRow,
  mapDateEntryToSheetRow,
  mapDeleteToSheetRow,
} from "./mapper.js";
import type { SheetSyncPayload } from "./types.js";

function runTests() {
  console.log("Running google-sheets/mapper Tests...\n");
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void) {
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (e) {
      console.log(`  ✗ ${name}`);
      console.log(`    Error: ${e}`);
      failed++;
    }
  }

  function assertEquals(actual: unknown, expected: unknown, message?: string) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${message ?? "Assertion failed"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }

  function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(message);
  }

  const dailyPayload: SheetSyncPayload = {
    recordType: "daily-entry",
    recordKey: "repo-1:04/02",
    repoGuid: "repo-1",
    username: "pawel_f",
    spreadsheetId: "spreadsheet-1",
    loca: "04/02",
    itemName: "01",
    fields: {
      DATE: "2026-07-20",
      STATE: "TAK",
      "TRAINING TIME": "2:00:00",
      APPROACHES: "5",
      "PULLS AUTO": "2",
      "QUALITY C AUTO": "8.5",
    },
  };

  test("maps technical columns from the payload", () => {
    const row = mapDailyEntryToSheetRow(dailyPayload, "2026-07-20T10:00:00.000Z");
    assertEquals(row.CHAD_RECORD_KEY, "repo-1:04/02");
    assertEquals(row.CHAD_REPO_GUID, "repo-1");
    assertEquals(row.CHAD_ITEM_NAME, "01");
    assertEquals(row.CHAD_LOCA, "04/02");
    assertEquals(row.CHAD_CREATED_AT, "2026-07-20T10:00:00.000Z");
    assertEquals(row.CHAD_UPDATED_AT, "2026-07-20T10:00:00.000Z");
    assertEquals(row.CHAD_SCHEMA_VERSION, SHEET_SCHEMA_VERSION);
    assertEquals(row.CHAD_SYNC_STATUS, "ACTIVE");
  });

  test("maps every known domain column (by label), defaulting missing ones to empty string", () => {
    const row = mapDailyEntryToSheetRow(dailyPayload, "2026-07-20T10:00:00.000Z");
    assertEquals(row.DATE, "2026-07-20");
    assertEquals(row.STATE, "TAK");
    assertEquals(row["TRAINING TIME"], "2:00:00");
    assertEquals(row.APPROACHES, "5");
    // Not present in dailyPayload.fields -> defaults to "", not undefined/missing.
    assertEquals(row.INFIELD, "");
    assertEquals(row.NUMBERS, "");
    for (const column of DAILY_ENTRY_DOMAIN_COLUMNS) {
      assert(Object.prototype.hasOwnProperty.call(row, column.label), `row should have a value for label "${column.label}"`);
    }
  });

  test("ITEM_NUMBER_COLUMN ('N') reads from payload.itemName, not payload.fields, and is always the first domain column on both tabs", () => {
    const dailyRow = mapDailyEntryToSheetRow(dailyPayload, "2026-07-20T10:00:00.000Z");
    assertEquals(dailyRow.N, "01", "N must equal payload.itemName");
    assertEquals(DAILY_ENTRY_DOMAIN_COLUMNS[0], ITEM_NUMBER_COLUMN, "N must be the first daily domain column");
    assertEquals(DATE_ENTRY_DOMAIN_COLUMNS[0], ITEM_NUMBER_COLUMN, "N must be the first date-entry domain column");
  });

  test("maps the AUTO columns to their em-dash display labels (faithful copy of the Dashboard table)", () => {
    const row = mapDailyEntryToSheetRow(dailyPayload, "2026-07-20T10:00:00.000Z");
    assertEquals(row["PULLS — AUTO"], "2");
    assertEquals(row["QUALITY C — AUTO"], "8.5");
    // Internal keys ("PULLS AUTO" without the dash) must not leak through as their own columns.
    assert(!("PULLS AUTO" in row), 'row must use the display label "PULLS — AUTO", not the internal key');
  });

  test("accepts an explicit syncStatus override", () => {
    const row = mapDailyEntryToSheetRow(dailyPayload, "2026-07-20T10:00:00.000Z", "DELETED");
    assertEquals(row.CHAD_SYNC_STATUS, "DELETED");
  });

  test("delete mapping only touches technical status/updated/schema columns, no domain columns", () => {
    const row = mapDeleteToSheetRow(dailyPayload, "2026-07-21T09:00:00.000Z");
    assertEquals(row.CHAD_RECORD_KEY, "repo-1:04/02");
    assertEquals(row.CHAD_UPDATED_AT, "2026-07-21T09:00:00.000Z");
    assertEquals(row.CHAD_SCHEMA_VERSION, SHEET_SCHEMA_VERSION);
    assertEquals(row.CHAD_SYNC_STATUS, "DELETED");
    assert(!("DATE" in row), "delete mapping must not include domain columns");
    assert(!("CHAD_CREATED_AT" in row), "delete mapping must not touch CHAD_CREATED_AT");
    assert(!("CHAD_ITEM_NAME" in row), "delete mapping must not touch CHAD_ITEM_NAME");
  });

  test("DAILY_TRACKER_SHEET_HEADERS is domain columns (by label) followed by technical columns, in order", () => {
    assertEquals(DAILY_TRACKER_SHEET_HEADERS, [...DAILY_ENTRY_DOMAIN_COLUMNS.map((c) => c.label), ...TECHNICAL_COLUMNS]);
  });

  test("DAILY_ENTRY_DOMAIN_COLUMNS is 'N' (not part of the Dashboard's own DAILY_COLUMNS array — see ITEM_NUMBER_COLUMN doc) followed by the Dashboard's DAILY_COLUMNS order exactly (incl. OUTINGS last, under results)", () => {
    const keys = DAILY_ENTRY_DOMAIN_COLUMNS.map((c) => c.key);
    assertEquals(keys, [
      "N",
      "DATE",
      "STATE",
      "TRAINING TIME",
      "VERBAL EXERCISES",
      "INFIELD",
      "THEORY",
      "FIELD REVIEW",
      "ACTION TIME",
      "APPROACHES",
      "LONG INTERACTIONS",
      "NUMBERS",
      "PULLS AUTO",
      "FIRST MESSAGES",
      "RESPONSES",
      "DATES SET UP",
      "DATES",
      "CLOSES AUTO",
      "QUALITY DP AUTO",
      "QUALITY C AUTO",
      "OUTINGS",
    ]);
  });

  test("IMMUTABLE_ON_UPDATE_COLUMNS are all real technical columns or the 'N' domain column", () => {
    for (const column of IMMUTABLE_ON_UPDATE_COLUMNS) {
      assert(
        (TECHNICAL_COLUMNS as readonly string[]).includes(column) || column === "N",
        `${column} should be a technical column or "N"`
      );
    }
    assert(!(IMMUTABLE_ON_UPDATE_COLUMNS as readonly string[]).includes("CHAD_UPDATED_AT"), "CHAD_UPDATED_AT must stay mutable");
    assert(!(IMMUTABLE_ON_UPDATE_COLUMNS as readonly string[]).includes("CHAD_SYNC_STATUS"), "CHAD_SYNC_STATUS must stay mutable");
  });

  // --- Date Entry ("dates" tab) ---

  const datePayload: SheetSyncPayload = {
    recordType: "date-entry",
    recordKey: "repo-1:04/03/01",
    repoGuid: "repo-1",
    username: "pawel_f",
    spreadsheetId: "spreadsheet-1",
    loca: "04/03/01",
    itemName: "01",
    fields: { DATA: "2026-07-20", "ŹRÓDŁO": "Tinder", NAZWA: "Ala", PULL: "TRUE", CLOSE: "TAK", "JAKOŚĆ": "8.5" },
  };

  test("mapDateEntryToSheetRow maps Date Entry's own columns, including Polish diacritics", () => {
    const row = mapDateEntryToSheetRow(datePayload, "2026-07-20T10:00:00.000Z");
    assertEquals(row.DATA, "2026-07-20");
    assertEquals(row["ŹRÓDŁO"], "Tinder");
    assertEquals(row.NAZWA, "Ala");
    assertEquals(row.PULL, "TRUE");
    assertEquals(row.CLOSE, "TAK");
    assertEquals(row["JAKOŚĆ"], "8.5");
    assertEquals(row.CHAD_RECORD_KEY, "repo-1:04/03/01");
    // Daily-only domain columns must never appear on a Date Entry row.
    assert(!("DATE" in row), "date-entry row must not contain daily-entry-only columns");
  });

  test("DATE_ENTRIES_SHEET_HEADERS is Date Entry domain columns followed by the same technical columns", () => {
    assertEquals(DATE_ENTRIES_SHEET_HEADERS, [...DATE_ENTRY_DOMAIN_COLUMNS.map((c) => c.label), ...TECHNICAL_COLUMNS]);
  });

  test("DATE_ENTRY_DOMAIN_COLUMNS is 'N' followed by the Dashboard's own DATE_COLUMNS order exactly", () => {
    assertEquals(
      DATE_ENTRY_DOMAIN_COLUMNS.map((c) => c.key),
      ["N", "DATA", "ŹRÓDŁO", "NAZWA", "LINK", "PULL", "CLOSE", "JAKOŚĆ"]
    );
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
