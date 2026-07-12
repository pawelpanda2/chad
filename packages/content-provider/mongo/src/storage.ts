/**
 * cp-mongo — Stage 2 SKELETON ONLY. `GetItem` is real (a plain findOne
 * keyed by repoId+loca, proving the document model in document.ts is
 * actually queryable) — everything else deliberately throws, since
 * GetByNames/GetManyByName/FindRecursively need index/design decisions
 * (e.g. does "search by name" need a dedicated index? does
 * FindRecursively need a text index on `body`?) not yet made. Not wired
 * into cp-entry's routing yet — see packages/content-provider/entry.
 */

import type { ContentProviderStorage, CpItem, CpConfig, CpItemType } from "cp-core";
import { ContentProviderError } from "cp-core";
import { getDb, getCollectionName } from "./client.js";
import type { CpMongoDocument } from "./document.js";

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
    `cp-mongo.${operation} is not implemented — this package is a Stage 2 skeleton (document model + connection helper only, see README.md).`
  );
}

export const mongoStorage: ContentProviderStorage = {
  async GetItem(repoGuid, loca) {
    const db = await getDb();
    const collection = db.collection<CpMongoDocument>(getCollectionName());
    const doc = await collection.findOne({ repoId: repoGuid, loca: loca ?? "" });
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
