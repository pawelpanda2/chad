/**
 * Configuration for the Google Sheets sync follower (Story 75).
 *
 * Independent from `data-providers/config.ts` on purpose — that file is
 * specifically the Mongo/Content-Provider primary+follower layer (Story
 * 72), and Sheets is a third, unrelated follower with its own enable flag,
 * matching the shape the user's own prompt asked for:
 * `if (config.googleSheetsEnabled) { ... }` alongside the existing
 * `mongoEnabled`/`contentProviderEnabled` checks.
 *
 * Read lazily inside functions, not at module load — same reason as
 * `data-providers/config.ts`/`mongo.ts`'s `getMongoUri()`: Next.js collects
 * page data at build time, before docker-compose has injected the runtime
 * env, so throwing at import time would fail every build regardless of what
 * is actually configured.
 *
 * Revision (2026-07-21, Story 75 follow-up): a single global
 * `GOOGLE_SHEETS_SPREADSHEET_ID` shared by every CHAD user was wrong — every
 * user has their own personal spreadsheet (they own the Google account it
 * lives in), so all of pawel_f's writes and all of kamil_s's writes were
 * landing in whichever one spreadsheet the env var happened to name.
 * Replaced with `GOOGLE_SHEETS_SPREADSHEET_MAP`, a JSON object keyed by
 * CHAD username (`{"pawel_f": "...", "kamil_s": "..."}`) — see
 * `resolveSpreadsheetIdForUser` below. The tab *names* (`daily`/`dates`)
 * stay single env vars, shared across every user's own spreadsheet — each
 * user's spreadsheet has its own "daily"/"dates" tabs, just like the
 * Dashboard's own Tracker/Dates tables are one per user's own repo.
 */

export interface GoogleSheetsConfig {
  enabled: boolean;
  /** CHAD username -> that user's own spreadsheet id. Never a single shared id — see revision note above. */
  spreadsheetMap: Record<string, string>;
  dailyTrackerSheetName: string;
  /** Tab name for the Date Entry ("Dates") mirror — same spreadsheet, separate tab. */
  dateEntriesSheetName: string;
  serviceAccountEmail: string;
  /** Already un-escaped to real newlines — see `normalizePrivateKey` below. */
  serviceAccountPrivateKey: string;
}

const REQUIRED_WHEN_ENABLED = [
  "GOOGLE_SHEETS_SPREADSHEET_MAP",
  "GOOGLE_SHEETS_DAILY_TRACKER_SHEET_NAME",
  "GOOGLE_SHEETS_DATE_ENTRIES_SHEET_NAME",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
] as const;

/**
 * Parses/validates `GOOGLE_SHEETS_SPREADSHEET_MAP` — must be a JSON object
 * of non-empty `{username: spreadsheetId}` pairs. Throws a specific,
 * actionable error (never a generic parse failure) so a malformed map is
 * caught at config-load time, not as a confusing per-user failure later.
 */
export function parseSpreadsheetMap(raw: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "GOOGLE_SHEETS_SPREADSHEET_MAP must be valid JSON, e.g. " +
        '\'{"pawel_f":"<spreadsheetId>","kamil_s":"<spreadsheetId>"}\'.'
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      'GOOGLE_SHEETS_SPREADSHEET_MAP must be a JSON object of {"username": "spreadsheetId"} pairs, not an array or primitive.'
    );
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) {
    throw new Error("GOOGLE_SHEETS_SPREADSHEET_MAP must contain at least one username -> spreadsheetId entry.");
  }
  const map: Record<string, string> = {};
  for (const [username, spreadsheetId] of entries) {
    if (typeof spreadsheetId !== "string" || spreadsheetId.trim() === "") {
      throw new Error(`GOOGLE_SHEETS_SPREADSHEET_MAP: value for username "${username}" must be a non-empty spreadsheet id string.`);
    }
    map[username] = spreadsheetId;
  }
  return map;
}

/**
 * Resolves the spreadsheet id for one user. Throws (never falls back to
 * another user's spreadsheet or a default) if the username isn't in the
 * map — a missing mapping must block that user's sync, not silently write
 * their personal dating-activity data into someone else's sheet.
 */
export function resolveSpreadsheetIdForUser(config: GoogleSheetsConfig, username: string): string {
  const spreadsheetId = config.spreadsheetMap[username];
  if (!spreadsheetId) {
    throw new Error(
      `Google Sheets sync: no spreadsheet configured for user "${username}" in GOOGLE_SHEETS_SPREADSHEET_MAP.`
    );
  }
  return spreadsheetId;
}

function readBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  return raw === "true" || raw === "1";
}

/**
 * A private key stored in an env var arrives with literal `\n` two-character
 * sequences instead of real newlines (shells/`.env` files can't hold a
 * literal multi-line value cleanly) — this un-escapes them. A key that
 * already contains real newlines (e.g. injected via a mounted secret file
 * read into the env) is left untouched.
 */
export function normalizePrivateKey(raw: string): string {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

/**
 * Reads and validates the current Google Sheets config from env vars.
 * Throws a specific, actionable error (naming the exact missing var, never
 * the secret value itself) if `GOOGLE_SHEETS_ENABLED` is true but any
 * required var is missing/empty. When disabled, no other var is required at
 * all — this is the "integration can be switched off with a config flag"
 * requirement.
 */
export function loadGoogleSheetsConfig(): GoogleSheetsConfig {
  const enabled = readBool("GOOGLE_SHEETS_ENABLED", false);

  if (!enabled) {
    return {
      enabled: false,
      spreadsheetMap: {},
      dailyTrackerSheetName: "",
      dateEntriesSheetName: "",
      serviceAccountEmail: "",
      serviceAccountPrivateKey: "",
    };
  }

  const missing = REQUIRED_WHEN_ENABLED.filter((name) => {
    const value = process.env[name];
    return value === undefined || value === "";
  });
  if (missing.length > 0) {
    throw new Error(
      `Google Sheets sync is enabled (GOOGLE_SHEETS_ENABLED=true) but missing required env var(s): ${missing.join(", ")}. ` +
        "Set them (see .env.local.example) or set GOOGLE_SHEETS_ENABLED=false to disable the integration."
    );
  }

  return {
    enabled: true,
    spreadsheetMap: parseSpreadsheetMap(process.env.GOOGLE_SHEETS_SPREADSHEET_MAP!),
    dailyTrackerSheetName: process.env.GOOGLE_SHEETS_DAILY_TRACKER_SHEET_NAME!,
    dateEntriesSheetName: process.env.GOOGLE_SHEETS_DATE_ENTRIES_SHEET_NAME!,
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    serviceAccountPrivateKey: normalizePrivateKey(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!),
  };
}
