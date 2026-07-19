#!/usr/bin/env node
/**
 * Story 73: logical JSON backup of a `beeper` MongoDB database, one file
 * per collection plus an index/count report — used specifically for QNAP's
 * `chad-mongodb` container, which this environment cannot reach via
 * `docker exec` (no SSH/docker-context access to the QNAP host from this
 * session) so bash-scripts/mongo/backup.sh's real `mongodump` cannot be
 * invoked against it directly. This script is a read-only fallback with
 * the same intent (a restorable point-in-time copy before the Story 73
 * per-user migration writes anything), not a replacement for backup.sh —
 * prefer backup.sh whenever `docker exec` into the target container is
 * possible (e.g. the local Mac Docker Mongo).
 *
 * Usage:
 *   node backup-beeper-json.mjs --uri <server-uri> --label <name>
 *
 * Writes to bash-scripts/mongo/backups/<label>-<timestamp>/beeper/*.json
 * plus a report.json with per-collection counts and index definitions.
 */

import { MongoClient } from "mongodb";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const URI = getArg("uri");
const LABEL = getArg("label") || "backup";
if (!URI) {
  console.error("Usage: node backup-beeper-json.mjs --uri <server-uri> --label <name>");
  process.exit(1);
}

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

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.join(__dirname, "backups", `${LABEL}-${timestamp}`, "beeper");
mkdirSync(outDir, { recursive: true });

console.log(`Beeper JSON backup — source: ${redact(URI)}`);
console.log(`Output: ${outDir}\n`);

const client = new MongoClient(URI);
await client.connect();
const db = client.db("beeper");

const report = { source: redact(URI), takenAt: new Date().toISOString(), collections: {} };

for (const name of COLLECTIONS) {
  const col = db.collection(name);
  const docs = await col.find({}).toArray();
  const indexes = await col.indexes().catch(() => []);
  writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(docs, null, 2));
  report.collections[name] = { count: docs.length, indexes };
  console.log(`  ${name}: ${docs.length} documents, ${indexes.length} indexes -> ${name}.json`);
}

writeFileSync(path.join(outDir, "..", "report.json"), JSON.stringify(report, null, 2));
console.log(`\nReport written to ${path.join(outDir, "..", "report.json")}`);

await client.close();
