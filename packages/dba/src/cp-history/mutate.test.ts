/**
 * Real-Mongo integration tests for `executeCpMutationWithHistory` (Story
 * 79) — against the local `chad-mongodb-local-mac-docker` single-node
 * `rs0` (already required for Change Streams since Story 74; Story 79
 * repurposes the same replica set for multi-document transactions), using
 * a dedicated scratch database. No child process/worker to spawn or
 * restart here (unlike the retired `packages/history-worker`'s own
 * `worker-process.test.mjs`) — `executeCpMutationWithHistory` is a plain
 * async function called directly against real Mongo, which is itself part
 * of the proof that no separate process/shadow-state is needed anymore.
 *
 * Run: `MONGODB_URI` must point at a real replica-set-enabled MongoDB
 * (defaults below to the local dev stack from docker-compose.local.yml).
 */
import { randomUUID } from "node:crypto";

process.env.MONGODB_URI =
  process.env.MONGODB_URI ?? "mongodb://localhost:27017/chad_test_story79_mutate?directConnection=true";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getMongoDb, closeMongoConnection } from "../mongo.js";
import {
  executeCpMutationWithHistory,
  ensureCpHistoryIndexes,
  CpHistoryVersionConflictError,
  CpItemAlreadyDeletedError,
  CpItemNotMigratedError,
  CpMutationIdReusedError,
  HISTORY_SNAPSHOT_INTERVAL,
  type CpHistoryDoc,
  type CpItemDoc,
} from "./mutate.js";
import { hashCpState } from "./hash.js";
import type { Db } from "mongodb";

const REPO = "mutate-test-repo-cccccccc-3333-3333-3333-333333333333";

let db: Db;

function itemsCol() {
  return db.collection<CpItemDoc>("cp_items");
}

function historyCol() {
  return db.collection<CpHistoryDoc>("cp_history");
}

function freshItemId(): string {
  return randomUUID();
}

function ctx(overrides: Partial<Parameters<typeof executeCpMutationWithHistory>[2]> = {}) {
  return {
    actor: { username: "alice", repoGuid: REPO },
    requestId: null,
    ...overrides,
  };
}

beforeAll(async () => {
  db = await getMongoDb();
  // In the real app, MongoCpProvider.ensureIndexes() creates both of these
  // before any write ever happens — replicated here since these tests call
  // executeCpMutationWithHistory directly, bypassing MongoCpProvider.
  await itemsCol().createIndex({ "config.address": 1 }, { unique: true });
  await ensureCpHistoryIndexes(db);
});

beforeEach(async () => {
  await historyCol().deleteMany({ repoGuid: REPO });
  await itemsCol().deleteMany({ "config.address": { $regex: `^${REPO}` } });
});

afterAll(async () => {
  await historyCol().deleteMany({ repoGuid: REPO });
  await itemsCol().deleteMany({ "config.address": { $regex: `^${REPO}` } });
  await closeMongoConnection();
});

describe("executeCpMutationWithHistory — insert", () => {
  it("creates cp_items and exactly one cp_history doc, version 1, correct hashes", async () => {
    const itemId = freshItemId();
    const address = `${REPO}/01`;
    const mutationId = randomUUID();

    const result = await executeCpMutationWithHistory(
      mutationId,
      { kind: "put", itemId, config: { id: itemId, address, type: "Text", name: "n1" }, body: "hello" },
      ctx()
    );

    expect(result.historyDoc.version).toBe(1);
    expect(result.historyDoc.operationType).toBe("insert");
    expect(result.historyDoc.beforeHash).toBeNull();
    expect(result.historyDoc.afterHash).toBe(hashCpState(result.item!.config, result.item!.body));
    expect(result.historyDoc.afterSnapshot).not.toBeNull();
    expect(result.historyDoc.actor).toEqual({ username: "alice", repoGuid: REPO, kind: "user" });

    const itemDoc = await itemsCol().findOne({ _id: itemId });
    expect(itemDoc?._historyVersion).toBe(1);
    expect(itemDoc?._lastMutationId).toBe(mutationId);

    const historyCount = await historyCol().countDocuments({ sourceId: itemId });
    expect(historyCount).toBe(1);
  });

  it("system actor when no actor is provided", async () => {
    const itemId = freshItemId();
    const result = await executeCpMutationWithHistory(
      randomUUID(),
      { kind: "put", itemId, config: { id: itemId, address: `${REPO}/02`, type: "Text", name: "n2" }, body: "" },
      { actor: null, requestId: null }
    );
    expect(result.historyDoc.actor.kind).toBe("system");
    expect(result.historyDoc.actor.username).toBe("system");
  });
});

describe("executeCpMutationWithHistory — update", () => {
  it("creates exactly one new event, increments version by 1, and preserves the hash chain", async () => {
    const itemId = freshItemId();
    const address = `${REPO}/03`;
    const insertResult = await executeCpMutationWithHistory(
      randomUUID(),
      { kind: "put", itemId, config: { id: itemId, address, type: "Text", name: "n3" }, body: "v1" },
      ctx()
    );

    const updateResult = await executeCpMutationWithHistory(
      randomUUID(),
      { kind: "put", itemId, config: { id: itemId, address, type: "Text", name: "n3" }, body: "v2" },
      ctx()
    );

    expect(updateResult.historyDoc.version).toBe(2);
    expect(updateResult.historyDoc.operationType).toBe("update");
    expect(updateResult.historyDoc.beforeHash).toBe(insertResult.historyDoc.afterHash);

    const historyCount = await historyCol().countDocuments({ sourceId: itemId });
    expect(historyCount).toBe(2);

    // created preserved across the update. (`modified` is NOT asserted to
    // differ here: formatCpTimestamp's CP-convention precision is whole
    // seconds — YYMMDD_HHMMSS, pre-existing since Story 72, unrelated to
    // Story 79 — so two operations inside the same wall-clock second
    // legitimately produce an identical `modified` string.)
    expect(updateResult.item!.config.created).toBe(insertResult.item!.config.created);
  });

  it("does not require any in-memory/shadow state across independent calls — beforeHash/version are always read fresh from Mongo", async () => {
    const itemId = freshItemId();
    const address = `${REPO}/04`;
    const r1 = await executeCpMutationWithHistory(
      randomUUID(),
      { kind: "put", itemId, config: { id: itemId, address, type: "Text", name: "n4" }, body: "a" },
      ctx()
    );
    // Each call below is a fully independent invocation — nothing shared in
    // closure/module state between them beyond the Mongo connection itself,
    // simulating what would otherwise require a "restart" in the retired
    // Change-Stream worker's in-memory-cache design.
    const r2 = await executeCpMutationWithHistory(
      randomUUID(),
      { kind: "put", itemId, config: { id: itemId, address, type: "Text", name: "n4" }, body: "b" },
      ctx()
    );
    const r3 = await executeCpMutationWithHistory(
      randomUUID(),
      { kind: "put", itemId, config: { id: itemId, address, type: "Text", name: "n4" }, body: "c" },
      ctx()
    );

    expect([r1.historyDoc.version, r2.historyDoc.version, r3.historyDoc.version]).toEqual([1, 2, 3]);
    expect(r2.historyDoc.beforeHash).toBe(r1.historyDoc.afterHash);
    expect(r3.historyDoc.beforeHash).toBe(r2.historyDoc.afterHash);
  });

  it("takes a full afterSnapshot every HISTORY_SNAPSHOT_INTERVAL-th version, diff-only otherwise", async () => {
    const itemId = freshItemId();
    const address = `${REPO}/05`;
    let last: Awaited<ReturnType<typeof executeCpMutationWithHistory>> | null = null;
    for (let i = 0; i < HISTORY_SNAPSHOT_INTERVAL + 1; i++) {
      last = await executeCpMutationWithHistory(
        randomUUID(),
        { kind: "put", itemId, config: { id: itemId, address, type: "Text", name: "n5" }, body: `v${i}` },
        ctx()
      );
      if (i > 0 && i < HISTORY_SNAPSHOT_INTERVAL - 1) {
        expect(last.historyDoc.afterSnapshot).toBeNull();
      }
    }
    // Version HISTORY_SNAPSHOT_INTERVAL (the Nth update after the insert)
    // must carry a full snapshot.
    const nthVersionDoc = await db
      .collection<CpHistoryDoc>("cp_history")
      .findOne({ sourceId: itemId, version: HISTORY_SNAPSHOT_INTERVAL });
    expect(nthVersionDoc?.afterSnapshot).not.toBeNull();
  });

  it("rejects with a version conflict when expectedVersion doesn't match, without mutating anything", async () => {
    const itemId = freshItemId();
    const address = `${REPO}/06`;
    await executeCpMutationWithHistory(
      randomUUID(),
      { kind: "put", itemId, config: { id: itemId, address, type: "Text", name: "n6" }, body: "v1" },
      ctx()
    );

    await expect(
      executeCpMutationWithHistory(
        randomUUID(),
        { kind: "put", itemId, config: { id: itemId, address, type: "Text", name: "n6" }, body: "v2", expectedVersion: 5 },
        ctx()
      )
    ).rejects.toBeInstanceOf(CpHistoryVersionConflictError);

    const historyCount = await historyCol().countDocuments({ sourceId: itemId });
    expect(historyCount).toBe(1); // no new event from the rejected attempt
  });
});

describe("executeCpMutationWithHistory — delete", () => {
  it("removes cp_items, creates one event with a snapshot and afterHash null", async () => {
    const itemId = freshItemId();
    const address = `${REPO}/07`;
    const insertResult = await executeCpMutationWithHistory(
      randomUUID(),
      { kind: "put", itemId, config: { id: itemId, address, type: "Text", name: "n7" }, body: "content" },
      ctx()
    );

    const deleteResult = await executeCpMutationWithHistory(randomUUID(), { kind: "delete", itemId }, ctx());

    expect(deleteResult.item).toBeNull();
    expect(deleteResult.historyDoc.operationType).toBe("delete");
    expect(deleteResult.historyDoc.version).toBe(2);
    expect(deleteResult.historyDoc.afterHash).toBeNull();
    expect(deleteResult.historyDoc.beforeHash).toBe(insertResult.historyDoc.afterHash);
    expect(deleteResult.historyDoc.afterSnapshot).toEqual({
      config: insertResult.item!.config,
      body: insertResult.item!.body,
    });
    expect(deleteResult.historyDoc.address).toBe(address);
    expect(deleteResult.historyDoc.actor.username).toBe("alice");

    const stillThere = await itemsCol().findOne({ _id: itemId });
    expect(stillThere).toBeNull();
  });

  it("a second delete of the same item does not fabricate a duplicate event", async () => {
    const itemId = freshItemId();
    const address = `${REPO}/08`;
    await executeCpMutationWithHistory(
      randomUUID(),
      { kind: "put", itemId, config: { id: itemId, address, type: "Text", name: "n8" }, body: "x" },
      ctx()
    );
    await executeCpMutationWithHistory(randomUUID(), { kind: "delete", itemId }, ctx());

    await expect(executeCpMutationWithHistory(randomUUID(), { kind: "delete", itemId }, ctx())).rejects.toBeInstanceOf(
      CpItemAlreadyDeletedError
    );

    const historyCount = await historyCol().countDocuments({ sourceId: itemId });
    expect(historyCount).toBe(2); // insert + delete only, no phantom second delete
  });
});

describe("executeCpMutationWithHistory — atomicity", () => {
  it("a forced cp_history insert failure (sourceId+version collision) leaves cp_items completely unchanged", async () => {
    const itemId = freshItemId();
    const address = `${REPO}/09`;

    // Pre-plant a DIFFERENT cp_history doc (different _id/mutationId — NOT
    // the mutationId-reuse case, covered separately below) that already
    // occupies (sourceId: itemId, version: 1) — this trips the real
    // {sourceId,version} unique index inside the transaction's own
    // historyCol.insertOne, forcing a genuine rollback.
    await historyCol().insertOne({
      _id: randomUUID(),
      mutationId: randomUUID(),
      requestId: null,
      sourceCollection: "cp_items",
      sourceId: itemId,
      repoGuid: REPO,
      address,
      itemName: "n9",
      version: 1,
      operationType: "insert",
      actor: { username: "system", repoGuid: REPO, kind: "system" },
      changedAt: new Date(),
      beforeHash: null,
      afterHash: "planted",
      changes: { config: [], body: null },
      metadata: {},
    } as CpHistoryDoc);

    await expect(
      executeCpMutationWithHistory(
        randomUUID(),
        { kind: "put", itemId, config: { id: itemId, address, type: "Text", name: "n9" }, body: "should not persist" },
        ctx()
      )
    ).rejects.toThrow();

    const itemDoc = await itemsCol().findOne({ _id: itemId });
    expect(itemDoc).toBeNull(); // the cp_items write must have been rolled back with the transaction
  });

  it("reusing a mutationId for a different item is rejected, never silently treated as an idempotent replay of the wrong item", async () => {
    const firstId = freshItemId();
    const mutationId = randomUUID();
    await executeCpMutationWithHistory(
      mutationId,
      { kind: "put", itemId: firstId, config: { id: firstId, address: `${REPO}/09b`, type: "Text", name: "first" }, body: "x" },
      ctx()
    );

    const secondId = freshItemId();
    await expect(
      executeCpMutationWithHistory(
        mutationId,
        { kind: "put", itemId: secondId, config: { id: secondId, address: `${REPO}/09c`, type: "Text", name: "second" }, body: "y" },
        ctx()
      )
    ).rejects.toBeInstanceOf(CpMutationIdReusedError);

    const secondDoc = await itemsCol().findOne({ _id: secondId });
    expect(secondDoc).toBeNull();
  });

  it("a forced cp_items write failure (address conflict) creates no history event", async () => {
    const address = `${REPO}/10`;
    const firstId = freshItemId();
    await executeCpMutationWithHistory(
      randomUUID(),
      { kind: "put", itemId: firstId, config: { id: firstId, address, type: "Text", name: "n10" }, body: "first" },
      ctx()
    );

    // A second, different _id trying to claim the SAME address hits
    // cp_items' unique config.address index during the transaction.
    const secondId = freshItemId();
    const mutationId = randomUUID();
    await expect(
      executeCpMutationWithHistory(
        mutationId,
        { kind: "put", itemId: secondId, config: { id: secondId, address, type: "Text", name: "n10-conflict" }, body: "second" },
        ctx()
      )
    ).rejects.toThrow();

    const historyForFailedMutation = await historyCol().findOne({ _id: mutationId });
    expect(historyForFailedMutation).toBeNull();
    const historyForSecondId = await historyCol().countDocuments({ sourceId: secondId });
    expect(historyForSecondId).toBe(0);
  });
});

describe("executeCpMutationWithHistory — idempotency and concurrency", () => {
  it("retrying the same mutationId twice produces exactly one event and one version", async () => {
    const itemId = freshItemId();
    const address = `${REPO}/11`;
    const mutationId = randomUUID();
    const input = { kind: "put" as const, itemId, config: { id: itemId, address, type: "Text", name: "n11" }, body: "x" };

    const first = await executeCpMutationWithHistory(mutationId, input, ctx());
    const retry = await executeCpMutationWithHistory(mutationId, input, ctx());

    expect(retry.idempotentReplay).toBe(true);
    expect(retry.historyDoc._id).toBe(first.historyDoc._id);
    expect(retry.historyDoc.version).toBe(first.historyDoc.version);

    const historyCount = await historyCol().countDocuments({ sourceId: itemId });
    expect(historyCount).toBe(1);
    const itemDoc = await itemsCol().findOne({ _id: itemId });
    expect(itemDoc?._historyVersion).toBe(1);
  });

  it("two concurrent updates to the same item never produce the same version", async () => {
    const itemId = freshItemId();
    const address = `${REPO}/12`;
    await executeCpMutationWithHistory(
      randomUUID(),
      { kind: "put", itemId, config: { id: itemId, address, type: "Text", name: "n12" }, body: "base" },
      ctx()
    );

    const [a, b] = await Promise.all([
      executeCpMutationWithHistory(
        randomUUID(),
        { kind: "put", itemId, config: { id: itemId, address, type: "Text", name: "n12" }, body: "from-a" },
        ctx({ actor: { username: "alice", repoGuid: REPO } })
      ),
      executeCpMutationWithHistory(
        randomUUID(),
        { kind: "put", itemId, config: { id: itemId, address, type: "Text", name: "n12" }, body: "from-b" },
        ctx({ actor: { username: "bob", repoGuid: REPO } })
      ),
    ]);

    expect(a.historyDoc.version).not.toBe(b.historyDoc.version);
    expect([a.historyDoc.version, b.historyDoc.version].sort()).toEqual([2, 3]);

    const historyCount = await historyCol().countDocuments({ sourceId: itemId });
    expect(historyCount).toBe(3); // insert + two concurrent updates, no lost update
  });
});

describe("executeCpMutationWithHistory — pre-Story-79 (unmigrated) data", () => {
  it("refuses to silently guess a starting version for a document with no _historyVersion", async () => {
    const itemId = freshItemId();
    const address = `${REPO}/13`;
    await itemsCol().insertOne({
      _id: itemId,
      config: { id: itemId, address, type: "Text", name: "legacy", created: "x", modified: "x" },
      body: "pre-existing",
      // deliberately no _historyVersion — simulates data written before Story 79
    });

    await expect(
      executeCpMutationWithHistory(
        randomUUID(),
        { kind: "put", itemId, config: { id: itemId, address, type: "Text", name: "legacy" }, body: "edited" },
        ctx()
      )
    ).rejects.toBeInstanceOf(CpItemNotMigratedError);

    const historyCount = await historyCol().countDocuments({ sourceId: itemId });
    expect(historyCount).toBe(0);
  });
});
