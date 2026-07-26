#!/usr/bin/env node
/**
 * Validates GOOGLE_SHEETS_SPREADSHEET_MAP + the related Google Sheets sync
 * env vars WITHOUT ever printing a secret (service-account private key) —
 * spreadsheet IDs and CHAD usernames are not credentials (see
 * packages/dba/src/google-sheets/config.ts's own header comment on
 * `GoogleSheetsInfoConfig`), so those are safe to report; the private key
 * itself is only ever checked for presence/non-emptiness.
 *
 * Checks:
 *  - GOOGLE_SHEETS_SPREADSHEET_MAP is set and valid JSON (via dba's own
 *    `parseSpreadsheetMap`, so Compose's quote-stripping is handled the
 *    same way production does).
 *  - The map includes `test3`, `pawel_f`, and `kamil_s`.
 *  - No two usernames share the same spreadsheetId (a copy/paste mistake
 *    that would silently mix two users' data into one sheet).
 *  - The three sheet-tab-name env vars are set.
 *  - When GOOGLE_SHEETS_ENABLED=true, the service account email/private key
 *    env vars are present (not their VALUES).
 *
 * Usage: node packages/dba/scripts/validate-google-sheets-config.mjs
 * (run `pnpm --filter dba build` first — see the `tables-sync:validate-config`
 * root script, which does both). Exits non-zero on any failure.
 */

import { fileURLToPath } from "node:url";

const REQUIRED_USERNAMES = ["test3", "pawel_f", "kamil_s"];
const REQUIRED_SHEET_NAME_VARS = [
  "GOOGLE_SHEETS_DAILY_TRACKER_SHEET_NAME",
  "GOOGLE_SHEETS_DATE_ENTRIES_SHEET_NAME",
  "GOOGLE_SHEETS_LEADS_SHEET_NAME",
];

/**
 * Pure function of an env-like object (never reads `process.env` directly)
 * so it's trivially unit-testable with synthetic env objects — see
 * tests/tables-sync/google-sheets/config-validator.test.mjs.
 *
 * `parseSpreadsheetMap` is injected (not imported at module scope) so this
 * script has no hard dependency on `packages/dba/dist` existing yet when
 * merely imported for its types/shape by a test; the CLI entrypoint below
 * always supplies the real one from the built dba package.
 */
export function validateGoogleSheetsConfig(env, parseSpreadsheetMap) {
  const errors = [];
  const warnings = [];
  let spreadsheetMap = null;

  const rawMap = env.GOOGLE_SHEETS_SPREADSHEET_MAP;
  if (!rawMap) {
    errors.push("GOOGLE_SHEETS_SPREADSHEET_MAP is not set.");
  } else {
    try {
      spreadsheetMap = parseSpreadsheetMap(rawMap);
    } catch (error) {
      errors.push(`GOOGLE_SHEETS_SPREADSHEET_MAP is not valid: ${error instanceof Error ? error.message : error}`);
    }
  }

  if (spreadsheetMap) {
    const usernames = Object.keys(spreadsheetMap);
    for (const required of REQUIRED_USERNAMES) {
      if (!usernames.includes(required)) {
        errors.push(`GOOGLE_SHEETS_SPREADSHEET_MAP is missing required username "${required}".`);
      }
    }

    const seenSpreadsheetIds = new Map();
    for (const [username, spreadsheetId] of Object.entries(spreadsheetMap)) {
      const owner = seenSpreadsheetIds.get(spreadsheetId);
      if (owner) {
        errors.push(
          `GOOGLE_SHEETS_SPREADSHEET_MAP: username "${username}" and "${owner}" share the same spreadsheetId ` +
            `— every user must have their OWN spreadsheet (their data would otherwise mix in one sheet).`
        );
      } else {
        seenSpreadsheetIds.set(spreadsheetId, username);
      }
    }

    for (const extra of usernames.filter((u) => !REQUIRED_USERNAMES.includes(u))) {
      warnings.push(`GOOGLE_SHEETS_SPREADSHEET_MAP has an extra mapped username not in the required list: "${extra}" (not an error, just noted).`);
    }
  }

  for (const name of REQUIRED_SHEET_NAME_VARS) {
    if (!env[name]) {
      errors.push(`${name} is not set.`);
    }
  }

  const enabled = env.GOOGLE_SHEETS_ENABLED === "true" || env.GOOGLE_SHEETS_ENABLED === "1";
  if (enabled) {
    if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL) errors.push("GOOGLE_SHEETS_ENABLED=true but GOOGLE_SERVICE_ACCOUNT_EMAIL is not set.");
    if (!env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) errors.push("GOOGLE_SHEETS_ENABLED=true but GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is not set.");
  } else {
    warnings.push("GOOGLE_SHEETS_ENABLED is not \"true\" — sync writes are disabled on this environment (info/validation still ran).");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    // Non-secret summary only: usernames + which vars are present, never a
    // spreadsheetId-to-secret value or the private key itself.
    summary: {
      mappedUsernames: spreadsheetMap ? Object.keys(spreadsheetMap).sort() : [],
      sheetNamesConfigured: REQUIRED_SHEET_NAME_VARS.filter((n) => Boolean(env[n])),
      googleSheetsEnabled: enabled,
      serviceAccountEmailConfigured: Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
      serviceAccountPrivateKeyConfigured: Boolean(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
    },
  };
}

async function main() {
  const dbaDist = new URL("../dist/google-sheets/config.js", import.meta.url);
  let parseSpreadsheetMap;
  try {
    ({ parseSpreadsheetMap } = await import(dbaDist.href));
  } catch (error) {
    console.error(
      "[validate-google-sheets-config] Could not load packages/dba/dist/google-sheets/config.js — " +
        'run "pnpm --filter dba build" first.'
    );
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }

  const result = validateGoogleSheetsConfig(process.env, parseSpreadsheetMap);

  console.log("[validate-google-sheets-config] Summary:", JSON.stringify(result.summary, null, 2));

  if (result.warnings.length > 0) {
    console.log("\n[validate-google-sheets-config] Warnings:");
    for (const w of result.warnings) console.log(`  - ${w}`);
  }

  if (!result.ok) {
    console.error("\n[validate-google-sheets-config] FAILED:");
    for (const e of result.errors) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }

  console.log("\n[validate-google-sheets-config] OK — Google Sheets config looks valid.");
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  main();
}
