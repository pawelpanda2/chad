// Unit tests for packages/dba/scripts/validate-google-sheets-config.mjs's
// pure `validateGoogleSheetsConfig` function — synthetic env objects only,
// never `process.env` (so this test never depends on/mutates the real
// local `.env.local`). Also asserts the result never carries the private
// key's actual value anywhere in its (loggable) shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_ROOT } from "../../support/database/tables-sync-env.mjs";

const { validateGoogleSheetsConfig } = await import(
  path.join(REPO_ROOT, "packages/dba/scripts/validate-google-sheets-config.mjs")
);

const REAL_PRIVATE_KEY_SECRET = "-----BEGIN PRIVATE KEY-----\\nTOTALLY-FAKE-BUT-SENSITIVE-LOOKING\\n-----END PRIVATE KEY-----\\n";

function validMap() {
  return JSON.stringify({
    pawel_f: "spreadsheet-pawel",
    kamil_s: "spreadsheet-kamil",
    test3: "spreadsheet-test3",
  });
}

function baseEnv(overrides = {}) {
  return {
    GOOGLE_SHEETS_SPREADSHEET_MAP: validMap(),
    GOOGLE_SHEETS_DAILY_TRACKER_SHEET_NAME: "daily",
    GOOGLE_SHEETS_DATE_ENTRIES_SHEET_NAME: "dates",
    GOOGLE_SHEETS_LEADS_SHEET_NAME: "leads",
    GOOGLE_SHEETS_ENABLED: "true",
    GOOGLE_SERVICE_ACCOUNT_EMAIL: "svc@example.iam.gserviceaccount.com",
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: REAL_PRIVATE_KEY_SECRET,
    ...overrides,
  };
}

// Mirrors dba's real parseSpreadsheetMap contract closely enough for these
// pure unit tests (validated separately, end-to-end, by mapping-schema /
// worker tests importing the real one from packages/dba/dist).
function fakeParseSpreadsheetMap(raw) {
  const parsed = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("GOOGLE_SHEETS_SPREADSHEET_MAP must be a JSON object");
  }
  return parsed;
}

test("a fully valid config with test3/pawel_f/kamil_s and no duplicate spreadsheetIds passes", () => {
  const result = validateGoogleSheetsConfig(baseEnv(), fakeParseSpreadsheetMap);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(result.summary.mappedUsernames, ["kamil_s", "pawel_f", "test3"]);
});

test("fails when GOOGLE_SHEETS_SPREADSHEET_MAP is missing entirely", () => {
  const env = baseEnv({ GOOGLE_SHEETS_SPREADSHEET_MAP: undefined });
  const result = validateGoogleSheetsConfig(env, fakeParseSpreadsheetMap);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("is not set")));
});

test("fails when GOOGLE_SHEETS_SPREADSHEET_MAP is malformed JSON", () => {
  const env = baseEnv({ GOOGLE_SHEETS_SPREADSHEET_MAP: "{not json" });
  const result = validateGoogleSheetsConfig(env, fakeParseSpreadsheetMap);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("not valid")));
});

test("fails when a required username (test3/pawel_f/kamil_s) is missing from the map", () => {
  const env = baseEnv({ GOOGLE_SHEETS_SPREADSHEET_MAP: JSON.stringify({ pawel_f: "spreadsheet-pawel", kamil_s: "spreadsheet-kamil" }) });
  const result = validateGoogleSheetsConfig(env, fakeParseSpreadsheetMap);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('"test3"')));
});

test("fails when two usernames share the same spreadsheetId", () => {
  const env = baseEnv({
    GOOGLE_SHEETS_SPREADSHEET_MAP: JSON.stringify({
      pawel_f: "same-spreadsheet-id",
      kamil_s: "same-spreadsheet-id",
      test3: "spreadsheet-test3",
    }),
  });
  const result = validateGoogleSheetsConfig(env, fakeParseSpreadsheetMap);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("share the same spreadsheetId")));
});

test("fails when a required sheet-name env var is missing", () => {
  const env = baseEnv({ GOOGLE_SHEETS_LEADS_SHEET_NAME: undefined });
  const result = validateGoogleSheetsConfig(env, fakeParseSpreadsheetMap);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("GOOGLE_SHEETS_LEADS_SHEET_NAME")));
});

test("fails when GOOGLE_SHEETS_ENABLED=true but the service account email/key are missing", () => {
  const env = baseEnv({ GOOGLE_SERVICE_ACCOUNT_EMAIL: undefined, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: undefined });
  const result = validateGoogleSheetsConfig(env, fakeParseSpreadsheetMap);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("GOOGLE_SERVICE_ACCOUNT_EMAIL")));
  assert.ok(result.errors.some((e) => e.includes("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY")));
});

test("passes (with a warning, not an error) when GOOGLE_SHEETS_ENABLED is not true — disabled is a valid state", () => {
  const env = baseEnv({ GOOGLE_SHEETS_ENABLED: "false", GOOGLE_SERVICE_ACCOUNT_EMAIL: undefined, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: undefined });
  const result = validateGoogleSheetsConfig(env, fakeParseSpreadsheetMap);
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((w) => w.includes("GOOGLE_SHEETS_ENABLED")));
});

test("never leaks the actual private key value anywhere in the returned result", () => {
  const result = validateGoogleSheetsConfig(baseEnv(), fakeParseSpreadsheetMap);
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes(REAL_PRIVATE_KEY_SECRET), "the raw private key must never appear in the loggable result");
  assert.equal(result.summary.serviceAccountPrivateKeyConfigured, true, "presence is reported, the value is not");
});
