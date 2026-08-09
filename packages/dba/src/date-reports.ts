/**
 * Browse root logical folder `randki` — free-text date (randka) reports.
 *
 * Distinct from:
 * - `views/dates` (YAML Dates tracker table)
 * - root `reports` (`report-browse.ts` — daygame/nightgame categories)
 * - `views/reports` (`report-entries.ts` — Forms create path)
 *
 * Verified against real QNAP data (pawel_f): Text children are reports;
 * Folder children often hold nested Text items (`report`, `before`, `after`).
 */

import { resolveByNames, getChildrenOf, getItemByAddress } from "./item-ops.js";
import { addressToRepoAndLoca } from "./cp-model.js";
import type { CpItem } from "./cp-model.js";

/** Logical name of the root folder that holds date reports. */
export const DATE_REPORTS_FOLDER_NAMES = ["randki"] as const;

export interface DateReportListItem {
  address: string;
  name: string;
  loca: string;
  /** Direct child type under `randki`. */
  kind: "Text" | "Folder";
}

export interface DateReportText {
  /** Address of the list entry (Text or Folder under `randki`). */
  address: string;
  name: string;
  loca: string;
  body: string;
  /**
   * Address of the Text item that holds/edits the body.
   * For Folder entries this is usually the nested `report` Text (or first Text child).
   */
  editAddress: string;
  editLoca: string;
  /** False when the entry is a Folder with no Text child — openable, not writable. */
  editable: boolean;
}

export interface DateReportsOps {
  resolveByNames: (names: string[]) => Promise<CpItem | null>;
  getChildrenOf: (parentAddress: string) => Promise<CpItem[]>;
  getItemByAddress: (address: string) => Promise<CpItem | null>;
}

const defaultOps: DateReportsOps = {
  resolveByNames,
  getChildrenOf,
  getItemByAddress,
};

function isDirectChildOf(parentAddress: string, childAddress: string): boolean {
  const prefix = `${parentAddress}/`;
  if (!childAddress.startsWith(prefix)) return false;
  return !childAddress.slice(prefix.length).includes("/");
}

function isUnder(parentAddress: string, address: string): boolean {
  return address === parentAddress || address.startsWith(`${parentAddress}/`);
}

/**
 * Direct Text + Folder children of root `randki`, in provider order
 * (no alphabetical re-sort). Missing folder → `[]`.
 */
export async function listDateReports(ops: DateReportsOps = defaultOps): Promise<DateReportListItem[]> {
  const folder = await ops.resolveByNames([...DATE_REPORTS_FOLDER_NAMES]);
  if (!folder) return [];
  if (folder.config.type !== "Folder") {
    throw new Error(`Expected "randki" to be a Folder (got "${folder.config.type}")`);
  }

  const children = await ops.getChildrenOf(folder.config.address);
  return children
    .filter((c) => c.config.type === "Text" || c.config.type === "Folder")
    .map((c) => ({
      address: c.config.address,
      name: c.config.name,
      loca: addressToRepoAndLoca(c.config.address).loca,
      kind: c.config.type as "Text" | "Folder",
    }));
}

async function resolveEditableText(
  entry: CpItem,
  ops: DateReportsOps,
): Promise<{ text: CpItem; body: string; editable: boolean } | null> {
  if (entry.config.type === "Text") {
    return {
      text: entry,
      body: typeof entry.body === "string" ? entry.body : "",
      editable: true,
    };
  }
  if (entry.config.type !== "Folder") return null;

  const children = await ops.getChildrenOf(entry.config.address);
  const texts = children.filter((c) => c.config.type === "Text");
  if (texts.length === 0) {
    return { text: entry, body: "", editable: false };
  }
  const namedReport =
    texts.find((c) => c.config.name.toLowerCase() === "report") ?? texts[0]!;
  return {
    text: namedReport,
    body: typeof namedReport.body === "string" ? namedReport.body : "",
    editable: true,
  };
}

/**
 * Full body for a date-report list entry. `address` must be a direct child
 * of the caller's `randki` folder (cross-folder / cross-repo addresses → null).
 */
export async function getDateReportByAddress(
  address: string,
  ops: DateReportsOps = defaultOps,
): Promise<DateReportText | null> {
  const trimmed = address?.trim();
  if (!trimmed) return null;

  const folder = await ops.resolveByNames([...DATE_REPORTS_FOLDER_NAMES]);
  if (!folder || folder.config.type !== "Folder") return null;

  if (!isDirectChildOf(folder.config.address, trimmed)) return null;

  const entry = await ops.getItemByAddress(trimmed);
  if (!entry) return null;
  if (entry.config.type !== "Text" && entry.config.type !== "Folder") return null;

  const resolved = await resolveEditableText(entry, ops);
  if (!resolved) return null;

  const editItem = resolved.text;
  if (!resolved.editable) {
    return {
      address: entry.config.address,
      name: entry.config.name,
      loca: addressToRepoAndLoca(entry.config.address).loca,
      body: "",
      editAddress: entry.config.address,
      editLoca: addressToRepoAndLoca(entry.config.address).loca,
      editable: false,
    };
  }

  if (editItem.config.type !== "Text") return null;
  if (!isUnder(folder.config.address, editItem.config.address)) return null;

  return {
    address: entry.config.address,
    name: entry.config.name,
    loca: addressToRepoAndLoca(entry.config.address).loca,
    body: resolved.body,
    editAddress: editItem.config.address,
    editLoca: addressToRepoAndLoca(editItem.config.address).loca,
    editable: true,
  };
}
