/**
 * cp-entry — the ONLY package dashboard/cp-gui/API should ever import for
 * Content Provider data. Never import cp-net-adapter/cp-files/cp-mongo
 * directly from outside this package group.
 *
 * Routes repo GUID -> backend (see repo-storage-config.ts) -> delegates to
 * that backend's ContentProviderStorage implementation -> returns the
 * unified CpItem model. cp-net-adapter and cp-files (read-only, Stage 2)
 * both exist now; cp-mongo still throws "not implemented" until its own
 * stage. REPO_BACKEND_OVERRIDES defaults every repo to net-adapter, so
 * this wiring doesn't change behavior for any existing consumer.
 */

import type { ContentProviderStorage, CpItemType } from "cp-core";
import { netAdapterStorage } from "cp-net-adapter";
import { filesStorage } from "cp-files";
import { getBackendKindForRepo } from "./repo-storage-config.js";

function getStorageForRepo(repoGuid: string): ContentProviderStorage {
  const kind = getBackendKindForRepo(repoGuid);
  switch (kind) {
    case "net-adapter":
      return netAdapterStorage;
    case "files":
      return filesStorage;
    case "mongo":
      throw new Error(
        "cp-mongo backend is not implemented yet (planned for Stage 2)."
      );
  }
}

export const entry: ContentProviderStorage = {
  GetItem(repoGuid, loca) {
    return getStorageForRepo(repoGuid).GetItem(repoGuid, loca);
  },
  GetByNames(repoGuid, ...names) {
    return getStorageForRepo(repoGuid).GetByNames(repoGuid, ...names);
  },
  GetManyByName(repoGuid, parentLoca, name) {
    return getStorageForRepo(repoGuid).GetManyByName(repoGuid, parentLoca, name);
  },
  FindRecursively(repoGuid, loca, phrase) {
    return getStorageForRepo(repoGuid).FindRecursively(repoGuid, loca, phrase);
  },
  Put(repoGuid, loca, type: CpItemType, name, content) {
    return getStorageForRepo(repoGuid).Put(repoGuid, loca, type, name, content);
  },
  PostParentItem(repoGuid, parentLoca, type: CpItemType, name) {
    return getStorageForRepo(repoGuid).PostParentItem(repoGuid, parentLoca, type, name);
  },
};

export { getBackendKindForRepo } from "./repo-storage-config.js";
export type { CpBackendKind } from "./repo-storage-config.js";
