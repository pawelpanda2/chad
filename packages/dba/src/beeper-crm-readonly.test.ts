/**
 * Regression test — Story 92: listBeeperContacts({view:"permissions"}) must
 * still work when Local Mongo readonly mode is active.
 *
 * Real bug found via live browser verification (Dev Panel -> Local Mongo ->
 * Beeper Contacts page): the Permissions view called
 * ensureBeeperSyncPermissionsMigrated() unconditionally, which calls
 * assertBeeperWriteAllowed() — a real WRITE guard — turning every read into
 * an HTTP 500 ("BeeperMongoReadonlyWriteForbiddenError") whenever the Dev
 * Panel had Local Mongo selected. Fixed in beeper-crm.ts by skipping that
 * lazy auto-heal when isBeeperMongoReadonlyMode() is true.
 *
 * Uses a throwaway test repoGuid, seeded via a raw MongoClient (never
 * through beeper-crm.ts's own guarded write functions — mirrors how the
 * real local mirror is actually populated: by refreshBeeperMongoMirror's
 * own direct writer, never by Dashboard business logic). Never touches the
 * real pawel_f/kamil_s databases.
 *
 * Run via:
 *   npx tsc && node dist/beeper-crm-readonly.test.js
 */

import { MongoClient } from "mongodb";
import { listBeeperContacts } from "./beeper-crm.js";
import { setMongoSource, getMongoSource } from "./dev-db-override.js";
import { closeMongoConnection } from "./mongo.js";

const TEST_REPO_GUID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const LOCAL_URI = "mongodb://localhost:27017/?directConnection=true";
const DB_NAME = `beeper_${TEST_REPO_GUID}`;

async function seedViaRawClient() {
  const client = new MongoClient(LOCAL_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  await db.collection("contacts").deleteMany({});
  await db.collection("contacts").insertOne({
    displayName: "Readonly Test Contact",
    identities: [{ senderID: "readonly-test-sender" }],
    tags: [],
    updatedAt: new Date(),
  });
  await client.close();
}

async function cleanup() {
  const client = new MongoClient(LOCAL_URI);
  await client.connect();
  await client.db(DB_NAME).dropDatabase();
  await client.close();
}

async function runTests() {
  console.log("Running listBeeperContacts() readonly-mode regression test (real local MongoDB)...\n");
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

  function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(message);
  }

  const originalSource = getMongoSource();
  process.env.BEEPER_MONGODB_URI = LOCAL_URI;

  await cleanup();
  await seedViaRawClient();

  try {
    await test("listBeeperContacts({view: 'permissions'}) does NOT throw in Local Mongo readonly mode", async () => {
      setMongoSource("local");
      await closeMongoConnection();

      // Would previously reject with BeeperMongoReadonlyWriteForbiddenError.
      const { runWithRepoContext } = await import("./repo-context.js");
      const contacts = await runWithRepoContext(
        { repoGuid: TEST_REPO_GUID, username: "readonly-test-user" },
        () => listBeeperContacts({ view: "permissions", permissionFilter: "all" })
      );
      assert(contacts.length === 1, `expected 1 seeded contact to be readable, got ${contacts.length}`);
    });
  } finally {
    setMongoSource(originalSource);
    await closeMongoConnection();
    await cleanup();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
