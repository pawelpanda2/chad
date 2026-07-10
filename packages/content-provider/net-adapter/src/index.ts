/**
 * cp-net-adapter — implements ContentProviderStorage (cp-core) by calling
 * the real, currently-running .NET Content Provider's `/invoke` HTTP API.
 *
 * Stage 1 scope: read-only (GetItem, GetByNames, GetManyByName,
 * FindRecursively). Put/PostParentItem are implemented (the /invoke shape
 * is already documented and simple to wire up) but are Stage 3 territory —
 * not exercised by the Stage 1 model-compatibility test.
 */

import type { ContentProviderStorage, CpItem, CpConfig, CpItemType } from "cp-core";
import { invoke } from "./invoke.js";

interface RawInvokeResponse {
  Body?: unknown;
  Settings?: Record<string, unknown>;
}

function toCpItem(raw: RawInvokeResponse): CpItem {
  const settings = (raw.Settings ?? {}) as CpConfig;
  return {
    Body: typeof raw.Body === "string" ? raw.Body : JSON.stringify(raw.Body ?? ""),
    Config: settings,
    Settings: settings, // legacy alias only
    Address: (settings.address as string) ?? "",
  };
}

export const netAdapterStorage: ContentProviderStorage = {
  async GetItem(repoGuid, loca) {
    const raw = (await invoke([
      "IRepoService",
      "IItemWorker",
      "GetItem",
      repoGuid,
      loca,
    ])) as RawInvokeResponse;
    return toCpItem(raw);
  },

  async GetByNames(repoGuid, ...names) {
    const raw = (await invoke([
      "IRepoService",
      "IItemWorker",
      "GetByNames",
      repoGuid,
      ...names,
    ])) as RawInvokeResponse;
    return toCpItem(raw);
  },

  async GetManyByName(repoGuid, parentLoca, name) {
    const raw = (await invoke([
      "IRepoService",
      "IManyItemsWorker",
      "GetManyByName",
      repoGuid,
      parentLoca,
      name,
    ])) as RawInvokeResponse[];
    if (!Array.isArray(raw)) return [];
    return raw.map(toCpItem);
  },

  async FindRecursively(repoGuid, loca, phrase) {
    const raw = (await invoke([
      "IRepoService",
      "IMethodWorker",
      "FindRecursively",
      repoGuid,
      loca,
      phrase,
    ])) as RawInvokeResponse[];
    if (!Array.isArray(raw)) return [];
    return raw.map(toCpItem);
  },

  async Put(repoGuid, loca, type: CpItemType, name, content) {
    const raw = (await invoke([
      "IRepoService",
      "IItemWorker",
      "Put",
      repoGuid,
      loca,
      type,
      name,
      content,
    ])) as RawInvokeResponse;
    return toCpItem(raw);
  },

  async PostParentItem(repoGuid, parentLoca, type: CpItemType, name) {
    const raw = (await invoke([
      "IRepoService",
      "IItemWorker",
      "PostParentItem",
      repoGuid,
      parentLoca,
      type,
      name,
    ])) as RawInvokeResponse;
    return toCpItem(raw);
  },
};
