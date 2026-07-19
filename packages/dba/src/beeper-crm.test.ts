/**
 * Beeper CRM per-user database isolation tests — Story 73.
 *
 * Run against a REAL local MongoDB instance (chad-mongodb-local-mac-docker),
 * using two throwaway test repoGuids (beeper_<test-guid> databases) —
 * never the real beeper_21d11bdc-.../beeper_8b603669-... user databases.
 * Dropped before and after the run, so safe to re-run any number of times.
 *
 * Run via:
 *   BEEPER_MONGODB_URI="mongodb://change_me:change_me@localhost:27017?authSource=admin" \
 *     npx tsc && node dist/beeper-crm.test.js
 */

import {
  listBeeperContacts,
  getBeeperContact,
  getBeeperDashboardStats,
  searchBeeperContacts,
  getBeeperMergeSuggestions,
  ensureBeeperIndexes,
} from "./beeper-crm.js";
import { runWithRepoContext, type RepoContext } from "./repo-context.js";
import { getBeeperMongoDb, closeMongoConnection } from "./mongo.js";

// Test-only, throwaway GUIDs — deliberately NOT the real pawel_f/kamil_s
// repoGuids, so this suite can never touch real user data.
const USER_A: RepoContext = { repoGuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", username: "test-user-a" };
const USER_B: RepoContext = { repoGuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", username: "test-user-b" };

async function dropTestDatabases() {
  for (const u of [USER_A, USER_B]) {
    const db = await getBeeperMongoDb(u.repoGuid);
    await db.dropDatabase();
  }
}

async function seedContact(repoGuid: string, displayName: string, senderID: string) {
  const db = await getBeeperMongoDb(repoGuid);
  const result = await db.collection("contacts").insertOne({
    displayName,
    notes: "",
    tags: [],
    identities: [{ network: "test", senderID }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return result.insertedId.toString();
}

async function seedDirectChannel(repoGuid: string, contactIds: string[]) {
  const { ObjectId } = await import("mongodb");
  const db = await getBeeperMongoDb(repoGuid);
  await db.collection("channels").insertOne({
    beeperChatID: `test-chat-${Math.random()}`,
    network: "test",
    type: "direct",
    title: null,
    participantIDs: contactIds.map((id) => new ObjectId(id)),
    lastMessageAt: null,
    createdAt: new Date(),
  });
}

async function runTests() {
  console.log("Running Beeper CRM per-user isolation tests (real local MongoDB)...\n");
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

  function assertEquals(actual: unknown, expected: unknown, message?: string) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${message ?? "assertEquals failed"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }

  async function assertRejects(fn: () => Promise<unknown>, message?: string) {
    try {
      await fn();
    } catch {
      return;
    }
    throw new Error(message ?? "Expected promise to reject, but it resolved");
  }

  await dropTestDatabases();
  await ensureBeeperIndexes(USER_A.repoGuid);
  await ensureBeeperIndexes(USER_B.repoGuid);

  // User A gets two similarly-named direct-DM contacts (for merge-suggestions
  // coverage) — user B gets nothing.
  const aliceId = await seedContact(USER_A.repoGuid, "Alice Anderson", "sender-alice-1");
  const aliceDupeId = await seedContact(USER_A.repoGuid, "Alice Anderson", "sender-alice-2");
  await seedDirectChannel(USER_A.repoGuid, [aliceId]);
  await seedDirectChannel(USER_A.repoGuid, [aliceDupeId]);

  await test("listing contacts as user A returns the seeded contacts", async () => {
    const contacts = await runWithRepoContext(USER_A, () => listBeeperContacts());
    assert(contacts.some((c) => c._id === aliceId), "expected Alice in user A's contact list");
  });

  await test("listing contacts as user B returns an empty list (no leakage from user A)", async () => {
    const contacts = await runWithRepoContext(USER_B, () => listBeeperContacts());
    assertEquals(contacts.length, 0);
  });

  await test("fetching user A's contact id while acting as user B returns null (route layer turns this into 404, never another user's data)", async () => {
    const detail = await runWithRepoContext(USER_B, () => getBeeperContact(aliceId));
    assertEquals(detail, null);
  });

  await test("fetching user A's contact id while acting as user A succeeds", async () => {
    const detail = await runWithRepoContext(USER_A, () => getBeeperContact(aliceId));
    assert(detail !== null, "expected contact to be found");
    assertEquals(detail!.contact.displayName, "Alice Anderson");
  });

  await test("dashboard stats are isolated per user", async () => {
    const statsA = await runWithRepoContext(USER_A, () => getBeeperDashboardStats());
    const statsB = await runWithRepoContext(USER_B, () => getBeeperDashboardStats());
    assertEquals(statsA.totalContacts, 2);
    assertEquals(statsB.totalContacts, 0);
  });

  await test("search does not leak across users", async () => {
    const resultsB = await runWithRepoContext(USER_B, () => searchBeeperContacts("Alice"));
    assertEquals(resultsB.length, 0);
    const resultsA = await runWithRepoContext(USER_A, () => searchBeeperContacts("Alice"));
    assert(resultsA.some((r) => r._id === aliceId), "expected to find Alice in user A's own search");
  });

  await test("merge suggestions do not leak across users", async () => {
    const suggestionsB = await runWithRepoContext(USER_B, () => getBeeperMergeSuggestions());
    assertEquals(suggestionsB.length, 0);
    const suggestionsA = await runWithRepoContext(USER_A, () => getBeeperMergeSuggestions());
    assert(suggestionsA.length > 0, "expected user A's two similarly-named contacts to produce a merge suggestion");
  });

  await test("calling a beeper-crm function outside runWithRepoContext throws, never falls back to a default database", async () => {
    await assertRejects(() => listBeeperContacts(), "expected getCurrentRepoGuid() to throw when called with no active repo context");
  });

  await test("parallel requests for two different users do not mix databases", async () => {
    const [contactsA, contactsB] = await Promise.all([
      runWithRepoContext(USER_A, () => listBeeperContacts()),
      runWithRepoContext(USER_B, () => listBeeperContacts()),
    ]);
    assertEquals(contactsA.length, 2);
    assertEquals(contactsB.length, 0);
  });

  await test("ensureBeeperIndexes creates the same indexes in both user databases independently", async () => {
    const dbA = await getBeeperMongoDb(USER_A.repoGuid);
    const dbB = await getBeeperMongoDb(USER_B.repoGuid);
    const idxA = await dbA.collection("contacts").indexes();
    const idxB = await dbB.collection("contacts").indexes();
    assert(idxA.some((i) => i.name === "identities_senderID_unique"), "user A missing expected index");
    assert(idxB.some((i) => i.name === "identities_senderID_unique"), "user B missing expected index");
  });

  await test("getBeeperMongoDb rejects an invalid repoGuid, never silently substitutes a database", async () => {
    await assertRejects(() => getBeeperMongoDb("not-a-real-guid"));
    await assertRejects(() => getBeeperMongoDb(""));
  });

  await test("getBeeperMongoDb never resolves to the old shared 'beeper' database", async () => {
    const dbA = await getBeeperMongoDb(USER_A.repoGuid);
    assert(dbA.databaseName !== "beeper", "must never be the old shared database name");
    assertEquals(dbA.databaseName, `beeper_${USER_A.repoGuid}`);
  });

  await dropTestDatabases();
  await closeMongoConnection();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
