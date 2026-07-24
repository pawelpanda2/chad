/**
 * Mongo ContentProviderStorage — implements the shared cp-core contract.
 * GetItem is real; remaining methods throw until index/design decisions land.
 */

import type { ContentProviderStorage, CpItem, CpConfig, CpItemType } from "cp-core";
import { ContentProviderError } from "cp-core";
import type { CpMongoDocument } from "../models/document.js";
import { findByRepoAndLoca } from "../repositories/items-repository.js";

function toCpItem(doc: CpMongoDocument): CpItem {
  const config: CpConfig = {
    id: doc.itemId,
    type: doc.type,
    name: doc.name,
    address: doc.loca ? `${doc.repoId}/${doc.loca}` : doc.repoId,
    ...(doc.metadata ?? {}),
  };
  return {
    Body: doc.body ?? "",
    Config: config,
    Settings: config,
    Address: config.address,
  };
}

function notImplemented(operation: string): never {
  throw new ContentProviderError(
    `cp-mongo.${operation} is not implemented — this package is a Stage 2 skeleton (document model + GetItem only, see README.md).`
  );
}

export const mongoStorage: ContentProviderStorage = {
  async GetItem(repoGuid, loca) {
    const doc = await findByRepoAndLoca(repoGuid, loca);
    if (!doc) {
      throw new ContentProviderError(`No cp-mongo document for repoId="${repoGuid}" loca="${loca}"`);
    }
    return toCpItem(doc);
  },

  async GetByNames() {
    notImplemented("GetByNames");
  },

  async GetManyByName() {
    notImplemented("GetManyByName");
  },

  async FindRecursively() {
    notImplemented("FindRecursively");
  },

  async Put(_repoGuid, _loca, _type: CpItemType, _name, _content) {
    notImplemented("Put");
  },

  async PostParentItem(_repoGuid, _parentLoca, _type: CpItemType, _name) {
    notImplemented("PostParentItem");
  },
};
