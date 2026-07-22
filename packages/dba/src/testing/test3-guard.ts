/**
 * Load-bearing safety guard for every test in Story 78 that mutates data on
 * the real, shared QNAP TEST Mongo (`chad-mongodb` — holds PROD data too,
 * see `ai-docs/begin_here/01_ai_start.md` and `backlog/stories/78/`).
 *
 * Not published as part of `dba`'s public surface for application code —
 * this lives under `src/testing/` and is imported only by test files
 * (`packages/dba/src/testing/**\/*.test.ts`, integration/E2E helpers), never
 * by `packages/dashboard`/`packages/console` runtime code.
 *
 * Every destructive test helper (create/update/delete via DBA or HTTP,
 * fixture provisioning, cleanup) MUST call `assertTest3Scoped(address)`
 * before performing the mutation. This is the one mechanism standing
 * between "isolated test run" and "accidentally touching pawel_f's or
 * kamil_s's real data" — see Story 78 Input 1 §1.2/§12 and Input 2 (the
 * whole reason `test3` exists is to test the real environment safely, via
 * repoGuid isolation, not via a separate sandboxed database).
 */

/**
 * `test3`'s real, stable repoGuid — confirmed 2026-07-23 against the real
 * `chad_admin/users/users-list` on QNAP's shared Mongo (read-only lookup,
 * see `backlog/stories/78/02_plan.md` §0). This account already exists;
 * this Story only provisions its own repo/data, never reassigns this GUID.
 */
export const TEST3_REPO_GUID = "5a9c8b7d-6e5f-4a3b-2c1d-0e9f8a7b6c5d";
export const TEST3_USERNAME = "test3";

export class Test3ScopeViolationError extends Error {
  constructor(address: string) {
    super(
      `Refusing to touch address "${address}" — it is outside test3's own repo ` +
        `(must equal "${TEST3_REPO_GUID}" or start with "${TEST3_REPO_GUID}/"). ` +
        `This guard exists specifically to prevent a test from ever mutating ` +
        `pawel_f's, kamil_s's, or chad_admin's real data on the shared QNAP Mongo.`
    );
    this.name = "Test3ScopeViolationError";
  }
}

/**
 * Throws unless `address` is exactly test3's repo root, or a descendant of
 * it (`TEST3_REPO_GUID` or `TEST3_REPO_GUID + "/..."`). Anchored so a GUID
 * that merely shares a string prefix with `TEST3_REPO_GUID` is correctly
 * rejected (same regex-anchoring lesson as `cp-history.ts`'s repo-isolation
 * check — see its own regression test).
 */
export function assertTest3Scoped(address: string): void {
  if (typeof address !== "string" || address.length === 0) {
    throw new Test3ScopeViolationError(String(address));
  }
  const isRoot = address === TEST3_REPO_GUID;
  const isDescendant = address.startsWith(`${TEST3_REPO_GUID}/`);
  if (!isRoot && !isDescendant) {
    throw new Test3ScopeViolationError(address);
  }
}

export interface Test3SessionLike {
  username: string;
  repoGuid: string;
}

/**
 * Re-verifies the actual logged-in/session identity a test is about to act
 * as, never trusting a hardcoded constant alone — Input 1 §1.2's own
 * requirement ("przed mutacją musi potwierdzić, że użytkownik nazywa się
 * dokładnie test3, jego repoGuid jest równy oczekiwanemu testowemu GUID").
 */
export function assertIsTest3Session(session: Test3SessionLike | null | undefined): void {
  if (!session) {
    throw new Error("assertIsTest3Session: no session — refusing to proceed with a destructive test operation.");
  }
  if (session.username !== TEST3_USERNAME || session.repoGuid !== TEST3_REPO_GUID) {
    throw new Error(
      `assertIsTest3Session: session is username=${session.username} repoGuid=${session.repoGuid}, ` +
        `expected username=${TEST3_USERNAME} repoGuid=${TEST3_REPO_GUID}. Refusing to proceed.`
    );
  }
}

/**
 * A short, explicit denylist of Mongo operations that must never appear in
 * any Story 78 test/provisioner code path, checked at review time (grepped
 * for in the regression-runner script, see `bash-scripts/tests/`) — not a
 * runtime guard (a string denylist can't intercept a real driver call), but
 * documents the exact list so a code reviewer (human or AI) has a concrete
 * checklist. See Input 1 §12.
 */
export const FORBIDDEN_OPERATIONS = ["deleteMany({})", "dropDatabase(", ".drop(", "rs.reconfig(", "rs.initiate("] as const;
