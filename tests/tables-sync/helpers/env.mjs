// Shared environment bootstrap for the tables<->Google Sheets sync
// regression suite (tests/tables-sync). Mirrors the existing
// test/support/qnap-env.mjs convention: load `.env.local` (gitignored,
// never committed) lazily via dotenv, then rewrite the docker-compose
// service hostnames ("mongodb"/"postgres") to the host-published ports so
// the suite also works when run as a plain `node` process on the Mac host,
// outside the compose network — same rewrite
// packages/dba's own test:integration:local-mongo script does by hand for
// Mongo (`mongodb://localhost:27017/...?directConnection=true`).
//
// This suite must NEVER touch real pawel_f/kamil_s data: every DB-backed
// test in this directory only ever reads/writes rows scoped to synthetic
// repoGuid/recordKey values (see `TABLES_SYNC_TEST_PREFIX` below), exactly
// like the existing `packages/dba/src/google-sheets/worker.test.ts` already
// does against the same shared local database.

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the repo root (tests/tables-sync/helpers -> ../../..). */
export const REPO_ROOT = path.resolve(__dirname, "../../..");

/** Absolute path to packages/dba's build output — every test imports from here, never from src/. */
export const DBA_DIST = path.join(REPO_ROOT, "packages/dba/dist");

/** Every synthetic recordKey/repoGuid this suite ever writes starts with this — never a real CHAD username or repoGuid. */
export const TABLES_SYNC_TEST_PREFIX = "tables-sync-test";

let envLoaded = false;

/**
 * Loads `.env.local` (if present — CI/sandboxes without it fall back to
 * whatever the caller's own `test:tables-sync*` npm script already
 * exported) and rewrites in-network hostnames to host-published ports.
 * Idempotent — safe to call from every test file's top level.
 */
export function loadTablesSyncEnv() {
  if (envLoaded) return;
  envLoaded = true;
  dotenv.config({ path: path.join(REPO_ROOT, ".env.local") });
  rewriteInNetworkHostsForHostProcess();
}

function rewriteInNetworkHostsForHostProcess() {
  // "mongodb"/"postgres" are only resolvable *inside* the docker-compose
  // network (see docker-compose.local.yml) — a plain `node` process on the
  // host talks to the same containers via their published ports instead.
  if (process.env.MONGODB_URI?.includes("@mongodb:27017") || process.env.MONGODB_URI?.includes("//mongodb:27017")) {
    // `docker-compose.local.yml`'s mongodb service runs with NO auth at all
    // (no MONGO_INITDB_ROOT_USERNAME/PASSWORD) — `.env.local`'s own
    // MONGODB_URI (templated for the in-network, auth-shaped PROD/TEST
    // form) carries placeholder credentials + `authSource=admin` that this
    // local, no-auth mongod does not understand, which hangs the driver's
    // SCRAM handshake instead of failing fast. Same known-working,
    // credential-free, `directConnection=true` shape as this repo's own
    // `test:integration:local-mongo` root script — never re-use
    // `.env.local`'s credentials/authSource for local host testing.
    let dbName = "chad";
    try {
      dbName = new URL(process.env.MONGODB_URI).pathname.replace(/^\//, "") || "chad";
    } catch {
      // Keep the "chad" default — a malformed URI here isn't worth failing over.
    }
    process.env.MONGODB_URI = `mongodb://localhost:27017/${dbName}?directConnection=true`;
  }
  if (process.env.POSTGRES_URI?.includes("@postgres:5432")) {
    process.env.POSTGRES_URI = process.env.POSTGRES_URI.replace("@postgres:5432", "@127.0.0.1:5433");
  }
}

/** True once a POSTGRES_URI or MONGODB_URI is available to connect through (after `loadTablesSyncEnv()`). */
export function hasAnyDatabaseConfigured() {
  return Boolean(process.env.POSTGRES_URI || process.env.MONGODB_URI);
}

/**
 * Best-effort reachability probe — used by the DB-backed suites
 * (google-sheets/delete-physical, google-sheets/worker-order) to SKIP
 * (never fail) when no local datastore is reachable, matching this repo's
 * existing convention for credential-gated tests (see
 * test/integration/qnap-test3-google-sheets.test.mjs's `describe.skipIf`).
 *
 * Goes through `packages/dba/dist/postgres.js` (never a bare `import("pg")`
 * from this file — `pg` is a dependency of the `dba` workspace package, not
 * hoisted to the repo root under pnpm's strict node_modules layout, so a
 * bare specifier here would fail to resolve even when Postgres itself is
 * perfectly reachable).
 */
export async function probePostgresReachable() {
  if (!process.env.POSTGRES_URI) return false;
  try {
    const { withPostgresClient } = await import(`${DBA_DIST}/postgres.js`);
    await withPostgresClient((client) => client.query("SELECT 1"));
    return true;
  } catch {
    return false;
  }
}

/**
 * Same idea, for MongoDB — this is the outbox backend the DB-backed
 * google-sheets/*.test.mjs suites deliberately use (see their own header
 * comments for why: on this repo's local stack `DBA_PRIMARY_BACKEND` is
 * `postgres` and a live dashboard container may already be polling that
 * SAME shared `cp_outbox_google_sheets_sync` table with its own real
 * background worker — enqueuing a synthetic test job there risks a real
 * background worker racing to claim it first and burning a real Google
 * Sheets API call against a bogus test spreadsheetId. Mongo's outbox
 * collection has no such live consumer in this stack (Mongo is
 * Beeper-CRM-only once Postgres is primary — see
 * docker-compose.local.yml), so it's the safe, non-racy choice for these
 * tests regardless of which backend is the *current* CHAD primary.
 */
export async function probeMongoReachable() {
  if (!process.env.MONGODB_URI) return false;
  try {
    const { getMongoDb } = await import(`${DBA_DIST}/mongo.js`);
    const db = await getMongoDb();
    await db.command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

/**
 * `--qnap-test` CLI flag, forwarded by `run-all.mjs` as the
 * `TABLES_SYNC_QNAP_TEST` env var (not argv — argv isn't passed through to
 * child `node --test` processes cleanly), exported so individual suites can
 * react to it.
 */
export function isQnapTestRun() {
  return process.env.TABLES_SYNC_QNAP_TEST === "1";
}
