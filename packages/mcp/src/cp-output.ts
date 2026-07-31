/**
 * Shapes `dba`'s current `CpItem` (`{ _id, config: {id,address,type,name,...},
 * body }` — `packages/dba/src/cp-model.ts`) into the structure MCP tools
 * return. Deliberately does NOT resurrect the legacy uppercase
 * `{Body, Config, Settings, Address}` wire shape from
 * `packages/content-provider/common/src/contracts.ts` — that shape is the
 * storage-provider wire contract, not what any current application code
 * (dashboard, console) actually works with; see Story 97 `02_plan.md`.
 * `legacyFieldNote` documents the correspondence for anyone arriving from
 * the older `/invoke` docs, without actually emitting the old field names.
 */

import type { CpItem } from "dba";

export interface CpItemOutput {
  id: string;
  address: string;
  type: string;
  name: string;
  /** Every custom config field beyond id/address/type/name, unchanged. */
  config: Record<string, unknown>;
  body: string;
  legacyFieldNote: string;
}

const LEGACY_FIELD_NOTE =
  "Field correspondence with the older Content Provider /invoke docs: " +
  "address == Address, body == Body, {id,address,type,name,...} == Config/Settings.";

export function toCpItemOutput(item: CpItem): CpItemOutput {
  const { id, address, type, name, ...rest } = item.config;
  return {
    id,
    address,
    type,
    name,
    config: rest,
    body: item.body,
    legacyFieldNote: LEGACY_FIELD_NOTE,
  };
}

/** Loca relative to the configured repo root, e.g. "03/21/05" or "" for the repo root itself. */
export function addressFromLoca(repoGuid: string, loca: string): string {
  return loca ? `${repoGuid}/${loca}` : repoGuid;
}

const LOCA_PATTERN = /^(\d{2,3})(\/\d{2,3})*$/;

export function isValidLoca(loca: string): boolean {
  return loca === "" || LOCA_PATTERN.test(loca);
}
