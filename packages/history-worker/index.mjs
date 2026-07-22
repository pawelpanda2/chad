import { webcrypto as crypto } from "node:crypto";
// Node 18 (the production image's runtime, see Dockerfile) has no native
// globalThis.crypto — the mongodb driver needs it, hence this shim. Node
// 19+ (e.g. a developer machine running this same file directly for local
// testing, Story 78) already defines it as a getter-only property, so an
// unconditional assignment throws there. Guarded, not removed — Node 18 in
// production is unaffected.
if (!globalThis.crypto) {
  globalThis.crypto = crypto;
}

// cp_items change-stream consumer -> cp_history (Story 74; readiness signal
// + persistent shadow state + stable event ordering added in Story 78).
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
//     where it left off, never re-scanning or dropping events. Story 78
//     added watchStatus/watchOpenedAt to this same document — set to
//     "ready" only after itemsCol.watch() actually returns a live cursor,
//     so callers waiting for "the change stream is really open" have a
//     real signal instead of guessing from the unconditional "running"
//     status (which used to be written before watch() ever ran).
//   - MongoDB 4.4 has no pre/post-images (that's a 6.0+ feature), so
//     "before" state for update/delete diffing comes from a cache of
//     last-observed {config, body, actor} per item. Story 74 kept this
//     in-memory only, which lost all before/address/actor context on every
//     restart even though the resume token itself survived. Story 78 added
//     a persistent shadow-state store (lib/shadow-state.mjs,
//     chad.cp_history_last_state) — one doc per item, updated at the same
//     point the in-memory cache is, read back at startup to seed the
//     in-memory cache. This is still never a bootstrap from cp_items
//     itself: the shadow-state store only ever contains state derived from
//     events this worker actually processed, so an item with no prior real
//     history still correctly gets beforeUnknown: true on its first event
//     after a restart, exactly as before this Story.
//   - Idempotency: each cp_history document's _id is the change event's
//     own resume-token data string, which is unique and stable — a retried
//     insert of the same event is a duplicate-key error, caught and
//     ignored, rather than needing a separate dedup check.
//   - Stable ordering (Story 78): changedAt alone only has second
//     precision, which can't order several operations inside the same
//     second. Each history doc also stores orderSeconds/orderIncrement
//     (the change event's own BSON clusterTime Timestamp components) —
//     cp-history.ts sorts by these, not changedAt.
import { MongoClient } from "mongodb";
import { buildHistoryDocument } from "./lib/history-event-mapper.mjs";
import { loadShadowState, saveShadowState } from "./lib/shadow-state.mjs";

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

// In-memory "last observed state" cache — fast path for the hot loop,
// backed by the persistent shadow-state store (lib/shadow-state.mjs) so a
// restart doesn't lose it. Keyed by item _id (== config.id). Seeded from
// the persistent store in mainLoop() below, before the change stream opens.
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

/**
 * Builds and persists one cp_history record for a single change-stream
 * event. Never throws on a duplicate (already-processed) event — that is
 * exactly the idempotency guarantee described in the header comment.
 */
async function recordHistoryEvent(change) {
  const sourceId = change.documentKey?._id;
  if (sourceId === undefined) return;

  const cached = lastKnownState.get(sourceId) ?? null;
  const built = buildHistoryDocument(change, cached);
  if (built === null) return;
  const { historyDoc, nextState } = built;

  try {
    await historyCol.insertOne(historyDoc);
    console.log(
      `[history-worker] history persisted: ${historyDoc.operationType} address=${historyDoc.address ?? "(unknown)"} beforeUnknown=${historyDoc.beforeUnknown}`
    );
  } catch (error) {
    if (error?.code === 11000) {
      console.log("[history-worker] duplicate event (already recorded), skipping");
    } else {
      throw error;
    }
  }

  // Update both the fast in-memory cache and the durable shadow-state store
  // AFTER computing the diff above (needs the pre-update value),
  // progressively — see header comment on why there is no startup-time
  // bootstrap read of cp_items itself. Order here matters for crash-safety:
  // shadow state (and the resume token below) are only advanced after the
  // history doc has actually been persisted (or found to be a duplicate),
  // so a crash between insertOne and here just replays the same event next
  // time — the insertOne's own duplicate-key guard makes that a no-op.
  if (sourceId !== undefined) {
    if (nextState === null) {
      lastKnownState.delete(sourceId);
    } else {
      lastKnownState.set(sourceId, nextState);
    }
    await saveShadowState(db, sourceId, nextState);
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

  // watchStatus goes "opening" -> "ready" only once itemsCol.watch() below
  // has actually returned a live cursor (Story 78) — a caller polling for
  // "is the change stream really open" must never trust the unconditional
  // status: "running" mainLoop() writes at process start, which said
  // nothing about the stream itself yet.
  await saveState({ watchStatus: "opening" });

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
  await saveState({ watchStatus: "ready", watchOpenedAt: new Date() });

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
  // Seed the in-memory cache from the persistent shadow-state store (Story
  // 78) BEFORE the change stream opens — see header comment for why this is
  // safe (never a raw cp_items scan, only state this worker itself already
  // derived from real events).
  const shadowState = await loadShadowState(db);
  for (const [sourceId, state] of shadowState) {
    lastKnownState.set(sourceId, state);
  }
  console.log(`[history-worker] seeded in-memory cache with ${shadowState.size} persisted shadow-state entries`);

  await saveState({ status: "running", startedAt: new Date(), lastError: null, watchStatus: "opening" });

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
  await saveState({ status: "stopped", watchStatus: "stopped" }).catch(() => {});
  await client.close();
  console.log("[history-worker] graceful shutdown complete");
  process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

mainLoop();
