/**
 * Real-Postgres integration tests for `PostgresCpProvider` (Story 80) —
 * repo isolation, duplicate-child-name detection, and `createChild`
 * concurrency (advisory-lock-based allocation, no counter table). Mirrors
 * the coverage `mongo-cp-provider.test.ts` has for the equivalent Mongo
 * behaviors. Every test uses its own fresh, random repoGuid — see
 * `mutate-postgres.test.ts`'s file header for why (cp_history is
 * database-enforced append-only, so no cleanup-by-delete between tests).
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.POSTGRES_URI =
  process.env.POSTGRES_URI ?? "postgres://chad:chad@localhost:5433/chad_test_story80_mutate";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { withPostgresClient, closePostgresConnection } from "../postgres.js";
import { PostgresCpProvider, DuplicateChildNameError, AddressConflictError } from "./postgres-cp-provider.js";
import type { CpItem } from "../cp-model.js";

function freshRepo(): string {
  return randomUUID();
}

async function ensureSchema(): Promise<void> {
  await withPostgresClient(async (client) => {
    const { rows } = await client.query("SELECT to_regclass('cp_items') AS reg");
    if (rows[0].reg) return;
    const sqlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "sql", "migrations", "0001_init.sql");
    const sql = await readFile(sqlPath, "utf8");
    await client.query(sql);
  });
}

const provider = new PostgresCpProvider();

function rootItem(repo: string): CpItem {
  const id = randomUUID();
  return { _id: id, config: { id, address: repo, type: "Folder", name: "root" }, body: "" };
}

beforeAll(async () => {
  await ensureSchema();
});

afterAll(async () => {
  await withPostgresClient((client) => client.query("TRUNCATE cp_history, cp_items"));
  await closePostgresConnection();
});

describe("PostgresCpProvider — getItem repo isolation", () => {
  it("getItem by id returns null when expectedRepoGuid doesn't match the item's own repo", async () => {
    const repo = freshRepo();
    const root = rootItem(repo);
    await provider.executeWrite({ kind: "put-item", operationId: randomUUID(), createdAt: new Date().toISOString(), actor: null, item: root });

    const wrongRepo = freshRepo();
    const result = await provider.getItem({ id: root._id }, wrongRepo);
    expect(result).toBeNull();

    const correct = await provider.getItem({ id: root._id }, repo);
    expect(correct?._id).toBe(root._id);
  });

  it("a repoGuid that is a string-prefix of another repo's GUID is not treated as a match", async () => {
    const repo = freshRepo();
    const root = rootItem(repo);
    await provider.executeWrite({ kind: "put-item", operationId: randomUUID(), createdAt: new Date().toISOString(), actor: null, item: root });

    const prefixOnly = repo.slice(0, repo.length - 4);
    const result = await provider.getItem({ id: root._id }, prefixOnly);
    expect(result).toBeNull();
  });
});

describe("PostgresCpProvider — getByNames2 duplicate detection", () => {
  it("throws DuplicateChildNameError when two siblings share a name, never silently picking one", async () => {
    const repo = freshRepo();
    const root = rootItem(repo);
    await provider.executeWrite({ kind: "put-item", operationId: randomUUID(), createdAt: new Date().toISOString(), actor: null, item: root });

    // Two DIFFERENT children with the SAME name under the same parent —
    // simulating a data-integrity incident, not going through the normal
    // find-or-create createChild path (which would prevent this).
    for (const suffix of ["01", "02"]) {
      const childId = randomUUID();
      const address = `${repo}/${suffix}`;
      await provider.executeWrite({
        kind: "put-item",
        operationId: randomUUID(),
        createdAt: new Date().toISOString(),
        actor: null,
        item: { _id: childId, config: { id: childId, address, type: "Folder", name: "dup" }, body: "" },
      });
    }

    await expect(provider.getByNames2({ repoGuid: repo, loca: "", names: ["dup"] })).rejects.toBeInstanceOf(DuplicateChildNameError);
  });
});

describe("PostgresCpProvider — createChild", () => {
  it("find-or-create: creating the same name twice returns the same item, alreadyExisted the second time", async () => {
    const repo = freshRepo();
    const root = rootItem(repo);
    await provider.executeWrite({ kind: "put-item", operationId: randomUUID(), createdAt: new Date().toISOString(), actor: null, item: root });

    const first = await provider.executeWrite({
      kind: "create-child-item",
      operationId: randomUUID(),
      createdAt: new Date().toISOString(),
      actor: null,
      parentItemId: root._id,
      parentAddress: repo,
      name: "daily",
      type: "Folder",
      body: "",
      item: null,
    });
    expect(first.alreadyExisted).toBe(false);

    const second = await provider.executeWrite({
      kind: "create-child-item",
      operationId: randomUUID(),
      createdAt: new Date().toISOString(),
      actor: null,
      parentItemId: root._id,
      parentAddress: repo,
      name: "daily",
      type: "Folder",
      body: "",
      item: null,
    });
    expect(second.alreadyExisted).toBe(true);
    expect(second.item._id).toBe(first.item._id);
  });

  it("concurrent createChild calls with the SAME name never create two items (advisory lock serializes allocation)", async () => {
    const repo = freshRepo();
    const root = rootItem(repo);
    await provider.executeWrite({ kind: "put-item", operationId: randomUUID(), createdAt: new Date().toISOString(), actor: null, item: root });

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        provider.executeWrite({
          kind: "create-child-item",
          operationId: randomUUID(),
          createdAt: new Date().toISOString(),
          actor: null,
          parentItemId: root._id,
          parentAddress: repo,
          name: "same-name",
          type: "Folder",
          body: "",
          item: null,
        })
      )
    );

    const distinctIds = new Set(results.map((r) => r.item._id));
    expect(distinctIds.size).toBe(1); // exactly one item, regardless of race

    const children = await provider.getChildren(repo);
    expect(children).toHaveLength(1);
  });

  it("concurrent createChild calls with DIFFERENT names get unique addresses with no gaps", async () => {
    const repo = freshRepo();
    const root = rootItem(repo);
    await provider.executeWrite({ kind: "put-item", operationId: randomUUID(), createdAt: new Date().toISOString(), actor: null, item: root });

    const names = ["alpha", "beta", "gamma", "delta", "epsilon"];
    const results = await Promise.all(
      names.map((name) =>
        provider.executeWrite({
          kind: "create-child-item",
          operationId: randomUUID(),
          createdAt: new Date().toISOString(),
          actor: null,
          parentItemId: root._id,
          parentAddress: repo,
          name,
          type: "Folder",
          body: "",
          item: null,
        })
      )
    );

    const addresses = results.map((r) => r.item.config.address).sort();
    const expected = [1, 2, 3, 4, 5].map((n) => `${repo}/0${n}`).sort();
    expect(addresses).toEqual(expected); // unique, contiguous, no gaps

    const children = await provider.getChildren(repo);
    expect(children).toHaveLength(5);
  });
});

describe("PostgresCpProvider — putItem address conflict", () => {
  it("a second, different id claiming the same address is rejected as AddressConflictError", async () => {
    const repo = freshRepo();
    const address = `${repo}/01`;
    const firstId = randomUUID();
    await provider.executeWrite({
      kind: "put-item",
      operationId: randomUUID(),
      createdAt: new Date().toISOString(),
      actor: null,
      item: { _id: firstId, config: { id: firstId, address, type: "Text", name: "n1" }, body: "first" },
    });

    const secondId = randomUUID();
    await expect(
      provider.executeWrite({
        kind: "put-item",
        operationId: randomUUID(),
        createdAt: new Date().toISOString(),
        actor: null,
        item: { _id: secondId, config: { id: secondId, address, type: "Text", name: "n1-conflict" }, body: "second" },
      })
    ).rejects.toBeInstanceOf(AddressConflictError);
  });
});
