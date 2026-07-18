/**
 * Common provider contract both MongoCpProvider and
 * LegacyContentProviderAdapter implement, so `DbaDataRouter` and business
 * functions in `packages/dba` never need to know which backend they're
 * actually talking to (Story 72 §9).
 */

import type { CpItem } from "../cp-model.js";
import type { DataWriteCommand, DataWriteResult } from "../data-commands.js";

export type DataBackendName = "mongo" | "content-provider";

/**
 * Two supported lookup keys, matching CP's own two natural ways to find
 * an item (Story 72 §10 — "po trwałym id lub po pełnym config.address"):
 * a persistent id (Mongo `_id` / CP-issued GUID) or the full address
 * string.
 */
export type GetItemInput = { id: string } | { address: string };

export interface GetByNamesInput {
  repoGuid: string;
  names: string[];
}

export interface GetByNames2Input {
  repoGuid: string;
  /** Starting loca (may be ""), matching `IItemWorker.GetByNames2`'s `loca` param. */
  loca: string;
  names: string[];
}

export interface CpCompatibleDataProvider {
  readonly name: DataBackendName;
  getItem(input: GetItemInput): Promise<CpItem | null>;
  getByNames(input: GetByNamesInput): Promise<CpItem | null>;
  getByNames2(input: GetByNames2Input): Promise<CpItem[]>;
  executeWrite(command: DataWriteCommand): Promise<DataWriteResult>;
  /**
   * Writes the full item's config as-is, preserving the supplied `_id`/
   * `config.id` and every custom field — never allocates a new id/address.
   * Added to close the gap documented in `legacy-cp-provider.ts`'s original
   * doc comment: plain `executeWrite`/`Put` on the real Content Provider
   * always minted a fresh GUID and dropped custom fields on every write,
   * so a CP-follower replay could never reproduce the exact same item a
   * Mongo primary had already decided. `LegacyContentProviderAdapter` now
   * implements this as Put (ensure body/directory exist) + the new CP-side
   * `PutItemConfig` method (fix identity/custom fields) — see that class's
   * updated doc comment. `MongoCpProvider` never had this problem; its
   * `putItemConfig` is effectively the same as a config-only `putItem`.
   */
  putItemConfig(item: CpItem): Promise<CpItem>;
}
