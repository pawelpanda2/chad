/**
 * DbaDataRouter tests. Uses fake, in-memory CpCompatibleDataProvider
 * implementations for primary/follower (Story 72 - Router test list),
 * none of which need a real Content Provider, but the REAL outbox against
 * the same local test MongoDB used by `data-outbox.test.ts`/
 * `mongo-cp-provider.test.ts`, so enqueue side effects are actually
 * verified, not assumed.
 *
 * Run via: npx tsc && node dist/data-router.test.js
 */

import { getMongoDb, closeMongoConnection } from "./mongo.js";
import { OUTBOX_COLLECTION, getJob } from "./data-outbox.js";
import { DbaDataRouter } from "./data-router.js";
import { validateDataProvidersConfig, type DbaDataProvidersConfig } from "./data-providers/config.js";
import type { CpCompatibleDataProvider, DataBackendName, GetByNames2Input, GetByNamesInput, GetItemInput } from "./data-providers/types.js";
import type { DataWriteCommand, DataWriteResult } from "./data-commands.js";
import type { CpItem } from "./cp-model.js";

const REPO = "21d11bdc-f1f4-44d1-b61a-3fa6b039c641";

function fakeItem(id: string): CpItem {
  return { _id: id, config: { id, address: `${REPO}/${id}`, type: "Text", name: id }, body: "body" };
}

class FakeProvider implements CpCompatibleDataProvider {
  public writeCalls = 0;
  public items = new Map<string, CpItem>();

  constructor(public readonly name: DataBackendName, private readonly failWrites = false) {}

  async getItem(input: GetItemInput): Promise<CpItem | null> {
    if ("id" in input) return this.items.get(input.id) ?? null;
    return [...this.items.values()].find((i) => i.config.address === input.address) ?? null;
  }
  async getByNames(_input: GetByNamesInput): Promise<CpItem | null> {
    return null;
  }
  async getByNames2(_input: GetByNames2Input): Promise<CpItem[]> {
    return [];
  }
  async putItemConfig(item: CpItem): Promise<CpItem> {
    this.items.set(item._id, item);
    return item;
  }
  async executeWrite(command: DataWriteCommand): Promise<DataWriteResult> {
    this.writeCalls++;
    if (this.failWrites) throw new Error(`${this.name} write failed`);
    const item = command.kind === "put-item" ? command.item : command.item ?? fakeItem(command.operationId);
    this.items.set(item._id, item);
    return { item, alreadyExisted: false };
  }
}

function baseConfig(overrides: Partial<DbaDataProvidersConfig> = {}): DbaDataProvidersConfig {
  return {
    mongoEnabled: true,
    contentProviderEnabled: true,
    primaryBackend: "mongo",
    followerWritesEnabled: true,
    followerWritesAsync: true,
    failRequestOnFollowerError: false,
    shadowReadsEnabled: false,
    ...overrides,
  };
}

function putCommand(id: string): DataWriteCommand {
  return { kind: "put-item", operationId: `op-router-${id}-${Date.now()}-${Math.random()}`, createdAt: new Date().toISOString(), item: fakeItem(id) };
}

async function runTests() {
  console.log("Running DbaDataRouter Tests...\n");
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  [pass] ${name}`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] ${name}`);
      console.log(`    Error: ${e}`);
      failed++;
    }
  }

  function assertEquals(actual: unknown, expected: unknown, message?: string) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) throw new Error(`${message ?? "assertEquals failed"}: expected ${e}, got ${a}`);
  }
  function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(message);
  }

  const db = await getMongoDb();
  await db.collection(OUTBOX_COLLECTION).deleteMany({});

  await test("mongo-only config: write succeeds, no follower enqueued", async () => {
    const mongo = new FakeProvider("mongo");
    const config = baseConfig({ contentProviderEnabled: false });
    const router = new DbaDataRouter({ config, providers: { mongo } });
    const command = putCommand("only-mongo");
    const result = await router.executeWrite(command);
    assertEquals(result.alreadyExisted, false);
    assertEquals(mongo.writeCalls, 1);
    assertEquals(await getJob(`${command.operationId}:content-provider`), null);
  });

  await test("content-provider-only config: primary is CP, no follower enqueued", async () => {
    const cp = new FakeProvider("content-provider");
    const config = baseConfig({ mongoEnabled: false, primaryBackend: "content-provider" });
    const router = new DbaDataRouter({ config, providers: { "content-provider": cp } });
    const command = putCommand("only-cp");
    await router.executeWrite(command);
    assertEquals(cp.writeCalls, 1);
    assertEquals(await getJob(`${command.operationId}:mongo`), null);
  });

  await test("both active, mongo primary: primary write succeeds synchronously, follower job enqueued (not executed)", async () => {
    const mongo = new FakeProvider("mongo");
    const cp = new FakeProvider("content-provider");
    const config = baseConfig();
    const router = new DbaDataRouter({ config, providers: { mongo, "content-provider": cp } });
    const command = putCommand("both-mongo-primary");
    await router.executeWrite(command);

    assertEquals(mongo.writeCalls, 1);
    assertEquals(cp.writeCalls, 0); // follower is enqueued, never called directly
    const job = await getJob(`${command.operationId}:content-provider`);
    assert(job !== null, "follower job should be enqueued");
    assertEquals(job!.status, "pending");
  });

  await test("both active, content-provider primary: mongo becomes the follower", async () => {
    const mongo = new FakeProvider("mongo");
    const cp = new FakeProvider("content-provider");
    const config = baseConfig({ primaryBackend: "content-provider" });
    const router = new DbaDataRouter({ config, providers: { mongo, "content-provider": cp } });
    const command = putCommand("both-cp-primary");
    await router.executeWrite(command);

    assertEquals(cp.writeCalls, 1);
    assertEquals(mongo.writeCalls, 0);
    const job = await getJob(`${command.operationId}:mongo`);
    assert(job !== null, "follower job should be enqueued for mongo");
  });

  await test("follower writes disabled: no job is enqueued even with both backends active", async () => {
    const mongo = new FakeProvider("mongo");
    const cp = new FakeProvider("content-provider");
    const config = baseConfig({ followerWritesEnabled: false });
    const router = new DbaDataRouter({ config, providers: { mongo, "content-provider": cp } });
    const command = putCommand("follower-disabled");
    await router.executeWrite(command);
    assertEquals(await getJob(`${command.operationId}:content-provider`), null);
  });

  await test("invalid config (primary backend disabled) is rejected at validation, before any router use", async () => {
    const config = baseConfig({ mongoEnabled: false, primaryBackend: "mongo" });
    let threw = false;
    try {
      validateDataProvidersConfig(config);
    } catch {
      threw = true;
    }
    assert(threw, "validateDataProvidersConfig should throw when primary is disabled");
  });

  await test("primary write failure propagates and no follower job is enqueued", async () => {
    const mongo = new FakeProvider("mongo", true); // fails writes
    const cp = new FakeProvider("content-provider");
    const config = baseConfig();
    const router = new DbaDataRouter({ config, providers: { mongo, "content-provider": cp } });
    const command = putCommand("primary-fails");

    let threw = false;
    try {
      await router.executeWrite(command);
    } catch {
      threw = true;
    }
    assert(threw, "router should propagate the primary's failure");
    assertEquals(await getJob(`${command.operationId}:content-provider`), null);
  });

  await test("a follower-enqueue failure never fails the already-succeeded primary write", async () => {
    const mongo = new FakeProvider("mongo");
    const cp = new FakeProvider("content-provider");
    const config = baseConfig();
    let observedError: unknown = null;
    const router = new DbaDataRouter({
      config,
      providers: { mongo, "content-provider": cp },
      onFollowerEnqueueError: (error) => {
        observedError = error;
      },
    });

    // Force the enqueue step itself to fail (without tearing down the
    // shared Mongo connection other tests rely on) by making the
    // command's config contain a circular reference: BSON serialization
    // rejects it, so enqueueFollowerOperation's write throws, while the
    // primary's write above (a plain in-memory Map) has already succeeded.
    const item = fakeItem("enqueue-fails");
    const circular: Record<string, unknown> = { ...item.config };
    circular.self = circular;
    const command: DataWriteCommand = {
      kind: "put-item",
      operationId: "op-enqueue-fails",
      createdAt: new Date().toISOString(),
      item: { ...item, config: circular as unknown as CpItem["config"] },
    };

    const result = await router.executeWrite(command);
    assertEquals(result.item._id, "enqueue-fails"); // primary result still returned
    assert(observedError !== null, "onFollowerEnqueueError should have been called");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  await closeMongoConnection();
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
