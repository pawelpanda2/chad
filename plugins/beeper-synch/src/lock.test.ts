/**
 * lock.ts tests. Run via: tsx src/lock.test.ts
 *
 * Uses real child processes for "alive"/"stale" PID scenarios (spawn, kill,
 * wait for exit) rather than guessing a PID number that's "probably dead" —
 * matching packages/beeper-sync/lib/owner-db.test.mjs's real-process-boundary
 * testing style.
 */
import { spawnSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLock, LockHeldError, releaseLock } from "./lock.js";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
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

function assertTrue(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

function tmpLockFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "beeper-synch-lock-test-"));
  return join(dir, "beeper-synch.pid");
}

console.log("Running lock.ts tests...\n");

test("acquireLock creates the lock file with our own pid", () => {
  const lockFile = tmpLockFile();
  acquireLock(lockFile, 12345);
  assertTrue(existsSync(lockFile), "lock file must exist after acquire");
  assertTrue(readFileSync(lockFile, "utf8").trim() === "12345", "lock file must contain the given pid");
});

test("acquireLock throws LockHeldError when a LIVE process already holds the lock", () => {
  const lockFile = tmpLockFile();
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"]);
  try {
    acquireLock(lockFile, child.pid!);
    let threw = false;
    try {
      acquireLock(lockFile, process.pid);
    } catch (err) {
      threw = err instanceof LockHeldError;
    }
    assertTrue(threw, "expected LockHeldError for a live holder");
  } finally {
    child.kill("SIGKILL");
  }
});

test("acquireLock reclaims a STALE lock (holder pid no longer running)", () => {
  const lockFile = tmpLockFile();
  const result = spawnSync(process.execPath, ["-e", "process.exit(0)"]);
  assertTrue(result.status === 0, "helper process must have exited cleanly before the test proceeds");
  const deadPid = result.pid;
  // deadPid has already exited (spawnSync waited for it) — acquiring with this
  // stale pid on disk must succeed, not throw.
  acquireLock(lockFile, deadPid ?? 999999);
  acquireLock(lockFile, process.pid);
  assertTrue(readFileSync(lockFile, "utf8").trim() === String(process.pid), "lock must now belong to us");
});

test("releaseLock removes the file when it still belongs to us", () => {
  const lockFile = tmpLockFile();
  acquireLock(lockFile, process.pid);
  releaseLock(lockFile, process.pid);
  assertTrue(!existsSync(lockFile), "lock file must be gone after release");
});

test("releaseLock does NOT remove a lock now held by a different (newer) instance", () => {
  const lockFile = tmpLockFile();
  acquireLock(lockFile, 111);
  // Simulate: pid 111's holder crashed, a fresh instance reclaimed the stale
  // lock as pid 222, then the ORIGINAL (111) caller's cleanup path runs late.
  acquireLock(lockFile, 222);
  releaseLock(lockFile, 111);
  assertTrue(existsSync(lockFile), "lock file must survive a release from a stale pid");
  assertTrue(readFileSync(lockFile, "utf8").trim() === "222", "lock must still belong to the newer instance");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
