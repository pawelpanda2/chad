/**
 * Real-Postgres integration tests for `resolveCpItemByIdForUser` — the
 * shared Preview CP-link's server-side id→address resolver. Same
 * convention as `data-providers/postgres-cp-provider.test.ts` (fresh random
 * repoGuid per test, real local Postgres via `POSTGRES_URI`).
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.POSTGRES_URI =
  process.env.POSTGRES_URI ?? "postgres://chad:chad@localhost:5433/chad_test_story119_cp_link";
process.env.DBA_PRIMARY_BACKEND = process.env.DBA_PRIMARY_BACKEND ?? "postgres";
process.env.DBA_POSTGRES_ENABLED = process.env.DBA_POSTGRES_ENABLED ?? "true";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { withPostgresClient, closePostgresConnection } from "./postgres.js";
import { PostgresCpProvider } from "./data-providers/postgres-cp-provider.js";
import type { CpItem } from "./cp-model.js";
import { resolveCpItemByIdForUser } from "./cp-link-resolver.js";
import { CHAD_SHARED_REPO_GUID } from "./knowledge.js";

async function ensureSchema(): Promise<void> {
  await withPostgresClient(async (client) => {
    const { rows } = await client.query("SELECT to_regclass('cp_items') AS reg");
    if (rows[0].reg) return;
    const sqlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "sql", "migrations", "0001_init.sql");
    const sql = await readFile(sqlPath, "utf8");
    await client.query(sql);
  });
}

const provider = new PostgresCpProvider();

function freshRepo(): string {
  return randomUUID();
}

async function putRoot(repo: string, name = "root"): Promise<CpItem> {
  const id = randomUUID();
  const item: CpItem = { _id: id, config: { id, address: repo, type: "Folder", name }, body: "" };
  await provider.executeWrite({
    kind: "put-item",
    operationId: randomUUID(),
    createdAt: new Date().toISOString(),
    actor: null,
    item,
  });
  return item;
}

beforeAll(async () => {
  await ensureSchema();
});

afterAll(async () => {
  await withPostgresClient((client) => client.query("TRUNCATE cp_history, cp_items"));
  await closePostgresConnection();
});

describe("resolveCpItemByIdForUser", () => {
  it("resolves an item that lives in the user's own repo", async () => {
    const repo = freshRepo();
    const item = await putRoot(repo, "my-item");

    const result = await resolveCpItemByIdForUser({ repoGuid: repo, username: "u1" }, item._id);

    expect(result).toEqual({ repoGuid: repo, loca: "", name: "my-item", type: "Folder" });
  });

  it("resolves an item that lives in chad_shared", async () => {
    // Real chad_shared root may already exist from other test runs / real
    // data — find-or-reuse instead of assuming a clean root.
    const existing = await provider.getItem({ address: CHAD_SHARED_REPO_GUID });
    const sharedRoot = existing ?? (await putRoot(CHAD_SHARED_REPO_GUID, "chad_shared"));

    const result = await resolveCpItemByIdForUser(
      { repoGuid: freshRepo(), username: "u2" },
      sharedRoot._id
    );

    expect(result?.repoGuid).toBe(CHAD_SHARED_REPO_GUID);
  });

  it("returns null for an item that belongs to a different, non-shared repo (cross-user isolation)", async () => {
    const ownerRepo = freshRepo();
    const item = await putRoot(ownerRepo, "someone-elses-item");

    const otherUsersRepo = freshRepo();
    const result = await resolveCpItemByIdForUser({ repoGuid: otherUsersRepo, username: "attacker" }, item._id);

    expect(result).toBeNull();
  });

  it("returns null (never throws) for a well-formed but nonexistent id", async () => {
    const result = await resolveCpItemByIdForUser({ repoGuid: freshRepo(), username: "u3" }, randomUUID());
    expect(result).toBeNull();
  });
});
