/**
 * google-sheets/sync.ts tests (`queueDailyEntrySheetSyncIfEnabled`/
 * `queueDateEntrySheetSyncIfEnabled`) — the exact functions `leads.ts`
 * calls from `saveDailyEntry`/`updateDailyEntry`/`deleteDailyEntry`/
 * `saveDateEntry`/`updateDateEntry`. Uses real local MongoDB for the outbox
 * collection (only reached when the integration is enabled); the
 * disabled-path test doesn't touch Mongo at all.
 *
 * Run via: cd packages/dba && npx tsc &&
 *   MONGODB_URI="mongodb://...@localhost:27017/chad?authSource=admin" \
 *   node dist/google-sheets/sync.test.js
 */

import { getMongoDb, closeMongoConnection } from "../mongo.js";
import { queueDailyEntrySheetSyncIfEnabled, queueDateEntrySheetSyncIfEnabled } from "./sync.js";
import { GOOGLE_SHEETS_OUTBOX_COLLECTION } from "./outbox.js";

const ENV_KEYS = [
  "GOOGLE_SHEETS_ENABLED",
  "GOOGLE_SHEETS_SPREADSHEET_MAP",
  "GOOGLE_SHEETS_DAILY_TRACKER_SHEET_NAME",
  "GOOGLE_SHEETS_DATE_ENTRIES_SHEET_NAME",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
  "CHAD_ENVIRONMENT",
] as const;

// production-guard.ts's own test file (production-guard.test.ts) covers its
// behavior directly — here it just needs to be satisfied so these tests can
// exercise the enqueue logic itself. Safe to mutate freely: getMongoDb()'s
// client is already connected (cached at module load, above) using the
// REAL MONGODB_URI the test runner was invoked with — the guard only ever
// re-reads process.env.MONGODB_URI as a string for pattern matching, it
// never opens a new connection from it.
const ORIGINAL_MONGODB_URI = process.env.MONGODB_URI;

function clearEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
  if (ORIGINAL_MONGODB_URI === undefined) delete process.env.MONGODB_URI;
  else process.env.MONGODB_URI = ORIGINAL_MONGODB_URI;
}

function setFullValidEnv() {
  process.env.GOOGLE_SHEETS_ENABLED = "true";
  process.env.GOOGLE_SHEETS_SPREADSHEET_MAP = '{"pawel_f":"sheet-pawel-123","kamil_s":"sheet-kamil-456"}';
  process.env.GOOGLE_SHEETS_DAILY_TRACKER_SHEET_NAME = "daily-tracker-local";
  process.env.GOOGLE_SHEETS_DATE_ENTRIES_SHEET_NAME = "dates-local";
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "svc@example.iam.gserviceaccount.com";
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----\\n";
  // Satisfies production-guard.ts's checks — see comment above.
  process.env.CHAD_ENVIRONMENT = "prod";
  process.env.MONGODB_URI = "mongodb://u:p@chad-mongodb:27017/chad?authSource=admin";
}

async function runTests() {
  console.log("Running google-sheets/sync Tests...\n");
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    clearEnv();
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (e) {
      console.log(`  ✗ ${name}`);
      console.log(`    Error: ${e}`);
      failed++;
    } finally {
      clearEnv();
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

  await test("disabled integration (default/no env) never touches Mongo and never throws", async () => {
    const before = await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).countDocuments({});
    await queueDailyEntrySheetSyncIfEnabled({
      repoGuid: "repo-disabled",
      username: "pawel_f",
      loca: "01",
      itemName: "01",
      fields: { DATE: "2026-07-20" },
      kind: "upsert",
    });
    const after = await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).countDocuments({});
    assertEquals(after, before, "no job should have been enqueued while disabled");
  });

  await test("queueDailyEntrySheetSyncIfEnabled enqueues a job with recordType daily-entry and the resolved spreadsheetId", async () => {
    setFullValidEnv();
    await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).deleteMany({ recordKey: "repo-enabled:10" });
    await queueDailyEntrySheetSyncIfEnabled({
      repoGuid: "repo-enabled",
      username: "pawel_f",
      loca: "10",
      itemName: "01",
      fields: { DATE: "2026-07-20", STATE: "TAK" },
      kind: "upsert",
    });
    const jobs = await db
      .collection(GOOGLE_SHEETS_OUTBOX_COLLECTION)
      .find({ recordKey: "repo-enabled:10" })
      .toArray();
    assertEquals(jobs.length, 1);
    assertEquals(jobs[0].payload.recordType, "daily-entry");
    assertEquals(jobs[0].payload.username, "pawel_f");
    assertEquals(jobs[0].payload.spreadsheetId, "sheet-pawel-123", "must resolve to pawel_f's own spreadsheet, not a shared/global one");
    assertEquals(jobs[0].payload.fields.DATE, "2026-07-20");
    assertEquals(jobs[0].payload.fields.STATE, "TAK");
  });

  await test("queueDateEntrySheetSyncIfEnabled enqueues a job with recordType date-entry and the resolved spreadsheetId", async () => {
    setFullValidEnv();
    await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).deleteMany({ recordKey: "repo-enabled:11" });
    await queueDateEntrySheetSyncIfEnabled({
      repoGuid: "repo-enabled",
      username: "kamil_s",
      loca: "11",
      itemName: "01",
      fields: { DATA: "2026-07-20", "ŹRÓDŁO": "Tinder" },
      kind: "upsert",
    });
    const jobs = await db
      .collection(GOOGLE_SHEETS_OUTBOX_COLLECTION)
      .find({ recordKey: "repo-enabled:11" })
      .toArray();
    assertEquals(jobs.length, 1);
    assertEquals(jobs[0].payload.recordType, "date-entry");
    assertEquals(jobs[0].payload.username, "kamil_s");
    assertEquals(jobs[0].payload.spreadsheetId, "sheet-kamil-456", "must resolve to kamil_s's own spreadsheet");
    assertEquals(jobs[0].payload.fields.DATA, "2026-07-20");
  });

  await test("enabled but missing required config logs via the error callback and never throws", async () => {
    process.env.GOOGLE_SHEETS_ENABLED = "true";
    // Deliberately leave every other var unset.
    let loggedError: unknown = null;
    await queueDailyEntrySheetSyncIfEnabled(
      { repoGuid: "repo-x", username: "pawel_f", loca: "99", itemName: "01", fields: { DATE: "2026-07-20" }, kind: "upsert" },
      (error: unknown) => {
        loggedError = error;
      }
    );
    assert(loggedError !== null, "the missing-config error should have been reported via the callback, not thrown");
  });

  await test("enabled+configured but username not in GOOGLE_SHEETS_SPREADSHEET_MAP reports via callback, never falls back to another user's sheet", async () => {
    setFullValidEnv();
    let loggedError: unknown = null;
    const before = await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).countDocuments({});
    await queueDailyEntrySheetSyncIfEnabled(
      { repoGuid: "repo-unmapped", username: "someone_not_in_map", loca: "50", itemName: "01", fields: { DATE: "2026-07-20" }, kind: "upsert" },
      (error: unknown) => {
        loggedError = error;
      }
    );
    const after = await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).countDocuments({});
    assert(loggedError !== null, "an unmapped username should report via the callback, not silently enqueue");
    assert(String(loggedError).includes("someone_not_in_map"), "error should name the unmapped username");
    assertEquals(after, before, "no job should have been enqueued for an unmapped username");
  });

  await test("two different repos/users enqueue independent jobs with independent recordKeys and independent spreadsheetIds (isolation)", async () => {
    setFullValidEnv();
    await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).deleteMany({ "payload.loca": "20" });
    await queueDailyEntrySheetSyncIfEnabled({ repoGuid: "repo-alice", username: "pawel_f", loca: "20", itemName: "01", fields: { DATE: "a" }, kind: "upsert" });
    await queueDailyEntrySheetSyncIfEnabled({ repoGuid: "repo-bob", username: "kamil_s", loca: "20", itemName: "01", fields: { DATE: "b" }, kind: "upsert" });

    const jobs = await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).find({ "payload.loca": "20" }).toArray();
    assertEquals(jobs.length, 2);
    const recordKeys = jobs.map((j) => j.recordKey).sort();
    assertEquals(recordKeys, ["repo-alice:20", "repo-bob:20"]);
    const byRecordKey = Object.fromEntries(jobs.map((j) => [j.recordKey, j.payload.spreadsheetId]));
    assertEquals(byRecordKey["repo-alice:20"], "sheet-pawel-123");
    assertEquals(byRecordKey["repo-bob:20"], "sheet-kamil-456");
  });

  await test("delete kind enqueues with empty fields", async () => {
    setFullValidEnv();
    await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).deleteMany({ recordKey: "repo-enabled:30" });
    await queueDailyEntrySheetSyncIfEnabled({ repoGuid: "repo-enabled", username: "pawel_f", loca: "30", itemName: "", fields: {}, kind: "delete" });
    const jobs = await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).find({ recordKey: "repo-enabled:30" }).toArray();
    assertEquals(jobs.length, 1);
    assertEquals(jobs[0].kind, "delete");
    assertEquals(jobs[0].payload.fields, {});
  });

  await test("fully valid config still never enqueues when CHAD_ENVIRONMENT isn't 'prod' (production guard, 2026-07-22 — independent of GOOGLE_SHEETS_ENABLED)", async () => {
    setFullValidEnv();
    process.env.CHAD_ENVIRONMENT = "local"; // override back to non-prod
    const before = await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).countDocuments({});
    await queueDailyEntrySheetSyncIfEnabled({
      repoGuid: "repo-guard-test",
      username: "pawel_f",
      loca: "77",
      itemName: "01",
      fields: { DATE: "2026-07-20" },
      kind: "upsert",
    });
    const after = await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).countDocuments({});
    assertEquals(after, before, "no job should be enqueued when CHAD_ENVIRONMENT is not 'prod', even with everything else fully configured");
  });

  await test("fully valid config still never enqueues when MONGODB_URI isn't a known production host, even with CHAD_ENVIRONMENT=prod", async () => {
    setFullValidEnv();
    process.env.MONGODB_URI = "mongodb://u:p@mongodb:27017/chad"; // local docker sibling host, not chad-mongodb
    const before = await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).countDocuments({});
    await queueDailyEntrySheetSyncIfEnabled({
      repoGuid: "repo-guard-test-2",
      username: "pawel_f",
      loca: "78",
      itemName: "01",
      fields: { DATE: "2026-07-20" },
      kind: "upsert",
    });
    const after = await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).countDocuments({});
    assertEquals(after, before, "no job should be enqueued when MONGODB_URI doesn't resolve to a known production host");
  });

  // Leave no test jobs behind — see outbox.test.ts's matching cleanup for why
  // (this exact scenario — leftover fake-config test jobs later getting
  // drained into a real spreadsheet — happened once during this Story's own
  // manual real-sheet verification).
  await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).deleteMany({});

  console.log(`\n${passed} passed, ${failed} failed`);
  await closeMongoConnection();
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
