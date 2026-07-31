/**
 * Identity/repo-context resolution (Input §1.6 — "skąd MCP bierze zaufany
 * repoGuid użytkownika?"). No MCP tool ever accepts a repoGuid argument
 * from the model — every tool call resolves this module's ONE server-wide
 * identity and runs inside `dba`'s own `runWithRepoContext`
 * (`packages/dba/src/repo-context.ts`), the same AsyncLocalStorage
 * mechanism every dashboard API route already uses.
 *
 * This Story's identity source is a controlled local config profile
 * (`MCP_TEST_USERNAME`), not a login session — appropriate only because the
 * one supported client right now is a locally-spawned stdio process
 * (Odyseusz). A future HTTP transport needs its own per-request identity
 * (auth token → username → repoGuid, via the same lookup below), never this
 * module's single cached profile — see http.ts's own doc comment.
 *
 * Username → repoGuid lookup: reads `chad_admin/users/users-list` via
 * `dba`'s `getUsersListBody()` (`packages/dba/src/admin-users.ts`) — the
 * SAME source `packages/dashboard/lib/user-service.ts`'s `findUserByUsername`
 * uses for login, routed through `item-ops.ts`/`getDataRouter()` like every
 * other business function (works against whichever backend is configured
 * primary — Postgres here — no dependency on the legacy raw Content
 * Provider `/invoke` API). Deliberately NOT `dba`'s `resolveOwnRepo()`
 * (`repo-access.ts`): that helper calls `getAllRepos()`
 * (`client.ts`), which hits the legacy Content Provider HTTP API directly —
 * confirmed NOT part of the current local Docker stack
 * (`docker-compose.local.yml`: "Content Provider (content-provider-api)
 * removed from this stack") and not buildable via the current
 * `03_local_mac_docker/02_build.sh` pipeline (Story 97 `02_plan.md` records
 * this investigation). The parsed user record's `passwordHash`/`email` are
 * discarded immediately after the lookup — only `{ repoGuid, username }` is
 * ever kept or logged.
 *
 * Locked to exactly "test3" — this repo's one identity with an established,
 * guarded, resettable test repoGuid (`packages/dba/src/testing/test3-guard.ts`,
 * Story 78 — that module itself is test-only and not part of `dba`'s public
 * exports, so its constant is intentionally NOT imported here; this lookup
 * independently re-derives the same repoGuid live from `chad_admin`). This
 * applies to BOTH reads and writes: the whole point of this config profile
 * is "the local test identity", not "any real user read-only" — reusing it
 * for a real user's data was explicitly out of scope for this Story (Input
 * §1.6 forbids pawel_f/kamil_s for writes; locking reads to the same
 * test3-only identity removes any risk of this profile ever silently
 * pointing at real user data through a misconfigured env var).
 */

import { getItemByAddress, getUsersListBody, runWithRepoContext } from "dba";
import { load as loadYaml } from "js-yaml";
import type { McpConfig } from "./config.js";

export const REQUIRED_TEST_USERNAME = "test3";

export interface McpIdentity {
  repoGuid: string;
  username: string;
}

export class IdentityNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdentityNotConfiguredError";
  }
}

export class RepoScopeViolationError extends Error {
  constructor(address: string, repoGuid: string) {
    super(
      `Refusing to touch address "${address}" — it is outside the configured repo ` +
        `(must equal "${repoGuid}" or start with "${repoGuid}/").`
    );
    this.name = "RepoScopeViolationError";
  }
}

let cachedIdentity: McpIdentity | null = null;

/** Test-only hook to reset the module-level cache between test cases. */
export function __resetIdentityCacheForTests(): void {
  cachedIdentity = null;
}

/** Only the fields ever read out of a `users-list` row — never `passwordHash`/`email`. */
interface MinimalUsersListRow {
  username?: unknown;
  repoGuid?: unknown;
}

/**
 * Finds `username`'s repoGuid in `chad_admin/users/users-list`'s YAML body.
 * Pure/no I/O beyond the one `getUsersListBody()` call — kept minimal and
 * self-contained here rather than editing `packages/dba/src/index.ts`
 * (under active concurrent edit by another session at the time this Story
 * ran — see `02_plan.md`); `findLoginRepoGuid`-equivalent logic already
 * exists once in `packages/dashboard/lib/user-service.ts` for the login
 * flow — this is a deliberately small, independent duplicate for the same
 * read-only lookup, not a new parallel CRUD layer.
 */
async function findRepoGuidByUsername(username: string): Promise<string | null> {
  const body = await getUsersListBody();
  if (!body) return null;

  const parsed = loadYaml(body) as { users?: unknown } | null;
  const rows = Array.isArray(parsed?.users) ? (parsed!.users as MinimalUsersListRow[]) : [];
  const match = rows.find(
    (row) => typeof row.username === "string" && row.username.toLowerCase() === username.toLowerCase()
  );
  if (!match || typeof match.repoGuid !== "string" || match.repoGuid.length === 0) {
    return null;
  }
  return match.repoGuid;
}

/**
 * Resolves (and caches) this server's one identity. Never accepts input
 * from a tool argument. Throws `IdentityNotConfiguredError` — never falls
 * back to a global/default repo — when `MCP_TEST_USERNAME` is unset, not
 * exactly "test3", or has no matching row in `chad_admin/users/users-list`.
 * Also verifies the resolved repoGuid actually has a readable repo root
 * (catches a stale/incorrect users-list entry rather than trusting the
 * string blindly).
 */
export async function resolveMcpIdentity(config: McpConfig): Promise<McpIdentity> {
  if (cachedIdentity) return cachedIdentity;

  if (!config.testUsername) {
    throw new IdentityNotConfiguredError(
      "MCP_TEST_USERNAME is not set — no trusted identity, no repo context. Refusing (no fallback)."
    );
  }
  if (config.testUsername !== REQUIRED_TEST_USERNAME) {
    throw new IdentityNotConfiguredError(
      `MCP_TEST_USERNAME must be exactly "${REQUIRED_TEST_USERNAME}", got ${JSON.stringify(config.testUsername)}. ` +
        "This server only ever runs as the local test identity."
    );
  }

  const repoGuid = await findRepoGuidByUsername(config.testUsername);
  if (!repoGuid) {
    throw new IdentityNotConfiguredError(
      `No user named "${config.testUsername}" found in chad_admin/users/users-list — cannot resolve a repoGuid.`
    );
  }

  // Live sanity check — a repoGuid string alone proves nothing; confirm it
  // actually resolves to a real, readable repo root through the same path
  // every tool call will use.
  const root = await runWithRepoContext({ repoGuid, username: config.testUsername }, () => getItemByAddress(repoGuid));
  if (!root) {
    throw new IdentityNotConfiguredError(
      `users-list resolved repoGuid ${JSON.stringify(repoGuid)} for "${config.testUsername}", but no repo root item ` +
        "was readable at that address through the configured primary backend."
    );
  }

  cachedIdentity = { repoGuid, username: config.testUsername };
  return cachedIdentity;
}

/**
 * Anchored containment check (same anchoring lesson as `test3-guard.ts` and
 * `cp-history.ts`'s own repo-isolation check — a GUID that merely shares a
 * string prefix must NOT pass). Every mutating tool calls this on the
 * resolved/target address before writing.
 */
export function assertWithinConfiguredRepo(address: string, repoGuid: string): void {
  if (typeof address !== "string" || address.length === 0) {
    throw new RepoScopeViolationError(String(address), repoGuid);
  }
  const isRoot = address === repoGuid;
  const isDescendant = address.startsWith(`${repoGuid}/`);
  if (!isRoot && !isDescendant) {
    throw new RepoScopeViolationError(address, repoGuid);
  }
}

/** Resolves identity, then runs `fn` inside `dba`'s repo context — the one entry point every tool handler uses. */
export async function withMcpIdentity<T>(
  config: McpConfig,
  fn: (identity: McpIdentity) => Promise<T>
): Promise<T> {
  const identity = await resolveMcpIdentity(config);
  return runWithRepoContext({ repoGuid: identity.repoGuid, username: identity.username }, () => fn(identity));
}
