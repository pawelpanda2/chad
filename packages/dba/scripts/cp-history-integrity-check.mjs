#!/usr/bin/env node
// Story 79 — cp_history integrity checker. Verifies, for one repoGuid,
// that the hash-chained, versioned history in `cp_history` is fully
// consistent with the current state of `cp_items`. Prints a plain-text
// report and exits non-zero on ANY inconsistency — no separate "errors"
// collection is written anywhere (per the Story 79 input's explicit "Nie
// dodawaj kolekcji błędów" — this is a read-only report, not a persisted
// artifact).
//
// Usage:
//   node packages/dba/scripts/cp-history-integrity-check.mjs --repoGuid=<guid>
// or:
//   CP_HISTORY_INTEGRITY_REPO_GUID=<guid> node packages/dba/scripts/cp-history-integrity-check.mjs
//
// Requires `pnpm --filter dba build` to have run first (imports ../dist/).
import { getMongoDb, closeMongoConnection, hashCpState, CP_ITEMS_COLLECTION, CP_HISTORY_COLLECTION } from "../dist/index.js";

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--repoGuid=")) args.repoGuid = raw.slice("--repoGuid=".length);
  }
  return args;
}

function fail(issues, message) {
  issues.push(message);
}

async function main() {
  const args = parseArgs(process.argv);
  const repoGuid = args.repoGuid ?? process.env.CP_HISTORY_INTEGRITY_REPO_GUID;
  if (!repoGuid) {
    console.error(
      "Usage: node cp-history-integrity-check.mjs --repoGuid=<guid> (or set CP_HISTORY_INTEGRITY_REPO_GUID)"
    );
    process.exitCode = 1;
    return;
  }

  const db = await getMongoDb();
  const historyCol = db.collection(CP_HISTORY_COLLECTION);
  const itemsCol = db.collection(CP_ITEMS_COLLECTION);

  const allEvents = await historyCol.find({ repoGuid }).sort({ sourceId: 1, version: 1 }).toArray();

  const issues = [];
  const bySourceId = new Map();
  for (const event of allEvents) {
    if (event.repoGuid !== repoGuid) {
      fail(issues, `event ${event._id}: repoGuid mismatch (expected ${repoGuid}, found ${event.repoGuid})`);
      continue;
    }
    if (!event.actor?.username || !event.actor?.repoGuid) {
      fail(issues, `event ${event._id} (sourceId=${event.sourceId}, v${event.version}): missing actor.username/repoGuid`);
    }
    if (!event.address) {
      fail(issues, `event ${event._id} (sourceId=${event.sourceId}, v${event.version}): missing address`);
    }
    if (!bySourceId.has(event.sourceId)) bySourceId.set(event.sourceId, []);
    bySourceId.get(event.sourceId).push(event);
  }

  let itemsChecked = 0;
  let eventsChecked = allEvents.length;

  for (const [sourceId, events] of bySourceId) {
    itemsChecked++;

    // Duplicates check: (sourceId, version) must be unique — the DB's own
    // unique index should already prevent this, but verify defensively.
    const seenVersions = new Set();
    for (const event of events) {
      if (seenVersions.has(event.version)) {
        fail(issues, `sourceId=${sourceId}: duplicate version ${event.version}`);
      }
      seenVersions.add(event.version);
    }

    // Continuity: versions must be exactly 1..N, no gaps.
    const versions = events.map((e) => e.version).sort((a, b) => a - b);
    for (let i = 0; i < versions.length; i++) {
      if (versions[i] !== i + 1) {
        fail(issues, `sourceId=${sourceId}: version sequence is not continuous 1..N (got ${JSON.stringify(versions)})`);
        break;
      }
    }

    // First event must be an insert at version 1.
    const first = events.find((e) => e.version === 1);
    if (!first) {
      fail(issues, `sourceId=${sourceId}: no version 1 event found`);
    } else if (first.operationType !== "insert") {
      fail(issues, `sourceId=${sourceId}: version 1 event is "${first.operationType}", expected "insert"`);
    } else if (first.beforeHash !== null) {
      fail(issues, `sourceId=${sourceId}: version 1 (insert) must have beforeHash null`);
    } else if (!first.afterSnapshot) {
      fail(issues, `sourceId=${sourceId}: version 1 (insert) is missing its required afterSnapshot`);
    }

    // Hash chain: beforeHash(N) == afterHash(N-1), and delete must be last.
    const ordered = [...events].sort((a, b) => a.version - b.version);
    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1];
      const curr = ordered[i];
      if (prev.operationType === "delete") {
        fail(issues, `sourceId=${sourceId}: version ${curr.version} exists after a delete at version ${prev.version} (sourceId reused after delete?)`);
        continue;
      }
      if (curr.beforeHash !== prev.afterHash) {
        fail(
          issues,
          `sourceId=${sourceId}: hash-chain break — v${curr.version}.beforeHash (${curr.beforeHash}) != v${prev.version}.afterHash (${prev.afterHash})`
        );
      }
    }

    // Delete-specific checks.
    const last = ordered[ordered.length - 1];
    if (last.operationType === "delete") {
      if (last.afterHash !== null) {
        fail(issues, `sourceId=${sourceId}: delete event (v${last.version}) must have afterHash null`);
      }
      if (!last.afterSnapshot) {
        fail(issues, `sourceId=${sourceId}: delete event (v${last.version}) is missing its required pre-delete snapshot`);
      } else {
        const snapshotHash = hashCpState(last.afterSnapshot.config, last.afterSnapshot.body);
        if (snapshotHash !== last.beforeHash) {
          fail(issues, `sourceId=${sourceId}: delete event's snapshot hash does not match its own beforeHash`);
        }
      }
      const stillExists = await itemsCol.findOne({ _id: sourceId });
      if (stillExists) {
        fail(issues, `sourceId=${sourceId}: last event is "delete" but the cp_items document still exists`);
      }
    } else {
      // Alive item: cp_items must exist and match the last event exactly.
      const currentItem = await itemsCol.findOne({ _id: sourceId });
      if (!currentItem) {
        fail(issues, `sourceId=${sourceId}: last event is "${last.operationType}" but no matching cp_items document exists`);
      } else {
        if (currentItem._historyVersion !== last.version) {
          fail(
            issues,
            `sourceId=${sourceId}: cp_items._historyVersion (${currentItem._historyVersion}) != last cp_history version (${last.version})`
          );
        }
        const currentHash = hashCpState(currentItem.config, currentItem.body);
        if (currentHash !== last.afterHash) {
          fail(issues, `sourceId=${sourceId}: current cp_items hash != last cp_history event's afterHash`);
        }
      }
    }

    // Insert/update snapshot self-consistency, whenever a snapshot is present.
    for (const event of ordered) {
      if (event.operationType !== "delete" && event.afterSnapshot) {
        const snapshotHash = hashCpState(event.afterSnapshot.config, event.afterSnapshot.body);
        if (snapshotHash !== event.afterHash) {
          fail(issues, `sourceId=${sourceId} v${event.version}: afterSnapshot hash does not match its own afterHash`);
        }
      }
    }
  }

  console.log(`[cp-history-integrity] repoGuid=${repoGuid}`);
  console.log(`[cp-history-integrity] items checked: ${itemsChecked}, events checked: ${eventsChecked}`);
  if (issues.length === 0) {
    console.log("[cp-history-integrity] OK — zero inconsistencies.");
  } else {
    console.log(`[cp-history-integrity] FAILED — ${issues.length} inconsistenc${issues.length === 1 ? "y" : "ies"}:`);
    for (const issue of issues) console.log(`  - ${issue}`);
  }

  await closeMongoConnection();
  process.exitCode = issues.length === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error("[cp-history-integrity] Fatal error:", error);
  process.exitCode = 1;
});
