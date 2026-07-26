#!/usr/bin/env node
// Read-only audit: Mongo CHAD vs Postgres CHAD, matched by (repo_guid,
// config.address) — NOT by id (two different ids can legitimately occupy
// the same address on each backend after the 2026-07-24/25 Mongo/Postgres
// primary split; see backlog root-cause notes). Never writes anything.
//
// Usage:
//   POSTGRES_URI=... MONGODB_URI=... node packages/dba/scripts/audit-mongo-vs-postgres-by-address.mjs [--repoGuid=<guid>]
//
// Requires `pnpm --filter dba build` first (imports ../dist/).

import { getMongoDb, closeMongoConnection, hashCpState } from "../dist/index.js";
import { withPostgresClient, closePostgresConnection } from "../dist/postgres.js";

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--repoGuid=")) args.repoGuid = raw.slice("--repoGuid=".length);
  }
  return args;
}

function keyOf(repoGuid, address) {
  return `${repoGuid}::${address}`;
}

async function loadMongoItems(mongoDb, repoGuidFilter) {
  const filter = repoGuidFilter
    ? { "config.address": { $regex: `^${repoGuidFilter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(/|$)` } }
    : {};
  const docs = await mongoDb.collection("cp_items").find(filter).toArray();
  const byKey = new Map();
  for (const doc of docs) {
    const address = doc.config?.address;
    if (!address) continue;
    const repoGuid = address.split("/")[0];
    byKey.set(keyOf(repoGuid, address), {
      id: doc._id,
      repoGuid,
      address,
      name: doc.config?.name,
      type: doc.config?.type,
      modified: doc.config?.modified ?? null,
      hash: hashCpState(doc.config, doc.body ?? ""),
    });
  }
  return byKey;
}

async function loadPostgresItems(pgClient, repoGuidFilter) {
  const { rows } = repoGuidFilter
    ? await pgClient.query("SELECT * FROM cp_items WHERE repo_guid = $1", [repoGuidFilter])
    : await pgClient.query("SELECT * FROM cp_items");
  const byKey = new Map();
  for (const row of rows) {
    byKey.set(keyOf(row.repo_guid, row.address), {
      id: row.id,
      repoGuid: row.repo_guid,
      address: row.address,
      name: row.name,
      type: row.type,
      modified: row.modified_at,
      hash: hashCpState(row.config, row.body),
    });
  }
  return byKey;
}

async function auditItems(mongoDb, pgClient, repoGuidFilter) {
  const mongoItems = await loadMongoItems(mongoDb, repoGuidFilter);
  const pgItems = await loadPostgresItems(pgClient, repoGuidFilter);

  const allKeys = new Set([...mongoItems.keys(), ...pgItems.keys()]);
  const result = {
    totalAddresses: allKeys.size,
    identical: [],
    mongoOnly: [],
    postgresOnly: [],
    sameIdDifferentContent: [],
    differentIdSameAddress: [],
  };

  for (const key of allKeys) {
    const m = mongoItems.get(key);
    const p = pgItems.get(key);
    if (m && !p) {
      result.mongoOnly.push(m);
    } else if (p && !m) {
      result.postgresOnly.push(p);
    } else if (m.id === p.id) {
      if (m.hash === p.hash) {
        result.identical.push({ address: m.address });
      } else {
        result.sameIdDifferentContent.push({
          address: m.address,
          id: m.id,
          mongo: { name: m.name, type: m.type, modified: m.modified, hash: m.hash },
          postgres: { name: p.name, type: p.type, modified: p.modified, hash: p.hash },
        });
      }
    } else {
      result.differentIdSameAddress.push({
        address: m.address,
        mongo: { id: m.id, name: m.name, type: m.type, modified: m.modified },
        postgres: { id: p.id, name: p.name, type: p.type, modified: p.modified },
      });
    }
  }
  return result;
}

async function auditHistory(mongoDb, pgClient, repoGuidFilter) {
  const mongoFilter = repoGuidFilter
    ? { repoGuid: repoGuidFilter }
    : {};
  const mongoCount = await mongoDb.collection("cp_history").countDocuments(mongoFilter);
  const { rows } = repoGuidFilter
    ? await pgClient.query("SELECT count(*) FROM cp_history WHERE repo_guid = $1", [repoGuidFilter])
    : await pgClient.query("SELECT count(*) FROM cp_history");
  return { mongoCount, postgresCount: Number(rows[0].count) };
}

async function auditOutboxes(mongoDb, pgClient) {
  const mongoData = await mongoDb.collection("data_sync_outbox").countDocuments({});
  const mongoSheets = await mongoDb.collection("google_sheets_sync_outbox").countDocuments({});
  const { rows: pgData } = await pgClient.query("SELECT count(*) FROM cp_outbox_data_sync");
  const { rows: pgSheets } = await pgClient.query("SELECT count(*) FROM cp_outbox_google_sheets_sync");
  return {
    dataSync: { mongoCount: mongoData, postgresCount: Number(pgData[0].count) },
    sheetsSync: { mongoCount: mongoSheets, postgresCount: Number(pgSheets[0].count) },
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const mongoDb = await getMongoDb();

  await withPostgresClient(async (pgClient) => {
    console.log(`[audit] scope: ${args.repoGuid ? `repoGuid=${args.repoGuid}` : "ALL repos"}`);

    const itemsResult = await auditItems(mongoDb, pgClient, args.repoGuid);
    console.log("\n=== cp_items (matched by repo_guid + config.address) ===");
    console.log(`total distinct addresses seen: ${itemsResult.totalAddresses}`);
    console.log(`identical (same id, same hash): ${itemsResult.identical.length}`);
    console.log(`mongo-only (missing in Postgres): ${itemsResult.mongoOnly.length}`);
    console.log(`postgres-only (missing in Mongo): ${itemsResult.postgresOnly.length}`);
    console.log(`SAME id, DIFFERENT content: ${itemsResult.sameIdDifferentContent.length}`);
    console.log(`DIFFERENT id, SAME address (true collision): ${itemsResult.differentIdSameAddress.length}`);

    if (itemsResult.mongoOnly.length > 0) {
      console.log("\n--- mongo-only items ---");
      for (const it of itemsResult.mongoOnly) {
        console.log(`  ${it.address}  id=${it.id}  name="${it.name}"  type=${it.type}  modified=${it.modified}`);
      }
    }
    if (itemsResult.sameIdDifferentContent.length > 0) {
      console.log("\n--- same id, different content (needs manual review) ---");
      for (const it of itemsResult.sameIdDifferentContent) {
        console.log(`  ${it.address}  id=${it.id}`);
        console.log(`    mongo:    name="${it.mongo.name}" modified=${it.mongo.modified} hash=${it.mongo.hash}`);
        console.log(`    postgres: name="${it.postgres.name}" modified=${it.postgres.modified} hash=${it.postgres.hash}`);
      }
    }
    if (itemsResult.differentIdSameAddress.length > 0) {
      console.log("\n--- different id, same address (true collision, needs manual review) ---");
      for (const it of itemsResult.differentIdSameAddress) {
        console.log(`  ${it.address}`);
        console.log(`    mongo:    id=${it.mongo.id} name="${it.mongo.name}" modified=${it.mongo.modified}`);
        console.log(`    postgres: id=${it.postgres.id} name="${it.postgres.name}" modified=${it.postgres.modified}`);
      }
    }

    const historyResult = await auditHistory(mongoDb, pgClient, args.repoGuid);
    console.log("\n=== cp_history ===");
    console.log(`mongo: ${historyResult.mongoCount}  postgres: ${historyResult.postgresCount}`);

    const outboxResult = await auditOutboxes(mongoDb, pgClient);
    console.log("\n=== outboxes ===");
    console.log(`data_sync:   mongo=${outboxResult.dataSync.mongoCount}  postgres=${outboxResult.dataSync.postgresCount}`);
    console.log(`sheets_sync: mongo=${outboxResult.sheetsSync.mongoCount}  postgres=${outboxResult.sheetsSync.postgresCount}`);
  });

  await closeMongoConnection();
  await closePostgresConnection();
}

main().catch((error) => {
  console.error("[audit] FATAL:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
