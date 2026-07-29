/**
 * mirror-scheduler.ts tests. Run via: tsx src/mirror-scheduler.test.ts
 *
 * Uses a fake, fully-controllable refreshFn (deferred promises) instead of
 * the real dba refreshBeeperMongoMirror — this module owns only scheduling/
 * non-overlap/stop behavior, not the mirror logic itself (that's tested for
 * real, against real QNAP+local Mongo, in Story 92's manual verification —
 * see backlog/stories/92).
 */
import { MirrorRunner, type RefreshFn } from "./mirror-scheduler.js";
import type { BeeperMirrorMetadata } from "dba";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => Promise<void> | void): Promise<void> | void {
  const done = (err?: unknown) => {
    if (err) {
      console.log(`  ✗ ${name}`);
      console.log(`    Error: ${err}`);
      failed++;
    } else {
      console.log(`  ✓ ${name}`);
      passed++;
    }
  };
  try {
    const result = fn();
    if (result && typeof (result as Promise<void>).then === "function") {
      return (result as Promise<void>).then(() => done(), done);
    }
    done();
  } catch (err) {
    done(err);
  }
}

function assertTrue(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function fakeMeta(overrides: Partial<BeeperMirrorMetadata> = {}): BeeperMirrorMetadata {
  return {
    repoGuid: "21d11bdc-f1f4-44d1-b61a-3fa6b039c641",
    sourceHostPort: "qnap:12041",
    targetHostPort: "localhost:27017",
    lastCheckedAt: new Date().toISOString(),
    lastSuccessAt: new Date().toISOString(),
    result: "PASS",
    collections: { contacts: 1 },
    ...overrides,
  };
}

console.log("Running mirror-scheduler.ts tests...\n");

async function main() {
  await test("runs immediately on start() without waiting a full interval", async () => {
    let calls = 0;
    const refreshFn: RefreshFn = async () => {
      calls++;
      return fakeMeta();
    };
    const runner = new MirrorRunner("g", "src", "dst", 60_000, refreshFn);
    runner.start();
    await sleep(20);
    assertTrue(calls === 1, `expected 1 immediate call, got ${calls}`);
    await runner.stop();
  });

  await test("does not start a second run while one is in flight (non-overlap)", async () => {
    let calls = 0;
    const first = deferred<BeeperMirrorMetadata>();
    const refreshFn: RefreshFn = async () => {
      calls++;
      if (calls === 1) return first.promise;
      return fakeMeta();
    };
    // Very short interval — if overlap were possible, a second call would
    // fire well before we resolve the first.
    const runner = new MirrorRunner("g", "src", "dst", 5, refreshFn);
    runner.start();
    await sleep(50);
    assertTrue(calls === 1, `expected still only 1 call while first is in flight, got ${calls}`);
    first.resolve(fakeMeta());
    await sleep(30);
    assertTrue(calls >= 2, `expected a second call after the first resolved, got ${calls}`);
    await runner.stop();
  });

  await test("stop() waits for an in-flight run to finish rather than aborting it", async () => {
    const inFlight = deferred<BeeperMirrorMetadata>();
    let sawResolution = false;
    const refreshFn: RefreshFn = async () => {
      const result = await inFlight.promise;
      sawResolution = true;
      return result;
    };
    const runner = new MirrorRunner("g", "src", "dst", 60_000, refreshFn);
    runner.start();
    await sleep(10);
    const stopPromise = runner.stop();
    await sleep(10);
    inFlight.resolve(fakeMeta());
    await stopPromise;
    assertTrue(sawResolution, "stop() must have waited for the in-flight refreshFn to actually resolve");
  });

  await test("stop() prevents any further scheduled runs", async () => {
    let calls = 0;
    const refreshFn: RefreshFn = async () => {
      calls++;
      return fakeMeta();
    };
    const runner = new MirrorRunner("g", "src", "dst", 15, refreshFn);
    runner.start();
    await sleep(10);
    await runner.stop();
    const callsAtStop = calls;
    await sleep(60);
    assertTrue(calls === callsAtStop, `expected no further calls after stop(), had ${callsAtStop}, now ${calls}`);
  });

  await test("snapshot() reflects the last result and failure count", async () => {
    let call = 0;
    const refreshFn: RefreshFn = async () => {
      call++;
      return call === 1 ? fakeMeta({ result: "FAIL", lastError: "boom" }) : fakeMeta({ result: "NO_CHANGE" });
    };
    const runner = new MirrorRunner("g", "src", "dst", 10, refreshFn);
    runner.start();
    await sleep(15);
    let snap = runner.snapshot();
    assertTrue(snap.totalFailures >= 1, "expected at least 1 recorded failure after a FAIL run");
    await sleep(20);
    snap = runner.snapshot();
    assertTrue(snap.lastResult === "NO_CHANGE" || snap.lastResult === "FAIL", `unexpected lastResult ${snap.lastResult}`);
    await runner.stop();
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
