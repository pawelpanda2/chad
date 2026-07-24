/**
 * cp-entry — the ONLY package dashboard/cp-gui/API should ever import for
 * Content Provider data. Never import storage packages directly from outside.
 *
 * Routes repo GUID -> backend (repo-storage-config) -> ContentProviderStorage
 * implementation -> unified CpItem. Backend choice is config-only; business
 * callers always use `entry` / `createStorageForBackend`.
 */

import type { ContentProviderStorage, CpItemType } from "cp-core";
import { netAdapterStorage } from "cp-net-adapter";
import { filesStorage } from "cp-files";
import { mongoStorage } from "cp-mongo";
import { postgreStorage } from "cp-postgre";
import {
  getBackendKindForRepo,
  type CpBackendKind,
} from "./repo-storage-config.js";

/**
 * Factory: pick a storage implementation by kind. Used by the router and by
 * tests proving both mongo and postgre implement the same contract.
 */
export function createStorageForBackend(kind: CpBackendKind): ContentProviderStorage {
  switch (kind) {
    case "net-adapter":
      return netAdapterStorage;
    case "files":
      return filesStorage;
    case "mongo":
      return mongoStorage;
    case "postgre":
      return postgreStorage;
  }
}

function getStorageForRepo(repoGuid: string): ContentProviderStorage {
  return createStorageForBackend(getBackendKindForRepo(repoGuid));
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

export { getBackendKindForRepo, getDefaultBackendKind } from "./repo-storage-config.js";
export type { CpBackendKind } from "./repo-storage-config.js";
