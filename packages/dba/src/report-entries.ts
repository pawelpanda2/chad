/**
 * Reports (views/reports) Service
 *
 * Provides access to the "Reports" form/view feature: free-text reports
 * saved under the logical path `views / reports` (a Folder), each report
 * being a single Text item.
 *
 * NOT to be confused with `reports.ts` (GetReports/GetReportByName), which
 * is a separate, pre-existing feature targeting a different, root-level
 * `reports` folder (confirmed via real Content Provider data to already
 * hold unrelated report notes) — the two must not be merged. (This is also
 * why this file is named `report-entries.ts` rather than `reports.ts`.)
 *
 * Routed through the generic `item-ops.ts` helpers (`resolveByNames`,
 * `getChildrenOf`, `findOrCreateFolderChain`, `createOrGetChild`,
 * `putItemBody`), which call `getDataRouter()` — Mongo vs. Content
 * Provider is decided once, centrally, by the router's configured
 * primary/follower, never by an `if (mongoEnabled)` here (provider-
 * migration-audit.md). Every item is the same universal `CpItem
 * { config, body }` both backends share; no report-specific schema.
 */

import {
  resolveByNames,
  getChildrenOf,
  findOrCreateFolderChain,
  createOrGetChild,
  putItemBody,
  getItemByAddress,
} from "./item-ops.js";
import { addressToRepoAndLoca, repoAndLocaToAddress } from "./cp-model.js";
import { getCurrentRepoGuid } from "./repo-context.js";

/** A single saved report, for display in the dashboard. */
export interface ReportEntryItem {
  itemName: string;
  loca: string;
  body?: string;
}

/**
 * Gets all saved reports under views/reports, each with its own body.
 *
 * Distinguishes:
 * - folder not found -> throws (caller/route surfaces as an explicit error,
 *   never masked as an empty list)
 * - folder found but empty -> returns []
 *
 * @throws Error if views/reports does not exist, or if the underlying
 *   provider call fails for any other reason.
 */
export async function getAllReportEntries(): Promise<ReportEntryItem[]> {
  const folder = await resolveByNames(["views", "reports"]);
  if (!folder) {
    throw new Error("views/reports folder not found");
  }

  const children = await getChildrenOf(folder.config.address);
  return children.map((child) => ({
    itemName: child.config.name,
    loca: addressToRepoAndLoca(child.config.address).loca,
    body: child.body,
  }));
}

/**
 * Gets a single report's content by its numeric loca.
 *
 * @param loca The numeric loca of the report item (e.g. "07/04/01")
 * @returns The report's body text, or null if the item doesn't exist.
 */
export async function getReportEntryByLoca(loca: string): Promise<{ itemName: string; body: string } | null> {
  const address = repoAndLocaToAddress(getCurrentRepoGuid(), loca);
  const item = await getItemByAddress(address);
  if (!item) return null;
  return { itemName: item.config.name, body: item.body };
}

/**
 * Finds the next available item name, avoiding collisions with existing
 * children of the same folder. Mirrors the "same-day suffix" convention
 * already used for date/daily entries (documented in
 * documentation/dashboard/views/features/views.md): the first item keeps
 * the base name as-is, subsequent collisions append "b", "c", ...
 */
function nextAvailableName(baseName: string, existingNames: string[]): string {
  if (!existingNames.includes(baseName)) {
    return baseName;
  }
  for (let i = 0; i < 26; i++) {
    const candidate = `${baseName}${String.fromCharCode(98 + i)}`; // "b", "c", ...
    if (!existingNames.includes(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Could not find an available name for "${baseName}" (too many collisions)`);
}

/**
 * Creates a new report under views/reports with a caller-supplied name
 * (the Reports form's generated name, e.g. "26-05-06_dg_galeria mokotów").
 *
 * @param content Initial body content (may be empty — the Reports form
 *   creates the report before the user has typed anything, then fills it
 *   in via updateReportEntry on the first editor Save).
 * @param requestedName The generated name from the Reports form UI.
 * @returns The actually-used item name (may differ from requestedName on
 *   collision) and its loca.
 */
export async function createReportEntry(
  content: string,
  requestedName: string
): Promise<{ itemName: string; loca: string }> {
  const folder = await findOrCreateFolderChain(["views", "reports"]);
  const existingChildren = await getChildrenOf(folder.config.address);
  const reportName = nextAvailableName(
    requestedName,
    existingChildren.map((c) => c.config.name)
  );

  const created = await createOrGetChild(folder, reportName, "Text", content);
  return { itemName: created.config.name, loca: addressToRepoAndLoca(created.config.address).loca };
}

/**
 * Updates the content of an existing report, identified by its own loca —
 * never re-resolved by name, so repeated saves never create duplicates.
 *
 * @param loca The numeric loca of the report item (from createReportEntry)
 * @param content The new body content
 */
export async function updateReportEntry(loca: string, content: string): Promise<void> {
  const address = repoAndLocaToAddress(getCurrentRepoGuid(), loca);
  const existing = await getItemByAddress(address);
  if (!existing) {
    throw new Error(`Could not find report at loca "${loca}" to update`);
  }
  await putItemBody(address, content);
}
