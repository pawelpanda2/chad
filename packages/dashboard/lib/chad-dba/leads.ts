/**
 * Leads Service
 * 
 * Provides access to leads data through the Content Provider API.
 * Uses the shared repository: 21d11bdc-f1f4-44d1-b61a-3fa6b039c641
 */

import { invokeContentProvider } from "./client";

/**
 * Repository ID for the shared leads/reports/beeper data
 */
export const SHARED_REPO_ID = "21d11bdc-f1f4-44d1-b61a-3fa6b039c641";

/**
 * Gets all leads from the shared repository.
 * 
 * Args: ["IRepoService", "IItemWorker", "GetByNames", "21d11bdc-f1f4-44d1-b61a-3fa6b039c641", "leads", "all items"]
 * 
 * @returns Promise resolving to the leads data
 */
export async function GetAllLeads(): Promise<any> {
  return invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetByNames",
    SHARED_REPO_ID,
    "leads",
    "all items",
  ]);
}

/**
 * Gets a specific lead by name.
 * 
 * @param leadName - The name of the lead to retrieve
 * @returns Promise resolving to the lead data
 */
export async function GetLeadByName(leadName: string): Promise<any> {
  return invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetByNames",
    SHARED_REPO_ID,
    "leads",
    leadName,
  ]);
}

/**
 * Gets todo leads from the repository using FindRecursively.
 * 
 * This method works in two steps:
 * 1. First resolves the leads "all items" path to get the numeric loca
 * 2. Then calls FindRecursively with the resolved loca to search for todo items
 * 
 * IMPORTANT: FindRecursively accepts only 3 arguments after service/method:
 * - repo: the repository GUID (e.g., "21d11bdc-f1f4-44d1-b61a-3fa6b039c641")
 * - loca: the numeric path (e.g., "03/06"), NOT names like "leads", "06"
 * - phrase: the search phrase (e.g., "//todo")
 * 
 * The path resolution is done via GetByNames which returns Settings.address
 * containing the real numeric path.
 * 
 * @returns An array of ItemModel with Body, Settings.name, and Settings.address.
 */
export async function TodoLeads(): Promise<any> {
  // Import dynamically to avoid circular dependency
  const { chad_GetLeadsLoca } = await import("./path-resolver");
  
  // Step 1: Resolve the leads "all items" path to get numeric loca
  const leadsLoca = await chad_GetLeadsLoca();

  // Step 2: Search for todo items using FindRecursively with resolved loca
  return invokeContentProvider([
    "IRepoService",
    "IMethodWorker",
    "FindRecursively",
    SHARED_REPO_ID,
    leadsLoca,
    "//todo",
  ]);
}

/**
 * Creates a status item for a lead using PostParentItem.
 * 
 * Uses numeric loca for the parent location.
 * 
 * @param leadLoca The lead's parent location (e.g., "06/73")
 * @returns Promise resolving to the created item
 */
export async function createStatusForLead(leadLoca: string): Promise<any> {
  return invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "PostParentItem",
    SHARED_REPO_ID,
    leadLoca,
    "Text",
    "status",
  ]);
}

/**
 * Updates a status item with YAML content using Put.
 * 
 * Uses numeric loca for the item location.
 * 
 * @param loca The full loca of the status item (e.g., "06/73/02/status")
 * @param body The YAML body content
 * @returns Promise resolving to the updated item
 */
export async function putStatusContent(loca: string, body: string): Promise<any> {
  return invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "Put",
    SHARED_REPO_ID,
    loca,
    "Text",
    "status",
    body,
  ]);
}

/**
 * Gets an item by its numeric loca using GetItem.
 * 
 * IMPORTANT: This function uses GetItem with numeric loca, NOT GetByNames.
 * The loca parameter should be a numeric path like "06/73/02/status",
 * not a name path like "leads/06/status".
 * 
 * @param loca The numeric loca of the item (e.g., "06/73/02/status")
 * @returns Promise resolving to the item
 */
export async function getStatusItem(loca: string): Promise<any> {
  return invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetItem",
    SHARED_REPO_ID,
    loca,
  ]);
}

// =============================================================================
// Beeper to Content Provider integration helpers
// =============================================================================

/**
 * Result of posting an item by names path
 */
export interface PostItemByNamesResult {
  loca: string;
  address: string;
  name: string;
  item: any;
}

/**
 * Posts an item by names path using PostParentItem (create-or-get semantics).
 * 
 * This function builds the entire path hierarchy using POST operations:
 * - POST = create-or-get: creates if doesn't exist, returns existing if already exists
 * - Each level is created/retrieved using PostParentItem
 * 
 * IMPORTANT: This follows the Content Provider principle:
 * - POST = create-or-get (use for ensuring item exists)
 * - PUT = save content (use after POST to write data)
 * - GET = only when 100% sure item exists (use GetByNames sparingly)
 * 
 * @param repoId The repository ID
 * @param names The path segments (e.g., ["beeper", "whatsup", leadName, "beeper"])
 * @returns Promise resolving to { loca, address, name, item }
 * 
 * @example
 * ```typescript
 * // Create/get beeper/whatsup/Alice/beeper
 * const result = await postItemByNames(SHARED_REPO_ID, ["beeper", "whatsup", "Alice", "beeper"]);
 * console.log(result.loca); // "03/06/71/02/01"
 * ```
 */
export async function postItemByNames(
  repoId: string,
  names: string[]
): Promise<PostItemByNamesResult> {
  if (names.length === 0) {
    throw new Error("Names path cannot be empty");
  }

  // Step 1: Get or create the root item (first name)
  // For the root, we use GetByNames since it's the entry point
  // But we immediately switch to PostParentItem for all children
  const rootResult = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetByNames",
    repoId,
    names[0],
  ]);

  if (!rootResult?.Settings?.address) {
    throw new Error(`Could not resolve root '${names[0]}'`);
  }

  let currentLoca = rootResult.Settings.address.replace(`${repoId}/`, "");
  let currentItem = rootResult;

  // Step 2: For each remaining name, use PostParentItem (create-or-get)
  for (let i = 1; i < names.length; i++) {
    const name = names[i];

    const result = await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "PostParentItem",
      repoId,
      currentLoca,
      "Text",
      name,
    ]);

    if (!result?.Settings?.address) {
      throw new Error(`Could not create/resolve '${name}' under loca '${currentLoca}'`);
    }

    currentLoca = result.Settings.address.replace(`${repoId}/`, "");
    currentItem = result;
  }

  return {
    loca: currentLoca,
    address: currentItem.Settings.address,
    name: names[names.length - 1],
    item: currentItem,
  };
}

/**
 * Ensures the beeper/whatsup/[leadName]/beeper path exists and returns the final loca.
 * 
 * Uses POST (create-or-get) semantics via postItemByNames.
 * This is the recommended way to ensure a path exists before writing content.
 * 
 * Flow:
 * 1. POST beeper/whatsup/[leadName]/beeper - creates or gets the item
 * 2. Returns the loca for use with PUT
 * 
 * @param leadName The name of the lead (e.g., "26-05-12_pi_Agata")
 * @returns Promise resolving to the numeric loca of the final item
 */
export async function ensureBeeperContactPath(leadName: string): Promise<string> {
  const result = await postItemByNames(SHARED_REPO_ID, [
    "beeper",
    "whatsup",
    leadName,
    "beeper",
  ]);
  return result.loca;
}

/**
 * Saves text content to a beeper contact item using Put.
 * 
 * @param loca The numeric loca of the item (from ensureBeeperContactPath)
 * @param content The text content to save
 * @returns Promise resolving to the result
 */
export async function saveBeeperContactContent(loca: string, content: string): Promise<any> {
  return invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "Put",
    SHARED_REPO_ID,
    loca,
    "Text",
    "beeper",
    content,
  ]);
}

/**
 * Full flow: Save beeper WhatsApp conversation using POST -> PUT.
 * 
 * This is the recommended way to save conversations:
 * 1. POST beeper/whatsup/[leadName]/beeper - creates or gets the item
 * 2. PUT the content to the returned loca
 * 
 * @param leadName The name of the lead (e.g., "26-05-12_pi_Agata")
 * @param content The conversation content to save
 * @returns Promise resolving to { loca, address, success }
 * 
 * @example
 * ```typescript
 * const result = await saveBeeperWhatsappConversation("Alice", "Hello\nWorld");
 * console.log(`Saved to: ${result.address}`);
 * ```
 */
export async function saveBeeperWhatsappConversation(
  leadName: string,
  content: string
): Promise<{ loca: string; address: string; success: boolean }> {
  // Step 1: POST - create or get the item
  const postResult = await postItemByNames(SHARED_REPO_ID, [
    "beeper",
    "whatsup",
    leadName,
    "beeper",
  ]);

  // Step 2: PUT - save the content
  await saveBeeperContactContent(postResult.loca, content);

  return {
    loca: postResult.loca,
    address: postResult.address,
    success: true,
  };
}

/**
 * Full flow: Create beeper contact item and save content.
 * 
 * @param leadName The name of the lead (e.g., "26-05-12_pi_Agata")
 * @param content The text content to save
 * @returns Promise resolving to { loca, success }
 * @deprecated Use saveBeeperWhatsappConversation instead for clearer POST -> PUT semantics
 */
export async function createBeeperContact(leadName: string, content: string): Promise<{ loca: string; success: boolean }> {
  const loca = await ensureBeeperContactPath(leadName);
  await saveBeeperContactContent(loca, content);
  return { loca, success: true };
}

// =============================================================================
// Lead contacts discovery and matching
// =============================================================================

/**
 * Gets all lead names from the leads/all-items folder.
 * 
 * This function retrieves the parent item "leads/all-items" and returns
 * all child items (which are the individual lead folders).
 * 
 * @returns Promise resolving to an array of lead names
 */
export async function getAllLeadNames(): Promise<string[]> {
  const result = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetByNames",
    SHARED_REPO_ID,
    "leads",
    "all items",
  ]);

  if (!result?.Children) {
    return [];
  }

  // Extract names from children items
  return result.Children.map((child: any) => child.Settings?.name || child.Name || "").filter(Boolean);
}

/**
 * Gets the contacts content for a specific lead.
 * 
 * This function retrieves the "contacts" item under a specific lead folder.
 * The path is: leads / all-items / [leadName] / contacts
 * 
 * @param leadName - The name of the lead (e.g., "26-05-12_pi_Agata")
 * @returns Promise resolving to the contacts content (YAML string) or null if not found
 */
export async function getLeadContacts(leadName: string): Promise<string | null> {
  const result = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetByNames",
    SHARED_REPO_ID,
    "leads",
    "all items",
    leadName,
    "contacts",
  ]);

  if (!result?.Body) {
    return null;
  }

  return result.Body;
}

/**
 * Gets the contacts item metadata for a specific lead.
 * 
 * Similar to getLeadContacts but returns the full item instead of just the body.
 * 
 * @param leadName - The name of the lead
 * @returns Promise resolving to the contacts item or undefined if not found
 */
export async function getLeadContactsItem(leadName: string): Promise<any> {
  return invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetByNames",
    SHARED_REPO_ID,
    "leads",
    "all items",
    leadName,
    "contacts",
  ]);
}

/**
 * Gets all leads with their metadata, including whether they have contacts.
 * 
 * This function retrieves all leads and checks which ones have a "contacts" child item.
 * 
 * @returns Promise resolving to an array of lead info objects
 */
export async function getAllLeadsWithContacts(): Promise<Array<{
  name: string;
  hasContacts: boolean;
  loca?: string;
}>> {
  const result = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetByNames",
    SHARED_REPO_ID,
    "leads",
    "all items",
  ]);

  if (!result?.Children) {
    return [];
  }

  const leads = [];
  for (const child of result.Children) {
    const name = child.Settings?.name || child.Name || "";
    if (!name) continue;

    // Check if this lead has a "contacts" child
    const hasContacts = child.Children?.some((c: any) => 
      (c.Settings?.name === "contacts" || c.Name === "contacts")
    ) ?? false;

    leads.push({
      name,
      hasContacts,
      loca: child.Settings?.address ? 
        child.Settings.address.replace(`${SHARED_REPO_ID}/`, "") : undefined,
    });
  }

  return leads;
}

/**
 * Gets the full item data for leads/all-items.
 * 
 * Useful for debugging or when you need the complete structure.
 * 
 * @returns Promise resolving to the leads parent item
 */
export async function getLeadsParentItem(): Promise<any> {
  return invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetByNames",
    SHARED_REPO_ID,
    "leads",
    "all items",
  ]);
}

// =============================================================================
// Msg Planner - Public API functions
// =============================================================================

/**
 * Date folder info for Msg Planner
 */
export interface MsgPlannerDateFolder {
  /** The date string in YY-MM-DD format (logical name from config.yaml) */
  date: string;
  /** The numeric loca of the date folder */
  loca: string;
}

/**
 * Msg Planner body data for editing
 */
export interface MsgPlannerBodyData {
  /** The date of the folder */
  date: string;
  /** The numeric loca of the body item */
  loca: string;
  /** The body content */
  body: string;
}

/**
 * Regex pattern for validating date format YY-MM-DD
 */
// Matches YY-MM-DD format with optional suffix (letter or timestamp, no underscore)
// Examples: "26-07-08", "26-07-08b", "26-07-08c", "26-07-081234567890"
const DATE_PATTERN = /^\d{2}-\d{2}-\d{2}([a-z]|\d+)?$/;

/**
 * Checks if a string matches the YY-MM-DD date format.
 */
export function isValidDateFolderName(name: string): boolean {
  return DATE_PATTERN.test(name);
}

/**
 * Gets the numeric loca from a full address string.
 */
function getLocaFromAddress(address: string): string {
  if (!address) return "";
  const prefix = `${SHARED_REPO_ID}/`;
  if (!address.startsWith(prefix)) return "";
  return address.substring(prefix.length);
}

/**
 * Gets all date folders from the leads/msg planner path.
 * 
 * Uses GetByNames with logical names from config.yaml.
 */
export async function getMsgPlannerDateFolders(): Promise<MsgPlannerDateFolder[]> {
  console.log("[chad-dba] getMsgPlannerDateFolders: Starting...");

  // Step 1: Get the "msg planner" folder using GetByNames
  // Path: leads -> msg planner (logical names from config.yaml)
  console.log('[chad-dba] Step 1: Calling GetByNames("leads", "msg planner")');
  const msgPlannerResult = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetByNames",
    SHARED_REPO_ID,
    "leads",
    "msg planner",
  ]);

  console.log("[chad-dba] GetByNames result:", JSON.stringify(msgPlannerResult, null, 2));

  if (!msgPlannerResult?.Settings?.address) {
    console.log("[chad-dba] No msg planner folder found - GetByNames returned no address");
    return [];
  }

  const msgPlannerLoca = getLocaFromAddress(msgPlannerResult.Settings.address);
  console.log("[chad-dba] msg planner loca:", msgPlannerLoca);

  // Step 2: Get all children of the msg planner folder
  console.log("[chad-dba] Step 2: Getting children using GetItem");
  const childrenResult = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetItem",
    SHARED_REPO_ID,
    msgPlannerLoca,
  ]);

  console.log("[chad-dba] GetItem result:", JSON.stringify(childrenResult, null, 2));

  if (!childrenResult?.Children || !Array.isArray(childrenResult.Children)) {
    console.log("[chad-dba] No children found in msg planner folder");
    return [];
  }

  console.log("[chad-dba] Found", childrenResult.Children.length, "children");

  // Step 3: Filter children by date format (YY-MM-DD)
  const dateFolders: MsgPlannerDateFolder[] = [];

  for (const child of childrenResult.Children) {
    const logicalName = child.Settings?.name || child.Name || "";
    console.log("[chad-dba] Checking child name:", logicalName, "isValid:", isValidDateFolderName(logicalName));
    
    if (isValidDateFolderName(logicalName)) {
      const childLoca = getLocaFromAddress(child?.Settings?.address || "");
      console.log("[chad-dba] Valid date folder:", logicalName, "loca:", childLoca);

      if (childLoca) {
        dateFolders.push({
          date: logicalName,
          loca: childLoca,
        });
      }
    }
  }

  console.log("[chad-dba] Found", dateFolders.length, "date folders matching YY-MM-DD format");

  // Sort by date descending (newest first)
  dateFolders.sort((a, b) => {
    const parseDate = (d: string) => {
      const parts = d.split("-");
      return new Date(parseInt(`20${parts[0]}`), parseInt(parts[1]) - 1, parseInt(parts[2]));
    };
    return parseDate(b.date).getTime() - parseDate(a.date).getTime();
  });

  console.log("[chad-dba] Returning date folders:", dateFolders);
  return dateFolders;
}

/**
 * Gets the body.txt content for a specific date folder.
 */
export async function getMsgPlannerBodyForDate(date: string, dateFolderLoca: string): Promise<MsgPlannerBodyData | null> {
  // Get the body.txt item using GetManyByName
  const bodyItems = await invokeContentProvider([
    "IRepoService",
    "IManyItemsWorker",
    "GetManyByName",
    SHARED_REPO_ID,
    dateFolderLoca,
    "body.txt",
  ]);

  if (!Array.isArray(bodyItems) || bodyItems.length === 0) {
    return {
      date,
      loca: dateFolderLoca,
      body: "",
    };
  }

  const bodyItem = bodyItems[0];
  const bodyLoca = getLocaFromAddress(bodyItem?.Settings?.address || "");

  return {
    date,
    loca: bodyLoca || dateFolderLoca,
    body: bodyItem?.Body || "",
  };
}

/**
 * Saves content to a body.txt item in the msg planner.
 */
export async function saveMsgPlannerBody(dateFolderLoca: string, content: string): Promise<boolean> {
  // Step 1: Ensure body.txt exists using PostParentItem
  const bodyResult = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "PostParentItem",
    SHARED_REPO_ID,
    dateFolderLoca,
    "Text",
    "body.txt",
  ]);

  if (!bodyResult?.Settings?.address) {
    throw new Error("Could not create/get body.txt item");
  }

  const bodyLoca = getLocaFromAddress(bodyResult.Settings.address);

  // Step 2: Put the content
  await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "Put",
    SHARED_REPO_ID,
    bodyLoca,
    "Text",
    "body.txt",
    content,
  ]);

  return true;
}
