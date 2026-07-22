/**
 * Independent, defense-in-depth guard for the Google Sheets sync path —
 * the user's own explicit instruction (2026-07-22, Story 76/75 follow-up):
 * "Nie opieraj zabezpieczenia wyłącznie na GOOGLE_SHEETS_ENABLED" (don't
 * base the safeguard solely on GOOGLE_SHEETS_ENABLED). Google Sheets is a
 * PRODUCTION report — it must never reflect local Mongo, test Mongo,
 * developer data, migration data, or temporary data, even if
 * GOOGLE_SHEETS_ENABLED were accidentally left on somewhere it shouldn't
 * be (a copy-pasted .env, a future staging environment, TEST sharing
 * chad-mongodb with PROD today — see ai-docs/google-sheets/architecture.md
 * §0g).
 *
 * Two independent conditions, both required, checked against ACTUAL
 * runtime state (not a single trusted flag):
 *
 * 1. `CHAD_ENVIRONMENT` must be exactly "prod" — set only in
 *    `docker-compose.qnap.prod.yml`. Deliberately excludes "test" even
 *    though `chad-mongodb.qnap.test.yml` currently points at the exact
 *    same physical `chad-mongodb` container as PROD (Story 76 finding) —
 *    without this check, real TEST-environment activity (developers
 *    exercising the app against real data) would sync into the real
 *    production spreadsheets, which is exactly what must never happen.
 *    Also excludes "local" (docker-compose.local.yml's default), even for
 *    a `DBA_MONGO_MODE=qnap` local session pointed at QNAP's real Mongo
 *    (2026-07-22, real incident this session, see qnap-mongo-local-dev
 *    note) — the sync worker is only ever meant to run inside the one
 *    real deployed PROD dashboard container, never a developer machine,
 *    regardless of which Mongo that machine happens to be pointed at.
 *
 * 2. The resolved `MONGODB_URI`'s host must be on the known-production
 *    allowlist. This is the check that survives a `CHAD_ENVIRONMENT`
 *    misconfiguration (e.g. a copy-pasted compose file that sets
 *    CHAD_ENVIRONMENT=prod but still points MONGODB_URI at a local/test
 *    Mongo) — the two checks are independent, neither alone is trusted.
 *
 * Used both at worker-start time (`bootstrap.ts`) and at enqueue time
 * (`sync.ts`) — a job must never even be written into the outbox from a
 * non-production run, not just never drained from one.
 */

/**
 * Every host a production CHAD Mongo connection is legitimately reached
 * through today: `chad-mongodb` (QNAP's internal docker network name, used
 * by the real deployed dashboard containers) and QNAP's own Tailscale IP
 * (used only for the one-off diagnostic/migration scripts this session —
 * included so a future legitimate need to run the worker via that path
 * isn't silently blocked, but see the CHAD_ENVIRONMENT check above, which
 * still requires "prod" regardless of host).
 */
const PRODUCTION_MONGO_HOSTS = ["chad-mongodb", "100.117.139.83"];

export interface GoogleSheetsProductionGuardResult {
  allowed: boolean;
  reason: string;
}

/** Extracts the host (no port, no credentials, no path) from a MongoDB connection string. Returns "" if it can't be parsed — treated as "not on the allowlist", never as "trust it". */
export function extractMongoHost(mongoUri: string): string {
  const match = mongoUri.match(/@([^:/?]+)/);
  return match ? match[1] : "";
}

/**
 * The single source of truth for "is it safe for the Google Sheets sync
 * path to run right now" — call this before starting the worker AND
 * before enqueueing any job. Never throws; a misconfigured/missing env var
 * just means "not allowed", the caller decides how to log/no-op.
 */
export function checkGoogleSheetsProductionGuard(): GoogleSheetsProductionGuardResult {
  const chadEnvironment = process.env.CHAD_ENVIRONMENT;
  if (chadEnvironment !== "prod") {
    return {
      allowed: false,
      reason: `CHAD_ENVIRONMENT is "${chadEnvironment ?? "(unset)"}" — must be exactly "prod" (Google Sheets sync only ever runs in the real production environment, never local or test, even against real data).`,
    };
  }

  const mongoUri = process.env.MONGODB_URI ?? "";
  const host = extractMongoHost(mongoUri);
  if (!PRODUCTION_MONGO_HOSTS.includes(host)) {
    return {
      allowed: false,
      reason: `MONGODB_URI host "${host || "(unparseable)"}" is not a known production Mongo host (expected one of: ${PRODUCTION_MONGO_HOSTS.join(", ")}).`,
    };
  }

  return { allowed: true, reason: `CHAD_ENVIRONMENT=prod and MONGODB_URI host "${host}" is a known production host.` };
}
