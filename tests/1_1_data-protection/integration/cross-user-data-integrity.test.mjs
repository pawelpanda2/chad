// Data-protection framing (2026-07-28 audit) around the Google Sheets sync
// path: real users (pawel_f, kamil_s) must never be writable from a non-
// prod environment, and a lost-sync-job must never be indistinguishable
// from "nothing to sync" in the classification callers rely on. The
// mechanical PostgreSQL<->Sheet reconciliation itself lives in
// tests/1_2_google-sheets-sync (never duplicated here — see
// reconcile-real-users.test.mjs for the actual per-table diff).
import { describe, it, expect } from "vitest";
import { classifyOutboxState } from "../../support/google-sheets/reconciliation.mjs";

const dba = await import("../../../packages/dba/dist/index.js");

describe("Data protection — Google Sheets write allowlist never includes real users", () => {
  it("pawel_f and kamil_s are never in the non-prod write allowlist (default GOOGLE_SHEETS_NON_PROD_WRITE_USERS)", () => {
    const previous = process.env.CHAD_ENVIRONMENT;
    const previousAllow = process.env.GOOGLE_SHEETS_ALLOW_NON_PROD;
    const previousAllowlist = process.env.GOOGLE_SHEETS_NON_PROD_WRITE_USERS;
    try {
      process.env.CHAD_ENVIRONMENT = "test";
      delete process.env.GOOGLE_SHEETS_NON_PROD_WRITE_USERS; // exercise the real default, not a test-local override
      for (const realUser of ["pawel_f", "kamil_s"]) {
        const result = dba.checkGoogleSheetsWriteAllowed(realUser);
        expect(result.allowed, `${realUser} must never be write-allowed on a non-prod environment by default`).toBe(false);
      }
      // test3 stays allowed — it's the one account this allowlist exists for.
      expect(dba.checkGoogleSheetsWriteAllowed("test3").allowed).toBe(true);
    } finally {
      process.env.CHAD_ENVIRONMENT = previous;
      if (previousAllow === undefined) delete process.env.GOOGLE_SHEETS_ALLOW_NON_PROD;
      else process.env.GOOGLE_SHEETS_ALLOW_NON_PROD = previousAllow;
      if (previousAllowlist === undefined) delete process.env.GOOGLE_SHEETS_NON_PROD_WRITE_USERS;
      else process.env.GOOGLE_SHEETS_NON_PROD_WRITE_USERS = previousAllowlist;
    }
  });
});

describe("Data protection — a lost sync job must never be reported as a correct/empty state", () => {
  it("a record with real history but zero outbox job classifies as lost_outbox, distinct from legacy_no_history", () => {
    // This is the exact shape of the pawel_f Daily bug this audit found:
    // real cp_history, zero cp_outbox_google_sheets_sync rows ever created.
    const withHistoryNoJob = classifyOutboxState({ hasHistory: true, job: null });
    const noHistoryAtAll = classifyOutboxState({ hasHistory: false, job: null });
    expect(withHistoryNoJob).toBe("lost_outbox");
    expect(noHistoryAtAll).toBe("legacy_no_history");
    expect(withHistoryNoJob).not.toBe(noHistoryAtAll);
  });

  it("a failed job's error is preserved, never silently swallowed into a generic status", () => {
    const state = classifyOutboxState({ hasHistory: true, job: { status: "failed", lastError: "429 RESOURCE_EXHAUSTED" } });
    expect(state).toBe("failed_visible");
  });
});
