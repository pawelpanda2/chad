/**
 * google-sheets/production-guard.ts tests — pure, no I/O (reads/restores
 * process.env directly). Run via:
 *   cd packages/dba && npx tsc && node dist/google-sheets/production-guard.test.js
 */

import {
  checkGoogleSheetsProductionGuard,
  checkGoogleSheetsWriteAllowed,
  extractMongoHost,
} from "./production-guard.js";

async function runTests() {
  console.log("Running google-sheets/production-guard Tests...\n");
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void) {
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

  function assertEquals(actual: unknown, expected: unknown, message?: string) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${message ?? "Assertion failed"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }

  const keys = [
    "CHAD_ENVIRONMENT",
    "MONGODB_URI",
    "DBA_PRIMARY_BACKEND",
    "POSTGRES_URI",
    "GOOGLE_SHEETS_ALLOW_NON_PROD",
    "GOOGLE_SHEETS_NON_PROD_WRITE_USERS",
  ] as const;
  const originalEnv: Record<string, string | undefined> = {};
  for (const k of keys) originalEnv[k] = process.env[k];

  function restoreEnv() {
    for (const k of keys) {
      if (originalEnv[k] === undefined) delete process.env[k];
      else process.env[k] = originalEnv[k];
    }
  }

  test("extractMongoHost pulls the host out from between @ and :/", () => {
    assertEquals(extractMongoHost("mongodb://user:pass@chad-mongodb:27017/chad?authSource=admin"), "chad-mongodb");
    assertEquals(extractMongoHost("mongodb://user:pass@100.117.139.83:12040/chad?authSource=admin"), "100.117.139.83");
  });

  test("blocked when CHAD_ENVIRONMENT is unset", () => {
    delete process.env.CHAD_ENVIRONMENT;
    delete process.env.GOOGLE_SHEETS_ALLOW_NON_PROD;
    process.env.MONGODB_URI = "mongodb://u:p@chad-mongodb:27017/chad";
    assertEquals(checkGoogleSheetsProductionGuard().allowed, false);
    restoreEnv();
  });

  test("blocked when CHAD_ENVIRONMENT=local without ALLOW_NON_PROD", () => {
    process.env.CHAD_ENVIRONMENT = "local";
    delete process.env.GOOGLE_SHEETS_ALLOW_NON_PROD;
    process.env.MONGODB_URI = "mongodb://u:p@chad-mongodb:27017/chad";
    assertEquals(checkGoogleSheetsProductionGuard().allowed, false);
    restoreEnv();
  });

  test("allowed when CHAD_ENVIRONMENT=local with ALLOW_NON_PROD=true", () => {
    process.env.CHAD_ENVIRONMENT = "local";
    process.env.GOOGLE_SHEETS_ALLOW_NON_PROD = "true";
    assertEquals(checkGoogleSheetsProductionGuard().allowed, true);
    restoreEnv();
  });

  test("allowed when CHAD_ENVIRONMENT=test (QNAP TEST regression sync)", () => {
    process.env.CHAD_ENVIRONMENT = "test";
    process.env.DBA_PRIMARY_BACKEND = "postgres";
    delete process.env.POSTGRES_URI;
    assertEquals(checkGoogleSheetsProductionGuard().allowed, true);
    restoreEnv();
  });

  test("non-prod write allowlist: test3 ok, pawel_f blocked", () => {
    process.env.CHAD_ENVIRONMENT = "test";
    process.env.DBA_PRIMARY_BACKEND = "postgres";
    assertEquals(checkGoogleSheetsWriteAllowed("test3").allowed, true);
    assertEquals(checkGoogleSheetsWriteAllowed("pawel_f").allowed, false);
    restoreEnv();
  });

  test("prod allows any username write (map still required at enqueue)", () => {
    process.env.CHAD_ENVIRONMENT = "prod";
    process.env.DBA_PRIMARY_BACKEND = "mongo";
    process.env.MONGODB_URI = "mongodb://u:p@chad-mongodb:27017/chad";
    assertEquals(checkGoogleSheetsWriteAllowed("pawel_f").allowed, true);
    restoreEnv();
  });

  test("blocked when CHAD_ENVIRONMENT=prod but MONGODB_URI points at localhost", () => {
    process.env.CHAD_ENVIRONMENT = "prod";
    process.env.DBA_PRIMARY_BACKEND = "mongo";
    process.env.MONGODB_URI = "mongodb://u:p@localhost:27017/chad_test_story74";
    assertEquals(checkGoogleSheetsProductionGuard().allowed, false);
    restoreEnv();
  });

  test("allowed when CHAD_ENVIRONMENT=prod and MONGODB_URI points at chad-mongodb", () => {
    process.env.CHAD_ENVIRONMENT = "prod";
    process.env.DBA_PRIMARY_BACKEND = "mongo";
    process.env.MONGODB_URI = "mongodb://u:p@chad-mongodb:27017/chad?authSource=admin";
    assertEquals(checkGoogleSheetsProductionGuard().allowed, true);
    restoreEnv();
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
