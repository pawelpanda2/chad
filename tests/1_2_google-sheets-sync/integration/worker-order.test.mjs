// create -> update -> delete, in order, against the real local outbox +
// FakeGoogleSheetsClient: asserts the row updates in place (no duplicate),
// preserves CHAD_CREATED_AT across the update, and ends up fully removed
// after the delete — the full life cycle a single Daily Tracker row goes
// through in practice.
//
// Deliberately forces the MONGODB-backed outbox, never Postgres — see
// `helpers/env.mjs`'s `probeMongoReachable()` doc comment (avoids racing a
// live dashboard container's own real background worker on the shared
// Postgres outbox table). Skips when no local MongoDB is reachable.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTablesSyncEnv, probeMongoReachable, DBA_DIST } from "../../support/database/tables-sync-env.mjs";
import { FakeGoogleSheetsClient, SHEET_NAMES, dailyTarget, testRepoGuid, buildPayload } from "../../support/google-sheets/fake-sheets.mjs";

loadTablesSyncEnv();
process.env.DBA_PRIMARY_BACKEND = "mongo";

const dbReachable = await probeMongoReachable();
const skip = !dbReachable && "no local MongoDB reachable — start docker-compose.local.yml's mongodb service to run this suite";

const { enqueueGoogleSheetsSync, GOOGLE_SHEETS_OUTBOX_COLLECTION } = await import(`${DBA_DIST}/google-sheets/outbox.js`);
const { drainGoogleSheetsSyncOnce } = await import(`${DBA_DIST}/google-sheets/worker.js`);
const { getMongoDb, closeMongoConnection } = dbReachable ? await import(`${DBA_DIST}/mongo.js`) : {};

test(
  "create -> update -> delete converges to an empty sheet, with a correct in-place update in between",
  { skip },
  async () => {
    const repoGuid = testRepoGuid("worker-order");
    const loca = "01";
    const recordKey = `${repoGuid}:${loca}`;
    const workerId = "tables-sync-test-worker-order";
    const client = new FakeGoogleSheetsClient();

    // Defensive: a previous run of this suite that got killed before
    // reaching its own `finally` cleanup below can leave `status: "synced"`
    // docs under these SAME fixed operationIds — `enqueueGoogleSheetsSync`
    // is idempotent-by-operationId and would then silently no-op the
    // enqueues below, causing false failures unrelated to any real
    // regression. Always start from a clean slate.
    if (dbReachable) {
      const db = await getMongoDb();
      await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).deleteMany({ recordKey });
    }

    try {
      // 1. create
      await enqueueGoogleSheetsSync({
        operationId: `${recordKey}-create`,
        kind: "upsert",
        payload: buildPayload({ recordType: "daily-entry", loca, repoGuid, fields: { DATE: "2026-07-20", APPROACHES: "1" } }),
      });
      await drainGoogleSheetsSyncOnce({ client, sheetNames: SHEET_NAMES, workerId });

      const afterCreate = client.getRows(dailyTarget());
      assert.equal(afterCreate.length, 1, "exactly one row after create");
      assert.equal(afterCreate[0].APPROACHES, "1");
      const createdAt = afterCreate[0].CHAD_CREATED_AT;
      assert.ok(createdAt, "CHAD_CREATED_AT must be set on create");

      // 2. update (same recordKey — must update in place, not duplicate)
      await enqueueGoogleSheetsSync({
        operationId: `${recordKey}-update`,
        kind: "upsert",
        payload: buildPayload({ recordType: "daily-entry", loca, repoGuid, fields: { DATE: "2026-07-20", APPROACHES: "5" } }),
      });
      await drainGoogleSheetsSyncOnce({ client, sheetNames: SHEET_NAMES, workerId });

      const afterUpdate = client.getRows(dailyTarget());
      assert.equal(afterUpdate.length, 1, "still exactly one row after update — no duplicate");
      assert.equal(afterUpdate[0].APPROACHES, "5", "update must land the new value");
      assert.equal(afterUpdate[0].CHAD_CREATED_AT, createdAt, "CHAD_CREATED_AT must never change on update");

      // 3. delete -> final state is empty
      await enqueueGoogleSheetsSync({
        operationId: `${recordKey}-delete`,
        kind: "delete",
        payload: buildPayload({ recordType: "daily-entry", loca, repoGuid, fields: {} }),
      });
      await drainGoogleSheetsSyncOnce({ client, sheetNames: SHEET_NAMES, workerId });

      assert.equal(client.getRows(dailyTarget()).length, 0, "final state must be empty after delete");
    } finally {
      if (dbReachable) {
        const db = await getMongoDb();
        await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).deleteMany({ recordKey });
      }
    }
  }
);

test("closes the connection after the suite (host process, not the long-lived dashboard)", { skip }, async () => {
  await closeMongoConnection?.();
});
