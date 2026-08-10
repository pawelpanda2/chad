/**
 * Login user list (`chad_admin / users / users-list`) — the one place this
 * repo's authentication data lives. Previously read by
 * `packages/dashboard/lib/user-service.ts` via a direct `/invoke` HTTP call
 * to Content Provider (`GetByNames("chad_admin", "users", "users-list")`),
 * independent of `DBA_CONTENT_PROVIDER_ENABLED` — a violation of
 * `05_endpoint-rules.md` §2 (Dashboard must never call a provider directly)
 * that also meant login couldn't survive Content Provider being removed
 * from deployment. Routed through `item-ops.ts`/`getDataRouter()` like
 * every other business function now.
 *
 * `chad_admin` is itself an ordinary repo (Story 68's login-repo
 * restructure) — its GUID is hardcoded here because login happens BEFORE
 * any user's own repo context exists (there is no "current user" yet to
 * derive it from), unlike every other `dba` function.
 */

import yaml from "js-yaml";
import { resolveByNames, putItemBody } from "./item-ops.js";
import { runWithRepoContext } from "./repo-context.js";

export const CHAD_ADMIN_REPO_GUID = "0fc7da8d-3466-4964-a24c-dfc0d0fef87c";

export type ChadUserRole = "admin" | "user";

/**
 * Raw YAML body of the `users-list` item (a `users: [...]` document — see
 * `packages/dashboard/lib/user-service.ts`'s `CpUser` shape), or `null` if
 * the item doesn't exist.
 */
export async function getUsersListBody(): Promise<string | null> {
  return runWithRepoContext({ repoGuid: CHAD_ADMIN_REPO_GUID, username: "chad_admin" }, async () => {
    const item = await resolveByNames(["users", "users-list"]);
    return item?.body ?? null;
  });
}

export class AdminUsersError extends Error {
  constructor(
    public readonly code: "USERS_LIST_NOT_FOUND" | "USER_NOT_FOUND" | "VALIDATION" | "LAST_ADMIN",
    message: string
  ) {
    super(message);
    this.name = "AdminUsersError";
  }
}

/**
 * Sets `role: admin|user` on one entry in `chad_admin/users/users-list`.
 * Refuses to demote the last remaining admin (would lock out role management).
 *
 * There is no dedicated permissions-audit table in this repo — callers
 * (Dashboard admin routes) should log the actor/target/role change.
 */
export async function setUserRoleInUsersList(
  targetRepoGuid: string,
  role: ChadUserRole
): Promise<{ username: string; role: ChadUserRole }> {
  if (role !== "admin" && role !== "user") {
    throw new AdminUsersError("VALIDATION", `Invalid role "${role}" (expected "admin" or "user")`);
  }

  return runWithRepoContext({ repoGuid: CHAD_ADMIN_REPO_GUID, username: "chad_admin" }, async () => {
    const item = await resolveByNames(["users", "users-list"]);
    if (!item?.body) {
      throw new AdminUsersError("USERS_LIST_NOT_FOUND", "users-list item not found");
    }

    const parsed = yaml.load(item.body) as { users?: Array<Record<string, unknown>> } | null;
    if (!parsed || !Array.isArray(parsed.users)) {
      throw new AdminUsersError("VALIDATION", "users-list body is not a { users: [] } document");
    }

    const idx = parsed.users.findIndex(
      (u) => typeof u.repoGuid === "string" && u.repoGuid === targetRepoGuid
    );
    if (idx < 0) {
      throw new AdminUsersError("USER_NOT_FOUND", `No user with repoGuid "${targetRepoGuid}"`);
    }

    const previousRole = parsed.users[idx].role === "admin" ? "admin" : "user";
    if (previousRole === "admin" && role === "user") {
      const adminCount = parsed.users.filter((u) => u.role === "admin").length;
      if (adminCount <= 1) {
        throw new AdminUsersError(
          "LAST_ADMIN",
          "Cannot demote the last admin account — promote another user first"
        );
      }
    }

    parsed.users[idx] = {
      ...parsed.users[idx],
      role,
      updatedAt: new Date().toISOString(),
    };

    const nextBody = yaml.dump(parsed, { lineWidth: -1, noRefs: true });
    await putItemBody(item.config.address, nextBody);

    const username =
      typeof parsed.users[idx].username === "string" ? String(parsed.users[idx].username) : targetRepoGuid;
    return { username, role };
  });
}
