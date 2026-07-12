/**
 * Leads Service
 * 
 * Provides access to leads data through the Content Provider API.
 * Uses the shared repository: 21d11bdc-f1f4-44d1-b61a-3fa6b039c641
 */

import { invokeContentProvider } from "./client.js";
import { getCurrentRepoGuid } from "./repo-context.js";

/**
 * Gets all leads from the shared repository.
 * 
 * Uses PostByNames (create-or-get) to match the working C# test approach:
 * IItemWorker.PostByNames(repoId, "Folder", "leads", "all items")
 * 
 * @returns Promise resolving to the leads data (Body = map of leadId -> leadName)
 */
export async function GetAllLeads(): Promise<any> {
  return invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "PostByNames",
    getCurrentRepoGuid(),
    "Folder",
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
    getCurrentRepoGuid(),
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
  const { chad_GetLeadsLoca } = await import("./path-resolver.js");
  
  // Step 1: Resolve the leads "all items" path to get numeric loca
  const leadsLoca = await chad_GetLeadsLoca();

  // Step 2: Search for todo items using FindRecursively with resolved loca
  return invokeContentProvider([
    "IRepoService",
    "IMethodWorker",
    "FindRecursively",
    getCurrentRepoGuid(),
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
    getCurrentRepoGuid(),
    leadLoca,
    "Text",
    "status",
  ]);
}
/**
 * Finds an existing status item directly under a lead using the logical item name.
 *
 * Returns null when the status item does not exist.
 *
 * @param leadLoca The lead's numeric loca (e.g. "03/06/81")
 */
export async function findStatusForLead(leadLoca: string): Promise<any | null> {
  const allItems = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "PostByNames",
    getCurrentRepoGuid(),
    "Folder",
    "leads",
    "all items",
  ]);

  const leadsAddress = allItems?.Settings?.address || "";
  if (!leadsAddress) {
    throw new Error("findStatusForLead: Could not resolve leads/all items address");
  }

  const leadsLoca = getStatusLocaFromItem({
    Settings: { address: leadsAddress },
  });

  const result = await invokeContentProvider([
    "IRepoService",
    "IManyItemsWorker",
    "GetManyByName",
    getCurrentRepoGuid(),
    leadsLoca,
    "status",
  ]);

  if (!Array.isArray(result) || result.length === 0) {
    return null;
  }

  const statusPrefix = `${leadLoca}/`;

  for (const item of result) {
    const statusLoca = getStatusLocaFromItem(item);
    if (statusLoca.startsWith(statusPrefix)) {
      return item;
    }
  }

  return null;
}

/**
 * Resolves the numeric loca of a status item from its full address.
 *
 * @param item A status item with Settings.address
 */
export function getStatusLocaFromItem(item: any): string {
  const address = item?.Settings?.address;

  if (!address || typeof address !== "string") {
    throw new Error("Status item has no Settings.address");
  }

  const prefix = `${getCurrentRepoGuid()}/`;
  if (!address.startsWith(prefix)) {
    throw new Error(`Status address \"${address}\" does not start with repo prefix \"${prefix}\"`);
  }

  return address.substring(prefix.length);
}

/**
 * Gets contacts content for a lead using GetByNames2 with numeric loca.
 * 
 * This function uses GetByNames2 which is more reliable than GetItem
 * because it resolves the item by logical name from a known parent loca.
 * 
 * GetByNames2(repoId, leadLoca, "contacts")
 * 
 * @param leadLoca - The numeric loca of the lead (e.g., "03/06/89")
 * @returns Promise resolving to contacts body (YAML string) or null if not found
 */
export async function getLeadContactsByLoca(leadLoca: string): Promise<string | null> {
  try {
    const result = await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "GetByNames2",
      getCurrentRepoGuid(),
      leadLoca,
      "contacts",
    ]);
    
    // Check if the item was found and has body
    if (!result || !result.Body) {
      return null;
    }
    
    return result.Body;
  } catch (error) {
    // Item doesn't exist or error fetching
    return null;
  }
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
  // Validation: Ensure loca does not contain repo GUID
  // repoGuid should ONLY be passed as the repo argument, never in loca
  if (loca.includes(getCurrentRepoGuid())) {
    throw new Error(
      `Invalid loca for putStatusContent: loca contains repo GUID. ` +
      `repoGuid should only be passed as the repo argument, never in loca. ` +
      `Function: putStatusContent, repo: ${getCurrentRepoGuid()}, loca: ${loca}`
    );
  }

  return invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "Put",
    getCurrentRepoGuid(),
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
    getCurrentRepoGuid(),
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
 * const result = await postItemByNames(getCurrentRepoGuid(), ["beeper", "whatsup", "Alice", "beeper"]);
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

  // Protection: Check if any name in the path equals the repoId
  // This prevents creating items like "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/21d11bdc-f1f4-44d1-b61a-3fa6b039c641"
  // which would cause "Missing required config key: 'name'" errors
  for (const name of names) {
    if (name === repoId) {
      throw new Error(
        `Invalid path: Cannot create item with name "${name}" because it equals the repoId. ` +
        `This would create an invalid path structure. Check your path names - the repoId should only be used as the repository identifier, not as a folder/item name.`
      );
    }
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
  const result = await postItemByNames(getCurrentRepoGuid(), [
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
    getCurrentRepoGuid(),
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
  const postResult = await postItemByNames(getCurrentRepoGuid(), [
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
    getCurrentRepoGuid(),
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
    getCurrentRepoGuid(),
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
    getCurrentRepoGuid(),
    "leads",
    "all items",
    leadName,
    "contacts",
  ]);
}

/**
 * Lead info with contacts status for the dashboard
 */
export interface LeadDashboardItem {
  leadKey: string;
  leadName: string;
  loca: string;
  hasContacts: boolean;
}

/**
 * Gets all leads with their metadata, including whether they have contacts.
 * 
 * This function uses GetAllLeads() which returns a map of leadId -> leadName.
 * Then uses GetManyByName to find all contacts items at once (not one-by-one).
 * 
 * IMPORTANT: Uses logical names via GetManyByName, NOT physical paths.
 * The "contacts" items are found by logical name, not physical path.
 * 
 * @returns Promise resolving to an array of lead info objects
 */
export async function getAllLeadsWithContacts(): Promise<LeadDashboardItem[]> {
  // Step 1: Get all leads map using PostByNames (same as getStatusesDashboardList)
  const allLeadsResponse = await GetAllLeads();

  if (!allLeadsResponse?.Body || typeof allLeadsResponse.Body !== "object") {
    return [];
  }

  // Step 2: Get leads base loca
  const leadsLoca = allLeadsResponse.Settings?.address
    ? allLeadsResponse.Settings.address.replace(`${getCurrentRepoGuid()}/`, "")
    : "03/06";

  const body = allLeadsResponse.Body;

  // Step 3: Get all contacts items at once using GetManyByName
  // This finds all "contacts" items under the leads folder
  const contactsItems = await invokeContentProvider([
    "IRepoService",
    "IManyItemsWorker",
    "GetManyByName",
    getCurrentRepoGuid(),
    leadsLoca,
    "contacts",
  ]);

  // Build a set of lead names that have contacts
  const leadsWithContacts = new Set<string>();
  if (Array.isArray(contactsItems)) {
    for (const item of contactsItems) {
      const address = item?.Settings?.address || "";
      if (address) {
        // Extract the lead name from the address
        // Address format: repoId/leadsLoca/leadKey/.../contacts
        const withoutRepo = address.replace(`${getCurrentRepoGuid()}/`, "");
        const withoutLeads = withoutRepo.replace(`${leadsLoca}/`, "");
        const leadName = withoutLeads.split("/").slice(1).join("/").replace("/contacts", "");
        if (leadName) {
          leadsWithContacts.add(leadName);
        }
      }
    }
  }

  // Step 4: Build lead items
  const leads: LeadDashboardItem[] = [];

  for (const [leadKey, leadName] of Object.entries(body)) {
    if (!leadName || typeof leadName !== "string") continue;

    leads.push({
      leadKey,
      leadName,
      loca: `${leadsLoca}/${leadKey}`,
      hasContacts: leadsWithContacts.has(leadName),
    });
  }

  // Sort by leadKey descending (newest first) - same as statuses dashboard
  leads.sort((a, b) => parseInt(b.leadKey) - parseInt(a.leadKey));

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
    getCurrentRepoGuid(),
    "leads",
    "all items",
  ]);
}

// =============================================================================
// Lead Details - Public API functions
// =============================================================================

/**
 * Parsed contact information from a lead's contacts item
 */
export interface LeadContactInfo {
  name?: string | string[];
  phone?: string | string[];
  instagram?: string | string[];
  facebook?: string | string[];
  whatsapp?: string | string[];
  age?: string | string[];
  [key: string]: string | string[] | undefined;
}

/**
 * Lead details data for the dashboard
 */
export interface LeadDetailsData {
  leadKey: string;
  leadName: string;
  loca: string;
  contacts: LeadContactInfo | null;
  contactsError?: string;
}

/**
 * Parses YAML contacts body into a structured object.
 * Returns null if the body is empty or invalid.
 * Returns the parsed object on success.
 */
function parseContactsYaml(body: string): LeadContactInfo | null {
  if (!body || !body.trim()) {
    return null;
  }

  const result: LeadContactInfo = {};
  let hasAnyField = false;
  let currentKey: string | null = null;

  const ensureArrayValue = (key: string): string[] => {
    const existing = result[key];
    if (Array.isArray(existing)) {
      return existing;
    }
    if (typeof existing === "string" && existing.trim()) {
      const arr = [existing.trim()];
      result[key] = arr;
      return arr;
    }
    const arr: string[] = [];
    result[key] = arr;
    return arr;
  };

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;

    const listMatch = line.match(/^-\s+(.+)$/);
    if (listMatch && currentKey) {
      const value = listMatch[1].trim();
      if (!value) continue;
      const arr = ensureArrayValue(currentKey);
      arr.push(value);
      hasAnyField = true;
      continue;
    }

    const keyMatch = line.match(/^([^:]+):\s*(.*)$/);
    if (!keyMatch) {
      currentKey = null;
      continue;
    }

    const key = keyMatch[1].trim();
    const value = keyMatch[2].trim();

    if (!key) continue;

    currentKey = key;

    if (!value) {
      // Key with nested list in next lines.
      continue;
    }

    if (value.startsWith("- ")) {
      const firstItem = value.slice(2).trim();
      if (!firstItem) continue;
      const arr = ensureArrayValue(key);
      arr.push(firstItem);
      hasAnyField = true;
      continue;
    }

    result[key] = value;
    hasAnyField = true;
  }

  return hasAnyField ? result : null;
}

/**
 * Gets detailed information about a specific lead, including contacts.
 * 
 * This function:
 * 1. Finds the lead's contacts child item using numeric loca (more reliable)
 * 2. Parses the contacts body as YAML
 * 3. Returns structured lead details
 * 
 * @param leadName - The name of the lead (e.g., "26-05-12_pi_Agata")
 * @param leadLoca - The numeric loca of the lead (e.g., "03/06/89")
 * @returns Promise resolving to LeadDetailsData
 */
export async function getLeadDetails(leadName: string, leadLoca: string): Promise<LeadDetailsData> {
  // Get contacts content using numeric loca (more reliable than name-based lookup)
  const contactsBody = await getLeadContactsByLoca(leadLoca);
  
  let contacts: LeadContactInfo | null = null;
  let contactsError: string | undefined;

  if (contactsBody === null) {
    // No contacts item exists
    contacts = null;
  } else {
    // Try to parse the YAML
    contacts = parseContactsYaml(contactsBody);
    if (contacts === null) {
      // Body exists but YAML is empty or invalid
      contactsError = "Nie udałoło się odczytać danych kontaktowych";
    }
  }

  return {
    leadKey: leadLoca.split("/").pop() || leadName,
    leadName,
    loca: leadLoca,
    contacts,
    contactsError,
  };
}

// =============================================================================
// Msg Workouts - Public API functions
// =============================================================================

/**
 * Msg workout item for display in the dashboard
 */
export interface MsgWorkoutItem {
  physicalKey: string;
  logicalName: string;
  /** Numeric loca of the workout item (e.g., "03/06/89/03") */
  loca: string;
}

/**
 * Result of getting msg workouts for a lead
 */
export interface MsgWorkoutsResult {
  workouts: MsgWorkoutItem[];
  error?: string;
  notFound: boolean;
}

// =============================================================================
// Msg Workout Creation - Public API functions
// =============================================================================

/**
 * Generates a unique workout name for today's date.
 * 
 * Format: YY-MM-DD for the first workout, YY-MM-DDb, YY-MM-DDc, etc. for subsequent ones.
 * 
 * @param existingWorkoutNames - Array of existing workout names for the lead
 * @returns A unique workout name
 */
export function generateWorkoutName(existingWorkoutNames: string[]): string {
  const now = new Date();
  const year = now.getFullYear() % 100; // Last 2 digits of year
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  
  const baseName = `${year}-${month}-${day}`;
  
  // Check if base name exists
  if (!existingWorkoutNames.includes(baseName)) {
    return baseName;
  }
  
  // Try suffixes b, c, d, ... z, then aa, ab, etc.
  const letters = 'bcdefghijklmnopqrstuvwxyz';
  for (const letter of letters) {
    const nameWithSuffix = `${baseName}${letter}`;
    if (!existingWorkoutNames.includes(nameWithSuffix)) {
      return nameWithSuffix;
    }
  }
  
  // If we've exhausted single letters, try double letters (aa, ab, etc.)
  // This is extremely unlikely but provides a fallback
  for (const firstLetter of letters) {
    for (const secondLetter of letters) {
      const nameWithSuffix = `${baseName}${firstLetter}${secondLetter}`;
      if (!existingWorkoutNames.includes(nameWithSuffix)) {
        return nameWithSuffix;
      }
    }
  }
  
  // Ultimate fallback - add timestamp
  return `${baseName}_${Date.now()}`;
}

/**
 * Creates a new msg workout for a specific lead.
 * 
 * This function:
 * 1. Gets existing workouts to determine a unique name
 * 2. Creates the workout folder using PostParentItem
 * 3. Returns the created workout details
 * 
 * @param leadName - The name of the lead (e.g., "26-05-12_pi_Agata")
 * @param leadLoca - The numeric loca of the lead (e.g., "03/06/89")
 * @returns Promise resolving to the created workout details
 */
export async function createMsgWorkoutForLead(
  leadName: string,
  leadLoca: string
): Promise<{ workoutName: string; workoutLoca: string; success: boolean }> {
  // Step 1: Get existing workouts to generate a unique name
  const existingWorkoutsResult = await getLeadMsgWorkoutsByLoca(leadLoca);
  const existingNames = existingWorkoutsResult.workouts.map(w => w.logicalName);
  
  // Step 2: Generate unique name
  const workoutName = generateWorkoutName(existingNames);
  
  // Step 3: Ensure the msg workout folder exists and create the new workout
  // First, get or create the msg workout folder
  const msgWorkoutFolderResult = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetByNames2",
    getCurrentRepoGuid(),
    leadLoca,
    "msg workout",
  ]);
  
  let msgWorkoutFolderLoca: string;
  
  if (msgWorkoutFolderResult?.Settings?.address) {
    // Folder exists
    msgWorkoutFolderLoca = msgWorkoutFolderResult.Settings.address.replace(`${getCurrentRepoGuid()}/`, "");
  } else {
    // Folder doesn't exist, this shouldn't happen if getLeadMsgWorkoutsByLoca worked
    // but we handle it gracefully
    throw new Error("Could not resolve msg workout folder for lead");
  }
  
  // Step 4: Create the new workout item
  const workoutResult = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "PostParentItem",
    getCurrentRepoGuid(),
    msgWorkoutFolderLoca,
    "Folder",
    workoutName,
  ]);
  
  if (!workoutResult?.Settings?.address) {
    throw new Error(`Failed to create workout "${workoutName}"`);
  }
  
  const workoutLoca = workoutResult.Settings.address.replace(`${getCurrentRepoGuid()}/`, "");
  
  return {
    workoutName,
    workoutLoca,
    success: true,
  };
}

/**
 * Gets all msg workouts for a specific lead using numeric loca and GetByNames2.
 * 
 * This function uses the more efficient GetByNames2 method that starts from
 * a known numeric loca instead of resolving the full name path:
 * 
 * GetByNames2(repoId, leadLoca, "msg workout")
 * 
 * The response Body contains a map of physicalKey -> logicalName for each workout.
 * The response Settings.address contains the msg workout folder's address, which
 * is used to compute each workout's numeric loca.
 * 
 * IMPORTANT: This uses GetByNames2 instead of the old GetByNames pattern.
 * The old pattern required resolving: leads, all items, [leadName], msg workout
 * The new pattern uses the already-known leadLoca directly.
 * 
 * @param leadLoca - The numeric loca of the lead (e.g., "03/06/89")
 * @returns Promise resolving to MsgWorkoutsResult with list of workouts
 */
// =============================================================================
// Date Entry & Daily Entry - Actions folder
// =============================================================================

/**
 * Date entry record for display in the dashboard
 */
export interface DateEntryItem {
  itemName: string;
  loca: string;
  body?: string;
}

/**
 * Daily entry record for display in the dashboard
 */
export interface DailyEntryItem {
  itemName: string;
  loca: string;
  body?: string;
}

/**
 * Gets every child Text-item of a single folder (identified by parent
 * logical-name path, e.g. ["views", "dates"]), with each child's own
 * body fetched individually.
 *
 * This mirrors the PROVEN working pattern from getMsgPlannerDateFolders
 * (documentation/dba/data-access.md §5-7), NOT IManyItemsWorker.GetList —
 * GetList takes a C# ValueTuple parameter that the /invoke string-args
 * resolver (FindParameters.ConvertParamFromString) cannot construct
 * (confirmed real failure: "InvalidCastException: Invalid cast from
 * 'System.String' to 'System.ValueTuple`2[...]'" — this method is not
 * callable via /invoke at all, for any data, regardless of args). The
 * documented, already-working approach for "list every child of one
 * folder" is: GetByNames on the folder, then walk its Body map
 * (physicalKey -> logicalName), building each child's loca as
 * `${folderLoca}/${physicalKey}` — exactly what Msg Planner does.
 *
 * @param parentNames - logical-name path to the folder, e.g. ["views", "dates"]
 */
async function getAllChildTextItems(
  parentNames: string[]
): Promise<Array<{ itemName: string; loca: string; body?: string }>> {
  const repoGuid = getCurrentRepoGuid();

  const folderResult = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetByNames",
    repoGuid,
    ...parentNames,
  ]);

  if (!folderResult?.Settings?.address) {
    return [];
  }

  const folderLoca = folderResult.Settings.address.replace(`${repoGuid}/`, "");

  const childrenBody = folderResult?.Body;
  if (!childrenBody || typeof childrenBody !== "object") {
    return [];
  }

  const childEntries = Object.entries(childrenBody).filter(
    ([physicalKey, logicalName]) =>
      typeof physicalKey === "string" && physicalKey.length > 0 && typeof logicalName === "string"
  ) as Array<[string, string]>;

  const entries: Array<{ itemName: string; loca: string; body?: string }> = [];
  for (const [physicalKey, logicalName] of childEntries) {
    const childLoca = `${folderLoca}/${physicalKey}`;

    const itemResult = await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "GetItem",
      repoGuid,
      childLoca,
    ]);

    let body: string | undefined;
    if (itemResult?.Body) {
      body = typeof itemResult.Body === "string" ? itemResult.Body : JSON.stringify(itemResult.Body);
    }

    entries.push({ itemName: logicalName, loca: childLoca, body });
  }

  return entries;
}

/**
 * Gets all date entries from the views/dates folder.
 *
 * @returns Promise resolving to array of date entry items
 */
export async function getAllDateEntries(): Promise<DateEntryItem[]> {
  try {
    return await getAllChildTextItems(["views", "dates"]);
  } catch {
    return [];
  }
}

/**
 * Gets all daily entries from the views/daily folder.
 *
 * Note: The body is returned as a raw string. YAML parsing should be done
 * in the dashboard layer where js-yaml is available.
 *
 * @returns Promise resolving to array of daily entry items
 */
export async function getAllDailyEntries(): Promise<DailyEntryItem[]> {
  try {
    return await getAllChildTextItems(["views", "daily"]);
  } catch {
    return [];
  }
}

/**
 * Saves a date entry to the views/dates folder.
 *
 * Flow:
 * 1. Ensure views folder exists (PostParentItem on root)
 * 2. Ensure dates folder exists under views
 * 3. Create text item with the entry name
 * 4. Put YAML body into the text item
 *
 * @param itemName - The name of the entry (e.g., "26-07-10")
 * @param bodyYaml - The YAML body content
 * @returns Promise resolving to { itemName, loca, success }
 */
export async function saveDateEntry(
  itemName: string,
  bodyYaml: string
): Promise<{ itemName: string; loca: string; success: boolean }> {
  // Step 1: Get or create views folder under root
  const viewsResult = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "PostParentItem",
    getCurrentRepoGuid(),
    "",  // root loca
    "Folder",
    "views",
  ]);

  if (!viewsResult?.Settings?.address) {
    throw new Error("Failed to get or create views folder");
  }

  const viewsLoca = viewsResult.Settings.address.replace(`${getCurrentRepoGuid()}/`, "");

  // Step 2: Get or create dates folder under views
  const datesResult = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "PostParentItem",
    getCurrentRepoGuid(),
    viewsLoca,
    "Folder",
    "dates",
  ]);

  if (!datesResult?.Settings?.address) {
    throw new Error("Failed to get or create dates folder");
  }

  const datesLoca = datesResult.Settings.address.replace(`${getCurrentRepoGuid()}/`, "");

  // Step 3: Create text item under dates folder
  const entryResult = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "PostParentItem",
    getCurrentRepoGuid(),
    datesLoca,
    "Text",
    itemName,
  ]);

  if (!entryResult?.Settings?.address) {
    throw new Error(`Failed to create date entry "${itemName}"`);
  }

  const entryLoca = entryResult.Settings.address.replace(`${getCurrentRepoGuid()}/`, "");

  // Step 4: Put YAML body
  await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "Put",
    getCurrentRepoGuid(),
    entryLoca,
    "Text",
    itemName,
    bodyYaml,
  ]);

  return {
    itemName,
    loca: entryLoca,
    success: true,
  };
}

/**
 * Saves a daily entry to the views/daily folder.
 *
 * Flow:
 * 1. Ensure views folder exists (PostParentItem on root)
 * 2. Ensure daily folder exists under views
 * 3. Create text item with the entry name
 * 4. Put YAML body into the text item
 *
 * @param itemName - The name of the entry (e.g., "26-07-10")
 * @param bodyYaml - The YAML body content
 * @returns Promise resolving to { itemName, loca, success }
 */
export async function saveDailyEntry(
  itemName: string,
  bodyYaml: string
): Promise<{ itemName: string; loca: string; success: boolean }> {
  // Step 1: Get or create views folder under root
  const viewsResult = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "PostParentItem",
    getCurrentRepoGuid(),
    "",  // root loca
    "Folder",
    "views",
  ]);

  if (!viewsResult?.Settings?.address) {
    throw new Error("Failed to get or create views folder");
  }

  const viewsLoca = viewsResult.Settings.address.replace(`${getCurrentRepoGuid()}/`, "");

  // Step 2: Get or create daily folder under views
  const dailyResult = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "PostParentItem",
    getCurrentRepoGuid(),
    viewsLoca,
    "Folder",
    "daily",
  ]);

  if (!dailyResult?.Settings?.address) {
    throw new Error("Failed to get or create daily folder");
  }

  const dailyLoca = dailyResult.Settings.address.replace(`${getCurrentRepoGuid()}/`, "");

  // Step 3: Create text item under daily folder
  const entryResult = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "PostParentItem",
    getCurrentRepoGuid(),
    dailyLoca,
    "Text",
    itemName,
  ]);

  if (!entryResult?.Settings?.address) {
    throw new Error(`Failed to create daily entry "${itemName}"`);
  }

  const entryLoca = entryResult.Settings.address.replace(`${getCurrentRepoGuid()}/`, "");

  // Step 4: Put YAML body
  await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "Put",
    getCurrentRepoGuid(),
    entryLoca,
    "Text",
    itemName,
    bodyYaml,
  ]);

  return {
    itemName,
    loca: entryLoca,
    success: true,
  };
}

/**
 * Generates the next sequential zero-padded numeric item name ("01", "02",
 * ...) that isn't already in existingNames. Item NAMES are just sequence
 * numbers, not dates — the actual date lives inside the entry's own body
 * (DATE/DATA field), so encoding it again in the name was redundant.
 *
 * The dateStr parameter kept for source compatibility with older callers
 * that still pass it (harmless, ignored) — new callers should just pass
 * existingNames.
 */
export function generateEntryName(existingNames: string[], _dateStr?: string): string {
  let n = existingNames.length + 1;
  let candidate = String(n).padStart(2, "0");
  while (existingNames.includes(candidate)) {
    n += 1;
    candidate = String(n).padStart(2, "0");
  }
  return candidate;
}

/**
 * Daily Tracker "— AUTO" columns, computed from Date Entry records grouped
 * by matching date. Rules reconstructed from the Google Sheet's exported
 * values (no formulas were present in the export — see
 * documentation/dashboard/common/features/daily-tracker-dates.md for the
 * worked examples this was derived from) and confirmed by the project
 * owner:
 *
 * - PULLS: count of that day's Date records with PULL truthy.
 * - CLOSES: sum of CLOSE weights for that day (NIE=0, BLISKO=0.5, TAK=1).
 * - QUALITY D/P: average JAKOŚĆ of that day's records where PULL is truthy
 *   (records without a pull are excluded).
 * - QUALITY C: average JAKOŚĆ of that day's records where CLOSE=TAK
 *   (BLISKO does NOT count).
 *
 * Averaging multiple qualifying records for one day is the project
 * owner's best-guess reconstruction (not confirmed against a larger
 * dataset or the original formulas) — revisit if real data contradicts it.
 */
export interface DailyAutoFields {
  pullsAuto: number;
  closesAuto: number;
  qualityDpAuto: number | null;
  qualityCAuto: number | null;
}

function isPullTruthy(value: unknown): boolean {
  const s = String(value ?? "").trim().toUpperCase();
  return s === "TRUE" || s === "TAK" || s === "1";
}

function closeWeight(value: unknown): number {
  const s = String(value ?? "").trim().toUpperCase();
  if (s === "TAK") return 1;
  if (s === "BLISKO") return 0.5;
  return 0; // NIE or anything else
}

function parseQuality(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const normalized = String(value).replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Computes PULLS/CLOSES/QUALITY D/P/QUALITY C for every date present in
 * dateEntryFields, keyed by the date string exactly as it appears in the
 * DATA field (so callers should look up using the same DATE/DATA string
 * format the Daily Entry and Date Entry forms actually save).
 *
 * @param dateEntryFields - parsed YAML fields (DATA, PULL, CLOSE, JAKOŚĆ) of every Date Entry record
 */
export function computeDailyAutoFieldsByDate(
  dateEntryFields: Array<Record<string, unknown>>
): Map<string, DailyAutoFields> {
  const byDate = new Map<string, Array<Record<string, unknown>>>();
  for (const fields of dateEntryFields) {
    const date = String(fields["DATA"] ?? "").trim();
    if (!date) continue;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(fields);
  }

  const result = new Map<string, DailyAutoFields>();
  for (const [date, records] of byDate) {
    const pullRecords = records.filter((r) => isPullTruthy(r["PULL"]));
    const closeYesRecords = records.filter((r) => closeWeight(r["CLOSE"]) === 1);

    result.set(date, {
      pullsAuto: pullRecords.length,
      closesAuto: records.reduce((sum, r) => sum + closeWeight(r["CLOSE"]), 0),
      qualityDpAuto: average(
        pullRecords.map((r) => parseQuality(r["JAKOŚĆ"])).filter((n): n is number => n !== null)
      ),
      qualityCAuto: average(
        closeYesRecords.map((r) => parseQuality(r["JAKOŚĆ"])).filter((n): n is number => n !== null)
      ),
    });
  }

  return result;
}

export async function getLeadMsgWorkoutsByLoca(leadLoca: string): Promise<MsgWorkoutsResult> {
  try {
    const result = await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "GetByNames2",
      getCurrentRepoGuid(),
      leadLoca,
      "msg workout",
    ]);

    // Check if the item was found
    if (!result || !result.Settings) {
      return {
        workouts: [],
        notFound: true,
      };
    }

    // Get the msg workout folder's loca from the address
    const folderAddress = result.Settings.address || "";
    if (!folderAddress.startsWith(`${getCurrentRepoGuid()}/`)) {
      return {
        workouts: [],
        notFound: false,
        error: "Invalid folder address format",
      };
    }
    const msgWorkoutFolderLoca = folderAddress.substring(`${getCurrentRepoGuid()}/`.length);

    // Check if Body exists and is an object
    if (!result.Body || typeof result.Body !== "object") {
      return {
        workouts: [],
        notFound: false,
      };
    }

    // Parse the Body map: physicalKey -> logicalName
    // Also compute the workout's numeric loca: msgWorkoutFolderLoca/physicalKey
    const workouts: MsgWorkoutItem[] = [];
    for (const [physicalKey, logicalName] of Object.entries(result.Body)) {
      if (typeof logicalName === "string" && logicalName.trim()) {
        workouts.push({
          physicalKey,
          logicalName: logicalName.trim(),
          loca: `${msgWorkoutFolderLoca}/${physicalKey}`,
        });
      }
    }

    return {
      workouts,
      notFound: false,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[getLeadMsgWorkoutsByLoca] ERROR for lead loca "${leadLoca}": ${errorMsg}`);
    return {
      workouts: [],
      notFound: false,
      error: errorMsg,
    };
  }
}

/**
 * Ensures a lead has its standard sub-items: a "contacts" Text item and a
 * "msg workout" Folder.
 *
 * Uses PostParentItem, which is find-or-create (see
 * documentation/dba/post-parent-item.md): for a lead that already has the
 * items it returns the existing ones and creates nothing — so this is
 * idempotent and safe to call repeatedly. The Content Provider stores the
 * logical name ("contacts" / "msg workout") in each item's config while the
 * physical child folders stay numeric; nothing here builds a domain-named
 * physical folder by hand.
 *
 * Why this exists: leads created before the sub-items were guaranteed (or by
 * other tools) lack the "msg workout" folder, and GetByNames2 then returns an
 * empty HTTP body which surfaces as "Empty response body … 'msg workout'" in
 * lead details. Ensuring the folder exists makes GetByNames2 return an empty
 * (but valid) folder instead of an error.
 *
 * All raw CP access stays inside dba; callers pass only the numeric leadLoca.
 */
export async function ensureLeadSubItems(leadLoca: string): Promise<void> {
  const repo = getCurrentRepoGuid();
  if (leadLoca.includes(repo)) {
    throw new Error(
      `Invalid leadLoca for ensureLeadSubItems: must not contain repo GUID (got "${leadLoca}").`,
    );
  }

  // find-or-create "contacts" (Text)
  await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "PostParentItem",
    repo,
    leadLoca,
    "Text",
    "contacts",
  ]);

  // find-or-create "msg workout" (Folder)
  await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "PostParentItem",
    repo,
    leadLoca,
    "Folder",
    "msg workout",
  ]);
}

/** Result of a bulk sub-item backfill run. */
export interface EnsureAllLeadsResult {
  total: number;
  ensured: number;
  errors: Array<{ leadKey: string; leadLoca: string; error: string }>;
}

/**
 * Backfills the standard sub-items ("contacts" + "msg workout") for EVERY lead.
 * Idempotent (find-or-create), safe to run repeatedly. Iterates the same
 * leads/all-items map used elsewhere and resolves each lead's numeric loca as
 * `${leadsLoca}/${leadKey}`.
 */
export async function ensureAllLeadsSubItems(): Promise<EnsureAllLeadsResult> {
  const repo = getCurrentRepoGuid();
  const allLeadsResponse = await GetAllLeads();

  const body =
    allLeadsResponse?.Body && typeof allLeadsResponse.Body === "object"
      ? (allLeadsResponse.Body as Record<string, unknown>)
      : {};

  const leadsLoca = allLeadsResponse?.Settings?.address
    ? allLeadsResponse.Settings.address.replace(`${repo}/`, "")
    : "";

  const keys = Object.keys(body);
  const errors: EnsureAllLeadsResult["errors"] = [];
  let ensured = 0;

  for (const leadKey of keys) {
    const leadLoca = `${leadsLoca}/${leadKey}`;
    try {
      await ensureLeadSubItems(leadLoca);
      ensured++;
    } catch (e) {
      errors.push({
        leadKey,
        leadLoca,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { total: keys.length, ensured, errors };
}

/**
 * Extended lead details data including msg workouts
 */
export interface LeadDetailsDataWithWorkouts extends LeadDetailsData {
  msgWorkouts: MsgWorkoutItem[];
  msgWorkoutsError?: string;
  msgWorkoutsNotFound: boolean;
}

/**
 * Gets detailed information about a specific lead, including contacts and msg workouts.
 * 
 * This function:
 * 1. Gets contacts content using numeric loca
 * 2. Gets msg workouts using GetByNames2 with the known leadLoca (more efficient)
 * 3. Returns structured lead details with workouts
 * 
 * @param leadName - The name of the lead (e.g., "26-05-12_pi_Agata")
 * @param leadLoca - The numeric loca of the lead (e.g., "03/06/89")
 * @returns Promise resolving to LeadDetailsDataWithWorkouts
 */
export async function getLeadDetailsWithWorkouts(leadName: string, leadLoca: string): Promise<LeadDetailsDataWithWorkouts> {
  // Auto-heal: make sure this lead has its "contacts" and "msg workout"
  // sub-items before reading them (find-or-create, idempotent). Fixes leads
  // created before the sub-items were guaranteed and avoids the "Empty response
  // body … 'msg workout'" error. Never fail details just because heal failed.
  try {
    await ensureLeadSubItems(leadLoca);
  } catch (e) {
    console.error(
      `[getLeadDetailsWithWorkouts] ensureLeadSubItems failed for "${leadLoca}":`,
      e instanceof Error ? e.message : String(e),
    );
  }

  // Get basic lead details (contacts)
  const basicDetails = await getLeadDetails(leadName, leadLoca);

  // Get msg workouts using GetByNames2 with the known leadLoca
  const msgWorkoutsResult = await getLeadMsgWorkoutsByLoca(leadLoca);

  return {
    ...basicDetails,
    msgWorkouts: msgWorkoutsResult.workouts,
    msgWorkoutsError: msgWorkoutsResult.error,
    msgWorkoutsNotFound: msgWorkoutsResult.notFound,
  };
}

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks if body contains a specific field (as a key in YAML format).
 * The field should be at the start of a line followed by colon.
 */
export function hasField(body: string, field: string): boolean {
  const escapedField = escapeRegex(field);
  const regex = new RegExp(`^${escapedField}\\s*:`, "m");
  return regex.test(body);
}

/**
 * Parses a status body into a key-value map.
 * Each line is independent - next line is NEVER the value of previous field.
 * - `key: value` => key = "value"
 * - `key:` => key = ""
 */
export function parseStatusBody(body: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    if (!key) continue;

    result[key] = value;
  }

  return result;
}

/**
 * Gets the value of a specific YAML field from the body.
 * Returns empty string if field is empty or not found.
 */
export function getYamlFieldValue(body: string, field: string): string {
  const parsed = parseStatusBody(body);
  return parsed[field] || "";
}

// =============================================================================
// Todo Msg Dashboard - Public API functions
// =============================================================================

/**
 * Result item for todo-msg dashboard queries
 */
export interface TodoMsgResult {
  leadKey: string;
  leadName: string;
  loca?: string;
  valid: boolean;
}

/**
 * Strips the repo GUID prefix from a full address to get the numeric loca.
 * Example: "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/89/03" -> "03/06/89/03"
 */
function stripRepoPrefix(address: string): string {
  if (!address) return "";
  const slashIndex = address.indexOf("/");
  if (slashIndex === -1) return address;
  return address.substring(slashIndex + 1);
}

/**
 * Extracts the loca (location) from an address by removing the first segment.
 * Examples:
 *   "girls/06/61/02/01" -> "06/61/02/01"
 *   "Active/06/61/02/01" -> "06/61/02/01"
 */
function getLocaFromAddress(address: string): string {
  if (!address) return "";

  const parts = address.split("/");
  if (parts.length === 0) return "";

  // Replace first segment with "girls" if it's "Active"
  if (parts[0] === "Active") {
    parts[0] = "girls";
  }

  const normalizedAddress = parts.join("/");
  const slashIndex = normalizedAddress.indexOf("/");
  if (slashIndex === -1) return "";

  return normalizedAddress.substring(slashIndex + 1);
}

/**
 * Gets leads with //todo marker in their messages.
 * Uses the same logic as chad-console's "Find Todo" feature.
 * 
 * @returns Array of TodoMsgResult with lead information
 */
export async function getTodoMsgLeads(): Promise<TodoMsgResult[]> {
  // Import dynamically to avoid circular dependency
  const { chad_GetLeadsLoca, chad_GetRelativeLoca, chad_GetFirstSegment } = await import("./path-resolver.js");

  // Step 1: Fetch all leads to build the lead name map
  const allLeadsResponse = await GetAllLeads();

  // Build map of leadKey -> leadName from allLeads.Body
  const leadsNameMap = new Map<string, string>();
  if (allLeadsResponse && allLeadsResponse.Body && typeof allLeadsResponse.Body === "object") {
    const body = allLeadsResponse.Body;
    Object.keys(body).forEach((key) => {
      leadsNameMap.set(key, body[key]);
    });
  }

  // Step 2: Get the base leads loca
  const baseLoca = await chad_GetLeadsLoca();

  // Step 3: Fetch todo leads
  const items = await TodoLeads();

  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  // Step 4: Format results
  const results: TodoMsgResult[] = items.map((item) => {
    const address = item?.Settings?.address || "";

    // Get loca from address (remove first segment like "girls/" or repo prefix)
    const loca = getLocaFromAddress(address);

    // Get relative loca and lead key
    let relativeLoca = "";
    let leadKey = "";
    try {
      relativeLoca = chad_GetRelativeLoca(loca, baseLoca);
      leadKey = chad_GetFirstSegment(relativeLoca);
    } catch (e) {
      return {
        leadKey: "",
        leadName: "[invalid path]",
        loca: loca,
        valid: false,
      };
    }

    // Look up lead name from allLeads.Body using leadKey
    const leadName = leadsNameMap.get(leadKey);

    return {
      leadKey,
      leadName: leadName || `[missing lead key: ${leadKey}]`,
      loca,
      valid: !!leadName,
    };
  });

  return results;
}

/**
 * Gets leads where your-first-message is true (first message not sent yet).
 * Uses the same logic as the status system.
 * 
 * @returns Array of TodoMsgResult with lead information
 */
export async function getFirstMsgLeads(): Promise<TodoMsgResult[]> {
  // Import dynamically to avoid circular dependency
  const { chad_GetLeadsLoca, chad_GetLeadsStatuses } = await import("./path-resolver.js");

  // Step 1: Fetch all leads to build the lead name map
  const allLeadsResponse = await GetAllLeads();

  // Build map of girlId -> girlName from allLeads.Body
  const leadsNameMap = new Map<string, string>();
  if (allLeadsResponse && allLeadsResponse.Body && typeof allLeadsResponse.Body === "object") {
    const body = allLeadsResponse.Body;
    Object.keys(body).forEach((key) => {
      leadsNameMap.set(key, body[key]);
    });
  }

  // Step 2: Fetch statuses
  const statusItems = await chad_GetLeadsStatuses();

  // Step 3: Get leads base loca to properly extract girlId from status addresses
  const leadsBaseLoca = await chad_GetLeadsLoca();

  // Build map of girlIds that have your-first-message: true
  const girlsWithFirstMsgTrue = new Set<string>();

  if (Array.isArray(statusItems)) {
    statusItems.forEach((item) => {
      const address = item?.Settings?.address || "";
      if (address) {
        // Strip repo GUID prefix to get numeric loca
        const loca = stripRepoPrefix(address);

        // Extract girlId from loca
        let girlId: string | null = null;
        if (loca.startsWith(leadsBaseLoca + "/")) {
          const relativeLoca = loca.substring(leadsBaseLoca.length + 1);
          const segments = relativeLoca.split("/");
          if (segments.length >= 1) {
            girlId = segments[0];
          }
        }

        // Check if your-first-message is "true"
        if (girlId) {
          const body = item?.Body || "";
          const yourFirstMessageValue = getYamlFieldValue(body, "your-first-message");
          if (yourFirstMessageValue === "true") {
            girlsWithFirstMsgTrue.add(girlId);
          }
        }
      }
    });
  }

  // Step 4: Build results for leads with your-first-message: true
  const results: TodoMsgResult[] = Array.from(girlsWithFirstMsgTrue).map((girlId) => {
    const leadName = leadsNameMap.get(girlId);
    // Construct full loca from base loca + leadKey
    const loca = leadsBaseLoca ? `${leadsBaseLoca}/${girlId}` : "";
    return {
      leadKey: girlId,
      leadName: leadName || `[missing lead: ${girlId}]`,
      loca,
      valid: !!leadName,
    };
  });

  // Sort by girlId (numeric)
  results.sort((a, b) => parseInt(a.leadKey) - parseInt(b.leadKey));

  return results;
}

// =============================================================================
// Msg Workout Editor - Public API functions
// =============================================================================

/**
 * Data returned by getMsgWorkoutForEdit for use in the editor UI.
 */
export interface MsgWorkoutEditorData {
  /** Full display name of the lead (e.g., "26-07-06_pn_Karolina_ruda") */
  leadName: string;
  /** Full address including repo GUID (e.g., "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/89/03") */
  address: string;
  /** The text body content of the msg workout item */
  body: string;
}

/**
 * Gets the msg workout data for editing.
 *
 * This function retrieves the item at the given loca and returns
 * a ready-to-use data object for the editor UI.
 *
 * The leadName is resolved from the leads map using the first segment
 * of the loca path (which corresponds to the girlId).
 *
 * @param loca The numeric loca of the msg workout item (e.g., "03/06/89/03")
 * @returns Promise resolving to MsgWorkoutEditorData or null if not found
 *
 * @example
 * ```typescript
 * const data = await getMsgWorkoutForEdit("03/06/89/03");
 * if (data) {
 *   console.log(data.leadName); // "26-07-06_pn_Karolina_ruda"
 *   console.log(data.address);  // "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/89/03"
 *   console.log(data.body);     // "msg workout content..."
 * }
 * ```
 */
export async function getMsgWorkoutForEdit(loca: string): Promise<MsgWorkoutEditorData | null> {
  const result = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetItem",
    getCurrentRepoGuid(),
    loca,
  ]);

  if (!result?.Body) {
    return null;
  }

  // Build full address from repo GUID and loca
  const address = `${getCurrentRepoGuid()}/${loca}`;

  // Get lead name from the loca path (first segment = girlId)
  const girlId = loca.split("/")[0] || "";
  const allLeadsResponse = await GetAllLeads();
  let leadName = "";
  if (allLeadsResponse && allLeadsResponse.Body && typeof allLeadsResponse.Body === "object") {
    leadName = allLeadsResponse.Body[girlId] || "";
  }

  return {
    leadName,
    address,
    body: String(result.Body),
  };
}

/**
 * Saves content to a msg workout item using Put.
 *
 * @param loca The numeric loca of the msg workout item
 * @param content The content to save
 * @returns Promise resolving to true on success
 *
 * @example
 * ```typescript
 * await saveMsgWorkout("03/06/89/03", "Updated msg workout content");
 * ```
 */
export async function saveMsgWorkout(loca: string, content: string): Promise<boolean> {
  // First, get the item to retrieve its actual name
  // The Put operation may use the name parameter to validate or update the item name,
  // so we need to use the actual item name, not a hardcoded value.
  const item = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetItem",
    getCurrentRepoGuid(),
    loca,
  ]);

  if (!item?.Settings?.name) {
    throw new Error(`Could not find item at loca "${loca}" to save msg workout content`);
  }

  const itemName = item.Settings.name;

  await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "Put",
    getCurrentRepoGuid(),
    loca,
    "Text",
    itemName,
    content,
  ]);
  return true;
}

// =============================================================================
// Create Lead - Public API functions
// =============================================================================

/**
 * Result of creating a lead
 */
export interface CreateLeadResult {
  success: boolean;
  leadName: string;
  leadLoca?: string;
  error?: string;
  duplicate: boolean;
}

/**
 * Checks if a lead with the given name already exists.
 * 
 * @param leadName - The name of the lead to check
 * @returns true if the lead exists, false otherwise
 */
export async function leadExists(leadName: string): Promise<boolean> {
  try {
    const result = await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "GetByNames",
      getCurrentRepoGuid(),
      "leads",
      "all items",
      leadName,
    ]);
    
    // If we get a result with Settings.address, the lead exists
    return !!result?.Settings?.address;
  } catch {
    return false;
  }
}

/**
 * Creates a new lead in the shared repository.
 * 
 * The lead is created under: leads / all-items / [leadName]
 * with a "contacts" child item containing the contacts YAML.
 * 
 * @param leadName - The name of the lead (e.g., "26-06-07_pn_Ania")
 * @param contactsYaml - Optional YAML content for contacts
 * @returns Promise resolving to CreateLeadResult
 */
export async function createLead(
  leadName: string,
  contactsYaml?: string
): Promise<CreateLeadResult> {
  // Step 0: Check if lead already exists
  const exists = await leadExists(leadName);
  if (exists) {
    return {
      success: false,
      leadName,
      duplicate: true,
      error: `Lead "${leadName}" już istnieje. Nie można utworzyć duplikatu.`,
    };
  }

  try {
    // Step 1: Get leads/all-items parent loca
    const parentResult = await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "GetByNames",
      getCurrentRepoGuid(),
      "leads",
      "all items",
    ]);

    if (!parentResult?.Settings?.address) {
      return {
        success: false,
        leadName,
        duplicate: false,
        error: "Nie udało się znaleźć folderu leads/all-items",
      };
    }

    const parentLoca = parentResult.Settings.address.replace(`${getCurrentRepoGuid()}/`, "");

    // Step 2: Create the lead item using PostParentItem
    const leadResult = await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "PostParentItem",
      getCurrentRepoGuid(),
      parentLoca,
      "Folder",
      leadName,
    ]);

    if (!leadResult?.Settings?.address) {
      return {
        success: false,
        leadName,
        duplicate: false,
        error: "Nie udało się utworzyć leada",
      };
    }

    const leadLoca = leadResult.Settings.address.replace(`${getCurrentRepoGuid()}/`, "");

    // Step 3: Create contacts text item under the lead (always, even if empty)
    const contactsResult = await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "PostParentItem",
      getCurrentRepoGuid(),
      leadLoca,
      "Text",
      "contacts",
    ]);

    if (contactsResult?.Settings?.address) {
      const contactsLoca = contactsResult.Settings.address.replace(`${getCurrentRepoGuid()}/`, "");

      // Write contacts content (empty string if no contacts provided)
      await invokeContentProvider([
        "IRepoService",
        "IItemWorker",
        "Put",
        getCurrentRepoGuid(),
        contactsLoca,
        "Text",
        "contacts",
        contactsYaml || "",
      ]);
    }

    // Step 4: Create msg workout folder under the lead
    await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "PostParentItem",
      getCurrentRepoGuid(),
      leadLoca,
      "Folder",
      "msg workout",
    ]);

    return {
      success: true,
      leadName,
      leadLoca,
      duplicate: false,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Nieznany błąd";
    return {
      success: false,
      leadName,
      duplicate: false,
      error: errorMsg,
    };
  }
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
 * Regex pattern for validating date format YY-MM-DD
 * Matches: 2 digits, dash, 2 digits, dash, 2 digits
 */
// Matches YY-MM-DD format with optional suffix (letter, underscore+letter, or timestamp)
// Examples: "26-07-08", "26-07-08b", "26-07-08_b", "26-07-08c", "26-07-081234567890"
const DATE_PATTERN = /^\d{2}-\d{2}-\d{2}(_[a-z]|[a-z]|\d+)?$/;

/**
 * Checks if a string matches the YY-MM-DD date format.
 * 
 * @param name - The string to check
 * @returns true if the string matches YY-MM-DD format
 */
export function isValidDateFolderName(name: string): boolean {
  return DATE_PATTERN.test(name);
}

/**
 * Strips the repo GUID prefix from a full address to get the numeric loca.
 * This is a local helper for msg planner functions.
 * 
 * @param address - The full address
 * @param repoId - The repository GUID
 * @returns The numeric loca
 */
function stripRepoGuid(address: string, repoId: string): string {
  if (!address) return "";
  const prefix = `${repoId}/`;
  if (!address.startsWith(prefix)) return "";
  return address.substring(prefix.length);
}

/**
 * Gets all date folders from the leads/msg planner path.
 * 
 * This function:
 * 1. Resolves the "leads/msg planner" path to get the parent folder
 * 2. Retrieves all child items
 * 3. Filters only items whose logical names match YY-MM-DD format
 * 4. Returns sorted list (newest first)
 * 
 * IMPORTANT: Uses logical names from config.yaml, not physical folder names.
 * Physical folders are numeric, but we filter by logical names.
 * 
 * @returns Promise resolving to an array of MsgPlannerDateFolder objects
 */
export async function getMsgPlannerDateFolders(): Promise<MsgPlannerDateFolder[]> {
  // Import path-resolver dynamically to avoid circular dependency
  const { chad_GetLocaFromAddress } = await import("./path-resolver.js");

  console.log("[chad-dba] getMsgPlannerDateFolders: Starting...");

  // Step 1: Get the "msg planner" folder directly using GetByNames
  // Path: leads -> msg planner
  console.log("[chad-dba] Step 1: Trying to get 'leads/msg planner' using GetByNames");
  const msgPlannerResult = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetByNames",
    getCurrentRepoGuid(),
    "leads",
    "msg planner",
  ]);

  console.log("[chad-dba] GetByNames result:", JSON.stringify(msgPlannerResult, null, 2));

  if (!msgPlannerResult?.Settings?.address) {
    console.log("[chad-dba] No msg planner folder found - GetByNames returned no address");
    // No msg planner folder exists
    return [];
  }

  const msgPlannerLoca = chad_GetLocaFromAddress(msgPlannerResult.Settings.address, getCurrentRepoGuid());
  console.log("[chad-dba] msg planner loca:", msgPlannerLoca);

  // Step 2: Read child physical keys -> logical names from the folder body map.
  const childrenBody = msgPlannerResult?.Body;

  if (!childrenBody || typeof childrenBody !== "object") {
    console.log("[chad-dba] No child body map found in msg planner folder");
    return [];
  }

  const childEntries = Object.entries(childrenBody).filter(
    ([physicalName, logicalName]) =>
      typeof physicalName === "string" &&
      physicalName.length > 0 &&
      typeof logicalName === "string"
  ) as Array<[string, string]>;

  console.log("[chad-dba] Found", childEntries.length, "children in body map");

  // Step 3: Filter children by date format (YY-MM-DD)
  const dateFolders: MsgPlannerDateFolder[] = [];

  for (const [physicalName, logicalName] of childEntries) {
    console.log("[chad-dba] Checking child name:", logicalName, "isValid:", isValidDateFolderName(logicalName));
    
    if (isValidDateFolderName(logicalName)) {
      const childLoca = `${msgPlannerLoca}/${physicalName}`;

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
  // Parse date as YY-MM-DD and compare
  dateFolders.sort((a, b) => {
    const parseDate = (d: string) => {
      const parts = d.split("-");
      // Assume 20YY for years
      return new Date(parseInt(`20${parts[0]}`), parseInt(parts[1]) - 1, parseInt(parts[2]));
    };
    return parseDate(b.date).getTime() - parseDate(a.date).getTime();
  });

  console.log("[chad-dba] Returning date folders:", dateFolders);
  return dateFolders;
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
 * Gets the body.txt content for a specific date folder.
 * 
 * Uses GetByNames to find the body.txt item by its logical name.
 * 
 * @param dateFolderLoca - The numeric loca of the date folder
 * @returns Promise resolving to MsgPlannerBodyData or null if not found
 */
export async function getMsgPlannerBody(dateFolderLoca: string): Promise<MsgPlannerBodyData | null> {
  // We need the date from the loca path, but we'll get it from the caller
  // For now, return null - the caller should provide the date
  // This function will be called with both date and loca from the API
  return null;
}

/**
 * Gets the body.txt content for a specific date folder with full info.
 * 
 * @param date - The date string (YY-MM-DD format)
 * @param dateFolderLoca - The numeric loca of the date folder
 * @returns Promise resolving to MsgPlannerBodyData or null if not found
 */
export async function getMsgPlannerBodyForDate(date: string, dateFolderLoca: string): Promise<MsgPlannerBodyData | null> {
  // The date item itself is a Text item. Its content lives directly in Body.
  const dateItem = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetItem",
    getCurrentRepoGuid(),
    dateFolderLoca,
  ]);

  if (!dateItem?.Settings?.address) {
    return null;
  }

  return {
    date,
    loca: dateFolderLoca,
    body: typeof dateItem?.Body === "string" ? dateItem.Body : "",
  };
}

/**
 * Saves content directly to the date item in the msg planner.
 * 
 * The date item itself is a Text node, so we PUT directly to that loca.
 * 
 * @param dateFolderLoca - The numeric loca of the date item
 * @param content - The content to save
 * @returns Promise resolving to true on success
 */
export async function saveMsgPlannerBody(dateFolderLoca: string, content: string): Promise<boolean> {
  // Get the item to retrieve its name
  const dateItem = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetItem",
    getCurrentRepoGuid(),
    dateFolderLoca,
  ]);

  console.log(`[chad-dba] saveMsgPlannerBody: GetItem result for loca ${dateFolderLoca}:`, JSON.stringify(dateItem?.Settings, null, 2));

  const itemName = dateItem?.Settings?.name;

  if (!itemName || typeof itemName !== "string") {
    throw new Error(`Could not resolve msg planner item name for loca ${dateFolderLoca}. Got: ${JSON.stringify(dateItem?.Settings)}`);
  }

  console.log(`[chad-dba] saveMsgPlannerBody: Using item name "${itemName}" for Put`);

  const putResult = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "Put",
    getCurrentRepoGuid(),
    dateFolderLoca,
    "Text",
    itemName,
    content,
  ]);

  console.log(`[chad-dba] saveMsgPlannerBody: Put result:`, JSON.stringify(putResult, null, 2));

  return true;
}

/**
 * Entry for plan content generation - contains lead info for a specific filter type
 */
export interface PlanContentEntry {
  /** The address/loca to display */
  address: string;
  /** The lead name */
  leadName: string;
}

/**
 * Generated plan content with sections for each filter type
 */
export interface GeneratedPlanContent {
  /** The generated body content in //with; format */
  body: string;
  /** Entries for "Todo" section */
  todoEntries: PlanContentEntry[];
  /** Entries for "Your first msg" section */
  firstMsgEntries: PlanContentEntry[];
}

/**
 * Generates plan content from MsgTodo data sources.
 * 
 * Fetches leads from both "Todo" and "Your first msg" filters
 * and formats them into the standard plan content format:
 * 
 * ```
 * //with; Todo
 * 	[full-loca]; [leadName]
 * 
 * //with; Your first msg
 * 	[full-loca]; [leadName]
 * ```
 * 
 * All addresses use full loca format (e.g., "03/06/51" not "51").
 * 
 * @returns Promise resolving to GeneratedPlanContent
 */
export async function generatePlanContent(): Promise<GeneratedPlanContent> {
  console.log("[chad-dba] generatePlanContent: Starting...");

  // Fetch data from both sources
  const [todoLeads, firstMsgLeads] = await Promise.all([
    getTodoMsgLeads(),
    getFirstMsgLeads(),
  ]);

  console.log(`[chad-dba] generatePlanContent: Found ${todoLeads.length} todo leads, ${firstMsgLeads.length} first-msg leads`);

  // Build entries for Todo section - already has full loca from the todo item
  const todoEntries: PlanContentEntry[] = todoLeads
    .filter(lead => lead.valid && lead.loca)
    .map(lead => ({
      address: lead.loca!,
      leadName: lead.leadName,
    }));

  // Build entries for Your first msg section - use loca directly from the lead data
  const firstMsgEntries: PlanContentEntry[] = firstMsgLeads
    .filter(lead => lead.valid && lead.loca)
    .map(lead => ({
      address: lead.loca!,
      leadName: lead.leadName,
    }));

  // Generate body content
  const sections: string[] = [];

  // Add sorted section at the top
  const sortedSection = [
    "//sorted",
    "\t//1; obowiązkowo nowe",
    "\t//2; obowiązkowo gorący lead",
    "\t//3; wypadałoby",
    "\t//3; fajnie by było",
    "\t//4; koleżaki",
  ].join("\n");
  sections.push(sortedSection);

  if (todoEntries.length > 0) {
    const todoSection = [
      "//with; Todo",
      ...todoEntries.map(e => `\t${e.address}; ${e.leadName}`),
    ].join("\n");
    sections.push(todoSection);
  }

  if (firstMsgEntries.length > 0) {
    const firstMsgSection = [
      "//with; Your first msg",
      ...firstMsgEntries.map(e => `\t${e.address}; ${e.leadName}`),
    ].join("\n");
    sections.push(firstMsgSection);
  }

  const body = sections.join("\n\n");

  console.log(`[chad-dba] generatePlanContent: Generated ${sections.length} sections`);

  return {
    body,
    todoEntries,
    firstMsgEntries,
  };
}

/**
 * Finds the next available name for a date folder by checking existing children.
 * If the base date exists, appends b, c, etc. directly (skipping a).
 * Format: "26-07-08b", "26-07-08c", etc. (no underscore)
 * 
 * @param baseDate - The base date string (e.g., "26-07-08")
 * @param existingLogicalNames - Array of existing logical names under msg planner
 * @returns The next available name
 */
function findNextAvailableName(baseDate: string, existingLogicalNames: string[]): string {
  // If base name doesn't exist, use it
  if (!existingLogicalNames.includes(baseDate)) {
    return baseDate;
  }

  // Try b, c, d, etc. (no underscore)
  const alphabet = "bcdefghijklmnopqrstuvwxyz".split("");
  for (const letter of alphabet) {
    const candidate = `${baseDate}${letter}`;
    if (!existingLogicalNames.includes(candidate)) {
      return candidate;
    }
  }

  // If we've exhausted the alphabet, just return with a timestamp
  return `${baseDate}${Date.now()}`;
}

/**
 * Creates a new date folder in the msg planner and optionally saves generated body content.
 * 
 * Uses PostParentItem to create-or-get a child item under the msg planner folder.
 * The item type is "Text" (same as existing date folders).
 * 
 * If a folder with the same date already exists, creates a new one with a suffix:
 * - First duplicate: "26-07-08b"
 * - Second duplicate: "26-07-08c"
 * - etc. (skipping a)
 * 
 * If generateBody is true, automatically generates and saves plan content
 * based on current MsgTodo data.
 * 
 * @param date - The date string in YY-MM-DD format (logical name)
 * @param generateBody - Whether to generate and save body content (default: true)
 * @returns Promise resolving to the created MsgPlannerDateFolder with additional info
 * @throws Error if creation fails or date format is invalid
 */
export async function createMsgPlannerDateFolder(
  date: string,
  generateBody: boolean = true
): Promise<MsgPlannerDateFolder & { generatedBody?: string }> {
  // Validate date format
  if (!isValidDateFolderName(date)) {
    throw new Error(`Invalid date format: ${date}. Expected YY-MM-DD format.`);
  }

  console.log(`[chad-dba] createMsgPlannerDateFolder: Creating date folder "${date}"`);

  // Import path-resolver dynamically to avoid circular dependency
  const { chad_GetLocaFromAddress } = await import("./path-resolver.js");

  // Step 1: Get the msg planner folder
  const msgPlannerResult = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetByNames",
    getCurrentRepoGuid(),
    "leads",
    "msg planner",
  ]);

  if (!msgPlannerResult?.Settings?.address) {
    throw new Error("Msg planner folder not found. Cannot create date folder.");
  }

  const msgPlannerLoca = chad_GetLocaFromAddress(msgPlannerResult.Settings.address, getCurrentRepoGuid());
  console.log(`[chad-dba] Msg planner loca: ${msgPlannerLoca}`);

  // Step 2: Get existing children to find unique name if needed
  const existingLogicalNames: string[] = [];
  const childrenBody = msgPlannerResult?.Body;
  if (childrenBody && typeof childrenBody === "object") {
    for (const [, logicalName] of Object.entries(childrenBody)) {
      if (typeof logicalName === "string") {
        existingLogicalNames.push(logicalName);
      }
    }
  }
  console.log(`[chad-dba] Existing msg planner children:`, existingLogicalNames);

  // Step 3: Determine the actual name to use (may include suffix if duplicate)
  const actualName = findNextAvailableName(date, existingLogicalNames);
  const isDuplicate = actualName !== date;
  console.log(`[chad-dba] Using name: "${actualName}" (isDuplicate: ${isDuplicate})`);

  // Step 4: Use PostParentItem to create the date folder
  // PostParentItem will create the item if it doesn't exist, or return existing if it does
  // Note: PostParentItem does NOT accept a body/content argument
  console.log(`[chad-dba] Creating date folder with PostParentItem: parent=${msgPlannerLoca}, name=${actualName}`);
  const dateItemResult = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "PostParentItem",
    getCurrentRepoGuid(),
    msgPlannerLoca,
    "Text",  // Same type as existing date folders
    actualName,  // Logical name (YY-MM-DD format, possibly with suffix)
  ]);

  if (!dateItemResult?.Settings?.address) {
    throw new Error(`Failed to create date folder "${actualName}". No address returned.`);
  }

  // Step 5: Extract the loca of the created item
  const dateItemLoca = chad_GetLocaFromAddress(dateItemResult.Settings.address, getCurrentRepoGuid());
  console.log(`[chad-dba] Created date folder "${actualName}" with loca: ${dateItemLoca}`);

  const result: MsgPlannerDateFolder & { generatedBody?: string; originalDate?: string } = {
    date: actualName,  // Use actual name (may include suffix)
    loca: dateItemLoca,
  };

  // Step 6: Optionally generate and save body content
  if (generateBody) {
    try {
      console.log(`[chad-dba] Generating plan content for "${actualName}"...`);
      const planContent = await generatePlanContent();
      
      if (planContent.body) {
        console.log(`[chad-dba] Saving generated body to date folder "${actualName}"...`);
        await saveMsgPlannerBody(dateItemLoca, planContent.body);
        result.generatedBody = planContent.body;
        console.log(`[chad-dba] Successfully saved generated body (${planContent.body.length} chars)`);
      }
    } catch (bodyError) {
      // Log error but don't fail the creation
      console.error(`[chad-dba] Failed to generate/save body for "${actualName}":`, bodyError);
      // The date folder was still created, just without auto-generated content
    }
  }

  return result;
}
