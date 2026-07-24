/**
 * PostgreSQL ContentProviderStorage — implements the shared cp-core contract.
 * GetItem reads CHAD's cp_items table; remaining methods throw until fully ported.
 */

import type { ContentProviderStorage, CpItem, CpConfig, CpItemType } from "cp-core";
import { ContentProviderError } from "cp-core";
import type { CpPostgreItemRow } from "../models/row.js";
import { isCpItemType } from "../models/row.js";
import { findByRepoAndLoca } from "../repositories/items-repository.js";

function toCpItem(row: CpPostgreItemRow): CpItem {
  const cfg = row.config ?? {};
  const type = isCpItemType(row.type)
    ? row.type
    : isCpItemType(cfg.type)
      ? cfg.type
      : "Text";
  const config: CpConfig = {
    id: String(cfg.id ?? row.id),
    type,
    name: String(cfg.name ?? row.name),
    address: String(cfg.address ?? row.address),
    ...cfg,
  };
  return {
    Body: row.body ?? "",
    Config: config,
    Settings: config,
    Address: config.address,
  };
}

function notImplemented(operation: string): never {
  throw new ContentProviderError(
    `cp-postgre.${operation} is not implemented yet — GetItem is available; see packages/content-provider/postgre/README.md.`
  );
}

export const postgreStorage: ContentProviderStorage = {
  async GetItem(repoGuid, loca) {
    const row = await findByRepoAndLoca(repoGuid, loca);
    if (!row) {
      throw new ContentProviderError(
        `No cp_items row for repoGuid="${repoGuid}" loca="${loca}"`
      );
    }
    return toCpItem(row);
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
