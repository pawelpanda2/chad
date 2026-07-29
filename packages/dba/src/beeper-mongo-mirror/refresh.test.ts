/**
 * refreshBeeperMongoMirror() tests — Story 92.
 *
 * Run against a REAL local MongoDB instance (chad-mongodb-local-mac-docker),
 * using a throwaway test repoGuid — never the real
 * beeper_21d11bdc-.../beeper_8b603669-... user databases. "Source" and
 * "target" are both the SAME local mongod, reached via two different
 * connection strings (localhost vs 127.0.0.1) so the module's own same-host
 * refusal guard doesn't trip — this still exercises the real cross-database
 * copy + per-collection renameCollection mechanics production uses (source
 * and target ARE two independent MongoClients/servers in production too;
 * using one physical mongod for both here is a test-environment
 * convenience, not a difference in the code path under test). Dropped
 * before and after the run.
 *
 * Run via:
 *   npx tsc && node dist/beeper-mongo-mirror/refresh.test.js
 */

import { MongoClient } from "mongodb";
import { refreshBeeperMongoMirror } from "./refresh.js";
import { readBeeperMirrorMetadata, beeperMirrorMetadataPath } from "./metadata.js";
import { existsSync, rmSync } from "node:fs";

const TEST_REPO_GUID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SOURCE_URI = "mongodb://localhost:27017/?directConnection=true";
const TARGET_URI = "mongodb://127.0.0.1:27017/?directConnection=true";
const LIVE_DB = `beeper_${TEST_REPO_GUID}`;
const STAGING_DB = `${LIVE_DB}__mirror_staging`;

async function cleanup() {
  const client = new MongoClient(SOURCE_URI);
  await client.connect();
  await client.db(LIVE_DB).dropDatabase();
  await client.db(STAGING_DB).dropDatabase();
  await client.close();
  const metaPath = beeperMirrorMetadataPath(TEST_REPO_GUID);
  if (existsSync(metaPath)) rmSync(metaPath);
}

async function seedSource(contacts: number) {
  const client = new MongoClient(SOURCE_URI);
  await client.connect();
  const db = client.db(LIVE_DB);
  await db.collection("contacts").deleteMany({});
  if (contacts > 0) {
    await db.collection("contacts").insertMany(
      Array.from({ length: contacts }, (_, i) => ({ displayName: `Test ${i}`, tags: [] }))
    );
  }
  await client.close();
}

async function countTarget(collection: string): Promise<number> {
  const client = new MongoClient(TARGET_URI);
  await client.connect();
  const count = await client.db(LIVE_DB).collection(collection).countDocuments({});
  await client.close();
  return count;
}

async function runTests() {
  console.log("Running refreshBeeperMongoMirror() tests (real local MongoDB)...\n");
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

  await cleanup();

  await test("refuses to run when source and target resolve to the same host", async () => {
    let threw = false;
    try {
      await refreshBeeperMongoMirror({ repoGuid: TEST_REPO_GUID, sourceUri: SOURCE_URI, targetUri: SOURCE_URI });
    } catch {
      threw = true;
    }
    assert(threw, "expected a same-host refusal error");
  });

  await test("first run copies all documents and writes PASS metadata", async () => {
    await seedSource(5);
    const meta = await refreshBeeperMongoMirror({ repoGuid: TEST_REPO_GUID, sourceUri: SOURCE_URI, targetUri: TARGET_URI });
    assert(meta.result === "PASS", `expected PASS, got ${meta.result}`);
    assert(meta.collections.contacts === 5, `expected 5 contacts in metadata, got ${meta.collections.contacts}`);
    const targetCount = await countTarget("contacts");
    assert(targetCount === 5, `expected 5 contacts copied to target, got ${targetCount}`);
    assert(meta.lastSuccessAt != null, "expected lastSuccessAt to be set");
  });

  await test("second run with no source changes short-circuits to NO_CHANGE", async () => {
    const meta = await refreshBeeperMongoMirror({ repoGuid: TEST_REPO_GUID, sourceUri: SOURCE_URI, targetUri: TARGET_URI });
    assert(meta.result === "NO_CHANGE", `expected NO_CHANGE, got ${meta.result}`);
  });

  await test("a real source change is picked up and mirrored (insert)", async () => {
    await seedSource(8);
    const meta = await refreshBeeperMongoMirror({ repoGuid: TEST_REPO_GUID, sourceUri: SOURCE_URI, targetUri: TARGET_URI });
    assert(meta.result === "PASS", `expected PASS, got ${meta.result}`);
    const targetCount = await countTarget("contacts");
    assert(targetCount === 8, `expected 8 contacts after re-sync, got ${targetCount}`);
  });

  await test("a real source deletion is reflected (mirror never keeps stale extra docs)", async () => {
    await seedSource(2);
    const meta = await refreshBeeperMongoMirror({ repoGuid: TEST_REPO_GUID, sourceUri: SOURCE_URI, targetUri: TARGET_URI });
    assert(meta.result === "PASS", `expected PASS, got ${meta.result}`);
    const targetCount = await countTarget("contacts");
    assert(targetCount === 2, `expected 2 contacts after deletion synced, got ${targetCount}`);
  });

  await test("source unreachable preserves the last-good mirror and metadata, never wipes it", async () => {
    const before = readBeeperMirrorMetadata(TEST_REPO_GUID)!;
    const meta = await refreshBeeperMongoMirror({
      repoGuid: TEST_REPO_GUID,
      sourceUri: "mongodb://10.255.255.1:27017/?serverSelectionTimeoutMS=800&directConnection=true",
      targetUri: TARGET_URI,
    });
    assert(meta.result === "FAIL", `expected FAIL, got ${meta.result}`);
    assert(meta.lastSuccessAt === before.lastSuccessAt, "lastSuccessAt must be preserved on a source failure");
    assert(meta.collections.contacts === before.collections.contacts, "collections counts must be preserved on a source failure");
    const targetCount = await countTarget("contacts");
    assert(targetCount === 2, `expected the last-good 2 contacts still present in target, got ${targetCount}`);
  });

  await test("no staging database is left behind after a successful run", async () => {
    const client = new MongoClient(TARGET_URI);
    await client.connect();
    const dbs = (await client.db().admin().listDatabases()).databases.map((d) => d.name);
    await client.close();
    assert(!dbs.includes(STAGING_DB), `staging database ${STAGING_DB} should not exist after a clean run`);
  });

  await cleanup();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
