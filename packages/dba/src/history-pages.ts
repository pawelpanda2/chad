/**
 * History "page" column — resolve which dashboard page folder a history
 * row belongs under, by stable item id + current address (not hardcoded loca).
 *
 * Pages rearrange under Folders (e.g. `dates` may move); children stay under
 * that page's path (e.g. `…/dates/07/02`). We therefore:
 *   1. Load page folders by walking the tree (top-level folders + children of
 *      `views`, which hold dates/daily/reports/…) and keep each folder's id,
 *      name, and *current* address.
 *   2. Assign each history address via longest address-prefix match.
 */

import { getDataRouter } from "./data-router-instance.js";
import type { CpHistoryListItem, ListCpHistoryResult } from "./cp-history-types.js";

export interface HistoryPageFolder {
  /** Stable cp_items id — survives loca moves. */
  id: string;
  /** Display name for the History "page" column (e.g. `dates`). */
  name: string;
  /** Current full address (`repoGuid/…`). */
  address: string;
}

export type CpHistoryListItemWithPage = CpHistoryListItem & {
  /** Page folder name (e.g. `dates`), or null when under no known page. */
  pageName: string | null;
};

export type ListCpHistoryResultWithPages = Omit<ListCpHistoryResult, "items"> & {
  items: CpHistoryListItemWithPage[];
};

const SKIP_TOP_LEVEL = new Set(["hidden"]);

/** Container whose *children* are pages (dates, daily, …), not itself. */
const EXPAND_INTO_CHILDREN = new Set(["views"]);

/** Short TTL so paginated History list calls reuse one page-folder snapshot. */
const PAGES_CACHE_TTL_MS = 5_000;
const pagesCache = new Map<string, { at: number; pages: HistoryPageFolder[] }>();

/**
 * Pure matcher: longest page address that equals `address` or is a parent
 * prefix. `pages` may be unsorted — we pick the longest match.
 */
export function matchHistoryPageName(
  address: string,
  pages: ReadonlyArray<Pick<HistoryPageFolder, "name" | "address">>
): string | null {
  if (!address || pages.length === 0) return null;
  let best: { name: string; len: number } | null = null;
  for (const page of pages) {
    if (!page.address) continue;
    const isMatch =
      address === page.address || address.startsWith(`${page.address}/`);
    if (!isMatch) continue;
    if (!best || page.address.length > best.len) {
      best = { name: page.name, len: page.address.length };
    }
  }
  return best?.name ?? null;
}

/**
 * Resolve the current set of History page folders for a repo.
 * Prefer matching later by these ids/addresses — never hardcode loca segments.
 */
export async function resolveHistoryPages(repoGuid: string): Promise<HistoryPageFolder[]> {
  const cached = pagesCache.get(repoGuid);
  if (cached && Date.now() - cached.at < PAGES_CACHE_TTL_MS) {
    return cached.pages;
  }

  const router = getDataRouter();
  const topLevel = await router.getChildren(repoGuid);
  const pages: HistoryPageFolder[] = [];

  for (const child of topLevel) {
    if (child.config.type !== "Folder") continue;
    const name = child.config.name;
    if (SKIP_TOP_LEVEL.has(name)) continue;

    if (EXPAND_INTO_CHILDREN.has(name)) {
      const nested = await router.getChildren(child.config.address);
      for (const page of nested) {
        if (page.config.type !== "Folder") continue;
        pages.push({
          id: page._id,
          name: page.config.name,
          address: page.config.address,
        });
      }
      continue;
    }

    pages.push({
      id: child._id,
      name: child.config.name,
      address: child.config.address,
    });
  }

  pagesCache.set(repoGuid, { at: Date.now(), pages });
  return pages;
}

/** Attach `pageName` to each history row using current page folder addresses. */
export async function enrichHistoryListWithPages(
  repoGuid: string,
  result: ListCpHistoryResult
): Promise<ListCpHistoryResultWithPages> {
  const pages = await resolveHistoryPages(repoGuid);
  return {
    ...result,
    items: result.items.map((item) => ({
      ...item,
      pageName: matchHistoryPageName(item.address, pages),
    })),
  };
}
