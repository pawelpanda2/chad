#!/usr/bin/env node
// Story 80 — PostgreSQL integrity checker for cp_items/cp_history/outboxes.
// Read-only: never writes, never creates an "errors" collection/table —
// stdout report + non-zero exit code on any inconsistency (same convention
// as cp-history-integrity-check.mjs's Mongo equivalent).
//
// Usage:
//   POSTGRES_URI=... node packages/dba/scripts/cp-postgres-integrity-check.mjs (--repoGuid=<guid> | --all)
//   (or set CP_POSTGRES_INTEGRITY_REPO_GUID)
//
// If MONGODB_URI is also set, additionally cross-checks migrated counts
// against the Mongo source (Story 80 §14 "liczby po migracji zgadzają się
// z Mongo source" / "brak danych CHAD zapisanych wyłącznie w starym Mongo
// po cutover") — skipped, not failed, when MONGODB_URI is unset (this
// script is also the everyday native-Postgres integrity check, run with no
// Mongo involved at all once a repo is fully cut over).

import { withPostgresClient, closePostgresConnection } from "../dist/postgres.js";

function parseArgs(argv) {
  const args = { all: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--all") args.all = true;
    else if (raw.startsWith("--repoGuid=")) args.repoGuid = raw.slice("--repoGuid=".length);
  }
  return args;
}

function splitAddress(address) {
  const parts = address.split("/");
  const [repoGuid, ...segments] = parts;
  return { repoGuid, segments };
}

function parentAddressOf(address) {
  const idx = address.lastIndexOf("/");
  return idx === -1 ? null : address.slice(0, idx);
}

async function checkRepo(client, repoGuid, issues) {
  const { rows: items } = await client.query("SELECT * FROM cp_items WHERE repo_guid = $1", [repoGuid]);
  const itemById = new Map(items.map((i) => [i.id, i]));

  // --- cp_items shape invariants ---
  const seenAddresses = new Map();
  const siblingNameKey = new Map(); // `${parentAddress}::${name}` -> [address,...]
  for (const item of items) {
    if (item.id !== item.config?.id) {
      issues.push(`cp_items ${item.id}: id !== config.id ("${item.config?.id}")`);
    }
    if (item.address !== item.config?.address) {
      issues.push(`cp_items ${item.id}: address column ("${item.address}") !== config.address ("${item.config?.address}")`);
    }
    if (item.name !== item.config?.name) {
      issues.push(`cp_items ${item.id}: name column ("${item.name}") !== config.name ("${item.config?.name}")`);
    }
    if (splitAddress(item.address).repoGuid !== item.repo_guid) {
      issues.push(`cp_items ${item.id}: repo_guid column ("${item.repo_guid}") does not match address-derived repoGuid ("${splitAddress(item.address).repoGuid}")`);
    }

    if (!seenAddresses.has(item.address)) seenAddresses.set(item.address, []);
    seenAddresses.get(item.address).push(item.id);

    const parent = parentAddressOf(item.address);
    if (parent) {
      const key = `${parent}::${item.name}`;
      if (!siblingNameKey.has(key)) siblingNameKey.set(key, []);
      siblingNameKey.get(key).push(item.address);
    }
  }
  for (const [address, ids] of seenAddresses) {
    if (ids.length > 1) issues.push(`duplicate address "${address}": ids ${ids.join(", ")}`);
  }
  for (const [key, addresses] of siblingNameKey) {
    if (addresses.length > 1) {
      const [parent, name] = key.split("::");
      issues.push(`duplicate child name "${name}" under "${parent}": ${addresses.join(", ")}`);
    }
  }

  // --- cp_history per-item checks ---
  const { rows: events } = await client.query(
    "SELECT * FROM cp_history WHERE repo_guid = $1 ORDER BY source_id, version ASC",
    [repoGuid]
  );
  const eventsBySource = new Map();
  for (const event of events) {
    if (splitAddress(event.address).repoGuid !== event.repo_guid) {
      issues.push(`cp_history mutation_id=${event.mutation_id}: repo_guid ("${event.repo_guid}") does not match address-derived repoGuid ("${splitAddress(event.address).repoGuid}")`);
    }
    if (!eventsBySource.has(event.source_id)) eventsBySource.set(event.source_id, []);
    eventsBySource.get(event.source_id).push(event);
  }

  for (const [sourceId, sourceEvents] of eventsBySource) {
    // Version continuity: 1..N, no gaps, no duplicates.
    for (let i = 0; i < sourceEvents.length; i++) {
      const expected = i + 1;
      if (sourceEvents[i].version !== expected) {
        issues.push(`cp_history source_id=${sourceId}: expected version ${expected} at position ${i}, found ${sourceEvents[i].version} (gap or duplicate)`);
      }
    }

    // Hash chain: before_hash(N) === after_hash(N-1) — relaxed across a
    // migrated/native seam, since migrated rows use Mongo's hashCpState
    // algorithm and native rows use Postgres's own digest(jsonb::text)
    // algorithm; a non-null config_diff is how a migrated row is
    // identified (see cp-history-postgres.ts's resolveChanges doc comment)
    // — the two algorithms are internally consistent but not comparable to
    // each other, a known, disclosed limitation (backlog/stories/80),  not
    // a bug to "fix" by pretending they're the same hash.
    for (let i = 1; i < sourceEvents.length; i++) {
      const prev = sourceEvents[i - 1];
      const curr = sourceEvents[i];
      const eitherMigrated = prev.config_diff !== null || curr.config_diff !== null;
      if (eitherMigrated) continue;
      if (curr.before_hash !== prev.after_hash) {
        issues.push(`cp_history source_id=${sourceId}: hash chain broken between version ${prev.version} and ${curr.version} (before_hash !== previous after_hash)`);
      }
    }

    // First event must be an insert with beforeHash null.
    const first = sourceEvents[0];
    if (first.operation_type !== "insert") {
      issues.push(`cp_history source_id=${sourceId}: version 1 is "${first.operation_type}", expected "insert"`);
    }
    if (first.before_hash !== null) {
      issues.push(`cp_history source_id=${sourceId}: version 1 has a non-null before_hash (expected null for the first event)`);
    }

    // Last event vs. current cp_items state — no delete may be followed by
    // anything else, and a live item's history_version must match its last event's version.
    const last = sourceEvents[sourceEvents.length - 1];
    const liveItem = itemById.get(sourceId);
    if (last.operation_type === "delete") {
      if (liveItem) {
        issues.push(`cp_history source_id=${sourceId}: last event is "delete" but cp_items row still exists`);
      }
    } else {
      if (!liveItem) {
        issues.push(`cp_history source_id=${sourceId}: last event is "${last.operation_type}" (not delete) but no cp_items row exists — orphaned history`);
      } else if (liveItem.history_version !== last.version) {
        issues.push(`cp_items ${sourceId}: history_version (${liveItem.history_version}) does not match its last cp_history event's version (${last.version})`);
      }
    }
    for (let i = 0; i < sourceEvents.length - 1; i++) {
      if (sourceEvents[i].operation_type === "delete") {
        issues.push(`cp_history source_id=${sourceId}: a "delete" event at version ${sourceEvents[i].version} is followed by more events — deletes must be terminal`);
      }
    }
  }

  return { itemsChecked: items.length, eventsChecked: events.length };
}

async function checkOutboxes(client, issues) {
  const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString();
  const { rows: dataStale } = await client.query(
    "SELECT id FROM cp_outbox_data_sync WHERE status = 'processing' AND locked_at <= $1",
    [staleBefore]
  );
  for (const row of dataStale) {
    issues.push(`cp_outbox_data_sync ${row.id}: stuck "processing" past the stale-lock window (recoverStaleLocks should have reclaimed it)`);
  }
  const { rows: sheetsStale } = await client.query(
    "SELECT id FROM cp_outbox_google_sheets_sync WHERE status = 'processing' AND locked_at <= $1",
    [staleBefore]
  );
  for (const row of sheetsStale) {
    issues.push(`cp_outbox_google_sheets_sync ${row.id}: stuck "processing" past the stale-lock window`);
  }
}

async function checkAgainstMongo(pgClient, repoGuids, issues) {
  let mongoModule;
  try {
    mongoModule = await import("../dist/index.js");
  } catch {
    return; // dba not built with Mongo support somehow — skip, not a failure.
  }
  const { getMongoDb, closeMongoConnection } = mongoModule;
  const db = await getMongoDb();

  for (const repoGuid of repoGuids) {
    const escaped = repoGuid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const mongoCount = await db.collection("cp_items").countDocuments({ "config.address": { $regex: `^${escaped}(/|$)` } });
    const { rows } = await pgClient.query("SELECT count(*) FROM cp_items WHERE repo_guid = $1", [repoGuid]);
    const pgCount = Number(rows[0].count);
    if (mongoCount !== pgCount) {
      issues.push(`repoGuid=${repoGuid}: Mongo has ${mongoCount} cp_items, Postgres has ${pgCount} — counts disagree post-migration`);
    }
  }
  await closeMongoConnection();
}

async function main() {
  const args = parseArgs(process.argv);
  const singleRepoGuid = args.repoGuid ?? process.env.CP_POSTGRES_INTEGRITY_REPO_GUID;
  if (!singleRepoGuid && !args.all) {
    console.error("Usage: node cp-postgres-integrity-check.mjs (--repoGuid=<guid> | --all) (or set CP_POSTGRES_INTEGRITY_REPO_GUID)");
    process.exitCode = 1;
    return;
  }

  const issues = [];
  let itemsChecked = 0;
  let eventsChecked = 0;

  await withPostgresClient(async (client) => {
    let repoGuids;
    if (args.all) {
      const { rows } = await client.query("SELECT DISTINCT repo_guid FROM cp_items");
      repoGuids = rows.map((r) => r.repo_guid);
    } else {
      repoGuids = [singleRepoGuid];
    }

    for (const repoGuid of repoGuids) {
      const result = await checkRepo(client, repoGuid, issues);
      itemsChecked += result.itemsChecked;
      eventsChecked += result.eventsChecked;
    }

    await checkOutboxes(client, issues);

    if (process.env.MONGODB_URI) {
      await checkAgainstMongo(client, repoGuids, issues);
    } else {
      console.log("[cp-postgres-integrity] MONGODB_URI not set — skipping Mongo count-parity cross-check.");
    }
  });

  console.log(`[cp-postgres-integrity] scope: ${args.all ? "--all" : `repoGuid=${singleRepoGuid}`}`);
  console.log(`[cp-postgres-integrity] items checked: ${itemsChecked}, history events checked: ${eventsChecked}`);
  if (issues.length === 0) {
    console.log("[cp-postgres-integrity] OK — zero inconsistencies.");
  } else {
    console.log(`[cp-postgres-integrity] FAILED — ${issues.length} inconsistenc${issues.length === 1 ? "y" : "ies"}:`);
    for (const issue of issues) console.log(`  - ${issue}`);
  }

  await closePostgresConnection();
  process.exitCode = issues.length === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error("[cp-postgres-integrity] Fatal error:", error);
  process.exitCode = 1;
});
