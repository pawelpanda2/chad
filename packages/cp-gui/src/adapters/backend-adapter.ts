/**
 * BackendAdapter — cp-gui's only way to reach Content Provider data.
 *
 * cp-gui runs in the browser (standalone app or embedded in dashboard's
 * Folders page) and therefore cannot import cp-entry's Node code directly.
 * It talks to a server layer (a small API route wrapping cp-entry) over
 * HTTP instead:
 *
 *   cp-gui --(HTTP)--> server layer --(import)--> cp-entry --> backend
 *
 * Mirrors Blazor's `BackendAdapter` (injected into FolderView.razor /
 * TextView.razor) — same role, same shape as cp-core's ContentProviderStorage,
 * just over HTTP instead of a direct in-process call.
 */

import type { CpItem, CpItemType } from "cp-core";

export interface BackendAdapter {
  getItem(repoGuid: string, loca: string): Promise<CpItem>;
  getByNames(repoGuid: string, names: string[]): Promise<CpItem>;
  getManyByName(repoGuid: string, parentLoca: string, name: string): Promise<CpItem[]>;
  findRecursively(repoGuid: string, loca: string, phrase: string): Promise<CpItem[]>;
  /** Stage 3 — not used until write support lands. */
  put(repoGuid: string, loca: string, type: CpItemType, name: string, content: string): Promise<CpItem>;
  /** Stage 3 — not used until write support lands. */
  postParentItem(repoGuid: string, parentLoca: string, type: CpItemType, name: string): Promise<CpItem>;
}

/**
 * HTTP implementation, calling `cp-api`'s endpoints (see
 * packages/content-provider/api/README.md for the exact routes). `baseUrl`
 * has no trailing slash requirement — one is stripped if present.
 *
 * `put`/`postParentItem` throw — cp-api has no write endpoints yet
 * (Stage 3), matching cp-files/cp-mongo's own Put/PostParentItem, which
 * also still throw.
 */
export function createHttpBackendAdapter(baseUrl: string): BackendAdapter {
  const root = baseUrl.replace(/\/+$/, "");

  async function getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${root}${path}`);
    const body = await response.json();
    if (!response.ok) {
      const message = typeof body === "object" && body && "error" in body ? String((body as { error: unknown }).error) : response.statusText;
      throw new Error(`cp-api request failed (${response.status}): ${message}`);
    }
    return body as T;
  }

  return {
    async getItem(repoGuid, loca) {
      const path = loca ? `/repos/${repoGuid}/items/${loca}` : `/repos/${repoGuid}/root`;
      return getJson<CpItem>(path);
    },

    async getByNames(repoGuid, names) {
      const query = new URLSearchParams({ names: names.join(",") });
      return getJson<CpItem>(`/repos/${repoGuid}/by-names?${query}`);
    },

    async getManyByName(repoGuid, parentLoca, name) {
      const query = new URLSearchParams({ parentLoca, name });
      return getJson<CpItem[]>(`/repos/${repoGuid}/many-by-name?${query}`);
    },

    async findRecursively(repoGuid, loca, phrase) {
      const query = new URLSearchParams({ loca, phrase });
      return getJson<CpItem[]>(`/repos/${repoGuid}/find?${query}`);
    },

    async put() {
      throw new Error("put is not implemented — cp-api has no write endpoints yet (Stage 3).");
    },

    async postParentItem() {
      throw new Error("postParentItem is not implemented — cp-api has no write endpoints yet (Stage 3).");
    },
  };
}
