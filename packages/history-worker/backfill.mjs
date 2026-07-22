// One-time (idempotent, safe to re-run) backfill for cp_history (Story 74).
//
// history-worker's own live change-stream consumer deliberately never
// bootstraps from a full cp_items scan at startup (see index.mjs's header
// comment) — by design, it only ever records events it personally observes
// from the moment it starts watching. That means every item created before
// history-worker existed (or before it was first started) has NO history
// at all: opening the History tab for one of those items shows nothing,
// and the real change/create history that predates Story 74 is genuinely
// unrecoverable (Content Provider kept no audit trail of its own).
//
// This script closes that gap the only honest way possible: for every
// cp_items document that currently has ZERO cp_history records, it inserts
// exactly ONE synthetic "initial state" history record — an `insert` event
// with `beforeUnknown: true` (same convention the live worker already uses
// for its own first-ever-observed event on an item) and a diff computed
// against an empty prior state, using the EXACT SAME diffConfig/diffBody
// functions the live worker uses, so a reconstruction reading cp_history
// from the beginning gets that item's real current state at backfill time,
// under the same shape a real captured event would have. Clearly marked
// (`backfilled: true`) so nobody mistakes it for a genuinely observed
// change — it represents "state at backfill time", not a real event with a
// real timestamp for HOW that state came to be (best-effort `changedAt` is
// the item's own `config.created`, which IS real).
//
// Idempotent: an item that already has any cp_history record (real or a
// previous backfill run) is skipped entirely, so re-running this is safe
// and only ever affects items still missing history.
//
// Run via: cd packages/history-worker && node backfill.mjs
import { MongoClient } from "mongodb";
import { diffConfig } from "./lib/config-diff.mjs";
import { diffBody } from "./lib/body-diff.mjs";

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";

function parseCpTimestamp(raw) {
  // CP's own "YYMMDD_HHMMSS" format (e.g. "260718_212349") — best-effort;
  // falls back to now if unparseable (never throws, never blocks the run).
  const m = /^(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/.exec(raw ?? "");
  if (!m) return new Date();
  const [, yy, mm, dd, hh, min, ss] = m;
  return new Date(Date.UTC(2000 + Number(yy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss)));
}

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();
  const itemsCol = db.collection("cp_items");
  const historyCol = db.collection("cp_history");

  const itemsWithHistory = new Set(await historyCol.distinct("sourceId"));
  console.log(`[backfill] ${itemsWithHistory.size} item(s) already have history — will be skipped.`);

  const cursor = itemsCol.find({});
  let scanned = 0;
  let inserted = 0;
  let skipped = 0;

  for await (const item of cursor) {
    scanned++;
    if (itemsWithHistory.has(item._id)) {
      skipped++;
      continue;
    }

    const config = item.config ?? {};
    const body = item.body ?? "";
    const actor = item._lastActor ?? null;

    const historyDoc = {
      _id: `backfill:${item._id}`,
      sourceCollection: "cp_items",
      sourceId: item._id,
      address: config.address ?? null,
      operationType: "insert",
      changedAt: parseCpTimestamp(config.created),
      actor: actor ? { username: actor.username, repoGuid: actor.repoGuid } : null,
      beforeUnknown: true,
      backfilled: true,
      backfillNote:
        "Synthetic initial-state record — real change history predates the History feature (Story 74) and was never captured. Represents this item's state at backfill time (2026-07-22), not a genuinely observed event.",
      changes: {
        config: diffConfig(null, config),
        body: diffBody("", body),
      },
    };

    try {
      await historyCol.insertOne(historyDoc);
      inserted++;
    } catch (error) {
      if (error?.code === 11000) {
        skipped++; // already backfilled by a previous run
      } else {
        throw error;
      }
    }
  }

  console.log(`[backfill] scanned=${scanned} inserted=${inserted} skipped=${skipped}`);
  await client.close();
}

main().catch((error) => {
  console.error("[backfill] failed:", error);
  process.exit(1);
});
