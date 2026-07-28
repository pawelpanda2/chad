// History -> Google Sheets status shapes
// (`getGoogleSheetsSyncStatusForHistoryEntry`, used by
// /api/content-provider/history/[id]). The "not configured" shape is pure
// (no DB call at all — see outbox.ts's early return); the "no sync yet"
// shape needs a real outbox lookup, so it's skipped (not failed) when no
// local datastore is reachable, same convention as every other
// credential/DB-gated test in this repo.
//
// Forces the MONGODB-backed outbox (never Postgres) for the same reason as
// google-sheets/delete-physical.test.mjs / worker-order.test.mjs — see
// `helpers/env.mjs`'s `probeMongoReachable()` doc comment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTablesSyncEnv, probeMongoReachable, DBA_DIST, TABLES_SYNC_TEST_PREFIX } from "../helpers/env.mjs";

loadTablesSyncEnv();
process.env.DBA_PRIMARY_BACKEND = "mongo";

const { getGoogleSheetsSyncStatusForHistoryEntry } = await import(`${DBA_DIST}/google-sheets/outbox.js`);

test("spreadsheetConfigured=false short-circuits to the 'not configured' shape without any outbox lookup", async () => {
  const status = await getGoogleSheetsSyncStatusForHistoryEntry({
    mutationId: "does-not-matter",
    repoGuid: `${TABLES_SYNC_TEST_PREFIX}-repo`,
    address: `${TABLES_SYNC_TEST_PREFIX}-repo/01`,
    username: "someone",
    spreadsheetConfigured: false,
  });

  assert.equal(status.kind, "not_configured");
  assert.equal(status.label, "not configured");
  assert.equal(status.lastSyncedAt, null);
  assert.equal(status.lastError, null);
  assert.equal(status.spreadsheetId, null);
  assert.equal(status.spreadsheetUrl, null);
  assert.equal(status.jobId, null);
});

const dbReachable = await probeMongoReachable();

test(
  "spreadsheetConfigured=true but no matching job yet -> the 'no sync yet' shape",
  { skip: !dbReachable && "no local MongoDB reachable — set MONGODB_URI / start docker-compose.local.yml mongodb to run this check" },
  async () => {
    const repoGuid = `${TABLES_SYNC_TEST_PREFIX}-repo-history-shape`;
    const status = await getGoogleSheetsSyncStatusForHistoryEntry({
      mutationId: `${TABLES_SYNC_TEST_PREFIX}-mutation-never-enqueued-${Date.now()}`,
      repoGuid,
      address: `${repoGuid}/99/99`,
      username: "someone",
      spreadsheetConfigured: true,
    });

    assert.equal(status.kind, "none");
    assert.equal(status.label, "no sync yet");
    assert.equal(status.lastSyncedAt, null);
    assert.equal(status.lastError, null);
    assert.equal(status.jobId, null);
    assert.equal(status.recordKey, `${repoGuid}:99/99`);
  }
);

test(
  "closes the connection after the suite (host process, not the long-lived dashboard)",
  { skip: !dbReachable },
  async () => {
    const { closeMongoConnection } = await import(`${DBA_DIST}/mongo.js`);
    await closeMongoConnection();
  }
);
