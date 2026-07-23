/**
 * Per-request repo context — replaces the old hardcoded SHARED_REPO_ID.
 *
 * Every dashboard user has their own Content Provider repository
 * (identified by GUID, named `chad_<username>` in that repo's root
 * config.yaml — see documentation/dashboard/common/features/
 * chad-user-data-isolation.md). All data-access functions in this package
 * (leads.ts, beeper.ts, reports.ts, statuses-dashboard.ts, ai-answer.ts,
 * path-resolver.ts) call getCurrentRepoGuid() instead of referencing a
 * module-level constant.
 *
 * Uses Node's AsyncLocalStorage rather than a plain module-level variable:
 * a plain mutable variable would be shared across ALL concurrent requests
 * in the same Next.js server process, so two users' requests overlapping
 * in time could read/write each other's data. AsyncLocalStorage gives each
 * request's async call chain its own isolated context, which is the
 * standard safe pattern for this in Node.js.
 *
 * Every API route that calls into dba's data functions MUST wrap its
 * handler body in runWithRepoContext(...) after resolving the current
 * user. There is no fallback/default repo — getCurrentRepoGuid() throws
 * if called outside a context, by design: a missed route should fail
 * loudly (500, caught in review/testing) rather than silently leaking one
 * user's data to another.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export interface RepoContext {
  repoGuid: string;
  username: string;
  /**
   * Best-effort request correlation id (Story 79, cp_history rewrite) —
   * optional and non-breaking: existing callers of runWithRepoContext that
   * don't pass one still compile and still work, and history events for
   * those requests simply carry `requestId: null`. Never required for a
   * write to succeed; see tryGetCurrentRequestId().
   */
  requestId?: string;
}

const storage = new AsyncLocalStorage<RepoContext>();

export function runWithRepoContext<T>(
  context: RepoContext,
  fn: () => Promise<T>
): Promise<T> {
  return storage.run(context, fn);
}

export function getCurrentRepoGuid(): string {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error(
      "getCurrentRepoGuid() called outside of a request-scoped repo context. " +
        "The calling API route must resolve the current user and wrap its handler " +
        "in runWithRepoContext({ repoGuid, username }, async () => { ... })."
    );
  }
  return ctx.repoGuid;
}

export function getCurrentUsername(): string {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error(
      "getCurrentUsername() called outside of a request-scoped repo context."
    );
  }
  return ctx.username;
}

/**
 * Non-throwing variant for callers that must never fail just because they
 * ran outside a request-scoped context (e.g. a migration script, a test, a
 * background job) — used by data-commands.ts's builders to best-effort
 * stamp the acting user onto a write command for the history feature
 * (Story 74). Absence of an actor must never block the write itself or the
 * history it produces (recorded as "unknown" downstream), so this returns
 * `null` instead of throwing.
 */
export function tryGetCurrentActor(): RepoContext | null {
  return storage.getStore() ?? null;
}

/**
 * Non-throwing request-correlation id for the cp_history mutation writer
 * (Story 79) — `null` when the calling route never passed one to
 * runWithRepoContext, or when called outside any context (migration
 * scripts, tests). Never blocks a write.
 */
export function tryGetCurrentRequestId(): string | null {
  return storage.getStore()?.requestId ?? null;
}
