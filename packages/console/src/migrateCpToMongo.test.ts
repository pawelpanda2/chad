/**
 * migrateCpToMongo.ts tests — the traversal/report/idempotency logic,
 * against a fake in-process CpCompatibleDataProvider standing in for the
 * legacy Content Provider (same pattern as `data-router.test.ts`), plus
 * the REAL MongoCpProvider against the local test MongoDB for --apply.
 *
 * A live end-to-end run against a real Content Provider instance was NOT
 * done in this session (see Story 72 `06_others_from_report.md` — the
 * only available local CP container is the shared, login-critical
 * instance, and restarting it once already caused a real incident this
 * session; a second restart to mount a throwaway fixture repo under the
 * real Dropbox path was judged not worth the risk). This test instead
 * substitutes a fake provider so the migrator's OWN logic (walking a
 * Folder tree, classifying imported/unchanged/failed, duplicate
 * detection, idempotent re-run) is still genuinely exercised.
 *
 * Run via: npx tsc && node dist/migrateCpToMongo.test.js
 */

import { getMongoDb, closeMongoConnection, MongoCpProvider, systemClock, ITEMS_COLLECTION } from "dba";
import type { CpItem } from "dba";
import { migrateRepo, type MigratorMode } from "./migrateCpToMongo.js";

const REPO = "test-migrator-repo-guid";

// A tiny in-memory CP-shaped tree:
//   root (Folder, loca "")
//     01 (Folder, "docs")
//       01 (Text, "readme")
//     02 (Text, "standalone")
const TREE: Record<string, CpItem> = {
  "": { _id: "root-id", config: { id: "root-id", address: REPO, type: "Folder", name: "root" }, body: "" },
  "01": { _id: "docs-id", config: { id: "docs-id", address: `${REPO}/01`, type: "Folder", name: "docs" }, body: "" },
  "01/01": { _id: "readme-id", config: { id: "readme-id", address: `${REPO}/01/01`, type: "Text", name: "readme" }, body: "readme contents" },
  "02": { _id: "standalone-id", config: { id: "standalone-id", address: `${REPO}/02`, type: "Text", name: "standalone" }, body: "standalone contents" },
};
const CHILDREN: Record<string, { index: string; name: string }[]> = {
  "": [
    { index: "01", name: "docs" },
    { index: "02", name: "standalone" },
  ],
  "01": [{ index: "01", name: "readme" }],
};

async function runTests() {
  console.log("Running migrateCpToMongo Tests...\n");
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

  // Fake tree-walk dependencies, injected via migrateRepo's `deps` param
  // (no module-namespace monkey-patching — ES module named exports are
  // read-only live bindings and can't be reassigned from another module).
  const fakeGetItem = async (input: { address: string }): Promise<CpItem | null> => {
    const loca = input.address === REPO ? "" : input.address.slice(REPO.length + 1);
    return TREE[loca] ?? null;
  };
  const fakeGetFolderChildren = async (_repo: string, loca: string) => CHILDREN[loca] ?? [];

  const db = await getMongoDb();
  await db.collection(ITEMS_COLLECTION).deleteMany({ "config.address": { $regex: `^${REPO}` } });

  const mongoProvider = new MongoCpProvider(systemClock);

  function deps(mode: MigratorMode) {
    return {
      getItem: fakeGetItem,
      getFolderChildren: fakeGetFolderChildren,
      mongo: mode === "validate-only" ? null : mongoProvider,
    };
  }

  await test("validate-only scans the whole tree without touching Mongo", async () => {
    const report = await migrateRepo(REPO, "validate-only", () => {}, deps("validate-only"));
    assertEquals(report.itemsScanned, 4);
    assertEquals(report.itemsValid, 4);
    assertEquals(report.itemsFailed, 0);
    assertEquals(report.duplicateIds.length, 0);
    assertEquals(report.duplicateAddresses.length, 0);
    const count = await db.collection(ITEMS_COLLECTION).countDocuments({ "config.address": { $regex: `^${REPO}` } });
    assertEquals(count, 0, "validate-only must never write to Mongo");
  });

  await test("dry-run reports everything as 'would import' without writing", async () => {
    const report = await migrateRepo(REPO, "dry-run", () => {}, deps("dry-run"));
    assertEquals(report.itemsImported, 4);
    assertEquals(report.itemsUnchanged, 0);
    const count = await db.collection(ITEMS_COLLECTION).countDocuments({ "config.address": { $regex: `^${REPO}` } });
    assertEquals(count, 0, "dry-run must never write to Mongo");
  });

  await test("apply imports all 4 items into Mongo", async () => {
    const report = await migrateRepo(REPO, "apply", () => {}, deps("apply"));
    assertEquals(report.itemsImported, 4);
    assertEquals(report.itemsUnchanged, 0);
    assertEquals(report.itemsFailed, 0);

    const readme = await mongoProvider.getItem({ id: "readme-id" });
    assertEquals(readme?.body, "readme contents");
    assertEquals(readme?.config.address, `${REPO}/01/01`);
  });

  await test("re-applying the same tree is idempotent: reports unchanged, no duplicates created", async () => {
    const report = await migrateRepo(REPO, "apply", () => {}, deps("apply"));
    assertEquals(report.itemsImported, 0);
    assertEquals(report.itemsUnchanged, 4);
    const count = await db.collection(ITEMS_COLLECTION).countDocuments({ "config.address": { $regex: `^${REPO}` } });
    assertEquals(count, 4, "re-running must not create duplicates");
  });

  await test("a changed body is detected and re-imported (not silently skipped) on the next apply", async () => {
    TREE["02"] = { ...TREE["02"], body: "updated standalone contents" };
    const report = await migrateRepo(REPO, "apply", () => {}, deps("apply"));
    assertEquals(report.itemsImported, 1);
    assertEquals(report.itemsUnchanged, 3);

    const standalone = await mongoProvider.getItem({ id: "standalone-id" });
    assertEquals(standalone?.body, "updated standalone contents");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  await closeMongoConnection();
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
