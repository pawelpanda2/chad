#!/usr/bin/env node
/**
 * Story 81 — timestamped backup of cp_items + cp_history for one repoGuid (Mongo only).
 * Output: bash-scripts/mongo/backups/story81-<repo>-<timestamp>.json (gitignored).
 */
import fs from "node:fs";
import path from "node:path";
import { loadStory81QnapEnv, REPO_ROOT, CHAD_ADMIN_REPO_GUID } from "../support/story81-qnap-env.mjs";

const repoGuid = process.argv[2] || CHAD_ADMIN_REPO_GUID;
loadStory81QnapEnv();

const { getMongoDb, closeMongoConnection } = await import("../../packages/dba/dist/index.js");

const db = await getMongoDb();
const esc = repoGuid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const addressFilter = { "config.address": { $regex: `^${esc}(/|$)` } };

const items = await db.collection("cp_items").find(addressFilter).toArray();
const history = await db.collection("cp_history").find(addressFilter).toArray();

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.join(REPO_ROOT, "bash-scripts/mongo/backups");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `story81-${repoGuid.slice(0, 8)}-${ts}.json`);

const payload = {
  exportedAt: new Date().toISOString(),
  repoGuid,
  cp_items: items,
  cp_history: history,
  counts: { cp_items: items.length, cp_history: history.length },
};

fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
console.log(`[backup] wrote ${outFile}`);
console.log(`[backup] cp_items=${items.length} cp_history=${history.length}`);

await closeMongoConnection();
