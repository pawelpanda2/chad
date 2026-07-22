/**
 * cp-history.ts tests — run against a REAL local MongoDB instance (the
 * already-running `chad-mongodb-local-mac-docker` container, a single-node
 * `rs0` replica set — required since Story 79 for `executeCpMutationWithHistory`'s
 * transactions, in addition to Story 74's original reason of Change
 * Streams), using a dedicated test-only database (never the real `chad`
 * data — Story 72 §25 / Story 74 §22):
 *
 *   MONGODB_URI="mongodb://localhost:27017/chad_test_story79?directConnection=true" \
 *     npx tsc && node dist/cp-history.test.js
 *
 * Most tests here insert directly-crafted `cp_history` fixture documents
 * (read-side concerns: isolation/pagination/sorting are legitimately
 * testable this way) rather than going through
 * `executeCpMutationWithHistory` — the real end-to-end write path (atomic
 * commit, hash chain, idempotency, concurrency) is covered by
 * `cp-history/mutate.test.ts` instead. The Daily/Date-Tracker-address-
 * resolution tests below DO go through the real `MongoCpProvider.executeWrite`
 * path, though, and therefore DO exercise real transactions as a side
 * effect.
 */

import { getMongoDb, closeMongoConnection } from "./mongo.js";
import {
  listCpHistory,
  getCpHistoryEntry,
  getCpHistoryForItem,
  resolveDailyTrackerAddressPrefix,
  listDailyTrackerHistory,
  resolveDateEntriesAddressPrefix,
  listDateEntriesHistory,
  type CpHistoryConfigOp,
} from "./cp-history.js";
import { buildCreateChildItemCommand } from "./data-commands.js";
import { getMongoProvider } from "./data-router-instance.js";
import { systemClock } from "./data-clock.js";
import { splitAddress } from "./cp-model.js";

const REPO_A = "cp-history-test-repo-aaaaaaaa-1111-1111-1111-111111111111";
const REPO_B = "cp-history-test-repo-bbbbbbbb-2222-2222-2222-222222222222";

const HISTORY_COLLECTION = "cp_history";

/** Matches the document shape `executeCpMutationWithHistory` writes (cp-history/mutate.ts's CpHistoryDoc). */
interface HistoryTestDoc {
  _id: string;
  mutationId: string;
  requestId: string | null;
  sourceCollection: string;
  sourceId: string;
  repoGuid: string;
  address: string;
  version: number;
  operationType: string;
  actor: { username: string; repoGuid: string; kind: string };
  changedAt: Date;
  beforeHash: string | null;
  afterHash: string | null;
  changes: { config: CpHistoryConfigOp[]; body: null };
  afterSnapshot: { config: unknown; body: string } | null;
  metadata: Record<string, unknown>;
}

/** Matches MongoCpProvider's cp_items document shape closely enough for these tests' purposes. */
interface CpItemTestDoc {
  _id: string;
  config: { id: string; type: string; name: string; address: string; created: string; modified: string };
  body: string;
  _historyVersion?: number;
  _lastMutationId?: string;
  _lastActor?: { username: string; repoGuid: string } | null;
  _lastRequestId?: string | null;
}

function makeHistoryDoc(overrides: {
  id: string;
  address: string;
  version?: number;
  operationType?: string;
  changedAt?: Date;
  actor?: { username: string; repoGuid: string; kind: string } | null;
}): HistoryTestDoc {
  const configOps: CpHistoryConfigOp[] = [{ op: "add", path: "/name", oldValue: null, newValue: "x" }];
  const repoGuid = splitAddress(overrides.address).repoGuid;
  return {
    _id: overrides.id,
    mutationId: overrides.id,
    requestId: null,
    sourceCollection: "cp_items",
    sourceId: overrides.id,
    repoGuid,
    address: overrides.address,
    version: overrides.version ?? 1,
    operationType: overrides.operationType ?? "insert",
    changedAt: overrides.changedAt ?? new Date(),
    actor: overrides.actor ?? { username: "system", repoGuid, kind: "system" },
    beforeHash: null,
    afterHash: "deadbeef",
    changes: { config: configOps, body: null },
    afterSnapshot: null,
    metadata: {},
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

  await test("listCpHistory only returns entries under the caller's own repo (isolation, by stored repoGuid field)", async () => {
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).insertMany([
      makeHistoryDoc({ id: "h1", address: `${REPO_A}/01` }),
      makeHistoryDoc({ id: "h2", address: `${REPO_B}/01` }),
    ]);
    const result = await listCpHistory({ repoGuid: REPO_A });
    assertEquals(result.items.length, 1);
    assertEquals(result.items[0].id, "h1");
  });

  await test("listCpHistory does not match a repo whose GUID is a string-prefix of another repo's GUID", async () => {
    // Regression guard: Story 79 filters on an exact `repoGuid` field
    // equality (not a regex), which is inherently immune to this — but
    // keep the regression test so a future refactor back to a regex
    // approach would still be caught.
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).deleteMany({});
    const prefixRepo = REPO_A.slice(0, 10); // shares a literal prefix with REPO_A
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).insertOne(makeHistoryDoc({ id: "h3", address: `${REPO_A}/01` }));
    const result = await listCpHistory({ repoGuid: prefixRepo });
    assertEquals(result.items.length, 0, "a bare string prefix must never match another repo's data");
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
      makeHistoryDoc({ id: "h9", address: `${REPO_A}/01`, operationType: "delete", version: 2 }),
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

  await test("listCpHistory(sourceId) sorts by version, not changedAt", async () => {
    // Deliberately give all docs the SAME changedAt and scrambled insertion
    // order — only `version` can distinguish them, proving the sourceId
    // branch really sorts by version and not by falling through to the
    // changedAt/_id branch.
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).deleteMany({});
    const sameInstant = new Date("2026-01-01T00:00:00.000Z");
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).insertMany([
      makeHistoryDoc({ id: "v3", address: `${REPO_A}/09`, version: 3, changedAt: sameInstant }),
      makeHistoryDoc({ id: "v1", address: `${REPO_A}/09`, version: 1, changedAt: sameInstant }),
      makeHistoryDoc({ id: "v2", address: `${REPO_A}/09`, version: 2, changedAt: sameInstant }),
    ]);
    // All three docs share sourceId "v1" by construction of makeHistoryDoc
    // (sourceId === id) — override so they share ONE sourceId as a real
    // item's version history would.
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).updateMany({}, { $set: { sourceId: "item-x" } });
    const result = await listCpHistory({ repoGuid: REPO_A, sourceId: "item-x" });
    assertEquals(result.items.map((i) => i.version), [3, 2, 1], "sourceId-scoped history must sort by version desc");
  });

  await test("getCpHistoryForItem returns full version history for one item, oldest first", async () => {
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).deleteMany({});
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).insertMany([
      { ...makeHistoryDoc({ id: "iv2", address: `${REPO_A}/07`, version: 2 }), sourceId: "item-y" },
      { ...makeHistoryDoc({ id: "iv1", address: `${REPO_A}/07`, version: 1 }), sourceId: "item-y" },
    ]);
    const result = await getCpHistoryForItem("item-y", REPO_A);
    assertEquals(result.map((r) => r.version), [1, 2]);
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
        _historyVersion: 1,
        _lastMutationId: "seed",
        _lastActor: null,
        _lastRequestId: null,
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

    // Real history from the executeWrite calls above already exists for
    // views/daily's own creation — filter further with a synthetic
    // fixture to prove the addressPrefix scoping itself, without deleting
    // the real entries.
    await db.collection<HistoryTestDoc>(HISTORY_COLLECTION).insertOne(
      makeHistoryDoc({ id: "dt2", address: `${REPO_A}/99/not-daily-tracker` })
    );

    const result = await listDailyTrackerHistory({ repoGuid: REPO_A, pageSize: 200 });
    assert(
      result.items.every((i) => i.address === dailyPrefix || i.address.startsWith(`${dailyPrefix}/`)),
      "every returned entry must be the Daily Tracker folder itself or a descendant"
    );
    assert(
      !result.items.some((i) => i.id === "dt2"),
      "an entry outside the Daily Tracker subtree must never appear"
    );
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

    const result = await listDateEntriesHistory({ repoGuid: REPO_A, pageSize: 200 });
    assert(
      result.items.every((i) => i.address === datesPrefix || i.address.startsWith(`${datesPrefix}/`)),
      "every returned entry must be the Dates folder itself or a descendant"
    );
    assert(
      !result.items.some((i) => i.address === dailyPrefix || i.address.startsWith(`${dailyPrefix}/`)),
      "Daily Tracker's own history must never leak into the Dates view"
    );
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
