// Real Google Sheets write test against test3's OWN dedicated spreadsheet
// (Story 78, Input 4 — supersedes the original spec's "fake client for
// everything"). Uses the real GoogleSheetsApiClient directly, never the
// production-guard-gated enqueue/worker path (that path stays PROD-only,
// untouched by this Story) — this is a deliberate, separate test-only
// invocation, exactly analogous to the original spec's "optional real
// Google smoke test... only for a dedicated test spreadsheet."
//
// Requires the same service-account credentials already configured in
// .env.local for pawel_f/kamil_s (GOOGLE_SERVICE_ACCOUNT_EMAIL/PRIVATE_KEY)
// — that service account must additionally have Editor access to test3's
// spreadsheet (shared by the project owner). Skips (not fails) if that
// access isn't set up yet, or if credentials are missing.
import { describe, it, expect } from "vitest";
import path from "node:path";
import dotenv from "dotenv";
import { TEST3_SPREADSHEET_ID, REPO_ROOT } from "../support/qnap-env.mjs";
import { TEST3_REPO_GUID } from "../../packages/dba/dist/testing/test3-guard.js";

dotenv.config({ path: path.join(REPO_ROOT, ".env.local") });

const { GoogleSheetsApiClient } = await import("../../packages/dba/dist/google-sheets/sheets-api-client.js");
const { normalizePrivateKey } = await import("../../packages/dba/dist/google-sheets/config.js");
const { mapDateEntryToSheetRow, mapDeleteToSheetRow, DATE_ENTRIES_SHEET_HEADERS, DATE_ENTRIES_HEADER_ROW_COUNT } = await import(
  "../../packages/dba/dist/google-sheets/mapper.js"
);

const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
const sheetName = process.env.GOOGLE_SHEETS_DATE_ENTRIES_SHEET_NAME || "dates";

// Resolved at module load (top-level await) — must happen BEFORE the
// describe.skipIf(...)/it.skipIf(...) calls below are evaluated, since
// skipIf's condition is read at collection time, not inside an async
// beforeAll (the same timing pitfall already fixed once in
// qnap-test3-daily-dates.test.mjs — see that file's own comment).
let client = null;
let accessible = false;
if (email && rawKey) {
  client = new GoogleSheetsApiClient({ email, privateKey: normalizePrivateKey(rawKey) });
  try {
    await client.ensureHeaders({ spreadsheetId: TEST3_SPREADSHEET_ID, sheetName, headerRowCount: DATE_ENTRIES_HEADER_ROW_COUNT }, DATE_ENTRIES_SHEET_HEADERS);
    accessible = true;
  } catch {
    accessible = false;
  }
}

describe.skipIf(!email || !rawKey)("Google Sheets — real write to test3's own dedicated spreadsheet", () => {
  it("service account has access and the 'dates' tab has the expected headers, in mapper order", async () => {
    expect(accessible, "service account must have Editor access to test3's spreadsheet — see 01_input.md Input 4's URL").toBe(true);
  });

  it.skipIf(!accessible)("create then update: a real row appears, keyed by CHAD_RECORD_KEY, no duplicate on update", async () => {
    const recordKey = `${TEST3_REPO_GUID}:99/99-story78-sheets-${Date.now()}`;
    const target = { spreadsheetId: TEST3_SPREADSHEET_ID, sheetName, headerRowCount: DATE_ENTRIES_HEADER_ROW_COUNT };
    const basePayload = {
      recordType: "date-entry",
      recordKey,
      repoGuid: TEST3_REPO_GUID,
      username: "test3",
      spreadsheetId: TEST3_SPREADSHEET_ID,
      loca: "99/99",
      itemName: "story78-e2e",
    };

    const row1 = mapDateEntryToSheetRow(
      { ...basePayload, fields: { DATA: "2026-04-01", "ŹRÓDŁO": "E2E Sheets", NAZWA: "E2E SheetsRow", LINK: "https://example.invalid/sheets", PULL: "TRUE", CLOSE: "TAK", "JAKOŚĆ": "9.0" } },
      new Date().toISOString()
    );
    await client.appendRow(target, row1);

    const rowNum1 = await client.findRowByKey(target, "CHAD_RECORD_KEY", recordKey);
    expect(rowNum1, "row must be findable by its CHAD_RECORD_KEY immediately after append").not.toBeNull();

    const row2 = mapDateEntryToSheetRow(
      { ...basePayload, fields: { DATA: "2026-04-01", "ŹRÓDŁO": "E2E Sheets", NAZWA: "E2E SheetsRow UPDATED", LINK: "https://example.invalid/sheets", PULL: "TRUE", CLOSE: "TAK", "JAKOŚĆ": "9.5" } },
      new Date().toISOString()
    );
    // Immutable-on-update columns — same convention the real caller
    // (worker.ts) already follows: strip before calling updateRow.
    for (const col of ["CHAD_CREATED_AT", "CHAD_ITEM_NAME", "CHAD_REPO_GUID", "CHAD_LOCA"]) delete row2[col];
    await client.updateRow(target, rowNum1, row2);

    const rowNum2 = await client.findRowByKey(target, "CHAD_RECORD_KEY", recordKey);
    expect(rowNum2, "update must hit the SAME row, never create a second one").toBe(rowNum1);

    // Tombstone (delete), same convention/mapper the real delete path uses
    // — never a physical row removal.
    await client.updateRow(target, rowNum2, mapDeleteToSheetRow(basePayload, new Date().toISOString()));
  }, 30_000);
});
