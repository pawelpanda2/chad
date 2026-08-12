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
  /** Direct child type under `randki` (or under a date-report Folder). */
  kind: "Text" | "Folder";
}

export interface DateReportText {
  address: string;
  name: string;
  loca: string;
  body: string;
  /** Same as address/loca for Text items (edit target). */
  editAddress: string;
  editLoca: string;
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

function toListItem(c: CpItem): DateReportListItem {
  return {
    address: c.config.address,
    name: c.config.name,
    loca: addressToRepoAndLoca(c.config.address).loca,
    kind: c.config.type as "Text" | "Folder",
  };
}

async function resolveRandkiFolder(ops: DateReportsOps): Promise<CpItem | null> {
  const folder = await ops.resolveByNames([...DATE_REPORTS_FOLDER_NAMES]);
  if (!folder) return null;
  if (folder.config.type !== "Folder") {
    throw new Error(`Expected "randki" to be a Folder (got "${folder.config.type}")`);
  }
  return folder;
}

/**
 * Direct Text + Folder children of root `randki`.
 * Provider order is oldest→newest (physical keys); we reverse so the UI
 * shows newest date reports first. No alphabetical re-sort.
 * Missing folder → `[]`.
 */
export async function listDateReports(ops: DateReportsOps = defaultOps): Promise<DateReportListItem[]> {
  const folder = await resolveRandkiFolder(ops);
  if (!folder) return [];

  const children = await ops.getChildrenOf(folder.config.address);
  return children
    .filter((c) => c.config.type === "Text" || c.config.type === "Folder")
    .map(toListItem)
    .reverse();
}

/**
 * Direct children of a date-report Folder (before / after / report / …).
 * `folderAddress` must be a direct Folder child of `randki`.
 * Order = provider order (oldest→newest); not reversed — parts keep natural order.
 */
export async function listDateReportChildren(
  folderAddress: string,
  ops: DateReportsOps = defaultOps,
): Promise<DateReportListItem[]> {
  const trimmed = folderAddress?.trim();
  if (!trimmed) return [];

  const randki = await resolveRandkiFolder(ops);
  if (!randki) return [];
  if (!isDirectChildOf(randki.config.address, trimmed)) return [];

  const entry = await ops.getItemByAddress(trimmed);
  if (!entry || entry.config.type !== "Folder") return [];

  const children = await ops.getChildrenOf(trimmed);
  return children
    .filter((c) => c.config.type === "Text" || c.config.type === "Folder")
    .map(toListItem);
}

/**
 * Full body for a Text item under `randki`.
 * Allowed:
 * - direct Text child of `randki`, or
 * - Text descendant under a direct child Folder of `randki`.
 */
export async function getDateReportTextByAddress(
  address: string,
  ops: DateReportsOps = defaultOps,
): Promise<DateReportText | null> {
  const trimmed = address?.trim();
  if (!trimmed) return null;

  const randki = await resolveRandkiFolder(ops);
  if (!randki) return null;
  if (!isUnder(randki.config.address, trimmed) || trimmed === randki.config.address) return null;

  const item = await ops.getItemByAddress(trimmed);
  if (!item || item.config.type !== "Text") return null;

  // Direct Text under randki, or any Text under a direct child of randki.
  if (!isDirectChildOf(randki.config.address, trimmed)) {
    const rest = trimmed.slice(randki.config.address.length + 1);
    const firstSeg = rest.split("/")[0];
    if (!firstSeg) return null;
    const topChildAddress = `${randki.config.address}/${firstSeg}`;
    if (!isDirectChildOf(randki.config.address, topChildAddress)) return null;
  }

  const body = typeof item.body === "string" ? item.body : "";
  return {
    address: item.config.address,
    name: item.config.name,
    loca: addressToRepoAndLoca(item.config.address).loca,
    body,
    editAddress: item.config.address,
    editLoca: addressToRepoAndLoca(item.config.address).loca,
    editable: true,
  };
}

/**
 * @deprecated Prefer {@link getDateReportTextByAddress} for Text and
 * {@link listDateReportChildren} for Folders. Kept for callers that still
 * expect auto-pick of nested `report` Text under a Folder.
 */
export async function getDateReportByAddress(
  address: string,
  ops: DateReportsOps = defaultOps,
): Promise<DateReportText | null> {
  const trimmed = address?.trim();
  if (!trimmed) return null;

  const randki = await resolveRandkiFolder(ops);
  if (!randki) return null;
  if (!isDirectChildOf(randki.config.address, trimmed)) return null;

  const entry = await ops.getItemByAddress(trimmed);
  if (!entry) return null;

  if (entry.config.type === "Text") {
    return getDateReportTextByAddress(trimmed, ops);
  }

  if (entry.config.type !== "Folder") return null;

  const children = await ops.getChildrenOf(entry.config.address);
  const texts = children.filter((c) => c.config.type === "Text");
  if (texts.length === 0) {
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
  const namedReport =
    texts.find((c) => c.config.name.toLowerCase() === "report") ?? texts[0]!;
  return getDateReportTextByAddress(namedReport.config.address, ops);
}
