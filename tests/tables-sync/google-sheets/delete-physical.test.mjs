// Regression guard for the "physical delete" fix: deleting a synced Daily
// Entry/Date Entry row must PHYSICALLY remove it from the sheet (0 rows
// left), never just tombstone it in place. Runs against the real local
// outbox + FakeGoogleSheetsClient — Google's own API is never called by
// this suite.
//
// Deliberately forces the MONGODB-backed outbox, never Postgres — see
// `helpers/env.mjs`'s `probeMongoReachable()` doc comment for why (a live
// dashboard container on this repo's local stack may already be polling
// the SHARED Postgres `cp_outbox_google_sheets_sync` table with its own
// real background worker, which would race to claim our synthetic test
// jobs first).
//
// Skips (never fails) when no local MongoDB is reachable — this suite
// must be safe to run in a sandbox with no docker-compose stack up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTablesSyncEnv, probeMongoReachable, DBA_DIST } from "../helpers/env.mjs";
import { FakeGoogleSheetsClient, SHEET_NAMES, dailyTarget, datesTarget, testRepoGuid, buildPayload } from "../helpers/fake-sheets.mjs";

loadTablesSyncEnv();
process.env.DBA_PRIMARY_BACKEND = "mongo";

const dbReachable = await probeMongoReachable();
const skip = !dbReachable && "no local MongoDB reachable — start docker-compose.local.yml's mongodb service to run this suite";

const { enqueueGoogleSheetsSync, GOOGLE_SHEETS_OUTBOX_COLLECTION } = await import(`${DBA_DIST}/google-sheets/outbox.js`);
const { drainGoogleSheetsSyncOnce } = await import(`${DBA_DIST}/google-sheets/worker.js`);
const { getMongoDb, closeMongoConnection } = dbReachable ? await import(`${DBA_DIST}/mongo.js`) : {};

async function cleanupOutboxFor(recordKey) {
  if (!dbReachable) return;
  const db = await getMongoDb();
  await db.collection(GOOGLE_SHEETS_OUTBOX_COLLECTION).deleteMany({ recordKey });
}

test(
  "daily-entry: create then delete -> the row is physically removed (0 rows), not just marked DELETED",
  { skip },
  async () => {
    const repoGuid = testRepoGuid("delete-physical-daily");
    const loca = "01";
    const recordKey = `${repoGuid}:${loca}`;
    const client = new FakeGoogleSheetsClient();

    // Defensive: a previous run of this suite that got killed (SIGKILL,
    // CI timeout, ...) before reaching its own `cleanupOutboxFor` below can
    // leave a `status: "synced"` doc under this SAME fixed operationId —
    // `enqueueGoogleSheetsSync` is idempotent-by-operationId and would then
    // silently no-op the enqueue below, making this test fail with "row
    // should exist right after create" for a reason that has nothing to do
    // with an actual regression. Always start from a clean slate.
    await cleanupOutboxFor(recordKey);

    await enqueueGoogleSheetsSync({
      operationId: `${recordKey}-create`,
      kind: "upsert",
      payload: buildPayload({ recordType: "daily-entry", loca, repoGuid, fields: { DATE: "2026-07-20", STATE: "TAK" } }),
    });
    await drainGoogleSheetsSyncOnce({ client, sheetNames: SHEET_NAMES, workerId: "tables-sync-test-delete-physical-daily" });

    assert.equal(client.getRows(dailyTarget()).length, 1, "row should exist right after create");

    await enqueueGoogleSheetsSync({
      operationId: `${recordKey}-delete`,
      kind: "delete",
      payload: buildPayload({ recordType: "daily-entry", loca, repoGuid, fields: {} }),
    });
    await drainGoogleSheetsSyncOnce({ client, sheetNames: SHEET_NAMES, workerId: "tables-sync-test-delete-physical-daily" });

    const rows = client.getRows(dailyTarget());
    assert.equal(rows.length, 0, "delete must physically remove the row, leaving 0 rows");
    assert.equal(
      await client.findRowByKey(dailyTarget(), "CHAD_RECORD_KEY", recordKey),
      null,
      "the deleted recordKey must no longer be findable at all"
    );

    await cleanupOutboxFor(recordKey);
  }
);

test(
  "date-entry: create then delete -> the row is physically removed (0 rows)",
  { skip },
  async () => {
    const repoGuid = testRepoGuid("delete-physical-date");
    const loca = "01/01";
    const recordKey = `${repoGuid}:${loca}`;
    const client = new FakeGoogleSheetsClient();

    // See the daily-entry test above for why this defensive cleanup is needed.
    await cleanupOutboxFor(recordKey);

    await enqueueGoogleSheetsSync({
      operationId: `${recordKey}-create`,
      kind: "upsert",
      payload: buildPayload({ recordType: "date-entry", loca, repoGuid, fields: { DATA: "2026-07-20", NAZWA: "Ala" } }),
    });
    await drainGoogleSheetsSyncOnce({ client, sheetNames: SHEET_NAMES, workerId: "tables-sync-test-delete-physical-date" });
    assert.equal(client.getRows(datesTarget()).length, 1);

    await enqueueGoogleSheetsSync({
      operationId: `${recordKey}-delete`,
      kind: "delete",
      payload: buildPayload({ recordType: "date-entry", loca, repoGuid, fields: {} }),
    });
    await drainGoogleSheetsSyncOnce({ client, sheetNames: SHEET_NAMES, workerId: "tables-sync-test-delete-physical-date" });

    assert.equal(client.getRows(datesTarget()).length, 0, "delete must physically remove the row, leaving 0 rows");

    await cleanupOutboxFor(recordKey);
  }
);

test("closes the connection after the suite (host process, not the long-lived dashboard)", { skip }, async () => {
  await closeMongoConnection?.();
});
