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
 * Follows the same proven approach as getAllDateEntries/getAllDailyEntries/
 * saveDateEntry/saveDailyEntry in leads.ts: physical folders are numeric,
 * logical names live in config, children of a Folder item are read from its
 * Body map (physicalKey -> logicalName), and a child's loca is built as
 * `${folderLoca}/${physicalKey}`.
 */

import { invokeContentProvider } from "./client.js";
import { getCurrentRepoGuid } from "./repo-context.js";

/** A single saved report, for display in the dashboard. */
export interface ReportEntryItem {
  itemName: string;
  loca: string;
  body?: string;
}

/** Result of resolving the views/reports folder. */
interface ReportsFolder {
  loca: string;
  children: Record<string, string>;
}

const EMPTY_RESPONSE_ERROR_PREFIX = "Empty response body from /invoke";

/**
 * True when the error is the specific "Empty response body" thrown by
 * invokeContentProvider for a not-found path (HTTP 200, empty body) — as
 * opposed to a real Content Provider failure (non-2xx, timeout, bad JSON),
 * which must NOT be silently treated as "not found".
 */
function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith(EMPTY_RESPONSE_ERROR_PREFIX);
}

function locaFromAddress(address: string | undefined): string | null {
  if (!address) return null;
  const prefix = `${getCurrentRepoGuid()}/`;
  if (!address.startsWith(prefix)) return null;
  return address.substring(prefix.length);
}

/**
 * Resolves the views/reports folder using the mandated call:
 * GetByNames2(repoId, "", "views", "reports")
 *
 * If the folder does not exist yet (fresh repo), falls back to ensuring it
 * exists via PostParentItem (same "ensure folder" pattern as
 * saveDateEntry/saveDailyEntry) — only used as a fallback, never as the
 * primary read path.
 *
 * @param ensureExists When true, creates the "views" and "reports"
 *   folders if they are missing (used by the create flow). When false,
 *   returns null if the folder does not exist (used by read flows, so a
 *   genuinely missing folder is reported as "not found", not as an empty
 *   list).
 */
async function resolveReportsFolder(ensureExists: boolean): Promise<ReportsFolder | null> {
  const repoGuid = getCurrentRepoGuid();

  try {
    const result = await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "GetByNames2",
      repoGuid,
      "",
      "views",
      "reports",
    ]);

    const loca = locaFromAddress(result?.Settings?.address);
    if (!loca) {
      throw new Error(
        `views/reports GetByNames2 response missing Settings.address: ${JSON.stringify(result)}`
      );
    }

    const children: Record<string, string> = {};
    if (result?.Body && typeof result.Body === "object") {
      for (const [key, value] of Object.entries(result.Body)) {
        if (typeof key === "string" && key.length > 0 && typeof value === "string") {
          children[key] = value;
        }
      }
    }

    return { loca, children };
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
    if (!ensureExists) {
      return null;
    }

    // Fallback: ensure "views" then "reports" folders exist (fresh repo).
    const viewsResult = await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "PostParentItem",
      repoGuid,
      "",
      "Folder",
      "views",
    ]);
    const viewsLoca = locaFromAddress(viewsResult?.Settings?.address);
    if (!viewsLoca) {
      throw new Error("Failed to get or create views folder");
    }

    const reportsResult = await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "PostParentItem",
      repoGuid,
      viewsLoca,
      "Folder",
      "reports",
    ]);
    const reportsLoca = locaFromAddress(reportsResult?.Settings?.address);
    if (!reportsLoca) {
      throw new Error("Failed to get or create reports folder");
    }

    return { loca: reportsLoca, children: {} };
  }
}

/**
 * Gets all saved reports under views/reports, each with its own body
 * fetched individually via GetItem.
 *
 * Distinguishes:
 * - folder not found -> throws (caller/route surfaces as an explicit error,
 *   never masked as an empty list)
 * - folder found but empty -> returns []
 *
 * @throws Error if views/reports does not exist, or if the Content
 *   Provider call fails for any other reason.
 */
export async function getAllReportEntries(): Promise<ReportEntryItem[]> {
  const repoGuid = getCurrentRepoGuid();
  const folder = await resolveReportsFolder(false);
  if (!folder) {
    throw new Error("views/reports folder not found");
  }

  const entries: ReportEntryItem[] = [];
  for (const [physicalKey, logicalName] of Object.entries(folder.children)) {
    const childLoca = `${folder.loca}/${physicalKey}`;

    const itemResult = await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "GetItem",
      repoGuid,
      childLoca,
    ]);

    // Presence check, not truthiness: itemResult?.Body === "" is a real,
    // genuinely-empty report body and must survive as "", not collapse into
    // `undefined` (which would be indistinguishable from "no Body at all").
    let body: string | undefined;
    if (itemResult?.Body !== undefined && itemResult?.Body !== null) {
      body = typeof itemResult.Body === "string" ? itemResult.Body : JSON.stringify(itemResult.Body);
    }

    entries.push({ itemName: logicalName, loca: childLoca, body });
  }

  return entries;
}

/**
 * Gets a single report's content by its numeric loca.
 *
 * @param loca The numeric loca of the report item (e.g. "07/04/01")
 * @returns The report's body text, or null if the item has no body.
 */
export async function getReportEntryByLoca(loca: string): Promise<{ itemName: string; body: string } | null> {
  const result = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetItem",
    getCurrentRepoGuid(),
    loca,
  ]);

  if (!result?.Settings?.name || result?.Body === undefined || result?.Body === null) {
    return null;
  }

  return {
    itemName: result.Settings.name,
    body: typeof result.Body === "string" ? result.Body : JSON.stringify(result.Body),
  };
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
 * Flow (matches the mandated PostParentItem -> Put sequence):
 * 1. Resolve (or ensure-create) the views/reports folder.
 * 2. Resolve a collision-free name from the requested one (see
 *    nextAvailableName) — the requested name is used as-is unless another
 *    report with that exact name already exists.
 * 3. PostParentItem(reportsLoca, "Text", reportName) — create-or-get the
 *    report item (called exactly once per report; the caller must not call
 *    this again for the same report — use updateReportEntry instead).
 * 4. Put(reportLoca, "Text", reportName, content) — write the body.
 *
 * If PostParentItem succeeds but Put fails, the error is rethrown with the
 * created item's name/loca attached so the caller can report exactly which
 * stage failed instead of claiming success.
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
  const repoGuid = getCurrentRepoGuid();
  const folder = await resolveReportsFolder(true);
  if (!folder) {
    throw new Error("Failed to resolve or create views/reports folder");
  }

  const existingNames = Object.values(folder.children);
  const reportName = nextAvailableName(requestedName, existingNames);

  const createResult = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "PostParentItem",
    repoGuid,
    folder.loca,
    "Text",
    reportName,
  ]);

  const reportLoca = locaFromAddress(createResult?.Settings?.address);
  if (!reportLoca) {
    throw new Error(`Failed to create report "${reportName}" under views/reports`);
  }

  try {
    await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "Put",
      repoGuid,
      reportLoca,
      "Text",
      reportName,
      content,
    ]);
  } catch (error) {
    throw new Error(
      `Report "${reportName}" was created at loca "${reportLoca}" but saving its content failed: ` +
        `${error instanceof Error ? error.message : String(error)}`
    );
  }

  return { itemName: reportName, loca: reportLoca };
}

/**
 * Updates the content of an existing report.
 *
 * Per the required update flow: GetItem to read the current type/name,
 * then Put to the same loca — never PostParentItem (which is only for
 * create-or-get of a not-yet-known item).
 *
 * @param loca The numeric loca of the report item (from createReportEntry)
 * @param content The new body content
 */
export async function updateReportEntry(loca: string, content: string): Promise<void> {
  const repoGuid = getCurrentRepoGuid();

  const item = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetItem",
    repoGuid,
    loca,
  ]);

  if (!item?.Settings?.name) {
    throw new Error(`Could not find report at loca "${loca}" to update`);
  }

  await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "Put",
    repoGuid,
    loca,
    item.Settings.type || "Text",
    item.Settings.name,
    content,
  ]);
}
