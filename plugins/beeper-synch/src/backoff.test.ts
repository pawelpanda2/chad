/**
 * backoff.ts tests. Run via: tsx src/backoff.test.ts
 */
import { Backoff, nextDelayMs } from "./backoff.js";

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

console.log("Running backoff.ts tests...\n");

test("attempt 0 has no delay", () => {
  assertTrue(nextDelayMs(0, { minMs: 1000, maxMs: 60_000 }) === 0, "attempt 0 must be immediate");
});

test("delay grows with attempt count (ignoring jitter band)", () => {
  const d1 = nextDelayMs(1, { minMs: 1000, maxMs: 60_000 });
  const d3 = nextDelayMs(3, { minMs: 1000, maxMs: 60_000 });
  // attempt 1 band: 800-1200ms; attempt 3 band: 3200-4800ms — must not overlap
  assertTrue(d1 < 1300, `attempt 1 delay too large: ${d1}`);
  assertTrue(d3 > 3000, `attempt 3 delay too small: ${d3}`);
});

test("delay never exceeds maxMs (even with jitter)", () => {
  const d = nextDelayMs(20, { minMs: 1000, maxMs: 10_000 });
  assertTrue(d <= 10_000 * 1.2, `delay ${d} exceeded max*1.2 jitter band`);
});

test("Backoff.attemptCount increases on each nextDelay() call", () => {
  const b = new Backoff({ minMs: 100, maxMs: 1000, stableAfterMs: 1000 });
  b.nextDelay();
  b.nextDelay();
  assertTrue(b.attemptCount === 2, `expected attemptCount 2, got ${b.attemptCount}`);
});

test("Backoff resets attempt count after a stable uptime", () => {
  const b = new Backoff({ minMs: 100, maxMs: 1000, stableAfterMs: 5000 });
  b.nextDelay();
  b.nextDelay();
  b.noteStableUptime(10_000);
  assertTrue(b.attemptCount === 0, `expected reset to 0, got ${b.attemptCount}`);
});

test("Backoff does NOT reset attempt count on a short-lived run (flapping process keeps growing delay)", () => {
  const b = new Backoff({ minMs: 100, maxMs: 1000, stableAfterMs: 5000 });
  b.nextDelay();
  b.noteStableUptime(500);
  assertTrue(b.attemptCount === 1, `expected attemptCount to stay 1, got ${b.attemptCount}`);
});

test("reset() clears attempt count explicitly", () => {
  const b = new Backoff({ minMs: 100, maxMs: 1000, stableAfterMs: 5000 });
  b.nextDelay();
  b.reset();
  assertTrue(b.attemptCount === 0, `expected 0 after reset(), got ${b.attemptCount}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
