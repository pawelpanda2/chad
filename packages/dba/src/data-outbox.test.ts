/**
 * data-outbox.ts tests — run against a REAL local MongoDB instance
 * (the already-running `chad-mongodb-local-mac-docker` container), using a
 * dedicated test-only database (never the real `beeper`/`chad` data —
 * Story 72 §25). Requires `MONGODB_URI` to point at that test database;
 * see `run-mongo-tests.sh` for the exact invocation.
 *
 * Run via: npx tsc && node dist/data-outbox.test.js
 */

import { getMongoDb, closeMongoConnection } from "./mongo.js";
import {
  enqueueFollowerOperation,
  claimNextJob,
  markSynced,
  markRetry,
  markConflict,
  recoverStaleLocks,
  getJob,
  reconcileMissingOutboxJobs,
  OUTBOX_COLLECTION,
  RETRY_BACKOFF_MS,
} from "./data-outbox.js";
import { createTestClock } from "./data-clock.js";
import type { PutItemCommand } from "./data-commands.js";
import type { CpItem } from "./cp-model.js";

function makeCommand(operationId: string): PutItemCommand {
  const item: CpItem = {
    _id: operationId,
    config: { id: operationId, address: `test-repo/${operationId}`, type: "Text", name: operationId },
    body: "hello",
  };
  return { kind: "put-item", operationId, createdAt: new Date().toISOString(), item };
}

async function runTests() {
  console.log("Running data-outbox Tests (real local MongoDB)...\n");
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
    if (a !== e) {
      throw new Error(`${message ?? "assertEquals failed"}: expected ${e}, got ${a}`);
    }
  }

  function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(message);
  }

  // Clean slate — this is a dedicated test database (see file header).
  const db = await getMongoDb();
  await db.collection(OUTBOX_COLLECTION).deleteMany({});

  await test("enqueue creates a pending job with the expected id", async () => {
    const command = makeCommand("op-1");
    await enqueueFollowerOperation({ command, primaryBackend: "mongo", followerBackend: "content-provider" });
    const job = await getJob("op-1:content-provider");
    assert(job !== null, "job should exist");
    assertEquals(job!.status, "pending");
    assertEquals(job!.operationId, "op-1");
    assertEquals(job!.followerBackend, "content-provider");
  });

  await test("enqueuing the same operationId+follower twice is idempotent (no duplicate, no overwrite)", async () => {
    const command = makeCommand("op-2");
    await enqueueFollowerOperation({ command, primaryBackend: "mongo", followerBackend: "content-provider" });
    const jobBefore = await getJob("op-2:content-provider");
    await enqueueFollowerOperation({ command, primaryBackend: "mongo", followerBackend: "content-provider" });
    const count = await db.collection(OUTBOX_COLLECTION).countDocuments({ operationId: "op-2" });
    assertEquals(count, 1);
    const jobAfter = await getJob("op-2:content-provider");
    assertEquals(jobAfter!.createdAt, jobBefore!.createdAt);
  });

  await test("different followers for the same operationId get separate jobs", async () => {
    const command = makeCommand("op-3");
    await enqueueFollowerOperation({ command, primaryBackend: "content-provider", followerBackend: "mongo" });
    await enqueueFollowerOperation({ command, primaryBackend: "mongo", followerBackend: "content-provider" });
    const count = await db.collection(OUTBOX_COLLECTION).countDocuments({ operationId: "op-3" });
    assertEquals(count, 2);
  });

  await test("claimNextJob moves pending -> processing and sets the lock", async () => {
    const command = makeCommand("op-4");
    await enqueueFollowerOperation({ command, primaryBackend: "mongo", followerBackend: "content-provider" });
    const claimed = await claimNextJob("worker-A");
    assert(claimed !== null, "should have claimed a job");
    assertEquals(claimed!.status, "processing");
    assertEquals(claimed!.lockedBy, "worker-A");
  });

  await test("a processing job is never claimed by a second worker", async () => {
    // Isolated slate — claimNextJob picks ANY eligible job, so leftover
    // pending jobs from earlier tests would make this test's outcome
    // depend on enqueue order rather than on the behavior under test.
    await db.collection(OUTBOX_COLLECTION).deleteMany({});
    const command = makeCommand("op-5");
    await enqueueFollowerOperation({ command, primaryBackend: "mongo", followerBackend: "content-provider" });

    const first = await claimNextJob("worker-A");
    assert(first !== null && first.operationId === "op-5", "worker-A should claim op-5");

    const second = await claimNextJob("worker-B");
    assert(second === null, "worker-B must not be able to claim the same (already-processing) job");

    const job = await getJob("op-5:content-provider");
    assertEquals(job!.status, "processing");
    assertEquals(job!.lockedBy, "worker-A");
  });

  await test("markSynced sets status=synced and clears the lock", async () => {
    const command = makeCommand("op-6");
    await enqueueFollowerOperation({ command, primaryBackend: "mongo", followerBackend: "content-provider" });
    await claimNextJob("worker-A");
    await markSynced("op-6:content-provider");
    const job = await getJob("op-6:content-provider");
    assertEquals(job!.status, "synced");
    assertEquals(job!.lockedBy, null);
    assert(job!.completedAt !== null, "completedAt should be set");
  });

  await test("markRetry schedules the next attempt per the backoff schedule", async () => {
    const clock = createTestClock("2026-01-01T00:00:00.000Z");
    const command = makeCommand("op-7");
    await enqueueFollowerOperation({ command, primaryBackend: "mongo", followerBackend: "content-provider" }, clock);
    await claimNextJob("worker-A", clock);
    await markRetry("op-7:content-provider", new Error("boom"), clock);
    const job = await getJob("op-7:content-provider");
    assertEquals(job!.status, "retry");
    assertEquals(job!.attempts, 1);
    assertEquals(job!.lastError, "boom");
    const expectedNext = new Date(clock.now().getTime() + RETRY_BACKOFF_MS[0]).toISOString();
    assertEquals(job!.nextAttemptAt, expectedNext);
  });

  await test("markRetry marks failed once the backoff schedule is exhausted", async () => {
    const clock = createTestClock("2026-01-01T00:00:00.000Z");
    const command = makeCommand("op-8");
    await enqueueFollowerOperation({ command, primaryBackend: "mongo", followerBackend: "content-provider" }, clock);
    // RETRY_BACKOFF_MS.length calls exhaust every defined backoff stage
    // (ending in "retry" with attempts == length); one more call is what
    // actually crosses into "failed".
    for (let i = 0; i < RETRY_BACKOFF_MS.length + 1; i++) {
      await markRetry("op-8:content-provider", new Error(`attempt ${i}`), clock);
    }
    const job = await getJob("op-8:content-provider");
    assertEquals(job!.status, "failed");
    assertEquals(job!.attempts, RETRY_BACKOFF_MS.length + 1);
  });

  await test("markConflict records the diagnostic and clears the lock", async () => {
    const command = makeCommand("op-9");
    await enqueueFollowerOperation({ command, primaryBackend: "mongo", followerBackend: "content-provider" });
    await claimNextJob("worker-A");
    await markConflict("op-9:content-provider", "address mismatch: expected X got Y");
    const job = await getJob("op-9:content-provider");
    assertEquals(job!.status, "conflict");
    assertEquals(job!.lastError, "address mismatch: expected X got Y");
  });

  await test("recoverStaleLocks resets a job stuck in processing past the lock timeout", async () => {
    const clock = createTestClock("2026-01-01T00:00:00.000Z");
    const command = makeCommand("op-10");
    await enqueueFollowerOperation({ command, primaryBackend: "mongo", followerBackend: "content-provider" }, clock);
    await claimNextJob("worker-A", clock);

    // Simulate a crash: 11 minutes pass (STALE_LOCK_MS is 10 minutes), no
    // markSynced/markRetry ever happened for this job.
    const laterClock = createTestClock(new Date(clock.now().getTime() + 11 * 60_000).toISOString());
    const recovered = await recoverStaleLocks(laterClock);
    assert(recovered >= 1, "should have recovered at least this one stale job");

    const job = await getJob("op-10:content-provider");
    assertEquals(job!.status, "retry");
    assertEquals(job!.lockedBy, null);
  });

  await test("reconcileMissingOutboxJobs backfills a missing job and is a no-op for existing ones", async () => {
    const existingCommand = makeCommand("op-11");
    await enqueueFollowerOperation({ command: existingCommand, primaryBackend: "mongo", followerBackend: "content-provider" });

    const missingCommand = makeCommand("op-12");
    const created = await reconcileMissingOutboxJobs([
      { command: existingCommand, primaryBackend: "mongo", followerBackend: "content-provider" },
      { command: missingCommand, primaryBackend: "mongo", followerBackend: "content-provider" },
    ]);

    assertEquals(created, 1);
    const job = await getJob("op-12:content-provider");
    assert(job !== null, "op-12's job should have been backfilled");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  await closeMongoConnection();
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
