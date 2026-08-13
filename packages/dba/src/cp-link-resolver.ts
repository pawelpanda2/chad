/**
 * Resolves a shared-Preview CP-link's target (`lib/preview/cp-link.ts` in
 * the dashboard) — a stable `CpItem.id` — to its current address, for the
 * click-time navigation `components/shared/cp-link-text.tsx` triggers via
 * `GET /api/cp-items/[id]`.
 *
 * Repo isolation: tries the id against exactly the repos a session may
 * already browse in Folders — its own repo plus `chad_shared` — the same
 * allowlist `resolveFoldersRepoAccess`/`listSelectableFoldersRepos`
 * (`shared-repo-access.ts`) already enforce for that GUI. Never widens
 * access beyond that; a foreign repo's item is indistinguishable from a
 * nonexistent one (`null` either way) so this can never be used to probe
 * whether an id exists in someone else's repo.
 *
 * Bypasses `DbaDataRouter` on purpose: `DbaDataRouter.getItem` does not
 * thread an `expectedRepoGuid` through to the provider, so an `{ id }`
 * lookup via the router would return the item regardless of which repo it
 * actually belongs to — unsafe for this use. `PostgresCpProvider.getItem`
 * does accept it directly. Same "call the Postgres provider directly for a
 * capability the router doesn't have" convention already used by
 * `moveItemByAddress`/`readdressItemByAddress`/`deleteItemByAddress` in
 * `item-ops.ts`.
 */
import { getPostgresProvider } from "./data-router-instance.js";
import { loadDataProvidersConfig } from "./data-providers/config.js";
import { listSelectableFoldersRepos, type FoldersSessionLike } from "./shared-repo-access.js";

export interface CpLinkTarget {
  repoGuid: string;
  /** Slash-joined numeric loca relative to `repoGuid`, "" for the repo root. */
  loca: string;
  name: string;
  type: string;
}

function addressToLoca(address: string, repoGuid: string): string {
  if (address === repoGuid) return "";
  const prefix = `${repoGuid}/`;
  return address.startsWith(prefix) ? address.slice(prefix.length) : address;
}

/**
 * Never throws for a missing/foreign/malformed id — returns `null`
 * (fail-safe: the caller renders a controlled not-found, never a crash and
 * never a hint about another user's data).
 */
export async function resolveCpItemByIdForUser(
  user: FoldersSessionLike,
  itemId: string
): Promise<CpLinkTarget | null> {
  const config = loadDataProvidersConfig();
  if (config.primaryBackend !== "postgres") {
    return null;
  }

  const provider = getPostgresProvider();
  for (const repo of listSelectableFoldersRepos(user)) {
    const item = await provider.getItem({ id: itemId }, repo.id);
    if (item) {
      return {
        repoGuid: repo.id,
        loca: addressToLoca(item.config.address, repo.id),
        name: item.config.name,
        type: item.config.type,
      };
    }
  }
  return null;
}
