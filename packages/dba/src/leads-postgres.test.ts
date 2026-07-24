/**
 * Real-Postgres regression test for Story 81's leads.ts fix — before this,
 * `saveDateEntry`/`saveDailyEntry`/`getAllDateEntries`/`getAllDailyEntries`/
 * `update*`/`delete*` only ever branched on
 * `config.mongoEnabled`/`config.contentProviderEnabled`, with no
 * `postgresEnabled`/`primaryBackend === "postgres"` case — every one of
 * them silently no-op'd (reads returned `[]`, writes returned
 * `success:false`) whenever Postgres was configured as primary. Found
 * deploying QNAP TEST's real Postgres cutover; this test exercises the
 * exact same business functions the Dashboard UI/API routes call, end to
 * end, against a real local Postgres.
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.POSTGRES_URI =
  process.env.POSTGRES_URI ?? "postgres://chad:chad@localhost:5433/chad_test_story80_mutate";
process.env.DBA_PRIMARY_BACKEND = "postgres";
process.env.DBA_POSTGRES_ENABLED = "true";
process.env.DBA_MONGO_ENABLED = "false";
process.env.DBA_CONTENT_PROVIDER_ENABLED = "false";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { withPostgresClient, closePostgresConnection } from "./postgres.js";
import { runWithRepoContext } from "./repo-context.js";
import {
  saveDateEntry,
  updateDateEntry,
  deleteDateEntry,
  saveDailyEntry,
  updateDailyEntry,
  deleteDailyEntry,
  getAllDateEntries,
  getAllDailyEntries,
  generateEntryName,
} from "./leads.js";
import { listCpHistory } from "./cp-history.js";

async function ensureSchema(): Promise<void> {
  await withPostgresClient(async (client) => {
    const { rows } = await client.query("SELECT to_regclass('cp_items') AS reg");
    if (rows[0].reg) return;
    const sqlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "sql", "migrations", "0001_init.sql");
    const sql = await readFile(sqlPath, "utf8");
    await client.query(sql);
  });
}

function yaml(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${k}: ${JSON.stringify(String(v))}`)
    .join("\n");
}

beforeAll(async () => {
  await ensureSchema();
});

afterAll(async () => {
  await closePostgresConnection();
});

describe("leads.ts against a Postgres primary (Story 81 regression)", () => {
  it("Date Entry: create -> update -> delete each work, and produce exactly one insert/update/delete cp_history event", async () => {
    const repoGuid = randomUUID();
    await runWithRepoContext({ repoGuid, username: "story81-test" }, async () => {
      const existing = await getAllDateEntries();
      expect(existing).toEqual([]); // fresh repo — proves the read path isn't silently returning stale/wrong data

      const name = generateEntryName(existing.map((e) => e.itemName));
      const created = await saveDateEntry(name, yaml({ DATA: "2026-01-20", "ŹRÓDŁO": "test", NAZWA: "n" }));
      expect(created.success).toBe(true);

      await updateDateEntry(created.loca, yaml({ DATA: "2026-01-21", "ŹRÓDŁO": "test", NAZWA: "n-updated" }));
      const afterUpdate = await getAllDateEntries();
      expect(afterUpdate).toHaveLength(1);
      expect(afterUpdate[0].body).toContain("n-updated");

      await deleteDateEntry(created.loca);
      expect(await getAllDateEntries()).toEqual([]);

      const history = await listCpHistory({ repoGuid, pageSize: 50 });
      const address = `${repoGuid}/${created.loca}`;
      const events = history.items.filter((e) => e.address === address).sort((a, b) => a.version - b.version);
      expect(events.map((e) => e.operationType)).toEqual(["insert", "update", "delete"]);
    });
  });

  it("Daily Entry: create -> update -> delete each work, and produce exactly one insert/update/delete cp_history event", async () => {
    const repoGuid = randomUUID();
    await runWithRepoContext({ repoGuid, username: "story81-test" }, async () => {
      const existing = await getAllDailyEntries();
      expect(existing).toEqual([]);

      const name = generateEntryName(existing.map((e) => e.itemName));
      const created = await saveDailyEntry(name, yaml({ DATE: "2026-01-20", STATE: "City" }));
      expect(created.success).toBe(true);

      await updateDailyEntry(created.loca, yaml({ DATE: "2026-01-21", STATE: "City-updated" }));
      const afterUpdate = await getAllDailyEntries();
      expect(afterUpdate).toHaveLength(1);
      expect(afterUpdate[0].body).toContain("City-updated");

      await deleteDailyEntry(created.loca);
      expect(await getAllDailyEntries()).toEqual([]);

      const history = await listCpHistory({ repoGuid, pageSize: 50 });
      const address = `${repoGuid}/${created.loca}`;
      const events = history.items.filter((e) => e.address === address).sort((a, b) => a.version - b.version);
      expect(events.map((e) => e.operationType)).toEqual(["insert", "update", "delete"]);
    });
  });
});
