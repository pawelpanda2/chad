#!/usr/bin/env node
// Read-only, timestamped JSON backup of CHAD's cp_items/cp_history/outbox
// data from both backends — used before any backend-routing change (e.g. a
// PROD Mongo->Postgres primary cutover) as a rollback artifact. Never
// deletes/mutates anything; safe to run against a live QNAP instance.
//
// Usage:
//   POSTGRES_URI=... MONGODB_URI=... node packages/dba/scripts/backup-cp-data.mjs [--label=<text>]
//
// Requires `pnpm --filter dba build` first (imports ../dist/).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { withPostgresClient, closePostgresConnection } from "../dist/postgres.js";
import { getMongoDb, closeMongoConnection } from "../dist/index.js";

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--label=")) args.label = raw.slice("--label=".length);
  }
  return args;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function backupPostgres(dir) {
  const tables = ["cp_items", "cp_history", "cp_outbox_data_sync", "cp_outbox_google_sheets_sync"];
  const counts = {};
  await withPostgresClient(async (client) => {
    for (const table of tables) {
      const { rows } = await client.query(`SELECT * FROM ${table}`);
      writeFileSync(join(dir, `postgres.${table}.json`), JSON.stringify(rows, null, 2));
      counts[table] = rows.length;
    }
  });
  await closePostgresConnection();
  return counts;
}

async function backupMongo(dir) {
  const collections = ["cp_items", "cp_history", "data_sync_outbox", "google_sheets_sync_outbox"];
  const counts = {};
  const db = await getMongoDb();
  for (const name of collections) {
    let docs = [];
    try {
      docs = await db.collection(name).find({}).toArray();
    } catch (err) {
      console.warn(`[backup-cp-data] mongo collection "${name}" unavailable:`, err instanceof Error ? err.message : err);
    }
    writeFileSync(join(dir, `mongo.${name}.json`), JSON.stringify(docs, null, 2));
    counts[name] = docs.length;
  }
  await closeMongoConnection();
  return counts;
}

async function main() {
  const args = parseArgs(process.argv);
  const label = args.label ? `-${args.label}` : "";
  const dirName = `${timestamp()}${label}`;
  const repoRoot = new URL("../../../", import.meta.url).pathname;
  const backupDir = join(repoRoot, ".runtime", "backups", "cp-data", dirName);
  mkdirSync(backupDir, { recursive: true });

  const manifest = { startedAt: new Date().toISOString(), dir: backupDir };

  if (process.env.POSTGRES_URI) {
    manifest.postgres = await backupPostgres(backupDir);
    console.log("[backup-cp-data] Postgres backed up:", manifest.postgres);
  } else {
    console.log("[backup-cp-data] POSTGRES_URI not set — skipping Postgres backup.");
  }

  if (process.env.MONGODB_URI) {
    manifest.mongo = await backupMongo(backupDir);
    console.log("[backup-cp-data] Mongo backed up:", manifest.mongo);
  } else {
    console.log("[backup-cp-data] MONGODB_URI not set — skipping Mongo backup.");
  }

  manifest.finishedAt = new Date().toISOString();
  writeFileSync(join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`[backup-cp-data] DONE — ${backupDir}`);
}

main().catch((error) => {
  console.error("[backup-cp-data] FATAL:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
