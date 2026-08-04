/**
 * Browse the root logical folder `reports` (lead / daygame report tree).
 *
 * Distinct from `report-entries.ts` (`views/reports` Forms feature).
 * Categories = direct Folder children; reports = direct Text children of a category.
 */

import { resolveByNames, getChildrenOf, getItemByAddress } from "./item-ops.js";
import { addressToRepoAndLoca } from "./cp-model.js";
import type { CpItem } from "./cp-model.js";

export interface ReportCategory {
  /** Stable id for API/GUI selection — full CP address. */
  id: string;
  logicalName: string;
  displayName: string;
  loca: string;
}

export interface ReportListItem {
  address: string;
  name: string;
  loca: string;
  /** Short preview when body was already available from getChildren; never required. */
  preview?: string | null;
}

/** User override of the AI Auto Pick — `unset` means “use auto”. */
export type UserReportSelection =
  | { status: "unset" }
  | { status: "none" }
  | { status: "report"; address: string };

/**
 * Single rule for which report address feeds the AI request / preview.
 * `userReport ?? autoReport` with an explicit none override.
 */
export function effectiveReportAddress(
  autoReportAddress: string | null,
  userReport: UserReportSelection,
): string | null {
  if (userReport.status === "unset") return autoReportAddress;
  if (userReport.status === "none") return null;
  return userReport.address;
}

/** Strip only a leading `^\d+\s+` prefix — GUI label only. */
export function reportCategoryDisplayName(logicalName: string): string {
  return logicalName.replace(/^\d+\s+/, "");
}

function previewFromBody(body: string | undefined | null): string | null {
  if (typeof body !== "string" || !body.trim()) return null;
  return body.split(/\r?\n/).slice(0, 2).join("\n");
}

export interface ReportBrowseOps {
  resolveByNames: (names: string[]) => Promise<CpItem | null>;
  getChildrenOf: (parentAddress: string) => Promise<CpItem[]>;
  getItemByAddress: (address: string) => Promise<CpItem | null>;
}

const defaultOps: ReportBrowseOps = {
  resolveByNames,
  getChildrenOf,
  getItemByAddress,
};

/**
 * Direct Folder children of root `reports`. Missing folder → `[]` (not an error).
 */
export async function listReportCategories(ops: ReportBrowseOps = defaultOps): Promise<ReportCategory[]> {
  const folder = await ops.resolveByNames(["reports"]);
  if (!folder) return [];
  if (folder.config.type !== "Folder") {
    throw new Error(`Expected "reports" to be a Folder (got "${folder.config.type}")`);
  }

  const children = await ops.getChildrenOf(folder.config.address);
  return children
    .filter((c) => c.config.type === "Folder")
    .map((c) => ({
      id: c.config.address,
      logicalName: c.config.name,
      displayName: reportCategoryDisplayName(c.config.name),
      loca: addressToRepoAndLoca(c.config.address).loca,
    }));
}

/**
 * Direct Text children of a category folder. Unknown address → `[]`.
 * Does not include Folder children. Does not return full body.
 */
export async function listReportsInCategory(
  categoryAddress: string,
  ops: ReportBrowseOps = defaultOps,
): Promise<ReportListItem[]> {
  const address = categoryAddress?.trim();
  if (!address) return [];

  const category = await ops.getItemByAddress(address);
  if (!category) return [];
  if (category.config.type !== "Folder") {
    throw new Error(`Expected category to be a Folder (got "${category.config.type}")`);
  }

  const children = await ops.getChildrenOf(address);
  return children
    .filter((c) => c.config.type === "Text")
    .map((c) => ({
      address: c.config.address,
      name: c.config.name,
      loca: addressToRepoAndLoca(c.config.address).loca,
      preview: previewFromBody(c.body),
    }));
}

/** Full body for a single report Text item (Creator Your Pick / Views editor). */
export async function getReportTextByAddress(
  address: string,
  ops: ReportBrowseOps = defaultOps,
): Promise<{ address: string; name: string; loca: string; body: string } | null> {
  const item = await ops.getItemByAddress(address.trim());
  if (!item || item.config.type !== "Text") return null;
  return {
    address: item.config.address,
    name: item.config.name,
    loca: addressToRepoAndLoca(item.config.address).loca,
    body: typeof item.body === "string" ? item.body : "",
  };
}
