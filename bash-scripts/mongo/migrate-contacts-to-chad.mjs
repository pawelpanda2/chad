#!/usr/bin/env node
/**
 * One-time migration (already run historically): copies the Beeper CRM
 * collections from the standalone `contacts` project's MongoDB database
 * into the shared, global `beeper` database on `chad-mongodb`.
 *
 * SUPERSEDED as of Story 73: the target architecture is no longer one
 * shared `beeper` database — each CHAD user now has their own
 * `beeper_<repoGuid>` database (see
 * bash-scripts/mongo/migrate-beeper-to-per-user.mjs, the per-user
 * migration that followed this one). Kept as-is for historical record —
 * do not re-run against a live target; if you do, note that
 * dba's `ensureBeeperIndexes()` now requires a `repoGuid` argument (the
 * `await ensureBeeperIndexes()` call below with no argument will throw).
 *
 * Preserves _id values (so cross-collection ObjectId references —
 * channelID, contactID, mergedInto, mergedFrom — stay valid).
 *
 * Safe by design:
 *   - Read-only against the source. Never writes, updates, or deletes
 *     anything in the source database.
 *   - Against the target, only INSERTS documents whose _id does not already
 *     exist there. Never updates or deletes existing target documents, so
 *     re-running this script (e.g. to pick up newly-synced source data) is
 *     idempotent and cannot clobber anything already migrated or already
 *     live in `chad`.
 *   - Defaults to --dry-run (report-only, zero writes). You must pass
 *     --apply to actually write.
 *
 * Usage:
 *   node migrate-contacts-to-chad.mjs [--apply]
 *     --source <uri>   Mongo URI of the contacts project's DB
 *                       (default: $CONTACTS_MONGODB_URI, falls back to
 *                       mongodb://localhost:27017/beeper)
 *     --target <uri>   Mongo URI of the chad DB
 *                       (default: $MONGODB_URI)
 *     --apply          Actually write. Without this flag, only reports
 *                       what would be inserted.
 *
 * See documentation/beeper/migration.md for the full migration plan this
 * script implements, and documentation/beeper/mongo-schema.md for the
 * collection shapes.
 */

import { MongoClient } from "mongodb";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");

function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return fallback;
}

const SOURCE_URI = getArg("source", process.env.CONTACTS_MONGODB_URI || "mongodb://localhost:27017/beeper");
const TARGET_URI = getArg("target", process.env.MONGODB_URI);

if (!TARGET_URI) {
  console.error("Error: target Mongo URI not set. Pass --target <uri> or set MONGODB_URI.");
  process.exit(1);
}

// Order is cosmetic only — Mongo has no FK constraints, and every document
// is inserted with its original _id preserved, so cross-collection
// references stay valid regardless of insertion order.
const COLLECTIONS = [
  "contacts",
  "channels",
  "messages",
  "timeline_events",
  "sync_state",
  "beeper_events",
  "merge_suggestions",
];

function redact(uri) {
  return uri.replace(/\/\/([^:@/]+):([^@/]+)@/, "//$1:***@");
}

async function migrateCollection(sourceDb, targetDb, name) {
  const sourceCol = sourceDb.collection(name);
  const targetCol = targetDb.collection(name);

  const sourceDocs = await sourceCol.find({}).toArray();
  if (sourceDocs.length === 0) {
    console.log(`  ${name}: source is empty — skipping.`);
    return { total: 0, existing: 0, inserted: 0 };
  }

  const sourceIds = sourceDocs.map((d) => d._id);
  const existingIds = new Set(
    (await targetCol.find({ _id: { $in: sourceIds } }, { projection: { _id: 1 } }).toArray()).map((d) =>
      d._id.toString()
    )
  );

  const toInsert = sourceDocs.filter((d) => !existingIds.has(d._id.toString()));

  if (!APPLY) {
    console.log(
      `  ${name}: ${sourceDocs.length} in source, ${existingIds.size} already in target, ${toInsert.length} would be inserted (dry-run).`
    );
    return { total: sourceDocs.length, existing: existingIds.size, inserted: toInsert.length };
  }

  if (toInsert.length > 0) {
    // ordered:false — one bad document (e.g. a duplicate-key race with a
    // concurrently-running beeper-sync) shouldn't abort the whole batch.
    await targetCol.insertMany(toInsert, { ordered: false }).catch((err) => {
      // BulkWriteError with only duplicate-key errors is fine (another
      // process inserted the same doc between our existence check and the
      // insert) — anything else, rethrow.
      if (err?.code !== 11000 && !err?.writeErrors?.every((we) => we.code === 11000)) {
        throw err;
      }
    });
  }

  console.log(
    `  ${name}: ${sourceDocs.length} in source, ${existingIds.size} already in target, ${toInsert.length} inserted.`
  );
  return { total: sourceDocs.length, existing: existingIds.size, inserted: toInsert.length };
}

async function main() {
  console.log(`Beeper CRM: contacts -> chad MongoDB migration`);
  console.log(`  source: ${redact(SOURCE_URI)}`);
  console.log(`  target: ${redact(TARGET_URI)}`);
  console.log(`  mode:   ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes — pass --apply to write)"}`);
  console.log("");

  const sourceClient = new MongoClient(SOURCE_URI);
  const targetClient = new MongoClient(TARGET_URI);
  await sourceClient.connect();
  await targetClient.connect();

  const sourceDb = sourceClient.db();
  const targetDb = targetClient.db();

  const totals = { total: 0, existing: 0, inserted: 0 };
  for (const name of COLLECTIONS) {
    const r = await migrateCollection(sourceDb, targetDb, name);
    totals.total += r.total;
    totals.existing += r.existing;
    totals.inserted += r.inserted;
  }

  console.log("");
  console.log(
    `Done. ${totals.total} source docs across ${COLLECTIONS.length} collections, ${totals.existing} already present, ${totals.inserted} ${APPLY ? "inserted" : "would be inserted"}.`
  );
  if (!APPLY) {
    console.log(`Re-run with --apply to actually write.`);
  } else {
    await sourceClient.close();
    await targetClient.close();
    // dba's ensureBeeperIndexes() always reads its target from
    // process.env.MONGODB_URI (see packages/dba/src/mongo.ts) — point it at
    // the same target this migration just wrote to, even if --target
    // overrode the default.
    process.env.MONGODB_URI = TARGET_URI;
    const dbaDist = path.join(__dirname, "..", "..", "packages", "dba", "dist", "beeper-crm.js");
    if (!existsSync(dbaDist)) {
      console.error(
        `\nWarning: ${dbaDist} not found — skipping index creation. Run "pnpm dba:build" then re-run this script to (re)create indexes.`
      );
      process.exit(0);
    }
    const { ensureBeeperIndexes } = await import(dbaDist);
    await ensureBeeperIndexes();
    console.log(`Indexes (re)created on the target via dba.ensureBeeperIndexes().`);
    // dba's getMongoDb() keeps its MongoClient open for the lifetime of the
    // process (by design, for long-lived callers like the dashboard) — this
    // is a one-shot script, so exit explicitly instead of hanging forever.
    process.exit(0);
  }

  await sourceClient.close();
  await targetClient.close();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
