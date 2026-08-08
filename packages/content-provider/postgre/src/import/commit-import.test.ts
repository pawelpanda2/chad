/**
 * Real-Postgres test for the atomic import-commit transaction (Story 109),
 * exercised directly at the cp-postgre level — this package's own client
 * (client.ts) connects via CP_POSTGRE_URI/POSTGRES_URI directly, unlike
 * packages/dba's own postgres.ts (which routes through dev-db-override.ts
 * and, by design, always requires real QNAP/Tailscale credentials for its
 * "server" source — see ai-docs/databases/red-rules.md Rule 1). That
 * requirement is pre-existing and applies equally to several already-existing
 * dba `*-postgres.test.ts` files (confirmed independently of this Story),
 * not something this feature introduces — but it does mean the fully-glued
 * dba-level end-to-end test (packages/dba/src/cp-import.test.ts) can only
 * run on a machine with real QNAP/Tailscale access, not in a sandboxed
 * session. This test covers the same atomicity/conflict/rollback guarantees
 * one layer down, against the same local Postgres container, without that
 * dependency.
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { withPostgreClient, closePostgrePool } from "../client.js";
import { commitFolderImportPostgre } from "./commit-import.js";
import type { CpImportPlan } from "cp-core";

process.env.POSTGRES_URI = process.env.POSTGRES_URI ?? "postgres://chad:3662dfbcb4c2e9b439971406856b78e3@localhost:5433/chad_test_story109_import";
process.env.CP_POSTGRE_URI = process.env.POSTGRES_URI;

async function ensureSchema(): Promise<void> {
  await withPostgreClient(async (client) => {
    const { rows } = await client.query("SELECT to_regclass('cp_items') AS reg");
    if (rows[0].reg) return;
    const sqlPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "..",
      "..",
      "dba",
      "sql",
      "migrations",
      "0001_init.sql"
    );
    const sql = await readFile(sqlPath, "utf8");
    await client.query(sql);
  });
}

async function seedTargetFolder(repoGuid: string): Promise<string> {
  const now = new Date();
  await withPostgreClient(async (client) => {
    const rootId = randomUUID();
    const rootConfig = { id: rootId, address: repoGuid, type: "Folder", name: "root", created: now.toISOString(), modified: now.toISOString() };
    await client.query(
      `INSERT INTO cp_items (id, repo_guid, address, name, type, config, body, created_at, modified_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$8)`,
      [rootId, repoGuid, repoGuid, "root", "Folder", JSON.stringify(rootConfig), "", now]
    );
    const targetId = randomUUID();
    const targetAddress = `${repoGuid}/01`;
    const targetConfig = { id: targetId, address: targetAddress, type: "Folder", name: "Target", created: now.toISOString(), modified: now.toISOString() };
    await client.query(
      `INSERT INTO cp_items (id, repo_guid, address, name, type, config, body, created_at, modified_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$8)`,
      [targetId, repoGuid, targetAddress, "Target", "Folder", JSON.stringify(targetConfig), "", now]
    );
  });
  return `${repoGuid}/01`;
}

async function countChildren(parentAddress: string): Promise<number> {
  return withPostgreClient(async (client) => {
    const escaped = parentAddress.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM cp_items WHERE address ~ $1`, [`^${escaped}/[0-9]{2,3}$`]);
    return rows[0].n as number;
  });
}

beforeAll(async () => {
  await ensureSchema();
});

afterAll(async () => {
  await closePostgrePool();
});

function simplePlan(rootName: string, children: CpImportPlan["root"]["children"] = []): CpImportPlan {
  return {
    root: { sourcePath: "01", type: "Folder", name: rootName, body: "", extraConfig: {}, children },
    totalItemCount: 1 + children.length,
  };
}

describe("commitFolderImportPostgre — real Postgres transaction", () => {
  it("happy path: commits the whole subtree in one transaction", async () => {
    const repoGuid = randomUUID();
    const parentAddress = await seedTargetFolder(repoGuid);
    const plan = simplePlan("Imported", [
      { sourcePath: "01/02", type: "Text", name: "Note", body: "hello", extraConfig: {}, children: [] },
    ]);

    const result = await commitFolderImportPostgre({ repoGuid, parentAddress, plan, actor: { username: "tester", repoGuid } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.createdItemCount).toBe(2);
      expect(result.result.createdRootAddress).toBe(`${parentAddress}/01`);
    }

    const after = await countChildren(parentAddress);
    expect(after).toBe(1);
    const grandchildren = await countChildren(`${parentAddress}/01`);
    expect(grandchildren).toBe(1);
  });

  it("root-name conflict: rolls back, nothing added", async () => {
    const repoGuid = randomUUID();
    const parentAddress = await seedTargetFolder(repoGuid);

    const first = simplePlan("Dup");
    const ok1 = await commitFolderImportPostgre({ repoGuid, parentAddress, plan: first, actor: null });
    expect(ok1.ok).toBe(true);

    const second = simplePlan("Dup");
    const ok2 = await commitFolderImportPostgre({ repoGuid, parentAddress, plan: second, actor: null });
    expect(ok2.ok).toBe(false);
    if (!ok2.ok) expect(ok2.error.code).toBe("ROOT_NAME_CONFLICT");

    const after = await countChildren(parentAddress);
    expect(after).toBe(1); // only the first import's root — the conflicting second attempt added nothing
  });

  it("missing parent: fails cleanly, no crash", async () => {
    const repoGuid = randomUUID();
    const plan = simplePlan("Orphan");
    const result = await commitFolderImportPostgre({ repoGuid, parentAddress: `${repoGuid}/99`, plan, actor: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PARENT_NOT_FOUND");
  });

  it("parent not a Folder: rejected", async () => {
    const repoGuid = randomUUID();
    const now = new Date();
    const textAddress = `${repoGuid}/01`;
    await withPostgreClient(async (client) => {
      const rootId = randomUUID();
      await client.query(
        `INSERT INTO cp_items (id, repo_guid, address, name, type, config, body, created_at, modified_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$8)`,
        [rootId, repoGuid, repoGuid, "root", "Folder", JSON.stringify({ id: rootId, address: repoGuid, type: "Folder", name: "root" }), "", now]
      );
      const textId = randomUUID();
      await client.query(
        `INSERT INTO cp_items (id, repo_guid, address, name, type, config, body, created_at, modified_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$8)`,
        [textId, repoGuid, textAddress, "NotAFolder", "Text", JSON.stringify({ id: textId, address: textAddress, type: "Text", name: "NotAFolder" }), "hi", now]
      );
    });
    const result = await commitFolderImportPostgre({ repoGuid, parentAddress: textAddress, plan: simplePlan("X"), actor: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PARENT_NOT_FOLDER");
  });

  it("concurrent imports under the same parent both succeed with distinct indices (advisory lock serializes allocation)", async () => {
    const repoGuid = randomUUID();
    const parentAddress = await seedTargetFolder(repoGuid);

    const [r1, r2] = await Promise.all([
      commitFolderImportPostgre({ repoGuid, parentAddress, plan: simplePlan("First"), actor: null }),
      commitFolderImportPostgre({ repoGuid, parentAddress, plan: simplePlan("Second"), actor: null }),
    ]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.result.createdRootAddress).not.toBe(r2.result.createdRootAddress);
    }
    const after = await countChildren(parentAddress);
    expect(after).toBe(2);
  });
});
