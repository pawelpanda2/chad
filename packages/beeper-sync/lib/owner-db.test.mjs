/**
 * owner-db.mjs tests — Story 73.
 *
 * beeper-ws and beeper-oplog each keep an identical copy of this file
 * (see owner-db.mjs's own header comment for why); these tests exercise
 * the shared logic once and apply equally to all three copies.
 *
 * resolveOwnerRepoGuid() calls process.exit(1) on failure rather than
 * throwing (deliberately — a background process with a missing/invalid
 * owner must stop hard at startup, not continue in some degraded state),
 * so the failure-path tests spawn a real child process and assert on its
 * exit code instead of catching an exception in-process.
 *
 * Run via: node lib/owner-db.test.mjs
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ownerDatabaseName, redactMongoUri } from "./owner-db.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OWNER_DB_PATH = join(__dirname, "owner-db.mjs");

let passed = 0;
let failed = 0;

function test(name, fn) {
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

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message ?? "assertEquals failed"}: expected ${expected}, got ${actual}`);
  }
}

// Spawns a fresh Node process that imports owner-db.mjs and calls
// resolveOwnerRepoGuid(), with BEEPER_OWNER_REPO_GUID set (or deliberately
// unset) in its env — a real process boundary, matching how
// beeper-ws/beeper-sync/beeper-oplog actually call this at startup.
function spawnResolve(envOverrides) {
  const env = { ...process.env, ...envOverrides };
  if (envOverrides.BEEPER_OWNER_REPO_GUID === undefined) {
    delete env.BEEPER_OWNER_REPO_GUID;
  }
  return spawnSync(
    process.execPath,
    ["-e", `import("${OWNER_DB_PATH}").then(m => { const g = m.resolveOwnerRepoGuid(); console.log(g); process.exit(0); })`],
    { env, encoding: "utf-8" }
  );
}

console.log("Running owner-db.mjs tests...\n");

test("missing BEEPER_OWNER_REPO_GUID stops the process (non-zero exit)", () => {
  const result = spawnResolve({ BEEPER_OWNER_REPO_GUID: undefined });
  assertEquals(result.status, 1, "expected exit code 1 when the env var is missing");
});

test("invalid (non-GUID) BEEPER_OWNER_REPO_GUID stops the process (non-zero exit)", () => {
  const result = spawnResolve({ BEEPER_OWNER_REPO_GUID: "not-a-real-guid" });
  assertEquals(result.status, 1, "expected exit code 1 for a malformed GUID");
});

test("valid BEEPER_OWNER_REPO_GUID resolves successfully (exit code 0)", () => {
  const result = spawnResolve({ BEEPER_OWNER_REPO_GUID: "21d11bdc-f1f4-44d1-b61a-3fa6b039c641" });
  assertEquals(result.status, 0, "expected exit code 0 for a valid GUID");
  assertEquals(result.stdout.trim(), "21d11bdc-f1f4-44d1-b61a-3fa6b039c641");
});

test("restarting the process with the same env resolves the same owner every time (no in-memory drift)", () => {
  const r1 = spawnResolve({ BEEPER_OWNER_REPO_GUID: "8b603669-f8e6-4224-bd78-a474998995fa" });
  const r2 = spawnResolve({ BEEPER_OWNER_REPO_GUID: "8b603669-f8e6-4224-bd78-a474998995fa" });
  assertEquals(r1.stdout.trim(), r2.stdout.trim(), "two independent process starts must resolve identically");
});

test("ownerDatabaseName never returns the old shared 'beeper' database name", () => {
  const name = ownerDatabaseName("21d11bdc-f1f4-44d1-b61a-3fa6b039c641");
  assertEquals(name, "beeper_21d11bdc-f1f4-44d1-b61a-3fa6b039c641");
});

test("redactMongoUri hides the password", () => {
  const redacted = redactMongoUri("mongodb://user:supersecret@host:27017/beeper");
  assertEquals(redacted.includes("supersecret"), false, "password must not appear in redacted output");
  assertEquals(redacted, "mongodb://user:***@host:27017/beeper");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
