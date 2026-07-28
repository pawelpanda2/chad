// 2026-07-28 — verifies the sync.ts fix directly: a Daily/Date/Lead write
// that SHOULD sync (passes environment/user guards) but has no spreadsheet
// mapping must leave a visible `failed` outbox row with a `lastError`,
// never nothing. This is the exact class of bug the pawel_f Daily gap
// exposed (see tests/release-audit-report.md) — this test targets the
// live sync.ts code path directly (queueDailyEntrySheetSyncIfEnabled),
// unlike the QNAP-TEST-HTTP-based tests which exercise whatever is already
// deployed there, not local source changes.
//
// Uses a synthetic repoGuid/username that is guaranteed to never be in
// GOOGLE_SHEETS_SPREADSHEET_MAP — never touches real user data.
import { describe, it, expect, afterAll } from "vitest";
import { loadTablesSyncEnv, probePostgresReachable, DBA_DIST } from "../../support/database/tables-sync-env.mjs";

loadTablesSyncEnv();

describe.skipIf(!(await probePostgresReachable()))("sync.ts — blocked outbox job on unmapped user (no lost outbox)", () => {
  let queueDailyEntrySheetSyncIfEnabled, getLatestGoogleSheetsJobForRecordKey, closePostgresConnection;

  it("enqueues a visible failed job (not nothing) when the user has no spreadsheet mapping", async () => {
    ({ queueDailyEntrySheetSyncIfEnabled, getLatestGoogleSheetsJobForRecordKey, closePostgresConnection } = await import(
      `${DBA_DIST}/index.js`
    ));

    process.env.CHAD_ENVIRONMENT = "prod"; // prod: all mapped users may enqueue, isolates this test from the non-prod allowlist policy.
    process.env.DBA_PRIMARY_BACKEND = "postgres";
    process.env.DBA_POSTGRES_ENABLED = "true";
    process.env.DBA_MONGO_ENABLED = "false";
    const repoGuid = "00000000-0000-4000-8000-blockedjobtest";
    const username = "blocked-job-verification-user"; // never in GOOGLE_SHEETS_SPREADSHEET_MAP.
    const loca = "99/99";
    const recordKey = `${repoGuid}:${loca}`;

    await queueDailyEntrySheetSyncIfEnabled({
      repoGuid,
      username,
      loca,
      itemName: "blocked-job-test",
      fields: { DATE: "2026-01-01" },
      kind: "upsert",
    });

    const job = await getLatestGoogleSheetsJobForRecordKey(recordKey);
    expect(job, "a visible outbox job must exist — never silently nothing for a would-be-synced user").not.toBeNull();
    expect(job.status).toBe("failed");
    expect(job.lastError).toContain("resolveSpreadsheetIdForUser");
  });
});

afterAll(async () => {
  const dba = await import(`${DBA_DIST}/index.js`).catch(() => null);
  await dba?.closePostgresConnection().catch(() => {});
});
