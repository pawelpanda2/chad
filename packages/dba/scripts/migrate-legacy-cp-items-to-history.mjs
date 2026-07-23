#!/usr/bin/env node
// Story 79 — one-time, explicit migration for cp_items documents written
// before the history mechanism existed (no `_historyVersion` field).
//
// Deliberately NOT automatic/silent: `executeCpMutationWithHistory` refuses
// (CpItemNotMigratedError) to mutate a document lacking `_historyVersion`
// rather than guessing a starting version — this script is the only
// sanctioned way to establish that baseline, and only for the one repoGuid
// you explicitly pass it.
//
// Usage:
//   node packages/dba/scripts/migrate-legacy-cp-items-to-history.mjs --repoGuid=<guid> [--apply] [--seedRunId=<id>]
//
// Without --apply: dry run, only reports how many items WOULD be migrated.
// Requires `pnpm --filter dba build` to have run first (imports ../dist/).
import { getMongoDb, closeMongoConnection, migrateLegacyCpItem, CP_ITEMS_COLLECTION } from "../dist/index.js";

function parseArgs(argv) {
  const args = { apply: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--apply") args.apply = true;
    else if (raw.startsWith("--repoGuid=")) args.repoGuid = raw.slice("--repoGuid=".length);
    else if (raw.startsWith("--seedRunId=")) args.seedRunId = raw.slice("--seedRunId=".length);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.repoGuid) {
    console.error("Usage: node migrate-legacy-cp-items-to-history.mjs --repoGuid=<guid> [--apply] [--seedRunId=<id>]");
    process.exitCode = 1;
    return;
  }

  const db = await getMongoDb();
  const escapedRepoGuid = args.repoGuid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const candidates = await db
    .collection(CP_ITEMS_COLLECTION)
    .find({
      "config.address": { $regex: `^${escapedRepoGuid}(/|$)` },
      _historyVersion: { $exists: false },
    })
    .toArray();

  console.log(`[migrate] repoGuid=${args.repoGuid}: ${candidates.length} cp_items document(s) missing _historyVersion.`);

  if (!args.apply) {
    console.log("[migrate] Dry run only (pass --apply to actually migrate). No changes made.");
    for (const doc of candidates) {
      console.log(`  would migrate: ${doc._id} (${doc.config?.address})`);
    }
    await closeMongoConnection();
    return;
  }

  let migrated = 0;
  let skipped = 0;
  for (const doc of candidates) {
    const result = await migrateLegacyCpItem(doc._id, { seedRunId: args.seedRunId, environment: process.env.CHAD_ENVIRONMENT });
    if (result.migrated) {
      migrated++;
      console.log(`  migrated: ${doc._id} (${doc.config?.address}) -> version 1`);
    } else {
      skipped++;
      console.log(`  skipped (already migrated by a concurrent run): ${doc._id}`);
    }
  }

  console.log(`[migrate] Done. migrated=${migrated} skipped=${skipped}`);
  await closeMongoConnection();
}

main().catch((error) => {
  console.error("[migrate] Fatal error:", error);
  process.exitCode = 1;
});
