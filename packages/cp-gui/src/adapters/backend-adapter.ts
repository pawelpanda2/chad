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

/** Not implemented yet — Stage 1 scope is the contract, not the HTTP client. */
export function createHttpBackendAdapter(_baseUrl: string): BackendAdapter {
  throw new Error("createHttpBackendAdapter is not implemented yet (Stage 1 scope: contracts only).");
}
