/**
 * google-sheets/outbox.ts tests — run against a REAL local MongoDB instance
 * (the already-running `chad-mongodb-local-mac-docker` container), same
 * convention as `data-outbox.test.ts`. Requires `MONGODB_URI` to point at a
 * safe local database.
 *
 * Run via: cd packages/dba && npx tsc &&
 *   MONGODB_URI="mongodb://...@localhost:27017/chad?authSource=admin" \
 *   node dist/google-sheets/outbox.test.js
 */

import { getMongoDb, closeMongoConnection } from "../mongo.js";
import {
  enqueueGoogleSheetsSync,
  claimNextGoogleSheetsJob,
  markGoogleSheetsJobSynced,
  markGoogleSheetsJobRetry,
  recoverStaleGoogleSheetsLocks,
  getGoogleSheetsJob,
  GOOGLE_SHEETS_OUTBOX_COLLECTION,
} from "./outbox.js";
import { RETRY_BACKOFF_MS } from "../data-outbox.js";
import { createTestClock } from "../data-clock.js";
import type { SheetSyncPayload } from "./types.js";

function makePayload(loca: string): SheetSyncPayload {
  return {
    recordType: "daily-entry",
    recordKey: `test-repo:${loca}`,
    repoGuid: "test-repo",
    username: "test-user",
    spreadsheetId: "test-spreadsheet",
    loca,
    itemName: loca,
    fields: { DATE: "2026-07-20" },
  };
}

async function runTests() {
  console.log("Running google-sheets/outbox Tests (real local MongoDB)...\n");
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

  await test("enqueue creates a pending job keyed by operationId", async () => {
    await enqueueGoogleSheetsSync({ operationId: "op-1", kind: "upsert", payload: makePayload("01") });
    const job = await getGoogleSheetsJob("op-1");
    assert(job !== null, "job should exist");
    assertEquals(job!.status, "pending");
    assertEquals(job!.recordKey, "test-repo:01");
    assertEquals(job!.kind, "upsert");
  });

  await test("enqueuing the same operationId twice is idempotent (no duplicate, no overwrite)", async () => {
    const payload = makePayload("02");
    await enqueueGoogleSheetsSync({ operationId: "op-2", kind: "upsert", payload });
    const before = await getGoogleSheetsJob("op-2");
    await enqueueGoogleSheetsSync({ operationId: "op-2", kind: "upsert", payload: makePayload("02-different") });
    const count = await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).countDocuments({ operationId: "op-2" });
    assertEquals(count, 1);
    const after = await getGoogleSheetsJob("op-2");
    assertEquals(after!.createdAt, before!.createdAt);
    // Second enqueue call's differing payload must NOT have overwritten the first (idempotent no-op, not a merge/replace).
    assertEquals(after!.payload.loca, "02");
  });

  await test("several writes to the same record get separate jobs (one per operation, not one slot per record)", async () => {
    const payload = makePayload("03");
    await enqueueGoogleSheetsSync({ operationId: "op-3a", kind: "upsert", payload });
    await enqueueGoogleSheetsSync({ operationId: "op-3b", kind: "upsert", payload: { ...payload, fields: { DATE: "2026-07-21" } } });
    const count = await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).countDocuments({ recordKey: "test-repo:03" });
    assertEquals(count, 2);
  });

  await test("claimNextGoogleSheetsJob moves pending -> processing and sets the lock", async () => {
    await enqueueGoogleSheetsSync({ operationId: "op-4", kind: "upsert", payload: makePayload("04") });
    const claimed = await claimNextGoogleSheetsJob("worker-A");
    assert(claimed !== null, "should have claimed a job");
    assertEquals(claimed!.status, "processing");
    assertEquals(claimed!.lockedBy, "worker-A");
  });

  await test("a processing job is never claimed by a second worker", async () => {
    await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).deleteMany({});
    await enqueueGoogleSheetsSync({ operationId: "op-5", kind: "upsert", payload: makePayload("05") });

    const first = await claimNextGoogleSheetsJob("worker-A");
    assert(first !== null && first.operationId === "op-5", "worker-A should claim op-5");

    const second = await claimNextGoogleSheetsJob("worker-B");
    assert(second === null, "worker-B must not be able to claim the same (already-processing) job");
  });

  await test("markGoogleSheetsJobSynced sets status=synced and clears the lock", async () => {
    await enqueueGoogleSheetsSync({ operationId: "op-6", kind: "upsert", payload: makePayload("06") });
    await claimNextGoogleSheetsJob("worker-A");
    await markGoogleSheetsJobSynced("op-6");
    const job = await getGoogleSheetsJob("op-6");
    assertEquals(job!.status, "synced");
    assertEquals(job!.lockedBy, null);
    assert(job!.completedAt !== null, "completedAt should be set");
  });

  await test("markGoogleSheetsJobRetry schedules the next attempt per the (reused) backoff schedule", async () => {
    const clock = createTestClock("2026-01-01T00:00:00.000Z");
    await enqueueGoogleSheetsSync({ operationId: "op-7", kind: "upsert", payload: makePayload("07") }, clock);
    await claimNextGoogleSheetsJob("worker-A", clock);
    await markGoogleSheetsJobRetry("op-7", new Error("boom"), clock);
    const job = await getGoogleSheetsJob("op-7");
    assertEquals(job!.status, "retry");
    assertEquals(job!.attempts, 1);
    assertEquals(job!.lastError, "boom");
    const expectedNext = new Date(clock.now().getTime() + RETRY_BACKOFF_MS[0]).toISOString();
    assertEquals(job!.nextAttemptAt, expectedNext);
  });

  await test("markGoogleSheetsJobRetry marks failed once the backoff schedule is exhausted", async () => {
    const clock = createTestClock("2026-01-01T00:00:00.000Z");
    await enqueueGoogleSheetsSync({ operationId: "op-8", kind: "upsert", payload: makePayload("08") }, clock);
    for (let i = 0; i < RETRY_BACKOFF_MS.length + 1; i++) {
      await markGoogleSheetsJobRetry("op-8", new Error(`attempt ${i}`), clock);
    }
    const job = await getGoogleSheetsJob("op-8");
    assertEquals(job!.status, "failed");
    assertEquals(job!.attempts, RETRY_BACKOFF_MS.length + 1);
  });

  await test("lastError is a plain sanitized string, never a raw object/stack that could carry secret-adjacent context", async () => {
    await enqueueGoogleSheetsSync({ operationId: "op-9", kind: "upsert", payload: makePayload("09") });
    await markGoogleSheetsJobRetry("op-9", new Error("Google Sheets API error (HTTP 403): insufficient permission"));
    const job = await getGoogleSheetsJob("op-9");
    assertEquals(typeof job!.lastError, "string");
    assertEquals(job!.lastError, "Google Sheets API error (HTTP 403): insufficient permission");
  });

  await test("recoverStaleGoogleSheetsLocks resets a job stuck in processing past the lock timeout", async () => {
    const clock = createTestClock("2026-01-01T00:00:00.000Z");
    await enqueueGoogleSheetsSync({ operationId: "op-10", kind: "upsert", payload: makePayload("10") }, clock);
    await claimNextGoogleSheetsJob("worker-A", clock);

    const laterClock = createTestClock(new Date(clock.now().getTime() + 11 * 60_000).toISOString());
    const recovered = await recoverStaleGoogleSheetsLocks(laterClock);
    assert(recovered >= 1, "should have recovered at least this one stale job");

    const job = await getGoogleSheetsJob("op-10");
    assertEquals(job!.status, "retry");
    assertEquals(job!.lockedBy, null);
  });

  await test("delete-kind jobs enqueue and are claimable the same way as upsert-kind jobs", async () => {
    // Isolated slate — earlier tests in this file leave `retry`-status jobs
    // behind whose `nextAttemptAt` (test-clock-based, 2026-01-01) sorts
    // before this job's real-clock `nextAttemptAt`, which would make
    // claimNextGoogleSheetsJob return one of those instead of op-11.
    await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).deleteMany({});
    await enqueueGoogleSheetsSync({ operationId: "op-11", kind: "delete", payload: makePayload("11") });
    const claimed = await claimNextGoogleSheetsJob("worker-A");
    assert(claimed !== null && claimed.kind === "delete", "should have claimed the delete job");
  });

  // Leave no test jobs behind: this collection is also what a real worker
  // would drain against real Google Sheets credentials in this same local
  // Mongo — a leftover `pending`/`retry` test job here would otherwise get
  // synced into a real spreadsheet the next time someone runs the worker
  // locally (this happened once during this Story's own manual real-sheet
  // verification, which is why this cleanup was added).
  await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).deleteMany({});

  console.log(`\n${passed} passed, ${failed} failed`);
  await closeMongoConnection();
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
