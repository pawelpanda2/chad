#!/usr/bin/env node
// Emergency restore counterpart to backup-cp-data.mjs. Reads the JSON dump
// produced by that script and re-inserts every row into Postgres, verbatim
// (INSERT ... ON CONFLICT (id) DO NOTHING — never overwrites a row that
// already exists, so re-running is safe and this can never clobber newer
// data than the backup). History triggers are disabled for the duration so
// restored rows don't mint fresh, wrong history/version bookkeeping.
//
// Usage:
//   POSTGRES_URI=... node packages/dba/scripts/restore-cp-data-from-backup.mjs <backup-dir>

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withPostgresClient, closePostgresConnection } from "../dist/postgres.js";

const backupDir = process.argv[2];
if (!backupDir) {
  console.error("Usage: node restore-cp-data-from-backup.mjs <backup-dir>");
  process.exit(1);
}

function load(table) {
  const path = join(backupDir, `postgres.${table}.json`);
  return JSON.parse(readFileSync(path, "utf8"));
}

async function restoreCpItems(client, rows) {
  let inserted = 0;
  for (const row of rows) {
    const result = await client.query(
      `INSERT INTO cp_items
         (id, repo_guid, address, name, type, config, body, created_at, modified_at,
          history_version, last_mutation_id, last_request_id, last_actor_username, last_actor_repo_guid, last_actor_kind)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (id) DO NOTHING`,
      [
        row.id,
        row.repo_guid,
        row.address,
        row.name,
        row.type,
        JSON.stringify(row.config),
        row.body,
        row.created_at,
        row.modified_at,
        row.history_version,
        row.last_mutation_id,
        row.last_request_id,
        row.last_actor_username,
        row.last_actor_repo_guid,
        row.last_actor_kind,
      ]
    );
    if (result.rowCount > 0) inserted++;
  }
  return inserted;
}

async function restoreCpHistory(client, rows) {
  let inserted = 0;
  for (const row of rows) {
    const result = await client.query(
      `INSERT INTO cp_history
         (mutation_id, request_id, source_id, repo_guid, address, item_name, version, operation_type,
          actor_username, actor_repo_guid, actor_kind, changed_at, before_hash, after_hash,
          config_diff, body_diff, before_snapshot, after_snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17::jsonb,$18::jsonb)
       ON CONFLICT (mutation_id) DO NOTHING`,
      [
        row.mutation_id,
        row.request_id,
        row.source_id,
        row.repo_guid,
        row.address,
        row.item_name,
        row.version,
        row.operation_type,
        row.actor_username,
        row.actor_repo_guid,
        row.actor_kind,
        row.changed_at,
        row.before_hash,
        row.after_hash,
        row.config_diff ? JSON.stringify(row.config_diff) : null,
        row.body_diff !== null && row.body_diff !== undefined ? JSON.stringify(row.body_diff) : null,
        row.before_snapshot ? JSON.stringify(row.before_snapshot) : null,
        row.after_snapshot ? JSON.stringify(row.after_snapshot) : null,
      ]
    );
    if (result.rowCount > 0) inserted++;
  }
  return inserted;
}

async function restoreOutbox(client, table, rows, columns) {
  let inserted = 0;
  for (const row of rows) {
    const values = columns.map((c) => (c.endsWith("::jsonb") ? JSON.stringify(row[c.split("::")[0]]) : row[c]));
    const colNames = columns.map((c) => c.split("::")[0]);
    const placeholders = columns.map((c, i) => (c.endsWith("::jsonb") ? `$${i + 1}::jsonb` : `$${i + 1}`));
    const result = await client.query(
      `INSERT INTO ${table} (${colNames.join(",")}) VALUES (${placeholders.join(",")}) ON CONFLICT (id) DO NOTHING`,
      values
    );
    if (result.rowCount > 0) inserted++;
  }
  return inserted;
}

async function main() {
  const items = load("cp_items");
  const history = load("cp_history");
  let dataSync = [];
  let sheetsSync = [];
  try {
    dataSync = load("cp_outbox_data_sync");
  } catch {
    /* optional */
  }
  try {
    sheetsSync = load("cp_outbox_google_sheets_sync");
  } catch {
    /* optional */
  }

  const report = { itemsInBackup: items.length, historyInBackup: history.length };

  await withPostgresClient(async (client) => {
    await client.query("ALTER TABLE cp_items DISABLE TRIGGER cp_items_before_insupd");
    await client.query("ALTER TABLE cp_items DISABLE TRIGGER cp_items_before_delete");
    try {
      report.itemsRestored = await restoreCpItems(client, items);
      report.historyRestored = await restoreCpHistory(client, history);
      if (dataSync.length) {
        report.dataSyncRestored = await restoreOutbox(client, "cp_outbox_data_sync", dataSync, [
          "id",
          "operation_id",
          "command_kind",
          "primary_backend",
          "follower_backend",
          "command::jsonb",
          "status",
          "attempts",
          "created_at",
          "updated_at",
          "next_attempt_at",
          "locked_at",
          "locked_by",
          "completed_at",
          "last_error",
        ]);
      }
      if (sheetsSync.length) {
        report.sheetsSyncRestored = await restoreOutbox(client, "cp_outbox_google_sheets_sync", sheetsSync, [
          "id",
          "operation_id",
          "record_key",
          "kind",
          "payload::jsonb",
          "status",
          "attempts",
          "created_at",
          "updated_at",
          "next_attempt_at",
          "locked_at",
          "locked_by",
          "completed_at",
          "last_error",
        ]);
      }
    } finally {
      await client.query("ALTER TABLE cp_items ENABLE TRIGGER cp_items_before_insupd");
      await client.query("ALTER TABLE cp_items ENABLE TRIGGER cp_items_before_delete");
    }
  });

  console.log("[restore-cp-data] REPORT:", JSON.stringify(report, null, 2));
  await closePostgresConnection();
}

main().catch((error) => {
  console.error("[restore-cp-data] FATAL:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
