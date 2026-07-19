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

import { resolveByNames } from "./item-ops.js";
import { runWithRepoContext } from "./repo-context.js";

export const CHAD_ADMIN_REPO_GUID = "0fc7da8d-3466-4964-a24c-dfc0d0fef87c";

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
