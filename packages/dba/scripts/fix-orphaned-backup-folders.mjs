#!/usr/bin/env node
// One-off fix for resolve-address-conflicts-to-backup.mjs's bug: the
// "backup" Folder items were created via createFolderChildItem() using the
// router's DEFAULT config (DBA_PRIMARY_BACKEND was never set in that
// script's env, defaulting to "mongo") instead of Postgres — so they exist
// in Mongo only, while their relocated children were inserted straight into
// Postgres, leaving those children pointing at a parent address with no row
// in Postgres. This copies the two backup folders (exact id/config/body,
// real Mongo history) into Postgres so the parent exists there too. Mongo's
// copy is left in place (harmless).
import { getMongoDb, closeMongoConnection } from "../dist/index.js";
import { withPostgresClient, closePostgresConnection } from "../dist/postgres.js";

const FOLDER_IDS = ["2683eefd-cb9b-4c6c-8648-d606b787ddea", "35e6448e-d913-4033-8eaf-ac7158c3f6ee"];
const VALID_ACTOR_KINDS = new Set(["user", "system", "migration", "unknown"]);
const VALID_OPERATION_TYPES = new Set(["insert", "update", "delete"]);

async function main() {
  const mongoDb = await getMongoDb();
  const report = [];

  await withPostgresClient(async (pgClient) => {
    await pgClient.query("ALTER TABLE cp_items DISABLE TRIGGER cp_items_before_insupd");
    try {
      for (const id of FOLDER_IDS) {
        const doc = await mongoDb.collection("cp_items").findOne({ _id: id });
        if (!doc) {
          report.push({ id, error: "not found in mongo" });
          continue;
        }
        const { rows: exists } = await pgClient.query("SELECT 1 FROM cp_items WHERE id = $1", [id]);
        if (exists.length > 0) {
          report.push({ id, skipped: "already exists in postgres" });
          continue;
        }

        const historyEvents = await mongoDb.collection("cp_history").find({ sourceId: id }).sort({ version: 1 }).toArray();
        const createdAt = historyEvents[0]?.changedAt ?? new Date();
        const modifiedAt = historyEvents[historyEvents.length - 1]?.changedAt ?? createdAt;

        await pgClient.query("BEGIN");
        try {
          await pgClient.query(
            `INSERT INTO cp_items
               (id, repo_guid, address, name, type, config, body, created_at, modified_at,
                history_version, last_mutation_id, last_request_id, last_actor_username, last_actor_repo_guid, last_actor_kind)
             VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
            [
              doc._id,
              doc.config.address.split("/")[0],
              doc.config.address,
              doc.config.name,
              doc.config.type,
              JSON.stringify(doc.config),
              doc.body ?? "",
              createdAt,
              modifiedAt,
              doc._historyVersion ?? 0,
              doc._lastMutationId ?? null,
              doc._lastRequestId ?? null,
              doc._lastActor?.username ?? null,
              doc._lastActor?.repoGuid ?? null,
              null,
            ]
          );
          let historyMigrated = 0;
          for (const event of historyEvents) {
            if (typeof event.mutationId !== "string" || typeof event.repoGuid !== "string" || typeof event.version !== "number") continue;
            await pgClient.query(
              `INSERT INTO cp_history
                 (mutation_id, request_id, source_id, repo_guid, address, item_name, version, operation_type,
                  actor_username, actor_repo_guid, actor_kind, changed_at, before_hash, after_hash,
                  config_diff, body_diff, before_snapshot, after_snapshot)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17::jsonb,$18::jsonb)
               ON CONFLICT (mutation_id) DO NOTHING`,
              [
                event.mutationId,
                event.requestId ?? null,
                event.sourceId,
                event.repoGuid,
                event.address,
                event.itemName ?? null,
                event.version,
                VALID_OPERATION_TYPES.has(event.operationType) ? event.operationType : "insert",
                event.actor?.username ?? null,
                event.actor?.repoGuid ?? null,
                VALID_ACTOR_KINDS.has(event.actor?.kind) ? event.actor.kind : "unknown",
                event.changedAt,
                event.beforeHash ?? null,
                event.afterHash ?? null,
                JSON.stringify(event.changes?.config ?? []),
                event.changes?.body != null ? JSON.stringify(event.changes.body) : null,
                null,
                event.afterSnapshot ? JSON.stringify(event.afterSnapshot) : null,
              ]
            );
            historyMigrated++;
          }
          await pgClient.query("COMMIT");
          report.push({ id, address: doc.config.address, name: doc.config.name, historyMigrated });
        } catch (error) {
          await pgClient.query("ROLLBACK");
          report.push({ id, error: error instanceof Error ? error.message : String(error) });
        }
      }
    } finally {
      await pgClient.query("ALTER TABLE cp_items ENABLE TRIGGER cp_items_before_insupd");
    }
  });

  console.log(JSON.stringify(report, null, 2));
  await closeMongoConnection();
  await closePostgresConnection();
}

main().catch((error) => {
  console.error("FATAL:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
