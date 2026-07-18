/**
 * MongoCpProvider tests — run against a REAL local MongoDB instance, a
 * dedicated test-only database (Story 72 §25). See `data-outbox.test.ts`
 * header for the exact invocation (`MONGODB_URI` pointed at
 * `chad_test_story72`, never `beeper`/`chad`).
 *
 * Run via: npx tsc && node dist/data-providers/mongo-cp-provider.test.js
 */

import { getMongoDb, closeMongoConnection } from "../mongo.js";
import { MongoCpProvider, ITEMS_COLLECTION, FOLDER_CHILD_COUNTERS_COLLECTION, AddressConflictError } from "./mongo-cp-provider.js";
import { createTestClock } from "../data-clock.js";
import type { CpItem } from "../cp-model.js";
import type { PutItemCommand, CreateChildItemCommand } from "../data-commands.js";

const REPO = "21d11bdc-f1f4-44d1-b61a-3fa6b039c641";

function putCommand(item: CpItem): PutItemCommand {
  return { kind: "put-item", operationId: `op-${item._id}`, createdAt: new Date().toISOString(), item };
}

async function runTests() {
  console.log("Running MongoCpProvider Tests (real local MongoDB)...\n");
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (e) {
      console.log(`  ✗ ${name}`);
      console.log(`    Error: ${e}`);
      failed++;
    }
  }

  function assertEquals(actual: unknown, expected: unknown, message?: string) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
      throw new Error(`${message ?? "assertEquals failed"}: expected ${e}, got ${a}`);
    }
  }

  function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(message);
  }

  const db = await getMongoDb();
  await db.collection(ITEMS_COLLECTION).deleteMany({});
  await db.collection(FOLDER_CHILD_COUNTERS_COLLECTION).deleteMany({});

  const clock = createTestClock("2026-07-18T12:00:00.000Z");
  const provider = new MongoCpProvider(clock);
  await provider.ensureIndexes();

  await test("put-item inserts a new item", async () => {
    const item: CpItem = {
      _id: "item-1",
      config: { id: "item-1", address: `${REPO}/01`, type: "Text", name: "01" },
      body: "hello world",
    };
    const result = await provider.executeWrite(putCommand(item));
    assertEquals(result.alreadyExisted, false);
    assertEquals(result.item.body, "hello world");
    assertEquals(result.item.config.created, result.item.config.modified);
  });

  await test("getItem by id returns the inserted item", async () => {
    const found = await provider.getItem({ id: "item-1" });
    assert(found !== null, "item should be found");
    assertEquals(found!.config.address, `${REPO}/01`);
  });

  await test("getItem by address returns the inserted item", async () => {
    const found = await provider.getItem({ address: `${REPO}/01` });
    assert(found !== null, "item should be found");
    assertEquals(found!._id, "item-1");
  });

  await test("getItem returns null for an unknown id/address", async () => {
    assertEquals(await provider.getItem({ id: "nope" }), null);
    assertEquals(await provider.getItem({ address: `${REPO}/99` }), null);
  });

  await test("put-item update preserves created, refreshes modified", async () => {
    const originalCreated = (await provider.getItem({ id: "item-1" }))!.config.created;

    const laterClock = createTestClock("2026-07-18T13:00:00.000Z");
    const laterProvider = new MongoCpProvider(laterClock);
    const updated: CpItem = {
      _id: "item-1",
      config: { id: "item-1", address: `${REPO}/01`, type: "Text", name: "01" },
      body: "updated body",
    };
    const result = await laterProvider.executeWrite(putCommand(updated));

    assertEquals(result.alreadyExisted, true);
    assertEquals(result.item.config.created, originalCreated);
    assert(result.item.config.modified !== originalCreated, "modified should have changed");
    assertEquals(result.item.body, "updated body");
  });

  await test("custom config fields survive a round trip", async () => {
    const item: CpItem = {
      _id: "item-custom",
      config: {
        id: "item-custom",
        address: `${REPO}/02`,
        type: "Text",
        name: "02",
        googleDocId: "doc-abc",
        myAppSpecificFlag: true,
      },
      body: "x",
    };
    await provider.executeWrite(putCommand(item));
    const found = await provider.getItem({ id: "item-custom" });
    assertEquals(found!.config.googleDocId, "doc-abc");
    assertEquals(found!.config.myAppSpecificFlag, true);
  });

  await test("config.address is unique — a second _id at the same address is rejected", async () => {
    const conflicting: CpItem = {
      _id: "different-id",
      config: { id: "different-id", address: `${REPO}/01`, type: "Text", name: "01-conflict" },
      body: "x",
    };
    let threw = false;
    try {
      await provider.executeWrite(putCommand(conflicting));
    } catch (error) {
      threw = error instanceof AddressConflictError;
    }
    assert(threw, "expected an AddressConflictError");
  });

  await test("getByNames resolves a name path hierarchically (not a global name search)", async () => {
    // Build repo -> "leads" (Folder) -> "all items" (Folder)
    const leadsAddress = `${REPO}/03`;
    await provider.executeWrite(
      putCommand({ _id: "leads-folder", config: { id: "leads-folder", address: leadsAddress, type: "Folder", name: "leads" }, body: "" })
    );
    const allItemsAddress = `${leadsAddress}/01`;
    await provider.executeWrite(
      putCommand({ _id: "all-items-folder", config: { id: "all-items-folder", address: allItemsAddress, type: "Folder", name: "all items" }, body: "" })
    );
    // A DIFFERENT parent also has a child confusingly also named "leads" —
    // proves this isn't a global `find({name: "leads"})`.
    const otherParent = `${REPO}/04`;
    await provider.executeWrite(
      putCommand({ _id: "other-folder", config: { id: "other-folder", address: otherParent, type: "Folder", name: "unrelated" }, body: "" })
    );
    await provider.executeWrite(
      putCommand({ _id: "decoy-leads", config: { id: "decoy-leads", address: `${otherParent}/01`, type: "Folder", name: "leads" }, body: "" })
    );

    const found = await provider.getByNames({ repoGuid: REPO, names: ["leads", "all items"] });
    assert(found !== null, "should resolve leads/all items");
    assertEquals(found!._id, "all-items-folder");
  });

  await test("getByNames2 returns the full resolved trail", async () => {
    const trail = await provider.getByNames2({ repoGuid: REPO, loca: "", names: ["leads", "all items"] });
    assertEquals(trail.length, 2);
    assertEquals(trail[0]._id, "leads-folder");
    assertEquals(trail[1]._id, "all-items-folder");
  });

  await test("getByNames returns null when the path doesn't resolve", async () => {
    assertEquals(await provider.getByNames({ repoGuid: REPO, names: ["leads", "does not exist"] }), null);
  });

  await test("create-child-item allocates the next numeric address and a new id", async () => {
    const parentAddress = `${REPO}/10`;
    await provider.executeWrite(
      putCommand({ _id: "parent-10", config: { id: "parent-10", address: parentAddress, type: "Folder", name: "parent" }, body: "" })
    );

    const command: CreateChildItemCommand = {
      kind: "create-child-item",
      operationId: "op-create-1",
      createdAt: clock.now().toISOString(),
      parentItemId: "parent-10",
      parentAddress,
      name: "child-a",
      type: "Text",
      body: "child body",
      item: null,
    };
    const result = await provider.executeWrite(command);
    assertEquals(result.alreadyExisted, false);
    assertEquals(result.item.config.address, `${parentAddress}/01`);
    assertEquals(result.item.config.name, "child-a");
    assert(!!result.item._id, "new child should have an id");
  });

  await test("create-child-item is idempotent find-or-create by name — no duplicate on retry", async () => {
    const parentAddress = `${REPO}/10`;
    const command: CreateChildItemCommand = {
      kind: "create-child-item",
      operationId: "op-create-2",
      createdAt: clock.now().toISOString(),
      parentItemId: "parent-10",
      parentAddress,
      name: "child-a", // same name as the previous test
      type: "Text",
      body: "different body, should be ignored",
      item: null,
    };
    const result = await provider.executeWrite(command);
    assertEquals(result.alreadyExisted, true);
    assertEquals(result.item.config.address, `${parentAddress}/01`); // same address as before, not /02

    const siblingCount = await db
      .collection(ITEMS_COLLECTION)
      .countDocuments({ "config.address": { $regex: `^${parentAddress.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[0-9]{2,3}$` } });
    assertEquals(siblingCount, 1);
  });

  await test("create-child-item with a second distinct name allocates the next index", async () => {
    const parentAddress = `${REPO}/10`;
    const command: CreateChildItemCommand = {
      kind: "create-child-item",
      operationId: "op-create-3",
      createdAt: clock.now().toISOString(),
      parentItemId: "parent-10",
      parentAddress,
      name: "child-b",
      type: "Text",
      body: "",
      item: null,
    };
    const result = await provider.executeWrite(command);
    assertEquals(result.item.config.address, `${parentAddress}/02`);
  });

  await test("create-child-item replaying a FOLLOWER's already-decided item never re-allocates", async () => {
    const decidedItem: CpItem = {
      _id: "decided-id",
      config: { id: "decided-id", address: `${REPO}/10/07`, type: "Text", name: "child-decided" },
      body: "",
    };
    const command: CreateChildItemCommand = {
      kind: "create-child-item",
      operationId: "op-create-4",
      createdAt: clock.now().toISOString(),
      parentItemId: "parent-10",
      parentAddress: `${REPO}/10`,
      name: "child-decided",
      type: "Text",
      body: "",
      item: decidedItem, // already decided by a primary elsewhere
    };
    const result = await provider.executeWrite(command);
    assertEquals(result.item.config.address, `${REPO}/10/07`); // exactly as decided, not /03
    assertEquals(result.item._id, "decided-id");
  });

  await test("getItem enforces repo isolation when an expected repo guid is supplied", async () => {
    const otherRepo = "8b603669-f8e6-4224-bd78-a474998995fa";
    await provider.executeWrite(
      putCommand({ _id: "other-repo-item", config: { id: "other-repo-item", address: `${otherRepo}/01`, type: "Text", name: "01" }, body: "secret" })
    );
    const leaked = await provider.getItem({ id: "other-repo-item" }, REPO);
    assertEquals(leaked, null);
    const allowed = await provider.getItem({ id: "other-repo-item" }, otherRepo);
    assert(allowed !== null, "should be readable with the correct repo guid");
  });

  await test("putItemConfig preserves the supplied id/custom fields and leaves body untouched", async () => {
    const initial: CpItem = {
      _id: "config-only-id",
      config: { id: "config-only-id", address: `${REPO}/20`, type: "Text", name: "cfg" },
      body: "original body",
    };
    await provider.executeWrite(putCommand(initial));

    const updated = await provider.putItemConfig({
      _id: "config-only-id",
      config: { id: "config-only-id", address: `${REPO}/20`, type: "Text", name: "cfg-renamed", extra: "kept" },
      body: "IGNORED — putItemConfig must not touch body",
    });

    assertEquals(updated.config.name, "cfg-renamed");
    assertEquals(updated.config.extra, "kept");
    assertEquals(updated.body, "original body");

    const reread = await provider.getItem({ id: "config-only-id" });
    assertEquals(reread?.body, "original body");
    assertEquals(reread?.config.name, "cfg-renamed");
  });

  await test("putItemConfig on a brand-new id creates it with empty body", async () => {
    const created = await provider.putItemConfig({
      _id: "config-only-new",
      config: { id: "config-only-new", address: `${REPO}/21`, type: "Text", name: "brand-new" },
      body: "should be ignored",
    });
    assertEquals(created.body, "");
    assertEquals(created.config.name, "brand-new");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  await closeMongoConnection();
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
