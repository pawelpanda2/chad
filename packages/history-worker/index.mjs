import { webcrypto as crypto } from "node:crypto";
globalThis.crypto = crypto;

// cp_items change-stream consumer -> cp_history (Story 74).
//
// Independent process (same pattern as packages/beeper-oplog): restarting
// the Dashboard never stops history tracking, and a crash in this process
// never takes the Dashboard down. Runs on QNAP inside docker-compose, next
// to chad-mongodb, requiring the single-node replica set (rs0) enabled by
// this same Story for MongoDB Change Streams.
//
// State/design summary (see ai-docs/history/how-it-works.md for the full
// write-up):
//   - Resume token + heartbeat/status persisted in chad.cp_history_state
//     (singleton doc, _id "cp_history_worker") — a restart resumes exactly
//     where it left off, never re-scanning or dropping events.
//   - MongoDB 4.4 has no pre/post-images (that's a 6.0+ feature), so
//     "before" state for update/delete diffing comes from an in-memory
//     cache of last-observed {config, body, actor} per item, populated
//     progressively from the events THIS worker has actually seen since it
//     started tracking (bootstrapped fresh — no read-all-cp_items-at-
//     startup step, deliberately: see 03_knowledge.md for why that would
//     make catch-up-after-downtime diffs subtly wrong). The first event
//     observed for any given item (ever, or after a long gap) has no known
//     "before" — recorded honestly as `beforeUnknown: true`, never
//     fabricated.
//   - Idempotency: each cp_history document's _id is the change event's
//     own resume-token data string, which is unique and stable — a retried
//     insert of the same event is a duplicate-key error, caught and
//     ignored, rather than needing a separate dedup check.
import { MongoClient } from "mongodb";
import { diffConfig } from "./lib/config-diff.mjs";
import { diffBody } from "./lib/body-diff.mjs";

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const HISTORY_STATE_ID = "cp_history_worker";
const HEARTBEAT_INTERVAL_MS = 15_000;
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 30_000;

function redactMongoUri(uri) {
  try {
    const parsed = new URL(uri);
    if (parsed.password) parsed.password = "***";
    if (parsed.username) parsed.username = "***";
    return parsed.toString();
  } catch {
    return "mongodb://(unparseable)";
  }
}

const client = new MongoClient(MONGO_URI);
await client.connect();
const db = client.db();
const itemsCol = db.collection("cp_items");
const historyCol = db.collection("cp_history");
const stateCol = db.collection("cp_history_state");

await historyCol.createIndex({ address: 1, changedAt: -1 });
await historyCol.createIndex({ sourceId: 1, changedAt: -1 });
await historyCol.createIndex({ changedAt: -1 });

console.log(`[history-worker] MongoDB: ${redactMongoUri(MONGO_URI)}`);
console.log("[history-worker] startup");

// In-memory "last observed state" cache — see header comment. Keyed by
// item _id (== config.id).
const lastKnownState = new Map();

let shuttingDown = false;
let currentStream = null;
let reconnectDelayMs = RECONNECT_BASE_DELAY_MS;

async function loadState() {
  return stateCol.findOne({ _id: HISTORY_STATE_ID });
}

async function saveState(patch) {
  await stateCol.updateOne(
    { _id: HISTORY_STATE_ID },
    { $set: { ...patch, lastHeartbeatAt: new Date() } },
    { upsert: true }
  );
}

function toDate(clusterTime) {
  if (!clusterTime) return new Date();
  // BSON Timestamp -> Date via its high-order seconds component.
  const seconds = typeof clusterTime.getHighBits === "function" ? clusterTime.getHighBits() : null;
  return seconds ? new Date(seconds * 1000) : new Date();
}

/**
 * Builds and persists one cp_history record for a single change-stream
 * event. Never throws on a duplicate (already-processed) event — that is
 * exactly the idempotency guarantee described in the header comment.
 */
async function recordHistoryEvent(change) {
  const sourceId = change.documentKey?._id;
  if (sourceId === undefined) return;

  const operationType = change.operationType;
  const cached = lastKnownState.get(sourceId) ?? null;
  const beforeUnknown = cached === null;

  let after = null;
  if (operationType === "insert" || operationType === "update" || operationType === "replace") {
    after = change.fullDocument ?? null;
  }

  const beforeConfig = cached?.config ?? null;
  const afterConfig = after?.config ?? null;
  const beforeBody = cached?.body ?? "";
  const afterBody = after?.body ?? "";

  const address = afterConfig?.address ?? beforeConfig?.address ?? null;
  // A delete event's change-stream document carries no fullDocument (no
  // `after`), so its own write never had a chance to record an actor —
  // fall back to the last actor this worker cached for the item from its
  // most recent insert/update, same principle as the address/body fallback
  // above.
  const actor = after?._lastActor ?? cached?.actor ?? null;

  const historyDoc = {
    _id: change._id?._data ?? `${sourceId}-${Date.now()}`,
    sourceCollection: "cp_items",
    sourceId,
    address,
    operationType,
    changedAt: toDate(change.clusterTime),
    actor: actor ? { username: actor.username, repoGuid: actor.repoGuid } : null,
    beforeUnknown,
    changes: {
      config: diffConfig(beforeConfig, afterConfig),
      body: diffBody(beforeBody, afterBody),
    },
  };

  try {
    await historyCol.insertOne(historyDoc);
    console.log(
      `[history-worker] history persisted: ${operationType} address=${address ?? "(unknown)"} beforeUnknown=${beforeUnknown}`
    );
  } catch (error) {
    if (error?.code === 11000) {
      console.log("[history-worker] duplicate event (already recorded), skipping");
    } else {
      throw error;
    }
  }

  // Update the cache AFTER computing the diff above (needs the pre-update
  // value), progressively — see header comment on why there is no
  // startup-time bootstrap read of the whole collection.
  if (operationType === "delete") {
    lastKnownState.delete(sourceId);
  } else if (after) {
    lastKnownState.set(sourceId, { config: after.config, body: after.body, actor: after._lastActor ?? null });
  }

  await saveState({ resumeToken: change._id, lastEventAt: new Date(), status: "running", lastError: null });
}

async function runChangeStream() {
  const existingState = await loadState();
  const resumeToken = existingState?.resumeToken ?? null;

  const options = { fullDocument: "updateLookup" };
  if (resumeToken) {
    options.resumeAfter = resumeToken;
    console.log("[history-worker] resuming from persisted resume token");
  } else {
    console.log("[history-worker] no persisted resume token — starting from now");
  }

  let stream;
  try {
    stream = itemsCol.watch([], options);
  } catch (error) {
    if (isResumeTokenLost(error)) {
      console.error(
        "[history-worker] resume token no longer in the oplog window — starting fresh from now. " +
          "History has a gap: some changes that happened while this worker was down were not recorded."
      );
      await saveState({
        resumeToken: null,
        status: "error",
        lastError: "resume token lost — restarted from now, history gap recorded",
        historyGapAt: new Date(),
      });
      stream = itemsCol.watch([], { fullDocument: "updateLookup" });
    } else {
      throw error;
    }
  }

  currentStream = stream;
  console.log("[history-worker] watch opened");

  stream.on("change", (change) => {
    recordHistoryEvent(change).catch((error) => {
      console.error("[history-worker] failed to persist history event:", error.message);
      saveState({ status: "error", lastError: error.message }).catch(() => {});
    });
  });

  return new Promise((resolve, reject) => {
    stream.on("error", (error) => {
      reject(error);
    });
    stream.on("close", () => {
      resolve();
    });
  });
}

function isResumeTokenLost(error) {
  return (
    error?.codeName === "ChangeStreamHistoryLost" ||
    /resume point may no longer be in the oplog|ChangeStreamHistoryLost/i.test(error?.message || "")
  );
}

async function mainLoop() {
  await saveState({ status: "running", startedAt: new Date(), lastError: null });

  while (!shuttingDown) {
    try {
      await runChangeStream();
      reconnectDelayMs = RECONNECT_BASE_DELAY_MS; // reset backoff after a clean run
      if (!shuttingDown) {
        console.log("[history-worker] change stream closed unexpectedly, reconnecting...");
      }
    } catch (error) {
      console.error(`[history-worker] change stream error: ${error.message}`);
      await saveState({ status: "error", lastError: error.message }).catch(() => {});
      if (shuttingDown) break;
      console.log(`[history-worker] retrying in ${reconnectDelayMs}ms`);
      await new Promise((r) => setTimeout(r, reconnectDelayMs));
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, RECONNECT_MAX_DELAY_MS);
    }
  }
}

const heartbeat = setInterval(() => {
  saveState({ status: "running" }).catch((error) => {
    console.error("[history-worker] heartbeat write failed:", error.message);
  });
}, HEARTBEAT_INTERVAL_MS);

async function gracefulShutdown(signal) {
  console.log(`\n[history-worker] received ${signal}, shutting down...`);
  shuttingDown = true;
  clearInterval(heartbeat);
  try {
    if (currentStream) await currentStream.close();
  } catch {
    // already closing/closed — fine.
  }
  await saveState({ status: "stopped" }).catch(() => {});
  await client.close();
  console.log("[history-worker] graceful shutdown complete");
  process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

mainLoop();
