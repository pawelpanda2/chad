#!/usr/bin/env node
// Story 81 — idempotent, index-metadata-only maintenance script for
// chad.cp_history. Fixes a real incident found deploying to QNAP TEST:
// Story 74/78's history-worker created an index named
// "address_1_changedAt_-1" (key pattern {address:1, changedAt:-1}).
// Story 79's ensureCpHistoryIndexes() tries to create a DIFFERENTLY-NAMED
// index ("address_changedAt") with that exact same key pattern, which
// MongoDB rejects as IndexOptionsConflict (code 85) — this broke
// cp_history writes for every repo on that deployment, not just one.
//
// What this script does, in order:
//   1. Reports the current cp_history indexes (BEFORE).
//   2. Finds any index whose key pattern is exactly {address:1,changedAt:-1}
//      under a name OTHER than "address_changedAt" (the name
//      ensureCpHistoryIndexes() uses) — there should be at most one, the
//      legacy history-worker one.
//   3. Drops ONLY that specific index, by its exact name — index metadata
//      only. Dropping an index can never delete a document; no `cp_history`
//      or `cp_items` document is touched by this script.
//   4. Calls ensureCpHistoryIndexes() — the real, unmodified application
//      function — to (re)create the current, correct set of indexes.
//   5. Reports the resulting cp_history indexes (AFTER).
//
// Idempotent: re-running when the legacy index is already gone, and/or the
// correct indexes already exist, is a safe no-op at every step (matches
// this repo's existing migration-script convention — see
// migrate-legacy-cp-items-to-history.mjs).
//
// Usage: MONGODB_URI=... node packages/dba/scripts/fix-cp-history-legacy-index-conflict.mjs
import { getMongoDb, closeMongoConnection, ensureCpHistoryIndexes } from "../dist/index.js";

const NEW_ADDRESS_INDEX_NAME = "address_changedAt";
const CONFLICTING_KEY_PATTERN = JSON.stringify({ address: 1, changedAt: -1 });

async function main() {
  const db = await getMongoDb();
  const col = db.collection("cp_history");

  const before = await col.indexes();
  console.log("[fix-index] cp_history indexes BEFORE:");
  for (const idx of before) console.log("  " + JSON.stringify(idx));

  const conflicting = before.filter(
    (idx) => JSON.stringify(idx.key) === CONFLICTING_KEY_PATTERN && idx.name !== NEW_ADDRESS_INDEX_NAME
  );

  if (conflicting.length === 0) {
    console.log('[fix-index] no legacy same-key-pattern index found under a different name — nothing to drop (idempotent no-op).');
  } else {
    for (const idx of conflicting) {
      console.log(
        `[fix-index] dropping legacy index "${idx.name}" (key ${JSON.stringify(idx.key)}) — index metadata only, no documents affected.`
      );
      await col.dropIndex(idx.name);
    }
  }

  console.log("[fix-index] ensuring current cp_history indexes (ensureCpHistoryIndexes)...");
  await ensureCpHistoryIndexes(db);

  const after = await col.indexes();
  console.log("[fix-index] cp_history indexes AFTER:");
  for (const idx of after) console.log("  " + JSON.stringify(idx));

  await closeMongoConnection();
}

main().catch((error) => {
  console.error("[fix-index] FATAL:", error);
  process.exitCode = 1;
});
