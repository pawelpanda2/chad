/**
 * google-sheets/worker.ts tests — real local MongoDB (for the outbox) +
 * FakeGoogleSheetsClient (Google's API is never called by any test, per
 * this Story's requirement). Same Mongo convention as data-outbox.test.ts.
 *
 * Run via: cd packages/dba && npx tsc &&
 *   MONGODB_URI="mongodb://...@localhost:27017/chad?authSource=admin" \
 *   node dist/google-sheets/worker.test.js
 */

import { getMongoDb, closeMongoConnection } from "../mongo.js";
import { enqueueGoogleSheetsSync, GOOGLE_SHEETS_OUTBOX_COLLECTION } from "./outbox.js";
import { processGoogleSheetsJobOnce, drainGoogleSheetsSyncOnce } from "./worker.js";
import { FakeGoogleSheetsClient } from "./fake-client.js";
import { createTestClock } from "../data-clock.js";
import type { SheetRecordType, SheetSyncPayload } from "./types.js";

const SHEET_NAMES = { "daily-entry": "daily-tracker-test", "date-entry": "dates-test" };
const SPREADSHEET_A = "test-spreadsheet-A";
const SPREADSHEET_B = "test-spreadsheet-B";
const DAILY_TARGET = { spreadsheetId: SPREADSHEET_A, sheetName: "daily-tracker-test" };
const DATES_TARGET = { spreadsheetId: SPREADSHEET_A, sheetName: "dates-test" };

function payload(
  loca: string,
  fields: Record<string, string>,
  repoGuid = "repo-A",
  recordType: SheetRecordType = "daily-entry",
  spreadsheetId: string = SPREADSHEET_A
): SheetSyncPayload {
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

async function runTests() {
  console.log("Running google-sheets/worker Tests (real local MongoDB + fake Sheets client)...\n");
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (e) {
      console.log(`  ✗ ${name}`);
      console.log(`    Error: ${e}`);
      failed++;
    }
  }

  function assertEquals(actual: unknown, expected: unknown, message?: string) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) throw new Error(`${message ?? "assertEquals failed"}: expected ${e}, got ${a}`);
  }

  function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(message);
  }

  const db = await getMongoDb();
  await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).deleteMany({});

  await test("create: a new record's job appends a new row with the mapped fields", async () => {
    const client = new FakeGoogleSheetsClient();
    await enqueueGoogleSheetsSync({
      operationId: "create-1",
      kind: "upsert",
      payload: payload("01", { DATE: "2026-07-20", STATE: "TAK" }),
    });

    const processed = await drainGoogleSheetsSyncOnce({ client, sheetNames: SHEET_NAMES, workerId: "w1" });
    assertEquals(processed, 1);

    const rows = client.getRows(DAILY_TARGET);
    assertEquals(rows.length, 1);
    assertEquals(rows[0].CHAD_RECORD_KEY, "repo-A:01");
    assertEquals(rows[0].DATE, "2026-07-20");
    assertEquals(rows[0].STATE, "TAK");
    assertEquals(rows[0].CHAD_SYNC_STATUS, "ACTIVE");
    assert(rows[0].CHAD_CREATED_AT.length > 0, "CHAD_CREATED_AT should be set on create");

    const headers = client.getHeaders(DAILY_TARGET);
    assert(headers.includes("CHAD_RECORD_KEY"), "headers should be initialized on first sync");
    assert(headers.includes("DATE"), "headers should include domain columns");
  });

  await test("update: a second job for the same recordKey updates the same row in place (no new row)", async () => {
    const client = new FakeGoogleSheetsClient();
    await enqueueGoogleSheetsSync({ operationId: "upd-1a", kind: "upsert", payload: payload("02", { DATE: "2026-07-20", APPROACHES: "1" }) });
    await drainGoogleSheetsSyncOnce({ client, sheetNames: SHEET_NAMES, workerId: "w1" });
    const createdAtAfterFirst = client.getRows(DAILY_TARGET)[0].CHAD_CREATED_AT;

    await enqueueGoogleSheetsSync({ operationId: "upd-1b", kind: "upsert", payload: payload("02", { DATE: "2026-07-20", APPROACHES: "3" }) });
    await drainGoogleSheetsSyncOnce({ client, sheetNames: SHEET_NAMES, workerId: "w1" });

    const rows = client.getRows(DAILY_TARGET);
    assertEquals(rows.length, 1, "update must not create a duplicate row");
    assertEquals(rows[0].APPROACHES, "3");
    assertEquals(rows[0].CHAD_CREATED_AT, createdAtAfterFirst, "CHAD_CREATED_AT must never change on update");
  });

  await test("update preserves manual/unknown columns the sheet owner added by hand", async () => {
    const client = new FakeGoogleSheetsClient();
    await enqueueGoogleSheetsSync({ operationId: "manual-1a", kind: "upsert", payload: payload("03", { DATE: "2026-07-20" }) });
    await drainGoogleSheetsSyncOnce({ client, sheetNames: SHEET_NAMES, workerId: "w1" });

    // Simulate the sheet owner manually adding their own column/value to this row.
    const row = client.getRows(DAILY_TARGET)[0];
    const rowNumber = (await client.findRowByKey(DAILY_TARGET, "CHAD_RECORD_KEY", "repo-A:03"))!;
    await client.updateRow(DAILY_TARGET, rowNumber, { ...row, MY_MANUAL_NOTE: "do not touch" });

    await enqueueGoogleSheetsSync({ operationId: "manual-1b", kind: "upsert", payload: payload("03", { DATE: "2026-07-21" }) });
    await drainGoogleSheetsSyncOnce({ client, sheetNames: SHEET_NAMES, workerId: "w1" });

    const after = client.getRows(DAILY_TARGET)[0];
    assertEquals(after.MY_MANUAL_NOTE, "do not touch");
    assertEquals(after.DATE, "2026-07-21");
  });

  await test("delete: marks CHAD_SYNC_STATUS=DELETED in place, row is not removed, domain data untouched", async () => {
    const client = new FakeGoogleSheetsClient();
    await enqueueGoogleSheetsSync({ operationId: "del-1a", kind: "upsert", payload: payload("04", { DATE: "2026-07-20", NUMBERS: "7" }) });
    await drainGoogleSheetsSyncOnce({ client, sheetNames: SHEET_NAMES, workerId: "w1" });

    await enqueueGoogleSheetsSync({ operationId: "del-1b", kind: "delete", payload: payload("04", {}) });
    await drainGoogleSheetsSyncOnce({ client, sheetNames: SHEET_NAMES, workerId: "w1" });

    const rows = client.getRows(DAILY_TARGET);
    assertEquals(rows.length, 1, "delete must not remove the row");
    assertEquals(rows[0].CHAD_SYNC_STATUS, "DELETED");
    assertEquals(rows[0].NUMBERS, "7", "delete must not blank out previously-synced domain data");
  });

  await test("delete for a record that was never synced is a harmless no-op (nothing to mark)", async () => {
    const client = new FakeGoogleSheetsClient();
    await enqueueGoogleSheetsSync({ operationId: "del-2", kind: "delete", payload: payload("05", {}) });
    const processed = await drainGoogleSheetsSyncOnce({ client, sheetNames: SHEET_NAMES, workerId: "w1" });
    assertEquals(processed, 1, "the job itself is still processed/marked synced");
    assertEquals(client.getRows(DAILY_TARGET).length, 0);
  });

  await test("retry after a simulated client failure, then succeeds on the next attempt", async () => {
    await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).deleteMany({});
    const client = new FakeGoogleSheetsClient();
    const clockT0 = createTestClock("2026-01-01T00:00:00.000Z");

    await enqueueGoogleSheetsSync({ operationId: "retry-1", kind: "upsert", payload: payload("06", { DATE: "2026-07-20" }) }, clockT0);

    client.failNextCallsWith = new Error("simulated Google Sheets API failure");
    const firstAttempt = await processGoogleSheetsJobOnce({ client, sheetNames: SHEET_NAMES, workerId: "w1", clock: clockT0 });
    assertEquals(firstAttempt, true);
    assertEquals(client.getRows(DAILY_TARGET).length, 0, "failed attempt must not have written a row");

    client.failNextCallsWith = null;
    const clockLater = createTestClock(new Date(clockT0.now().getTime() + 61_000).toISOString());
    const secondAttempt = await processGoogleSheetsJobOnce({ client, sheetNames: SHEET_NAMES, workerId: "w1", clock: clockLater });
    assertEquals(secondAttempt, true);

    const rows = client.getRows(DAILY_TARGET);
    assertEquals(rows.length, 1, "the retried attempt should have written the row");
    assertEquals(rows[0].DATE, "2026-07-20");
  });

  await test("a client failure never throws out of drainGoogleSheetsSyncOnce (a Sheets outage can't take down a caller)", async () => {
    await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).deleteMany({});
    const client = new FakeGoogleSheetsClient();
    client.failNextCallsWith = new Error("Google is down");
    await enqueueGoogleSheetsSync({ operationId: "outage-1", kind: "upsert", payload: payload("07", {}) });
    // Must resolve normally, not reject.
    const processed = await drainGoogleSheetsSyncOnce({ client, sheetNames: SHEET_NAMES, workerId: "w1" });
    assertEquals(processed, 1);
  });

  await test("new records are inserted at the TOP of the data range, newest first — never appended at the bottom (2026-07-22 fix, mirrors cp_history's oplog order)", async () => {
    await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).deleteMany({});
    const client = new FakeGoogleSheetsClient();
    await enqueueGoogleSheetsSync({ operationId: "order-1", kind: "upsert", payload: payload("01", { DATE: "2026-07-01" }) });
    await drainGoogleSheetsSyncOnce({ client, sheetNames: SHEET_NAMES, workerId: "w1" });
    await enqueueGoogleSheetsSync({ operationId: "order-2", kind: "upsert", payload: payload("02", { DATE: "2026-07-02" }) });
    await drainGoogleSheetsSyncOnce({ client, sheetNames: SHEET_NAMES, workerId: "w1" });
    await enqueueGoogleSheetsSync({ operationId: "order-3", kind: "upsert", payload: payload("03", { DATE: "2026-07-03" }) });
    await drainGoogleSheetsSyncOnce({ client, sheetNames: SHEET_NAMES, workerId: "w1" });

    const rows = client.getRows(DAILY_TARGET);
    assertEquals(rows.length, 3);
    assertEquals(rows[0].CHAD_RECORD_KEY, "repo-A:03", "the most recently created record must be the topmost row");
    assertEquals(rows[1].CHAD_RECORD_KEY, "repo-A:02");
    assertEquals(rows[2].CHAD_RECORD_KEY, "repo-A:01", "the first-ever created record must end up at the bottom");
  });

  await test("two different repos with the same loca get two independent rows (isolation)", async () => {
    await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).deleteMany({});
    const client = new FakeGoogleSheetsClient();
    await enqueueGoogleSheetsSync({ operationId: "iso-A", kind: "upsert", payload: payload("01", { DATE: "2026-07-20" }, "repo-A") });
    await enqueueGoogleSheetsSync({ operationId: "iso-B", kind: "upsert", payload: payload("01", { DATE: "2026-07-21" }, "repo-B") });
    await drainGoogleSheetsSyncOnce({ client, sheetNames: SHEET_NAMES, workerId: "w1" });

    const rows = client.getRows(DAILY_TARGET);
    assertEquals(rows.length, 2);
    const byKey = Object.fromEntries(rows.map((r) => [r.CHAD_RECORD_KEY, r]));
    assertEquals(byKey["repo-A:01"].DATE, "2026-07-20");
    assertEquals(byKey["repo-B:01"].DATE, "2026-07-21");
  });

  await test("two different users' jobs are routed to two different spreadsheets, never mixed (Story 75 follow-up)", async () => {
    await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).deleteMany({});
    const client = new FakeGoogleSheetsClient();
    await enqueueGoogleSheetsSync({
      operationId: "user-A",
      kind: "upsert",
      payload: payload("01", { DATE: "2026-07-20" }, "repo-pawel", "daily-entry", SPREADSHEET_A),
    });
    await enqueueGoogleSheetsSync({
      operationId: "user-B",
      kind: "upsert",
      payload: payload("01", { DATE: "2026-07-21" }, "repo-kamil", "daily-entry", SPREADSHEET_B),
    });
    await drainGoogleSheetsSyncOnce({ client, sheetNames: SHEET_NAMES, workerId: "w1" });

    const rowsInA = client.getRows(DAILY_TARGET);
    const rowsInB = client.getRows({ spreadsheetId: SPREADSHEET_B, sheetName: "daily-tracker-test" });
    assertEquals(rowsInA.length, 1, "spreadsheet A should only contain repo-pawel's row");
    assertEquals(rowsInA[0].CHAD_RECORD_KEY, "repo-pawel:01");
    assertEquals(rowsInB.length, 1, "spreadsheet B should only contain repo-kamil's row");
    assertEquals(rowsInB[0].CHAD_RECORD_KEY, "repo-kamil:01");
  });

  await test("date-entry jobs are routed to the dates target/tab, completely separate from daily-entry rows", async () => {
    await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).deleteMany({});
    const client = new FakeGoogleSheetsClient();
    await enqueueGoogleSheetsSync({
      operationId: "de-1",
      kind: "upsert",
      payload: payload("01", { DATA: "2026-07-20", "ŹRÓDŁO": "Tinder" }, "repo-A", "date-entry"),
    });
    await drainGoogleSheetsSyncOnce({ client, sheetNames: SHEET_NAMES, workerId: "w1" });

    const dailyRows = client.getRows(DAILY_TARGET);
    const dateRows = client.getRows(DATES_TARGET);
    assertEquals(dailyRows.length, 0, "a date-entry job must never write to the daily-entry tab");
    assertEquals(dateRows.length, 1);
    assertEquals(dateRows[0].DATA, "2026-07-20");
    assertEquals(dateRows[0]["ŹRÓDŁO"], "Tinder");

    const headers = client.getHeaders(DATES_TARGET);
    assert(headers.includes("DATA"), "dates tab headers should include Date Entry's own columns");
    assert(!headers.includes("DATE"), "dates tab headers must not include daily-entry-only columns");
  });

  // Leave no test jobs behind — see outbox.test.ts's matching cleanup for why.
  await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).deleteMany({});

  console.log(`\n${passed} passed, ${failed} failed`);
  await closeMongoConnection();
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
