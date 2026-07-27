#!/usr/bin/env node
// Story 82 — resolves specific Mongo/Postgres address-collision conflicts by
// relocating the Mongo-only side of each collision into a normal "backup"
// Folder Item (per-user, auto-addressed like any other CP folder), instead
// of overwriting or discarding either side.
//
// For each relocated item: config.id, config.name, config.type, body,
// created, modified are preserved byte-for-byte from the Mongo source —
// only the address (and therefore config.address) changes, to the next
// free child slot under its new parent. Real cp_history events are copied
// verbatim from Mongo (same convention as migrate-mongo-to-postgres.mjs) —
// no synthetic "moved" event is fabricated, so a relocated item's older
// history rows still show its original (pre-collision) address; that is
// the true historical record, not stale data.
//
// The "backup" Folder itself (and the nested "msg-auto" folder within it,
// for the two relocated Folder+child pairs) are created via the real
// createFolderChildItem/executeWrite path — genuine items with genuine,
// real history, addressed by the same nextChildIndexFromSiblings rule CP
// itself uses everywhere else.
//
// Usage:
//   POSTGRES_URI=... MONGODB_URI=... node packages/dba/scripts/resolve-address-conflicts-to-backup.mjs [--apply]
//
// Without --apply: dry run, prints the planned new addresses only.

import {
  getMongoDb,
  closeMongoConnection,
  createFolderChildItem,
  nextChildIndexFromSiblings,
} from "../dist/index.js";
import { withPostgresClient, closePostgresConnection } from "../dist/postgres.js";

const VALID_ACTOR_KINDS = new Set(["user", "system", "migration", "unknown"]);
const VALID_OPERATION_TYPES = new Set(["insert", "update", "delete"]);

function parseCpTimestamp(value) {
  if (typeof value !== "string") return null;
  const m = /^(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/.exec(value);
  if (!m) return null;
  const [, yy, mm, dd, hh, min, ss] = m;
  return new Date(2000 + Number(yy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss));
}

// Explicit, hand-reviewed plan (Story 82) — each entry is a Mongo item id to
// relocate, and where it goes. "parentKey" ties children to the folder
// they should nest under (resolved to a real address at run time).
const PLAN = [
  {
    repoGuid: "21d11bdc-f1f4-44d1-b61a-3fa6b039c641",
    username: "pawel_f",
    relocations: [
      { mongoId: "8dffa101-8990-404b-86ea-802cdf1bc125", parentKey: "backup", note: "msg-auto folder (conflict #2)" },
      { mongoId: "4b820d59-897d-497e-89d1-56e82472d3df", parentKey: "msg-auto", note: "ai prompts (conflict #2)" },
      { mongoId: "357bbf44-7bcc-4fc6-b047-aaefdfeb2a7a", parentKey: "backup", note: "my proposals (conflict #4)" },
      { mongoId: "09fabbce-ab07-479b-a716-f87d05e8aad9", parentKey: "backup", note: "approach context (conflict #5)" },
    ],
  },
  {
    repoGuid: "8b603669-f8e6-4224-bd78-a474998995fa",
    username: "kamil_s",
    relocations: [
      { mongoId: "0baccb95-63a4-4f21-927a-ecac7658f792", parentKey: "backup", note: "msg-auto folder (conflict #3)" },
      { mongoId: "d244f336-cfda-4f34-86e8-2969424436e6", parentKey: "msg-auto", note: "ai prompts (conflict #3)" },
    ],
  },
];

const plannedChildCounts = new Map(); // dry-run only: parentAddress -> extra planned (not-yet-committed) siblings

async function nextChildAddress(pgClient, parentAddress, dryRun = false) {
  const { rows } = await pgClient.query(
    "SELECT address FROM cp_items WHERE repo_guid = $1 AND address ~ $2",
    [parentAddress.split("/")[0], `^${parentAddress.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[0-9]+$`]
  );
  const siblingAddresses = rows.map((r) => r.address);
  if (dryRun) {
    const alreadyPlanned = plannedChildCounts.get(parentAddress) ?? 0;
    for (let i = 1; i <= alreadyPlanned; i++) siblingAddresses.push(`${parentAddress}/${String(i).padStart(2, "0")}`);
  }
  const idx = nextChildIndexFromSiblings(parentAddress, siblingAddresses);
  if (dryRun) {
    plannedChildCounts.set(parentAddress, (plannedChildCounts.get(parentAddress) ?? 0) + 1);
  }
  return `${parentAddress}/${idx}`;
}

async function insertRelocatedItem(pgClient, mongoDb, mongoId, newAddress, report) {
  const doc = await mongoDb.collection("cp_items").findOne({ _id: mongoId });
  if (!doc) {
    report.errors.push(`Mongo item ${mongoId} not found — skipped.`);
    return null;
  }

  const historyEvents = await mongoDb
    .collection("cp_history")
    .find({ sourceId: mongoId })
    .sort({ version: 1 })
    .toArray();
  const firstChangedAt = historyEvents[0]?.changedAt ?? null;
  const lastChangedAt = historyEvents[historyEvents.length - 1]?.changedAt ?? null;
  const createdAt = firstChangedAt ?? parseCpTimestamp(doc.config.created) ?? new Date();
  const modifiedAt = lastChangedAt ?? parseCpTimestamp(doc.config.modified) ?? createdAt;
  const lastEventActorKind = historyEvents[historyEvents.length - 1]?.actor?.kind ?? null;

  const newConfig = { ...doc.config, address: newAddress };

  await pgClient.query("BEGIN");
  try {
    await pgClient.query(
      `INSERT INTO cp_items
         (id, repo_guid, address, name, type, config, body, created_at, modified_at,
          history_version, last_mutation_id, last_request_id, last_actor_username, last_actor_repo_guid, last_actor_kind)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        doc._id,
        newAddress.split("/")[0],
        newAddress,
        doc.config.name,
        doc.config.type,
        JSON.stringify(newConfig),
        doc.body,
        createdAt,
        modifiedAt,
        doc._historyVersion ?? 0,
        doc._lastMutationId ?? null,
        doc._lastRequestId ?? null,
        doc._lastActor?.username ?? null,
        doc._lastActor?.repoGuid ?? null,
        VALID_ACTOR_KINDS.has(lastEventActorKind) ? lastEventActorKind : null,
      ]
    );

    let historyMigrated = 0;
    let historySkipped = 0;
    for (const event of historyEvents) {
      if (typeof event.mutationId !== "string" || typeof event.repoGuid !== "string" || typeof event.version !== "number") {
        historySkipped++;
        continue;
      }
      const { rows: existingHistory } = await pgClient.query("SELECT 1 FROM cp_history WHERE mutation_id = $1", [event.mutationId]);
      if (existingHistory.length > 0) continue;

      let operationType = VALID_OPERATION_TYPES.has(event.operationType) ? event.operationType : "update";
      let actorKind = VALID_ACTOR_KINDS.has(event.actor?.kind) ? event.actor.kind : "unknown";

      // address/repoGuid on historical rows are preserved AS RECORDED in
      // Mongo (the item's real address at that point in time) — not
      // rewritten to the new post-relocation address. See file header.
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
          null,
          event.afterSnapshot ? JSON.stringify(event.afterSnapshot) : null,
        ]
      );
      historyMigrated++;
    }

    await pgClient.query("COMMIT");
    report.relocated.push({ mongoId, oldAddress: doc.config.address, newAddress, historyMigrated, historySkipped });
    return newAddress;
  } catch (error) {
    await pgClient.query("ROLLBACK");
    report.errors.push(`Failed to insert ${mongoId} at ${newAddress}: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const report = { backupFolders: [], relocated: [], errors: [] };
  const mongoDb = await getMongoDb();

  await withPostgresClient(async (pgClient) => {
    await pgClient.query("ALTER TABLE cp_items DISABLE TRIGGER cp_items_before_insupd");
    try {
      for (const userPlan of PLAN) {
        const parentAddresses = { root: userPlan.repoGuid };

        // 1. Ensure "backup" folder exists (real createFolderChildItem path
        // — genuine history, genuine addressing, same as any other folder).
        let backupAddress;
        if (apply) {
          const { item, alreadyExisted } = await createFolderChildItem(userPlan.repoGuid, "backup", "Folder");
          backupAddress = item.config.address;
          report.backupFolders.push({ username: userPlan.username, address: backupAddress, alreadyExisted });
        } else {
          backupAddress = await nextChildAddress(pgClient, userPlan.repoGuid, true);
          report.backupFolders.push({ username: userPlan.username, address: `${backupAddress} (planned)`, alreadyExisted: false });
        }
        parentAddresses.backup = backupAddress;

        // 2. Resolve each relocation, in order (folders before their children).
        for (const reloc of userPlan.relocations) {
          const parentAddress = parentAddresses[reloc.parentKey];
          if (!parentAddress) {
            report.errors.push(`${userPlan.username}: unknown parentKey "${reloc.parentKey}" for ${reloc.mongoId} — skipped.`);
            continue;
          }
          const newAddress = await nextChildAddress(pgClient, parentAddress, !apply);

          if (!apply) {
            report.relocated.push({ mongoId: reloc.mongoId, newAddress: `${newAddress} (planned)`, note: reloc.note });
            // In dry-run, still register this address as "taken" for
            // subsequent siblings' planning (e.g. if two items shared a
            // parent) by re-deriving from a local counter next call —
            // nextChildAddress re-queries Postgres each time, so a
            // not-yet-applied planned address won't be double-planned;
            // acceptable for a dry-run preview.
            if (reloc.mongoId.includes("8dffa101") || reloc.mongoId.includes("0baccb95")) {
              parentAddresses["msg-auto"] = newAddress.replace(" (planned)", "");
            }
            continue;
          }

          await insertRelocatedItem(pgClient, mongoDb, reloc.mongoId, newAddress, report);
          if (reloc.parentKey === "backup" && (reloc.mongoId === "8dffa101-8990-404b-86ea-802cdf1bc125" || reloc.mongoId === "0baccb95-63a4-4f21-927a-ecac7658f792")) {
            parentAddresses["msg-auto"] = newAddress;
          }
        }
      }
    } finally {
      await pgClient.query("ALTER TABLE cp_items ENABLE TRIGGER cp_items_before_insupd");
    }
  });

  console.log(`[resolve-conflicts] mode: ${apply ? "APPLY" : "DRY-RUN"}`);
  console.log(JSON.stringify(report, null, 2));

  await closeMongoConnection();
  await closePostgresConnection();
  if (report.errors.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[resolve-conflicts] FATAL:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
