/**
 * Story 86 — pure unit tests for Beeper sync permission helpers.
 * Run: cd packages/dba && npx tsc && node dist/beeper-sync-permissions.test.js
 */

import {
  normalizeBeeperPermissions,
  resolveBeeperSyncMode,
} from "./beeper-crm.js";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertEquals(a: unknown, b: unknown, msg?: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${msg ?? "assertEquals"}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
}

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e instanceof Error ? e.message : e}`);
    failed++;
  }
}

console.log("Running beeper sync-permissions unit tests...\n");

test("unset → include", () => {
  assertEquals(resolveBeeperSyncMode(null), "include");
  assertEquals(resolveBeeperSyncMode({}), "include");
  assertEquals(resolveBeeperSyncMode({ include: null, exclude: null }), "include");
});

test("include true → include", () => {
  assertEquals(resolveBeeperSyncMode({ include: true, exclude: false }), "include");
});

test("exclude true → exclude", () => {
  assertEquals(resolveBeeperSyncMode({ include: false, exclude: true }), "exclude");
  assertEquals(resolveBeeperSyncMode({ include: true, exclude: true }), "exclude");
});

test("both false → metadata", () => {
  assertEquals(resolveBeeperSyncMode({ include: false, exclude: false }), "metadata");
});

test("normalize rejects both true", () => {
  let threw = false;
  try {
    normalizeBeeperPermissions(true, true);
  } catch {
    threw = true;
  }
  assert(threw, "should throw");
});

test("normalize allows both false", () => {
  assertEquals(normalizeBeeperPermissions(false, false), { include: false, exclude: false });
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
