/**
 * Regression test — Story 92: buildBeeperMongoUriForSource("qnap") must
 * recognize docker-compose.qnap.{test,prod}.yml's real BEEPER_MONGODB_URI
 * shape (mongodb://user:pass@beeper-mongodb:27017?authSource=admin — the
 * same-host container network hostname, port 27017, never the externally
 * -published Tailscale port 12041) and return it as-is, instead of falling
 * through to require BEEPER_MONGO_ROOT_USERNAME/PASSWORD (only ever set on
 * local, for the Dev Panel's runtime URI rebuild — never set on TEST/PROD).
 *
 * Real bug found live: TEST's Beeper Contacts page showed "No contacts
 * found" (root cause: a hard 500,
 * "BEEPER_MONGO_ROOT_USERNAME/PASSWORD must be set") even though
 * BEEPER_MONGODB_URI was already correctly configured — same bug shape as
 * isQnapPostgresUri()'s "chad-postgres" fix (2026-07-27), never applied to
 * the Beeper Mongo equivalent until now.
 *
 * Run via: npx tsc && node dist/dev-db-override-qnap-beeper-uri.test.js
 */

import { buildBeeperMongoUriForSource } from "./dev-db-override.js";

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

function assertEquals(actual: unknown, expected: unknown, message?: string): void {
  if (actual !== expected) {
    throw new Error(`${message ?? "assertEquals failed"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log("Running buildBeeperMongoUriForSource(\"qnap\") TEST/PROD URI-shape tests...\n");

const savedEnv = {
  BEEPER_MONGO_ROOT_USERNAME: process.env.BEEPER_MONGO_ROOT_USERNAME,
  BEEPER_MONGO_ROOT_PASSWORD: process.env.BEEPER_MONGO_ROOT_PASSWORD,
  BEEPER_MONGODB_URI: process.env.BEEPER_MONGODB_URI,
};

try {
  test("real docker-compose.qnap.test.yml shape (beeper-mongodb:27017, no ROOT_USERNAME set) is used as-is, not rejected", () => {
    delete process.env.BEEPER_MONGO_ROOT_USERNAME;
    delete process.env.BEEPER_MONGO_ROOT_PASSWORD;
    process.env.BEEPER_MONGODB_URI = "mongodb://beeper_admin:realpass@beeper-mongodb:27017?authSource=admin";

    const uri = buildBeeperMongoUriForSource("qnap");
    assertEquals(uri, "mongodb://beeper_admin:realpass@beeper-mongodb:27017?authSource=admin");
  });

  test("Tailscale form (100.117.139.83:12041) is still recognized (no regression)", () => {
    delete process.env.BEEPER_MONGO_ROOT_USERNAME;
    delete process.env.BEEPER_MONGO_ROOT_PASSWORD;
    process.env.BEEPER_MONGODB_URI = "mongodb://beeper_admin:realpass@100.117.139.83:12041/?authSource=admin";

    const uri = buildBeeperMongoUriForSource("qnap");
    assertEquals(uri, "mongodb://beeper_admin:realpass@100.117.139.83:12041/?authSource=admin");
  });

  test("a genuinely non-QNAP URI (local) still throws asking for ROOT_USERNAME/PASSWORD (no over-broad matching)", () => {
    delete process.env.BEEPER_MONGO_ROOT_USERNAME;
    delete process.env.BEEPER_MONGO_ROOT_PASSWORD;
    process.env.BEEPER_MONGODB_URI = "mongodb://localhost:27017?authSource=admin";

    let threw = false;
    try {
      buildBeeperMongoUriForSource("qnap");
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("expected an error — a plain localhost URI must not be treated as QNAP");
  });
} finally {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
