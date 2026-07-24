#!/usr/bin/env node
// Story 80 — idempotent, controlled Mongo -> PostgreSQL migrator for
// cp_items, cp_history, and both outboxes.
//
// Usage:
//   POSTGRES_URI=... MONGODB_URI=... node packages/dba/scripts/migrate-mongo-to-postgres.mjs \
//     (--repoGuid=<guid> | --all) [--apply]
//
// Without --apply: dry run — reports counts/conflicts only, no writes.
// Requires `pnpm --filter dba build` first (imports ../dist/).
//
// Design notes (see backlog/stories/80/02_plan.md §8):
//  - Never overwrites an existing Postgres row that differs from the Mongo
//    source under the same id/address — reported as a conflict, migration
//    continues with other items, and the script exits non-zero.
//  - Idempotent: re-running skips items/history/outbox jobs already present
//    and identical. No checkpoint file needed — the idempotent query IS the
//    checkpoint (matches migrate-legacy-cp-items-to-history.mjs's own
//    convention).
//  - cp_items has a history-writing trigger (Story 80's
//    cp_items_write_history) that would otherwise mint a FRESH, wrong
//    history event on every migrated insert. It is disabled for the
//    duration of this script's cp_items writes (via ALTER TABLE ... DISABLE
//    TRIGGER) and always re-enabled in a `finally`, even on error — so a
//    migrated item's real history (however many Mongo events it had) is
//    inserted verbatim into cp_history instead, and the item's own
//    history_version/last_* bookkeeping columns are set directly to the
//    Mongo document's own last-known values.
//  - Mongo's cp_history has no `beforeSnapshot` field at all (only a
//    periodic `afterSnapshot` — see cp-history/mutate.ts's doc comment) —
//    an update event outside that cadence has NO snapshot to carry over.
//    This migrator does not fabricate one: such rows get
//    before_snapshot/after_snapshot = NULL in Postgres, and their already-
//    computed Mongo diff (`changes.config`/`changes.body`) is preserved
//    verbatim in the new config_diff/body_diff columns instead (see
//    cp-history-postgres.ts's `resolveChanges` — a non-null config_diff is
//    exactly how the read side knows to trust the stored diff rather than
//    attempt to recompute one from absent snapshots).

import { getMongoDb, closeMongoConnection, hashCpState, splitAddress } from "../dist/index.js";
import { withPostgresClient, closePostgresConnection } from "../dist/postgres.js";

const VALID_ACTOR_KINDS = new Set(["user", "system", "migration", "unknown"]);
const VALID_OPERATION_TYPES = new Set(["insert", "update", "delete"]);

function parseArgs(argv) {
  const args = { apply: false, all: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--apply") args.apply = true;
    else if (raw === "--all") args.all = true;
    else if (raw.startsWith("--repoGuid=")) args.repoGuid = raw.slice("--repoGuid=".length);
  }
  return args;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Inverse of cp-model.ts's formatCpTimestamp ("YYMMDD_HHMMSS", 2000+YY). Returns null if unparseable — never guessed. */
function parseCpTimestamp(value) {
  if (typeof value !== "string") return null;
  const m = /^(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/.exec(value);
  if (!m) return null;
  const [, yy, mm, dd, hh, min, ss] = m;
  return new Date(2000 + Number(yy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss));
}

async function findRepoGuids(db) {
  const docs = await db.collection("cp_items").find({}, { projection: { "config.address": 1 } }).toArray();
  const guids = new Set();
  for (const doc of docs) {
    if (doc.config?.address) guids.add(splitAddress(doc.config.address).repoGuid);
  }
  return [...guids];
}

function emptyReport() {
  return {
    itemsCandidates: 0,
    itemsMigrated: 0,
    itemsAlreadyMigratedIdentical: 0,
    itemsConflict: 0,
    itemsNotHistoryMigratedYet: 0,
    historyEventsMigrated: 0,
    historyEventsAlreadyPresent: 0,
    historyEventsIncompatibleSkipped: 0,
    hashMismatches: 0,
  };
}

async function migrateRepo(mongoDb, pgClient, repoGuid, apply, report) {
  const escaped = escapeRegex(repoGuid);
  const items = await mongoDb
    .collection("cp_items")
    .find({ "config.address": { $regex: `^${escaped}(/|$)` } })
    .toArray();

  report.itemsCandidates += items.length;

  for (const doc of items) {
    if (doc._historyVersion === undefined) {
      report.itemsNotHistoryMigratedYet++;
      console.warn(
        `[migrate-pg] SKIP ${doc._id} (${doc.config?.address}) — no _historyVersion yet; run migrate-legacy-cp-items-to-history.mjs --repoGuid=${repoGuid} --apply first.`
      );
      continue;
    }

    const { rows: existingRows } = await pgClient.query("SELECT * FROM cp_items WHERE id = $1", [doc._id]);
    const existing = existingRows[0];

    if (existing) {
      // hashCpState (not JSON.stringify) — Postgres's jsonb storage does not
      // preserve Mongo's key insertion order, so a raw string comparison
      // would false-positive as a "conflict" on every idempotent re-run.
      // hashCpState canonicalizes key order before hashing, exactly the
      // comparison this needs.
      const sameContent =
        existing.address === doc.config.address &&
        existing.name === doc.config.name &&
        existing.type === doc.config.type &&
        hashCpState(existing.config, existing.body) === hashCpState(doc.config, doc.body);
      if (sameContent) {
        report.itemsAlreadyMigratedIdentical++;
        continue;
      }
      report.itemsConflict++;
      console.error(
        `[migrate-pg] CONFLICT: cp_items.id=${doc._id} already exists in Postgres with DIFFERENT content (address=${existing.address} vs ${doc.config.address}) — not overwritten.`
      );
      continue;
    }

    // Address-conflict check (different id already occupying this address).
    const { rows: addrRows } = await pgClient.query("SELECT id FROM cp_items WHERE repo_guid = $1 AND address = $2", [
      repoGuid,
      doc.config.address,
    ]);
    if (addrRows[0] && addrRows[0].id !== doc._id) {
      report.itemsConflict++;
      console.error(
        `[migrate-pg] CONFLICT: address ${doc.config.address} already occupied by a DIFFERENT id (${addrRows[0].id} vs ${doc._id}) — not overwritten.`
      );
      continue;
    }

    const historyEvents = await mongoDb
      .collection("cp_history")
      .find({ sourceId: doc._id })
      .sort({ version: 1 })
      .toArray();

    const firstChangedAt = historyEvents[0]?.changedAt ?? null;
    const lastChangedAt = historyEvents[historyEvents.length - 1]?.changedAt ?? null;
    const createdAt = firstChangedAt ?? parseCpTimestamp(doc.config.created) ?? new Date();
    const modifiedAt = lastChangedAt ?? parseCpTimestamp(doc.config.modified) ?? createdAt;
    const lastEventActorKind = historyEvents[historyEvents.length - 1]?.actor?.kind ?? null;

    if (!apply) {
      report.itemsMigrated++; // "would migrate"
      for (const event of historyEvents) {
        if (typeof event.mutationId !== "string" || typeof event.repoGuid !== "string" || typeof event.version !== "number") {
          report.historyEventsIncompatibleSkipped++;
        } else {
          report.historyEventsMigrated++;
        }
      }
      continue;
    }

    await pgClient.query("BEGIN");
    try {
      await pgClient.query(
        `INSERT INTO cp_items
           (id, repo_guid, address, name, type, config, body, created_at, modified_at,
            history_version, last_mutation_id, last_request_id, last_actor_username, last_actor_repo_guid, last_actor_kind)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          doc._id,
          repoGuid,
          doc.config.address,
          doc.config.name,
          doc.config.type,
          JSON.stringify(doc.config),
          doc.body,
          createdAt,
          modifiedAt,
          doc._historyVersion,
          doc._lastMutationId ?? null,
          doc._lastRequestId ?? null,
          doc._lastActor?.username ?? null,
          doc._lastActor?.repoGuid ?? null,
          VALID_ACTOR_KINDS.has(lastEventActorKind) ? lastEventActorKind : null,
        ]
      );

      for (const event of historyEvents) {
        // Pre-Story-79 cp_history documents (Story 74/78 Change-Stream
        // shape) have no `mutationId`/`repoGuid`/`version` fields at all —
        // a fundamentally different, incompatible schema, not a value worth
        // coercing. Story 80 §8.2: "raportuje rekordy niezgodne z nowym
        // schematem; nie fabrykuje brakujących danych" — report and skip,
        // never invent a mutationId/version for these.
        if (typeof event.mutationId !== "string" || typeof event.repoGuid !== "string" || typeof event.version !== "number") {
          report.historyEventsIncompatibleSkipped++;
          console.warn(
            `[migrate-pg] SKIP incompatible pre-Story-79 cp_history doc _id=${event._id} (sourceId=${event.sourceId}) — missing mutationId/repoGuid/version; not migrated, not fabricated.`
          );
          continue;
        }

        const { rows: existingHistory } = await pgClient.query("SELECT 1 FROM cp_history WHERE mutation_id = $1", [
          event.mutationId,
        ]);
        if (existingHistory.length > 0) {
          report.historyEventsAlreadyPresent++;
          continue;
        }

        let operationType = event.operationType;
        if (!VALID_OPERATION_TYPES.has(operationType)) {
          console.warn(`[migrate-pg] history event ${event.mutationId}: mapping legacy operationType "${operationType}" -> "update".`);
          operationType = "update";
        }
        let actorKind = event.actor?.kind;
        if (!VALID_ACTOR_KINDS.has(actorKind)) {
          console.warn(`[migrate-pg] history event ${event.mutationId}: unexpected actor.kind "${actorKind}" -> "unknown".`);
          actorKind = "unknown";
        }

        await pgClient.query(
          `INSERT INTO cp_history
             (mutation_id, request_id, source_id, repo_guid, address, item_name, version, operation_type,
              actor_username, actor_repo_guid, actor_kind, changed_at, before_hash, after_hash,
              config_diff, body_diff, before_snapshot, after_snapshot)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17::jsonb,$18::jsonb)`,
          [
            event.mutationId,
            event.requestId ?? null,
            event.sourceId,
            event.repoGuid,
            event.address,
            event.itemName ?? null,
            event.version,
            operationType,
            event.actor?.username ?? null,
            event.actor?.repoGuid ?? null,
            actorKind,
            event.changedAt,
            event.beforeHash ?? null,
            event.afterHash ?? null,
            JSON.stringify(event.changes?.config ?? []),
            event.changes?.body != null ? JSON.stringify(event.changes.body) : null,
            null, // Mongo never stores a beforeSnapshot — see file header doc comment.
            event.afterSnapshot ? JSON.stringify(event.afterSnapshot) : null,
          ]
        );
        report.historyEventsMigrated++;
      }

      await pgClient.query("COMMIT");
      report.itemsMigrated++;

      // Hash verification: re-read the row we just committed and confirm it
      // hashes identically to the Mongo source (Story 80 §8 "hash
      // verification") — using the SAME shared hashCpState function both
      // backends' business logic already relies on.
      const { rows: verifyRows } = await pgClient.query("SELECT config, body FROM cp_items WHERE id = $1", [doc._id]);
      const migratedHash = hashCpState(verifyRows[0].config, verifyRows[0].body);
      const sourceHash = hashCpState(doc.config, doc.body);
      if (migratedHash !== sourceHash) {
        report.hashMismatches++;
        console.error(`[migrate-pg] HASH MISMATCH for ${doc._id}: migrated=${migratedHash} source=${sourceHash}`);
      }
    } catch (error) {
      await pgClient.query("ROLLBACK");
      throw error;
    }
  }
}

async function migrateOutboxes(mongoDb, pgClient, apply, report) {
  const dataSyncDocs = await mongoDb.collection("data_sync_outbox").find({}).toArray();
  const sheetsDocs = await mongoDb.collection("google_sheets_sync_outbox").find({}).toArray();

  report.outboxDataCandidates = dataSyncDocs.length;
  report.outboxSheetsCandidates = sheetsDocs.length;
  report.outboxDataMigrated = 0;
  report.outboxSheetsMigrated = 0;

  if (!apply) return;

  for (const job of dataSyncDocs) {
    const result = await pgClient.query(
      `INSERT INTO cp_outbox_data_sync
         (id, operation_id, command_kind, primary_backend, follower_backend, command, status, attempts,
          created_at, updated_at, next_attempt_at, locked_at, locked_by, completed_at, last_error)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (id) DO NOTHING`,
      [
        job._id,
        job.operationId,
        job.commandKind,
        job.primaryBackend,
        job.followerBackend,
        JSON.stringify(job.command),
        job.status,
        job.attempts,
        job.createdAt,
        job.updatedAt,
        job.nextAttemptAt,
        job.lockedAt,
        job.lockedBy,
        job.completedAt,
        job.lastError,
      ]
    );
    if (result.rowCount > 0) report.outboxDataMigrated++;
  }

  for (const job of sheetsDocs) {
    const result = await pgClient.query(
      `INSERT INTO cp_outbox_google_sheets_sync
         (id, operation_id, record_key, kind, payload, status, attempts,
          created_at, updated_at, next_attempt_at, locked_at, locked_by, completed_at, last_error)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO NOTHING`,
      [
        job._id,
        job.operationId,
        job.recordKey,
        job.kind,
        JSON.stringify(job.payload),
        job.status,
        job.attempts,
        job.createdAt,
        job.updatedAt,
        job.nextAttemptAt,
        job.lockedAt,
        job.lockedBy,
        job.completedAt,
        job.lastError,
      ]
    );
    if (result.rowCount > 0) report.outboxSheetsMigrated++;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.repoGuid && !args.all) {
    console.error("Usage: node migrate-mongo-to-postgres.mjs (--repoGuid=<guid> | --all) [--apply]");
    process.exitCode = 1;
    return;
  }

  const mongoDb = await getMongoDb();
  const repoGuids = args.all ? await findRepoGuids(mongoDb) : [args.repoGuid];
  console.log(
    `[migrate-pg] scope: ${args.all ? `--all (${repoGuids.length} repo(s) found)` : `repoGuid=${args.repoGuid}`}, mode: ${
      args.apply ? "APPLY" : "DRY-RUN"
    }`
  );

  const report = emptyReport();
  let hadError = false;

  await withPostgresClient(async (pgClient) => {
    if (args.apply) {
      await pgClient.query("ALTER TABLE cp_items DISABLE TRIGGER cp_items_before_insupd");
    }
    try {
      for (const repoGuid of repoGuids) {
        try {
          await migrateRepo(mongoDb, pgClient, repoGuid, args.apply, report);
        } catch (error) {
          hadError = true;
          console.error(`[migrate-pg] repoGuid=${repoGuid} FAILED:`, error instanceof Error ? error.message : error);
        }
      }
      await migrateOutboxes(mongoDb, pgClient, args.apply, report);
    } finally {
      if (args.apply) {
        await pgClient.query("ALTER TABLE cp_items ENABLE TRIGGER cp_items_before_insupd");
      }
    }
  });

  console.log("[migrate-pg] REPORT:", JSON.stringify(report, null, 2));
  await closeMongoConnection();
  await closePostgresConnection();

  if (hadError || report.itemsConflict > 0 || report.hashMismatches > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[migrate-pg] FATAL:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
