// Pure unit tests, no DB — guards against the Folders GUI (or any future
// generic write path) ever being able to mutate rows that are actually
// owned by Daily Tracker / Dates / Leads (see
// packages/dba/src/system-folders.ts and its use from folders.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { DBA_DIST } from "../../../support/database/tables-sync-env.mjs";

const { listReadOnlyFolders, assertNotSystemFolderWrite, findProtectingSystemFolder, SystemFolderReadOnlyError } = await import(
  `${DBA_DIST}/system-folders.js`
);

test("listReadOnlyFolders lists exactly the three dedicated-GUI-owned folders", () => {
  const rows = listReadOnlyFolders();
  const addresses = rows.map((r) => r.address).sort();
  assert.deepEqual(addresses, ["leads", "views/daily", "views/dates"]);
  for (const row of rows) {
    assert.equal(row.status, "read-only");
    assert.ok(row.managedBy, "every read-only folder must name who manages it");
    assert.ok(row.reason, "every read-only folder must explain why it's read-only");
  }
});

test("assertNotSystemFolderWrite throws SYSTEM_FOLDER_READ_ONLY for the folder itself (update-body)", () => {
  assert.throws(
    () => assertNotSystemFolderWrite(["views", "daily"], "update-body"),
    (err) => {
      assert.ok(err instanceof SystemFolderReadOnlyError);
      assert.equal(err.code, "SYSTEM_FOLDER_READ_ONLY");
      assert.equal(err.managedBy, "Daily Tracker");
      return true;
    }
  );
});

test("assertNotSystemFolderWrite throws for a descendant of a system folder (delete)", () => {
  assert.throws(
    () => assertNotSystemFolderWrite(["views", "dates", "07", "02"], "delete"),
    (err) => {
      assert.ok(err instanceof SystemFolderReadOnlyError);
      assert.equal(err.managedBy, "Dates");
      return true;
    }
  );
});

test("assertNotSystemFolderWrite throws for create-child directly under a system folder", () => {
  assert.throws(
    () => assertNotSystemFolderWrite(["leads"], "create-child"),
    (err) => {
      assert.ok(err instanceof SystemFolderReadOnlyError);
      assert.equal(err.managedBy, "Leads");
      return true;
    }
  );
});

test("assertNotSystemFolderWrite does not throw for an unrelated folder", () => {
  assert.doesNotThrow(() => assertNotSystemFolderWrite(["reports"], "update-body"));
  assert.doesNotThrow(() => assertNotSystemFolderWrite(["hidden", "01"], "delete"));
});

test("findProtectingSystemFolder resolves the longest matching prefix, not just an exact match", () => {
  const hit = findProtectingSystemFolder(["views", "daily", "01", "02"]);
  assert.ok(hit);
  assert.deepEqual(hit.namePath, ["views", "daily"]);
});
