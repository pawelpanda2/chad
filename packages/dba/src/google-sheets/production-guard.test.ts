/**
 * google-sheets/production-guard.ts tests — pure, no I/O (reads/restores
 * process.env directly). Run via:
 *   cd packages/dba && npx tsc && node dist/google-sheets/production-guard.test.js
 */

import { checkGoogleSheetsProductionGuard, extractMongoHost } from "./production-guard.js";

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

  const originalEnv = { CHAD_ENVIRONMENT: process.env.CHAD_ENVIRONMENT, MONGODB_URI: process.env.MONGODB_URI };
  function restoreEnv() {
    if (originalEnv.CHAD_ENVIRONMENT === undefined) delete process.env.CHAD_ENVIRONMENT;
    else process.env.CHAD_ENVIRONMENT = originalEnv.CHAD_ENVIRONMENT;
    if (originalEnv.MONGODB_URI === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = originalEnv.MONGODB_URI;
  }

  test("extractMongoHost pulls the host out from between @ and :/", () => {
    assertEquals(extractMongoHost("mongodb://user:pass@chad-mongodb:27017/chad?authSource=admin"), "chad-mongodb");
    assertEquals(extractMongoHost("mongodb://user:pass@100.117.139.83:12040/chad?authSource=admin"), "100.117.139.83");
    assertEquals(extractMongoHost("mongodb://user:pass@mongodb:27017/chad"), "mongodb");
    assertEquals(extractMongoHost("mongodb://user:pass@localhost:27017/chad"), "localhost");
  });

  test("extractMongoHost returns empty string for an unparseable/malformed URI", () => {
    assertEquals(extractMongoHost("not-a-mongo-uri"), "");
    assertEquals(extractMongoHost(""), "");
  });

  test("blocked when CHAD_ENVIRONMENT is unset", () => {
    delete process.env.CHAD_ENVIRONMENT;
    process.env.MONGODB_URI = "mongodb://u:p@chad-mongodb:27017/chad";
    const result = checkGoogleSheetsProductionGuard();
    assertEquals(result.allowed, false);
    restoreEnv();
  });

  test("blocked when CHAD_ENVIRONMENT=local, even against a production-shaped Mongo host", () => {
    process.env.CHAD_ENVIRONMENT = "local";
    process.env.MONGODB_URI = "mongodb://u:p@chad-mongodb:27017/chad";
    const result = checkGoogleSheetsProductionGuard();
    assertEquals(result.allowed, false);
    restoreEnv();
  });

  test("blocked when CHAD_ENVIRONMENT=test, even against a production-shaped Mongo host (TEST and PROD share chad-mongodb today)", () => {
    process.env.CHAD_ENVIRONMENT = "test";
    process.env.MONGODB_URI = "mongodb://u:p@chad-mongodb:27017/chad";
    const result = checkGoogleSheetsProductionGuard();
    assertEquals(result.allowed, false);
    restoreEnv();
  });

  test("blocked when CHAD_ENVIRONMENT=prod but MONGODB_URI points at a local/test host", () => {
    process.env.CHAD_ENVIRONMENT = "prod";
    process.env.MONGODB_URI = "mongodb://u:p@mongodb:27017/chad";
    const result = checkGoogleSheetsProductionGuard();
    assertEquals(result.allowed, false);
    restoreEnv();
  });

  test("blocked when CHAD_ENVIRONMENT=prod but MONGODB_URI points at localhost", () => {
    process.env.CHAD_ENVIRONMENT = "prod";
    process.env.MONGODB_URI = "mongodb://u:p@localhost:27017/chad_test_story74";
    const result = checkGoogleSheetsProductionGuard();
    assertEquals(result.allowed, false);
    restoreEnv();
  });

  test("allowed when CHAD_ENVIRONMENT=prod and MONGODB_URI points at chad-mongodb (the real QNAP internal host)", () => {
    process.env.CHAD_ENVIRONMENT = "prod";
    process.env.MONGODB_URI = "mongodb://u:p@chad-mongodb:27017/chad?authSource=admin";
    const result = checkGoogleSheetsProductionGuard();
    assertEquals(result.allowed, true);
    restoreEnv();
  });

  test("allowed when CHAD_ENVIRONMENT=prod and MONGODB_URI points at QNAP's Tailscale IP", () => {
    process.env.CHAD_ENVIRONMENT = "prod";
    process.env.MONGODB_URI = "mongodb://u:p@100.117.139.83:12040/chad?authSource=admin&directConnection=true";
    const result = checkGoogleSheetsProductionGuard();
    assertEquals(result.allowed, true);
    restoreEnv();
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
