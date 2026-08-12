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

describe("PostgresCpProvider — moveItem", () => {
  it("reparents an item and its whole subtree, rewriting every descendant's address", async () => {
    const repo = freshRepo();
    const root = rootItem(repo);
    await provider.executeWrite({ kind: "put-item", operationId: randomUUID(), createdAt: new Date().toISOString(), actor: null, item: root });

    const sourceId = randomUUID();
    const source = { _id: sourceId, config: { id: sourceId, address: `${repo}/01`, type: "Folder", name: "knowledge" }, body: "" };
    const childId = randomUUID();
    const child = { _id: childId, config: { id: childId, address: `${repo}/01/01`, type: "Folder", name: "Verbal Game" }, body: "" };
    const grandchildId = randomUUID();
    const grandchild = { _id: grandchildId, config: { id: grandchildId, address: `${repo}/01/01/01`, type: "Text", name: "doc" }, body: "hello" };
    const targetId = randomUUID();
    const target = { _id: targetId, config: { id: targetId, address: `${repo}/02`, type: "Folder", name: "tematy" }, body: "" };
    for (const item of [source, child, grandchild, target]) {
      await provider.executeWrite({ kind: "put-item", operationId: randomUUID(), createdAt: new Date().toISOString(), actor: null, item });
    }

    const moved = await provider.moveItem(`${repo}/01`, `${repo}/02`);

    expect(moved._id).toBe(sourceId);
    expect(moved.config.name).toBe("knowledge");
    expect(moved.config.address).toBe(`${repo}/02/01`);

    expect(await provider.getItem({ address: `${repo}/01` })).toBeNull(); // gone from the old address
    const movedChild = await provider.getItem({ id: childId });
    expect(movedChild?.config.address).toBe(`${repo}/02/01/01`);
    const movedGrandchild = await provider.getItem({ id: grandchildId });
    expect(movedGrandchild?.config.address).toBe(`${repo}/02/01/01/01`);
    expect(movedGrandchild?.body).toBe("hello"); // body untouched by the address rewrite

    const targetChildren = await provider.getChildren(`${repo}/02`);
    expect(targetChildren.map((c) => c.config.name)).toEqual(["knowledge"]);
  });

  it("rejects moving onto a target with an existing same-named child (never a silent overwrite)", async () => {
    const repo = freshRepo();
    const root = rootItem(repo);
    await provider.executeWrite({ kind: "put-item", operationId: randomUUID(), createdAt: new Date().toISOString(), actor: null, item: root });

    const itemId = randomUUID();
    const item = { _id: itemId, config: { id: itemId, address: `${repo}/01`, type: "Text", name: "notes" }, body: "" };
    const targetId = randomUUID();
    const target = { _id: targetId, config: { id: targetId, address: `${repo}/02`, type: "Folder", name: "target" }, body: "" };
    const clashId = randomUUID();
    const clash = { _id: clashId, config: { id: clashId, address: `${repo}/02/01`, type: "Text", name: "notes" }, body: "" };
    for (const i of [item, target, clash]) {
      await provider.executeWrite({ kind: "put-item", operationId: randomUUID(), createdAt: new Date().toISOString(), actor: null, item: i });
    }

    await expect(provider.moveItem(`${repo}/01`, `${repo}/02`)).rejects.toThrow(/already exists/);
  });

  it("rejects moving to a target address that doesn't exist", async () => {
    const repo = freshRepo();
    const root = rootItem(repo);
    await provider.executeWrite({ kind: "put-item", operationId: randomUUID(), createdAt: new Date().toISOString(), actor: null, item: root });

    const itemId = randomUUID();
    const item = { _id: itemId, config: { id: itemId, address: `${repo}/01`, type: "Text", name: "notes" }, body: "" };
    await provider.executeWrite({ kind: "put-item", operationId: randomUUID(), createdAt: new Date().toISOString(), actor: null, item });

    await expect(provider.moveItem(`${repo}/01`, `${repo}/99`)).rejects.toThrow(/no longer exists/);
  });

  it("concurrent moves of different items into the SAME target get unique addresses with no gaps", async () => {
    const repo = freshRepo();
    const root = rootItem(repo);
    await provider.executeWrite({ kind: "put-item", operationId: randomUUID(), createdAt: new Date().toISOString(), actor: null, item: root });

    const targetId = randomUUID();
    const target = { _id: targetId, config: { id: targetId, address: `${repo}/50`, type: "Folder", name: "target" }, body: "" };
    await provider.executeWrite({ kind: "put-item", operationId: randomUUID(), createdAt: new Date().toISOString(), actor: null, item: target });

    const names = ["alpha", "beta", "gamma", "delta", "epsilon"];
    const sourceItems = names.map((name, i) => {
      const id = randomUUID();
      return { _id: id, config: { id, address: `${repo}/${10 + i}`, type: "Folder" as const, name }, body: "" };
    });
    for (const item of sourceItems) {
      await provider.executeWrite({ kind: "put-item", operationId: randomUUID(), createdAt: new Date().toISOString(), actor: null, item });
    }

    const moved = await Promise.all(sourceItems.map((item) => provider.moveItem(item.config.address, `${repo}/50`)));

    const addresses = moved.map((m) => m.config.address).sort();
    const expected = [1, 2, 3, 4, 5].map((n) => `${repo}/50/0${n}`).sort();
    expect(addresses).toEqual(expected);

    const children = await provider.getChildren(`${repo}/50`);
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
