/**
 * google-sheets/config.ts tests — pure env-var manipulation, no network/Mongo.
 * Run via: cd packages/dba && npx tsc && node dist/google-sheets/config.test.js
 */

import { loadGoogleSheetsConfig, normalizePrivateKey, parseSpreadsheetMap, resolveSpreadsheetIdForUser } from "./config.js";

const ENV_KEYS = [
  "GOOGLE_SHEETS_ENABLED",
  "GOOGLE_SHEETS_SPREADSHEET_MAP",
  "GOOGLE_SHEETS_DAILY_TRACKER_SHEET_NAME",
  "GOOGLE_SHEETS_DATE_ENTRIES_SHEET_NAME",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
] as const;

const FAKE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nMIIFakeKeyMaterial\\n-----END PRIVATE KEY-----\\n";

function clearEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

function setFullValidEnv() {
  process.env.GOOGLE_SHEETS_ENABLED = "true";
  process.env.GOOGLE_SHEETS_SPREADSHEET_MAP = '{"pawel_f":"sheet-pawel-123","kamil_s":"sheet-kamil-456"}';
  process.env.GOOGLE_SHEETS_DAILY_TRACKER_SHEET_NAME = "daily-tracker-local";
  process.env.GOOGLE_SHEETS_DATE_ENTRIES_SHEET_NAME = "dates-local";
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "svc@example.iam.gserviceaccount.com";
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = FAKE_PRIVATE_KEY;
}

function runTests() {
  console.log("Running google-sheets/config Tests...\n");
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void) {
    clearEnv();
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (e) {
      console.log(`  ✗ ${name}`);
      console.log(`    Error: ${e}`);
      failed++;
    } finally {
      clearEnv();
    }
  }

  function assertEquals(actual: unknown, expected: unknown, message?: string) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${message ?? "Assertion failed"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }

  function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(message);
  }

  test("disabled (default, no env at all) returns enabled:false without requiring any other var", () => {
    const config = loadGoogleSheetsConfig();
    assertEquals(config.enabled, false);
  });

  test("explicitly disabled (GOOGLE_SHEETS_ENABLED=false) is the same as unset, even with other vars missing", () => {
    process.env.GOOGLE_SHEETS_ENABLED = "false";
    const config = loadGoogleSheetsConfig();
    assertEquals(config.enabled, false);
  });

  test("fully configured + enabled loads every field correctly", () => {
    setFullValidEnv();
    const config = loadGoogleSheetsConfig();
    assertEquals(config.enabled, true);
    assertEquals(config.spreadsheetMap, { pawel_f: "sheet-pawel-123", kamil_s: "sheet-kamil-456" });
    assertEquals(config.dailyTrackerSheetName, "daily-tracker-local");
    assertEquals(config.dateEntriesSheetName, "dates-local");
    assertEquals(config.serviceAccountEmail, "svc@example.iam.gserviceaccount.com");
    // \n sequences un-escaped to real newlines:
    assert(config.serviceAccountPrivateKey.includes("\n"), "private key should contain real newlines");
    assert(!config.serviceAccountPrivateKey.includes("\\n"), "private key should not contain literal backslash-n");
  });

  test("enabled but missing GOOGLE_SHEETS_SPREADSHEET_MAP throws naming exactly that var", () => {
    setFullValidEnv();
    delete process.env.GOOGLE_SHEETS_SPREADSHEET_MAP;
    let threw = false;
    try {
      loadGoogleSheetsConfig();
    } catch (e) {
      threw = true;
      assert(String(e).includes("GOOGLE_SHEETS_SPREADSHEET_MAP"), "error should name the missing var");
    }
    assert(threw, "should have thrown");
  });

  test("enabled with malformed (non-JSON) GOOGLE_SHEETS_SPREADSHEET_MAP throws a specific parse error", () => {
    setFullValidEnv();
    process.env.GOOGLE_SHEETS_SPREADSHEET_MAP = "not-json";
    let threw = false;
    try {
      loadGoogleSheetsConfig();
    } catch (e) {
      threw = true;
      assert(String(e).includes("GOOGLE_SHEETS_SPREADSHEET_MAP"), "error should name the var");
    }
    assert(threw, "should have thrown");
  });

  test("enabled with GOOGLE_SHEETS_SPREADSHEET_MAP as a JSON array (not object) throws", () => {
    setFullValidEnv();
    process.env.GOOGLE_SHEETS_SPREADSHEET_MAP = '["pawel_f"]';
    let threw = false;
    try {
      loadGoogleSheetsConfig();
    } catch {
      threw = true;
    }
    assert(threw, "should have thrown");
  });

  test("parseSpreadsheetMap parses a valid username -> spreadsheetId JSON object", () => {
    assertEquals(parseSpreadsheetMap('{"pawel_f":"abc","kamil_s":"def"}'), { pawel_f: "abc", kamil_s: "def" });
  });

  test("resolveSpreadsheetIdForUser returns the mapped spreadsheet id for a known user", () => {
    setFullValidEnv();
    const config = loadGoogleSheetsConfig();
    assertEquals(resolveSpreadsheetIdForUser(config, "pawel_f"), "sheet-pawel-123");
    assertEquals(resolveSpreadsheetIdForUser(config, "kamil_s"), "sheet-kamil-456");
  });

  test("resolveSpreadsheetIdForUser throws (never falls back to another user's sheet) for an unmapped user", () => {
    setFullValidEnv();
    const config = loadGoogleSheetsConfig();
    let threw = false;
    try {
      resolveSpreadsheetIdForUser(config, "someone_else");
    } catch (e) {
      threw = true;
      assert(String(e).includes("someone_else"), "error should name the unmapped username");
      assert(!String(e).includes("sheet-pawel-123"), "error must never leak another user's spreadsheet id");
    }
    assert(threw, "should have thrown, never silently returned another user's spreadsheet id");
  });

  test("enabled but missing GOOGLE_SHEETS_DAILY_TRACKER_SHEET_NAME throws naming exactly that var", () => {
    setFullValidEnv();
    delete process.env.GOOGLE_SHEETS_DAILY_TRACKER_SHEET_NAME;
    let threw = false;
    try {
      loadGoogleSheetsConfig();
    } catch (e) {
      threw = true;
      assert(String(e).includes("GOOGLE_SHEETS_DAILY_TRACKER_SHEET_NAME"), "error should name the missing var");
    }
    assert(threw, "should have thrown");
  });

  test("enabled but missing GOOGLE_SHEETS_DATE_ENTRIES_SHEET_NAME throws naming exactly that var", () => {
    setFullValidEnv();
    delete process.env.GOOGLE_SHEETS_DATE_ENTRIES_SHEET_NAME;
    let threw = false;
    try {
      loadGoogleSheetsConfig();
    } catch (e) {
      threw = true;
      assert(String(e).includes("GOOGLE_SHEETS_DATE_ENTRIES_SHEET_NAME"), "error should name the missing var");
    }
    assert(threw, "should have thrown");
  });

  test("enabled but missing GOOGLE_SERVICE_ACCOUNT_EMAIL throws naming exactly that var", () => {
    setFullValidEnv();
    delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    let threw = false;
    try {
      loadGoogleSheetsConfig();
    } catch (e) {
      threw = true;
      assert(String(e).includes("GOOGLE_SERVICE_ACCOUNT_EMAIL"), "error should name the missing var");
    }
    assert(threw, "should have thrown");
  });

  test("enabled but missing GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY throws, and never leaks any private key material", () => {
    setFullValidEnv();
    delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    let threw = false;
    try {
      loadGoogleSheetsConfig();
    } catch (e) {
      threw = true;
      assert(String(e).includes("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"), "error should name the missing var");
    }
    assert(threw, "should have thrown");
  });

  test("secret masking: the error message for a fully-missing config never contains the (still-set) private key value", () => {
    setFullValidEnv();
    delete process.env.GOOGLE_SHEETS_SPREADSHEET_MAP;
    try {
      loadGoogleSheetsConfig();
      assert(false, "should have thrown");
    } catch (e) {
      const message = String(e);
      assert(!message.includes("MIIFakeKeyMaterial"), "error message must never contain private key material");
      assert(!message.includes(FAKE_PRIVATE_KEY), "error message must never contain the raw private key value");
    }
  });

  test("normalizePrivateKey un-escapes literal \\n sequences to real newlines", () => {
    assertEquals(normalizePrivateKey("line1\\nline2\\nline3"), "line1\nline2\nline3");
  });

  test("normalizePrivateKey leaves a key that already has real newlines untouched", () => {
    const real = "line1\nline2\nline3";
    assertEquals(normalizePrivateKey(real), real);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
