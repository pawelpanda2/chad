#!/usr/bin/env node
/**
 * Host-side CLI: mirror QNAP Postgres → local Mac Docker volume (Story 89).
 *
 *   POSTGRES_PASSWORD=… POSTGRES_QNAP_PASSWORD=… \
 *     node packages/dba/scripts/sync-local-postgres-from-qnap.mjs
 */

process.env.CHAD_ENVIRONMENT = process.env.CHAD_ENVIRONMENT || "local";
// Force host-published local URI (not docker DNS `postgres`).
if (process.env.NODE_ENV === "production") {
  delete process.env.NODE_ENV;
}

const { syncLocalPostgresFromQnap } = await import("../dist/sync-local-from-qnap.js");

try {
  const result = await syncLocalPostgresFromQnap();
  console.log("[sync-local-postgres] OK", result);
} catch (err) {
  console.error("[sync-local-postgres] FATAL:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
