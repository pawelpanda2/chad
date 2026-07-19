#!/usr/bin/env node
/**
 * Story 73: one-time migration from the old, single shared `beeper`
 * MongoDB database into a per-user database `beeper_<repoGuid>`.
 *
 * Modeled directly on migrate-contacts-to-chad.mjs (same dry-run-by-default
 * safety model, same collection list, same _id-preserving insert-only
 * approach so cross-collection ObjectId references — channelID, contactID,
 * mergedInto, mergedFrom — stay valid).
 *
 * Safe by design:
 *   - Read-only against the source `beeper` database. Never writes,
 *     updates, or deletes anything there.
 *   - Against the target `beeper_<repoGuid>` database, only INSERTS
 *     documents whose _id does not already exist there. Never updates or
 *     deletes existing target documents — re-running this script is
 *     idempotent.
 *   - Defaults to --dry-run (report-only, zero writes). Requires --apply
 *     to actually write.
 *   - Never touches/drops the source `beeper` database — per the Story's
 *     explicit instruction, it stays in place as a live backup until the
 *     user separately approves its removal, after full verification.
 *
 * Usage:
 *   node migrate-beeper-to-per-user.mjs --repo-guid <guid> [--uri <server-uri>] [--apply]
 *     --repo-guid <guid>  Required. Full GUID of the CHAD user this data
 *                         belongs to. Target database is
 *                         beeper_<repo-guid>.
 *     --uri <uri>         Mongo *server* URI (no database segment) holding
 *                         both the source `beeper` database and the target
 *                         `beeper_<repo-guid>` database (same server).
 *                         Default: $BEEPER_MONGODB_URI.
 *     --apply             Actually write. Without this flag, only reports
 *                         what would be inserted.
 *
 * After a successful --apply run, also (re)creates indexes on the target
 * via dba's ensureBeeperIndexes(repoGuid) — same as
 * migrate-contacts-to-chad.mjs did for the old shared database.
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

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPO_GUID = getArg("repo-guid");
const SERVER_URI = getArg("uri", process.env.BEEPER_MONGODB_URI);

if (!REPO_GUID || !GUID_RE.test(REPO_GUID)) {
  console.error(`Error: --repo-guid is required and must be a full GUID (got: ${JSON.stringify(REPO_GUID)}).`);
  process.exit(1);
}
if (!SERVER_URI) {
  console.error("Error: Mongo server URI not set. Pass --uri <uri> or set BEEPER_MONGODB_URI.");
  process.exit(1);
}

const TARGET_DB_NAME = `beeper_${REPO_GUID}`;

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
    // ordered:false — one bad document shouldn't abort the whole batch.
    await targetCol.insertMany(toInsert, { ordered: false }).catch((err) => {
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
  console.log(`Beeper CRM: beeper -> beeper_<repoGuid> per-user migration (Story 73)`);
  console.log(`  server:      ${redact(SERVER_URI)}`);
  console.log(`  source db:   beeper`);
  console.log(`  target db:   ${TARGET_DB_NAME}`);
  console.log(`  mode:        ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes — pass --apply to write)"}`);
  console.log("");

  const client = new MongoClient(SERVER_URI);
  await client.connect();

  const sourceDb = client.db("beeper");
  const targetDb = client.db(TARGET_DB_NAME);

  const totals = { total: 0, existing: 0, inserted: 0 };
  for (const name of COLLECTIONS) {
    const r = await migrateCollection(sourceDb, targetDb, name);
    totals.total += r.total;
    totals.existing += r.existing;
    totals.inserted += r.inserted;
  }

  console.log("");
  console.log(
    `Done. ${totals.total} source docs across ${COLLECTIONS.length} collections, ${totals.existing} already present, ${totals.inserted} ${APPLY ? "inserted" : "would be inserted"} into ${TARGET_DB_NAME}.`
  );
  console.log(`Source database 'beeper' was NOT modified or dropped.`);

  if (!APPLY) {
    console.log(`Re-run with --apply to actually write.`);
    await client.close();
    return;
  }

  const dbaDist = path.join(__dirname, "..", "..", "packages", "dba", "dist", "beeper-crm.js");
  if (!existsSync(dbaDist)) {
    console.error(
      `\nWarning: ${dbaDist} not found — skipping index creation. Run "pnpm --filter dba build" then re-run this script with --apply to (re)create indexes.`
    );
    await client.close();
    process.exit(0);
  }
  const { ensureBeeperIndexes } = await import(dbaDist);
  // ensureBeeperIndexes opens its own connection via dba's getBeeperMongoDb()
  // (reads BEEPER_MONGODB_URI itself) — close ours first to avoid holding a
  // redundant connection open for this one-shot script.
  await client.close();
  await ensureBeeperIndexes(REPO_GUID);
  console.log(`Indexes (re)created on ${TARGET_DB_NAME} via dba.ensureBeeperIndexes("${REPO_GUID}").`);
  // dba's getBeeperMongoDb() keeps its MongoClient open for the lifetime of
  // the process (by design, for long-lived callers like the dashboard) —
  // this is a one-shot script, so exit explicitly instead of hanging forever.
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
