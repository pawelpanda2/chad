// Real process-level integration test for the history-worker (Story 78,
// Input 1 §3.1/§3.3/§3.4/§3.5/§8) — spawns the actual
// `node index.mjs` process (same code the real container runs, no
// behavior copied into the test) against the LOCAL dev Mongo's replica set
// (already running, rs0 already configured — see
// ai-docs/history/how-it-works.md), using a fresh scratch database per run
// so this is fully isolated from both the real local-dev `chad` database
// and — deliberately — from QNAP TEST/shared Mongo entirely (see Story 78
// 02_plan.md §1: cp_history_state is a global singleton, so worker-restart/
// readiness/resume-token mechanics must never be tested against the real
// shared QNAP history-worker).
//
// This test directly writes to `cp_items` (not through the Dashboard/dba
// stack) — appropriate here because the scope is the worker's OWN
// mechanics (readiness signal, persistent shadow state across a restart,
// stable ordering), not the write pipeline. The full DBA/API-driven path is
// covered separately by the QNAP-TEST-targeted integration tests
// (test3-scoped). Never manually inserts into `cp_history` itself.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoClient } from "mongodb";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_MJS = path.join(__dirname, "index.mjs");
const DB_NAME = `chad_test_story78_${Date.now()}`;
const MONGO_URI = `mongodb://localhost:27017/${DB_NAME}?directConnection=true`;

let client;
let db;
let currentProc = null;
let currentProcOutput = [];

function spawnWorker() {
  const proc = spawn(process.execPath, [INDEX_MJS], {
    env: { ...process.env, MONGODB_URI: MONGO_URI },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = [];
  proc.stdout.on("data", (d) => output.push(d.toString()));
  proc.stderr.on("data", (d) => output.push(d.toString()));
  currentProc = proc;
  currentProcOutput = output;
  return { proc, output };
}

async function killWorker(proc) {
  if (!proc || proc.exitCode !== null) return;
  proc.kill("SIGTERM");
  await new Promise((resolve) => proc.once("exit", resolve));
}

async function pollUntil(fn, { timeoutMs = 15_000, intervalMs = 150, label = "condition" } = {}) {
  const start = Date.now();
  let lastValue;
  while (Date.now() - start < timeoutMs) {
    lastValue = await fn();
    if (lastValue) return lastValue;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for: ${label}. Worker output so far:\n${currentProcOutput.join("")}`
  );
}

async function waitForWatchReady(sinceOpenedAtIso) {
  return pollUntil(
    async () => {
      const state = await db.collection("cp_history_state").findOne({ _id: "cp_history_worker" });
      if (!state || state.watchStatus !== "ready") return null;
      if (sinceOpenedAtIso && state.watchOpenedAt && new Date(state.watchOpenedAt).toISOString() <= sinceOpenedAtIso) {
        return null; // stale "ready" from before this (re)start — keep polling for a fresh one.
      }
      return state;
    },
    { label: "cp_history_state.watchStatus === 'ready'" }
  );
}

function repoAddress(n) {
  return `11111111-2222-3333-4444-555555555555/${n}`;
}

async function insertCpItem({ id, address, name, actorUsername = "test3" }) {
  const now = new Date();
  await db.collection("cp_items").insertOne({
    _id: id,
    config: { id, address, name, created: now, modified: now },
    body: `seed for ${name}`,
    _lastActor: { username: actorUsername, repoGuid: "11111111-2222-3333-4444-555555555555" },
  });
}

async function updateCpItem(id, patch) {
  await db.collection("cp_items").updateOne(
    { _id: id },
    { $set: { ...patch, "config.modified": new Date() } }
  );
}

async function deleteCpItem(id) {
  await db.collection("cp_items").deleteOne({ _id: id });
}

async function waitForHistoryCount(sourceId, expectedCount) {
  return pollUntil(
    async () => {
      const docs = await db.collection("cp_history").find({ sourceId }).toArray();
      return docs.length >= expectedCount ? docs : null;
    },
    { label: `cp_history to have >= ${expectedCount} docs for sourceId=${sourceId}` }
  );
}

beforeAll(async () => {
  client = new MongoClient("mongodb://localhost:27017?directConnection=true");
  await client.connect();
  db = client.db(DB_NAME);
}, 30_000);

afterAll(async () => {
  await killWorker(currentProc);
  // Local-only scratch database (never QNAP/shared) — safe to fully drop,
  // per Story 78 02_plan.md's local-vs-QNAP split.
  await db.dropDatabase().catch(() => {});
  await client.close();
}, 30_000);

describe("history-worker process (real rs0, local scratch database)", () => {
  it("signals watchStatus: ready only after the change stream is actually open, with no persisted state", async () => {
    spawnWorker();
    const state = await waitForWatchReady();
    expect(state.watchStatus).toBe("ready");
    expect(state.watchOpenedAt).toBeTruthy();
  });

  it("captures a real insert with a genuine Change-Stream resume token, never backfilled", async () => {
    await insertCpItem({ id: "item-A", address: repoAddress("01"), name: "01" });
    const docs = await waitForHistoryCount("item-A", 1);
    expect(docs).toHaveLength(1);
    const [doc] = docs;
    expect(doc.operationType).toBe("insert");
    expect(doc.address).toBe(repoAddress("01"));
    expect(doc.actor).toEqual({ username: "test3", repoGuid: "11111111-2222-3333-4444-555555555555" });
    expect(doc.backfilled).toBeUndefined();
    expect(typeof doc._id).toBe("string");
    expect(doc._id.length).toBeGreaterThan(0); // the resume token's own data string, not a fabricated id.
  });

  it("preserves address/actor/before across a restart, and resumes without losing or duplicating the insert", async () => {
    const beforeRestartCount = (await db.collection("cp_history").find({ sourceId: "item-A" }).toArray()).length;
    await killWorker(currentProc);

    const readyBefore = await db.collection("cp_history_state").findOne({ _id: "cp_history_worker" });
    spawnWorker();
    await waitForWatchReady(new Date(readyBefore.watchOpenedAt).toISOString());

    await updateCpItem("item-A", { body: "updated after restart", "config.name": "01" });
    await deleteCpItem("item-A");

    const docs = await waitForHistoryCount("item-A", beforeRestartCount + 2);
    // Still exactly beforeRestartCount + 2 (no duplicate of the original insert re-processed).
    expect(docs).toHaveLength(beforeRestartCount + 2);

    const update = docs.find((d) => d.operationType === "update");
    const del = docs.find((d) => d.operationType === "delete");
    expect(update.beforeUnknown).toBe(false); // shadow state survived the restart.
    expect(update.address).toBe(repoAddress("01"));
    expect(del.beforeUnknown).toBe(false);
    expect(del.address).toBe(repoAddress("01")); // delete carries no fullDocument — must come from persisted shadow state.
    expect(del.actor).toEqual({ username: "test3", repoGuid: "11111111-2222-3333-4444-555555555555" });
  });

  it("gives several rapid same-second operations a stable, correct total order", async () => {
    await insertCpItem({ id: "item-B", address: repoAddress("02"), name: "02" });
    await updateCpItem("item-B", { body: "v1" });
    await updateCpItem("item-B", { body: "v2" });
    await deleteCpItem("item-B");

    const docs = await waitForHistoryCount("item-B", 4);
    const sorted = [...docs].sort((a, b) => a.orderSeconds - b.orderSeconds || a.orderIncrement - b.orderIncrement);
    expect(sorted.map((d) => d.operationType)).toEqual(["insert", "update", "update", "delete"]);
  });

  it("SIGTERM records a clean stopped state", async () => {
    await killWorker(currentProc);
    const state = await db.collection("cp_history_state").findOne({ _id: "cp_history_worker" });
    expect(state.status).toBe("stopped");
    expect(state.watchStatus).toBe("stopped");
  });
});
