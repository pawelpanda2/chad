/**
 * cp-history.ts tests — run against a REAL local MongoDB instance (the
 * already-running `chad-mongodb-local-mac-docker` container), using a
 * dedicated test-only database (never the real `chad` data — Story 72
 * §25 / Story 74 §22). Requires `MONGODB_URI` to point at that test
 * database, e.g.:
 *
 *   MONGODB_URI="mongodb://localhost:27017/chad_test_story74" \
 *     npx tsc && node dist/cp-history.test.js
 *
 * Writes directly into the `cp_history`/`cp_items` collections (the shape
 * the real `history-worker` produces) rather than going through the
 * worker itself — the worker's change-stream wiring is covered by the
 * Story 74 manual end-to-end verification (see backlog/stories/74), not
 * by this hand-rolled TS test runner.
 */

import { getMongoDb, closeMongoConnection } from "./mongo.js";
import {
  listCpHistory,
  getCpHistoryEntry,
  resolveDailyTrackerAddressPrefix,
  listDailyTrackerHistory,
  resolveDateEntriesAddressPrefix,
  listDateEntriesHistory,
  type CpHistoryConfigOp,
} from "./cp-history.js";
import { buildCreateChildItemCommand } from "./data-commands.js";
import { getMongoProvider } from "./data-router-instance.js";
import { systemClock } from "./data-clock.js";

const REPO_A = "cp-history-test-repo-aaaaaaaa-1111-1111-1111-111111111111";
const REPO_B = "cp-history-test-repo-bbbbbbbb-2222-2222-2222-222222222222";

const HISTORY_COLLECTION = "cp_history";

/** Matches the document shape the real history-worker writes (cp-history.ts's own CpHistoryDoc, not exported). */
interface HistoryTestDoc {
  _id: string;
  sourceCollection: string;
  sourceId: string;
  address: string;
  operationType: string;
  changedAt: Date;
  actor: { username: string; repoGuid: string } | null;
  beforeUnknown: boolean;
  changes: { config: CpHistoryConfigOp[]; body: null };
}

/** Matches MongoCpProvider's cp_items document shape closely enough for these tests' purposes. */
interface CpItemTestDoc {
  _id: string;
  config: { id: string; type: string; name: string; address: string; created: string; modified: string };
  body: string;
}

function makeHistoryDoc(overrides: {
  id: string;
  address: string;
  operationType?: string;
  changedAt?: Date;
  actor?: { username: string; repoGuid: string } | null;
}): HistoryTestDoc {
  const configOps: CpHistoryConfigOp[] = [
    { op: "add", path: "/name", oldValue: null, newValue: "x" },
  ];
  return {
    _id: overrides.id,
    sourceCollection: "cp_items",
    sourceId: overrides.id,
    address: overrides.address,
    operationType: overrides.operationType ?? "insert",
    changedAt: overrides.changedAt ?? new Date(),
    actor: overrides.actor ?? null,
    beforeUnknown: true,
    changes: { config: configOps, body: null },
  };
}

async function runTests() {
  console.log("Running cp-history Tests (real local MongoDB)...\n");
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

  // Clean slate — dedicated test database (see file header).
  const db = await getMongoDb();
  await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).deleteMany({});
  await db.collection<CpItemTestDoc>("cp_items").deleteMany({
    "config.address": { $regex: `^(${REPO_A}|${REPO_B})` },
  });

  await test("listCpHistory only returns entries under the caller's own repo (isolation)", async () => {
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).insertMany([
      makeHistoryDoc({ id: "h1", address: `${REPO_A}/01` }),
      makeHistoryDoc({ id: "h2", address: `${REPO_B}/01` }),
    ]);
    const result = await listCpHistory({ repoGuid: REPO_A });
    assertEquals(result.items.length, 1);
    assertEquals(result.items[0].id, "h1");
  });

  await test("listCpHistory does not match a repo whose GUID is a string-prefix of another repo's GUID", async () => {
    // Regression guard for the repo-isolation regex: a naive `^prefix`
    // match (no separator anchor) would let REPO_A's short-prefix leak
    // into a repo whose GUID happens to start with the same characters.
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).deleteMany({});
    const prefixRepo = REPO_A.slice(0, 10); // shares a literal prefix with REPO_A
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).insertMany([
      makeHistoryDoc({ id: "h3", address: `${REPO_A}extra-suffix-repo/01` }),
    ]);
    const result = await listCpHistory({ repoGuid: prefixRepo });
    assertEquals(result.items.length, 0, "a bare string prefix must never match another repo's address");
  });

  await test("listCpHistory root-address entry (no segments) matches its own repo", async () => {
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).deleteMany({});
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).insertOne(makeHistoryDoc({ id: "h4", address: REPO_A }));
    const result = await listCpHistory({ repoGuid: REPO_A });
    assertEquals(result.items.length, 1);
    assertEquals(result.items[0].id, "h4");
  });

  await test("listCpHistory addressPrefix filter restricts to that subtree only", async () => {
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).deleteMany({});
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).insertMany([
      makeHistoryDoc({ id: "h5", address: `${REPO_A}/01/01` }),
      makeHistoryDoc({ id: "h6", address: `${REPO_A}/02/01` }),
    ]);
    const result = await listCpHistory({ repoGuid: REPO_A, addressPrefix: `${REPO_A}/01` });
    assertEquals(result.items.length, 1);
    assertEquals(result.items[0].id, "h5");
  });

  await test("listCpHistory addressPrefix outside the caller's repo returns empty, not another repo's data", async () => {
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).deleteMany({});
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).insertOne(makeHistoryDoc({ id: "h7", address: `${REPO_B}/01` }));
    const result = await listCpHistory({ repoGuid: REPO_A, addressPrefix: `${REPO_B}/01` });
    assertEquals(result.items.length, 0);
  });

  await test("listCpHistory operationType filter", async () => {
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).deleteMany({});
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).insertMany([
      makeHistoryDoc({ id: "h8", address: `${REPO_A}/01`, operationType: "insert" }),
      makeHistoryDoc({ id: "h9", address: `${REPO_A}/01`, operationType: "delete" }),
    ]);
    const result = await listCpHistory({ repoGuid: REPO_A, operationType: "delete" });
    assertEquals(result.items.length, 1);
    assertEquals(result.items[0].id, "h9");
  });

  await test("listCpHistory pagination — page/pageSize slice and total reflect the full filtered set", async () => {
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).deleteMany({});
    const now = Date.now();
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).insertMany(
      Array.from({ length: 5 }, (_, i) =>
        makeHistoryDoc({ id: `p${i}`, address: `${REPO_A}/01`, changedAt: new Date(now + i * 1000) })
      )
    );
    const page1 = await listCpHistory({ repoGuid: REPO_A, page: 1, pageSize: 2 });
    assertEquals(page1.items.length, 2);
    assertEquals(page1.total, 5);
    // Newest-first: last inserted (p4) should be first.
    assertEquals(page1.items[0].id, "p4");
    const page2 = await listCpHistory({ repoGuid: REPO_A, page: 2, pageSize: 2 });
    assertEquals(page2.items.length, 2);
    assertEquals(page2.items[0].id, "p2");
  });

  await test("getCpHistoryEntry returns the entry for the owning repo", async () => {
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).deleteMany({});
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).insertOne(makeHistoryDoc({ id: "d1", address: `${REPO_A}/01` }));
    const entry = await getCpHistoryEntry("d1", REPO_A);
    assert(entry !== null, "entry should be found for the owning repo");
    assertEquals(entry!.id, "d1");
    assert(Array.isArray(entry!.changes.config), "detail must include the full config op list");
  });

  await test("getCpHistoryEntry returns null for a caller from a different repo (cross-user isolation)", async () => {
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).deleteMany({});
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).insertOne(makeHistoryDoc({ id: "d2", address: `${REPO_A}/01` }));
    const entry = await getCpHistoryEntry("d2", REPO_B);
    assertEquals(entry, null, "a guessed history id must never leak another repo's entry");
  });

  await test("getCpHistoryEntry returns null for a non-existent id", async () => {
    const entry = await getCpHistoryEntry("does-not-exist", REPO_A);
    assertEquals(entry, null);
  });

  await test("resolveDailyTrackerAddressPrefix returns null when the repo has no Daily Tracker folder yet", async () => {
    const prefix = await resolveDailyTrackerAddressPrefix(REPO_A);
    assertEquals(prefix, null);
  });

  await test("resolveDailyTrackerAddressPrefix resolves the real views/daily folder address once it exists", async () => {
    const mongo = getMongoProvider();
    let parent = await mongo.getItem({ address: REPO_A });
    if (!parent) {
      // Repo roots aren't created via createChild in real usage (there's
      // no parent to create them under) — insert directly, matching
      // MongoCpProvider's document shape, since test databases start empty.
      await db.collection<CpItemTestDoc>("cp_items").insertOne({
        _id: REPO_A,
        config: { id: REPO_A, type: "Folder", name: REPO_A, address: REPO_A, created: "x", modified: "x" },
        body: "",
      });
      parent = await mongo.getItem({ address: REPO_A });
    }
    assert(parent !== null, "repo root must exist before creating views/daily");

    const viewsCmd = buildCreateChildItemCommand(
      { parentItemId: parent!._id, parentAddress: parent!.config.address, name: "views", type: "Folder" },
      systemClock
    );
    const viewsResult = await mongo.executeWrite(viewsCmd);

    const dailyCmd = buildCreateChildItemCommand(
      {
        parentItemId: viewsResult.item._id,
        parentAddress: viewsResult.item.config.address,
        name: "daily",
        type: "Folder",
      },
      systemClock
    );
    const dailyResult = await mongo.executeWrite(dailyCmd);

    const prefix = await resolveDailyTrackerAddressPrefix(REPO_A);
    assertEquals(prefix, dailyResult.item.config.address);
  });

  await test("listDailyTrackerHistory only returns entries under the resolved Daily Tracker address", async () => {
    const dailyPrefix = await resolveDailyTrackerAddressPrefix(REPO_A);
    assert(dailyPrefix !== null, "precondition: Daily Tracker folder must exist (previous test)");

    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).deleteMany({});
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).insertMany([
      makeHistoryDoc({ id: "dt1", address: `${dailyPrefix}/01` }),
      makeHistoryDoc({ id: "dt2", address: `${REPO_A}/99/not-daily-tracker` }),
    ]);

    const result = await listDailyTrackerHistory({ repoGuid: REPO_A });
    assertEquals(result.items.length, 1);
    assertEquals(result.items[0].id, "dt1");
  });

  await test("listDailyTrackerHistory returns empty (not an error) for a repo with no Daily Tracker yet", async () => {
    const result = await listDailyTrackerHistory({ repoGuid: REPO_B });
    assertEquals(result.items, []);
    assertEquals(result.total, 0);
  });

  await test("resolveDateEntriesAddressPrefix returns null when the repo has no Dates folder yet", async () => {
    const prefix = await resolveDateEntriesAddressPrefix(REPO_B);
    assertEquals(prefix, null);
  });

  await test("resolveDateEntriesAddressPrefix resolves the real views/dates folder address once it exists", async () => {
    const mongo = getMongoProvider();
    const views = await mongo.getByNames({ repoGuid: REPO_A, names: ["views"] });
    assert(views !== null, "precondition: views folder must exist (created by the Daily Tracker test above)");

    const datesCmd = buildCreateChildItemCommand(
      {
        parentItemId: views!._id,
        parentAddress: views!.config.address,
        name: "dates",
        type: "Folder",
      },
      systemClock
    );
    const datesResult = await mongo.executeWrite(datesCmd);

    const prefix = await resolveDateEntriesAddressPrefix(REPO_A);
    assertEquals(prefix, datesResult.item.config.address);
  });

  await test("listDateEntriesHistory only returns entries under the resolved Dates address, never Daily Tracker's", async () => {
    const datesPrefix = await resolveDateEntriesAddressPrefix(REPO_A);
    const dailyPrefix = await resolveDailyTrackerAddressPrefix(REPO_A);
    assert(datesPrefix !== null && dailyPrefix !== null, "precondition: both folders must exist (previous tests)");

    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).deleteMany({});
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).insertMany([
      makeHistoryDoc({ id: "de1", address: `${datesPrefix}/01` }),
      makeHistoryDoc({ id: "de2", address: `${dailyPrefix}/01` }),
    ]);

    const result = await listDateEntriesHistory({ repoGuid: REPO_A });
    assertEquals(result.items.length, 1);
    assertEquals(result.items[0].id, "de1");
  });

  await test("listDateEntriesHistory returns empty (not an error) for a repo with no Dates folder yet", async () => {
    const result = await listDateEntriesHistory({ repoGuid: REPO_B });
    assertEquals(result.items, []);
    assertEquals(result.total, 0);
  });

  console.log(`\n${passed} passed, ${failed} failed`);

  // Cleanup — leave the dedicated test database as we found it.
  await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).deleteMany({});
  await db.collection<CpItemTestDoc>("cp_items").deleteMany({
    "config.address": { $regex: `^(${REPO_A}|${REPO_B})` },
  });

  await closeMongoConnection();
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
