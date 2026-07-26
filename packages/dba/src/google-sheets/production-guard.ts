/**
 * Independent, defense-in-depth guard for the Google Sheets sync path.
 *
 * Allowed environments:
 * - `prod` — production dashboard (full sync for every mapped user)
 * - `test` — QNAP TEST when `GOOGLE_SHEETS_ENABLED=true` (regression /
 *   test3 sync against real sheets; PROD container remains separate)
 * - `local` — only when `GOOGLE_SHEETS_ALLOW_NON_PROD=true` (explicit
 *   opt-in for local regression; never accidental)
 *
 * Host checks (defense in depth):
 * - Prefer Postgres URI host when `DBA_PRIMARY_BACKEND=postgres`
 * - Else Mongo URI host on the known allowlist
 *
 * Username write allowlist on non-prod:
 * - `GOOGLE_SHEETS_NON_PROD_WRITE_USERS` (comma-separated, default `test3`)
 * - Enforced at enqueue time via `checkGoogleSheetsWriteAllowed(username)`
 */

const PRODUCTION_MONGO_HOSTS = ["chad-mongodb", "100.117.139.83"];
const PRODUCTION_POSTGRES_HOSTS = [
  "chad-postgres",
  "100.117.139.83",
  "localhost",
  "127.0.0.1",
  "host.docker.internal",
];

export interface GoogleSheetsProductionGuardResult {
  allowed: boolean;
  reason: string;
}

/** Extracts the host (no port, no credentials, no path) from a MongoDB or Postgres connection string. */
export function extractMongoHost(mongoUri: string): string {
  const match = mongoUri.match(/@([^:/?]+)/);
  return match ? match[1] : "";
}

export function extractPostgresHost(postgresUri: string): string {
  try {
    const u = new URL(postgresUri);
    return u.hostname || "";
  } catch {
    const match = postgresUri.match(/@([^:/?]+)/);
    return match ? match[1] : "";
  }
}

function defaultNonProdWriteUsers(): string[] {
  const raw = process.env.GOOGLE_SHEETS_NON_PROD_WRITE_USERS ?? "test3";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Environment + datastore host gate for starting the worker / enabling enqueue.
 * Username-scoped writes use `checkGoogleSheetsWriteAllowed`.
 */
export function checkGoogleSheetsProductionGuard(): GoogleSheetsProductionGuardResult {
  const chadEnvironment = process.env.CHAD_ENVIRONMENT;
  const allowNonProd = process.env.GOOGLE_SHEETS_ALLOW_NON_PROD === "true";

  if (chadEnvironment === "prod") {
    return checkHosts("prod");
  }

  if (chadEnvironment === "test") {
    return checkHosts("test");
  }

  if (chadEnvironment === "local" && allowNonProd) {
    return {
      allowed: true,
      reason: 'CHAD_ENVIRONMENT=local with GOOGLE_SHEETS_ALLOW_NON_PROD=true — local regression sync allowed.',
    };
  }

  return {
    allowed: false,
    reason: `CHAD_ENVIRONMENT is "${chadEnvironment ?? "(unset)"}" — Google Sheets sync requires "prod", "test", or local with GOOGLE_SHEETS_ALLOW_NON_PROD=true.`,
  };
}

function checkHosts(envLabel: string): GoogleSheetsProductionGuardResult {
  const primary = process.env.DBA_PRIMARY_BACKEND ?? "mongo";
  if (primary === "postgres") {
    const pgUri = process.env.POSTGRES_URI ?? process.env.DATABASE_URL ?? "";
    const host = extractPostgresHost(pgUri);
    // On test/prod QNAP the URI may be empty at guard-check time in unit
    // tests; allow when host is empty only for `test` so compose can start
    // before URI injection is verified — enqueue still needs a spreadsheet map.
    if (!host && envLabel === "test") {
      return {
        allowed: true,
        reason: `CHAD_ENVIRONMENT=test, primary=postgres (host not yet resolved) — Sheets sync allowed for allowlisted users.`,
      };
    }
    if (host && !PRODUCTION_POSTGRES_HOSTS.includes(host) && envLabel === "prod") {
      return {
        allowed: false,
        reason: `POSTGRES_URI host "${host}" is not a known production Postgres host.`,
      };
    }
    return {
      allowed: true,
      reason: `CHAD_ENVIRONMENT=${envLabel}, primary=postgres host="${host || "(unset)"}".`,
    };
  }

  const mongoUri = process.env.MONGODB_URI ?? "";
  const host = extractMongoHost(mongoUri);
  if (envLabel === "prod" && !PRODUCTION_MONGO_HOSTS.includes(host)) {
    return {
      allowed: false,
      reason: `MONGODB_URI host "${host || "(unparseable)"}" is not a known production Mongo host (expected one of: ${PRODUCTION_MONGO_HOSTS.join(", ")}).`,
    };
  }
  return {
    allowed: true,
    reason: `CHAD_ENVIRONMENT=${envLabel}, MONGODB_URI host="${host || "(unset)"}".`,
  };
}

/**
 * Extra gate for enqueue: on non-prod environments only allowlisted
 * usernames may create write jobs (default: test3). Prod allows all mapped
 * users. Read-only validation of other users' sheets does not call this.
 */
export function checkGoogleSheetsWriteAllowed(username: string): GoogleSheetsProductionGuardResult {
  const envGuard = checkGoogleSheetsProductionGuard();
  if (!envGuard.allowed) return envGuard;

  const chadEnvironment = process.env.CHAD_ENVIRONMENT;
  if (chadEnvironment === "prod") {
    return { allowed: true, reason: "prod — all mapped users may enqueue." };
  }

  const allow = defaultNonProdWriteUsers();
  if (!allow.includes(username)) {
    return {
      allowed: false,
      reason: `username "${username}" is not in GOOGLE_SHEETS_NON_PROD_WRITE_USERS ([${allow.join(", ")}]) — refusing non-prod Sheets write.`,
    };
  }
  return {
    allowed: true,
    reason: `username "${username}" is allowlisted for non-prod Sheets writes.`,
  };
}
