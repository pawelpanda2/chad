/**
 * Compatible method names and the unified item model — the contract every
 * storage implementation (cp-files, cp-mongo, cp-net-adapter) must satisfy,
 * and the only thing cp-core knows about. cp-core does not select an
 * implementation — that's cp-entry's job.
 *
 * Method names and the Body/Config/Settings/Address shape are taken
 * directly from the real, currently-working .NET /invoke contract —
 * documented in documentation/dba/data-access.md, resolve-paths.md,
 * post-parent-item.md. Not guesses.
 */

import type { CpConfig, CpItemType } from "./types.js";

/** What every operation ultimately returns — matches the real /invoke response shape. */
export interface CpItem {
  Body: string;
  Config: CpConfig;
  /** @deprecated legacy alias of Config, kept only for callers expecting the old name */
  Settings: CpConfig;
  Address: string;
}

export interface ContentProviderStorage {
  GetItem(repoGuid: string, loca: string): Promise<CpItem>;
  GetByNames(repoGuid: string, ...names: string[]): Promise<CpItem>;
  GetManyByName(repoGuid: string, parentLoca: string, name: string): Promise<CpItem[]>;
  FindRecursively(repoGuid: string, loca: string, phrase: string): Promise<CpItem[]>;
  Put(
    repoGuid: string,
    loca: string,
    type: CpItemType,
    name: string,
    content: string
  ): Promise<CpItem>;
  PostParentItem(
    repoGuid: string,
    parentLoca: string,
    type: CpItemType,
    name: string
  ): Promise<CpItem>;
}
