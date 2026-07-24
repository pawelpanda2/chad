#!/usr/bin/env node
/**
 * Story 81 — Folders path smoke against Postgres (same ops as /api/folders).
 * Expects DBA_PRIMARY_BACKEND=postgres and POSTGRES_URI set.
 */
process.env.DBA_PRIMARY_BACKEND = "postgres";
process.env.DBA_POSTGRES_ENABLED = "true";
process.env.DBA_MONGO_ENABLED = "false";
process.env.DBA_CONTENT_PROVIDER_ENABLED = "false";

const REPO = process.argv[2] || "21d11bdc-f1f4-44d1-b61a-3fa6b039c641";
const LOCA = process.argv[3] ?? "08";

const { getItemByAddress, getChildrenOf } = await import("../dist/item-ops.js");
const { closePostgresConnection } = await import("../dist/postgres.js");

const root = await getItemByAddress(REPO);
if (!root) {
  console.error(`[folders-smoke] FAIL: root not found ${REPO}`);
  process.exitCode = 1;
} else {
  console.log(`[folders-smoke] root OK type=${root.config.type} name=${root.config.name}`);
  const kids = await getChildrenOf(REPO);
  console.log(`[folders-smoke] root children: ${kids.length}`);
}

const address = LOCA ? `${REPO}/${LOCA}` : REPO;
const item = await getItemByAddress(address);
if (!item) {
  console.error(`[folders-smoke] FAIL: Item not found: address "${address}"`);
  process.exitCode = 1;
} else {
  console.log(
    `[folders-smoke] ${address} OK type=${item.config.type} name=${item.config.name} bodyLen=${(item.body ?? "").length}`
  );
  if (item.config.type === "Folder") {
    const children = await getChildrenOf(address);
    console.log(`[folders-smoke] folder children: ${children.length}`);
  }
}

if (!process.exitCode) console.log("[folders-smoke] PASSED");
await closePostgresConnection();
