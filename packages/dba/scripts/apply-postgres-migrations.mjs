#!/usr/bin/env node
/**
 * Story 80 — applies packages/dba/sql/migrations/*.sql to POSTGRES_URI, in
 * filename order, tracked in a `schema_migrations` table (version = the
 * filename's numeric prefix, e.g. "0001"). Idempotent — re-running only
 * applies files not yet recorded. Each file runs inside its own transaction
 * (file + schema_migrations insert commit together, or neither does).
 *
 * Usage: POSTGRES_URI=postgres://... node packages/dba/scripts/apply-postgres-migrations.mjs
 */

import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const { Client } = pg;

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "sql", "migrations");

async function main() {
  const uri = process.env.POSTGRES_URI;
  if (!uri) {
    console.error("POSTGRES_URI environment variable is not set.");
    process.exitCode = 1;
    return;
  }

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const client = new Client({ connectionString: uri });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows: applied } = await client.query("SELECT version FROM schema_migrations");
    const appliedVersions = new Set(applied.map((r) => r.version));

    let appliedCount = 0;
    for (const file of files) {
      const version = file.split("_")[0];
      if (appliedVersions.has(version)) {
        console.log(`[migrations] ${file} — already applied, skipping.`);
        continue;
      }

      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      console.log(`[migrations] applying ${file}...`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
        await client.query("COMMIT");
        console.log(`[migrations] ${file} — applied.`);
        appliedCount++;
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${error instanceof Error ? error.message : error}`);
      }
    }

    console.log(`[migrations] done — ${appliedCount} new migration(s) applied, ${files.length} total on disk.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[migrations] FATAL:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
