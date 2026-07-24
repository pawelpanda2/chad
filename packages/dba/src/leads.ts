/**
 * Leads Service
 * 
 * Provides access to leads data through the Content Provider API.
 * Uses the shared repository: 21d11bdc-f1f4-44d1-b61a-3fa6b039c641
 */

import { invokeContentProvider } from "./client.js";
import { getCurrentRepoGuid, getCurrentUsername } from "./repo-context.js";
import { loadDataProvidersConfig } from "./data-providers/config.js";
import { getMongoProvider, getPostgresProvider } from "./data-router-instance.js";
import type { CpCompatibleDataProvider } from "./data-providers/types.js";
import { buildCreateChildItemCommand, buildPutItemCommand } from "./data-commands.js";
import { addressToRepoAndLoca, repoAndLocaToAddress } from "./cp-model.js";
import { systemClock } from "./data-clock.js";
import type { CpItem } from "./cp-model.js";
import {
  resolveByNames,
  getItemByAddress,
  getChildrenOf,
  findRecursively,
  createOrGetChild,
  findOrCreateFolderChain,
  putItemBody,
} from "./item-ops.js";
import { chad_GetRelativeLoca, chad_GetFirstSegment } from "./path-resolver.js";
import { queueDailyEntrySheetSyncIfEnabled, queueDateEntrySheetSyncIfEnabled } from "./google-sheets/sync.js";
import yaml from "js-yaml";

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
  const leadsFolder = await resolveByNames(["leads", "all items"]);
  if (!leadsFolder) return [];

  const leadChildren = await getChildrenOf(leadsFolder.config.address);
  const leadContactsChildren = await Promise.all(
    leadChildren.map((lead) => getChildrenOf(lead.config.address))
  );

  const leads: LeadDashboardItem[] = leadChildren.map((lead, i) => {
    const leadKey = lead.config.address.slice(leadsFolder.config.address.length + 1);
    const hasContacts = leadContactsChildren[i].some((c) => c.config.name === "contacts");
    return {
      leadKey,
      leadName: lead.config.name,
      loca: addressToRepoAndLoca(lead.config.address).loca,
      hasContacts,
    };
  });

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
  // Get contacts content via the lead's direct children (universal Item
  // model — no CP-specific loca lookup needed).
  const leadAddress = repoAndLocaToAddress(getCurrentRepoGuid(), leadLoca);
  const lead = await getItemByAddress(leadAddress);
  const children = lead ? await getChildrenOf(lead.config.address) : [];
  const contactsItem = children.find((c) => c.config.name === "contacts");
  const contactsBody = contactsItem?.body ?? null;

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
  const leadAddress = repoAndLocaToAddress(getCurrentRepoGuid(), leadLoca);
  const lead = await getItemByAddress(leadAddress);
  if (!lead) {
    throw new Error(`createMsgWorkoutForLead: lead not found at loca "${leadLoca}"`);
  }

  // Step 1: Ensure the msg workout folder exists (find-or-create, same as
  // ensureLeadSubItems) and get existing workouts to generate a unique name.
  const msgWorkoutFolder = await createOrGetChild(lead, "msg workout", "Folder");
  const existingWorkouts = await getChildrenOf(msgWorkoutFolder.config.address);
  const workoutName = generateWorkoutName(existingWorkouts.map((w) => w.config.name));

  // Step 2: Create the new workout item
  const workout = await createOrGetChild(msgWorkoutFolder, workoutName, "Folder");

  return {
    workoutName,
    workoutLoca: addressToRepoAndLoca(workout.config.address).loca,
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
 * Gets every child Text-item of a single flat folder (identified by parent
 * logical-name path, e.g. ["views", "dates"]) in ONE batched Content
 * Provider call for all bodies, instead of one GetItem per child.
 *
 * Flow (Task 2, Story 71 — replaces the old per-child GetItem loop, which
 * timed out on real repos with dozens of entries over a network-mounted
 * Content Provider data root):
 *
 * 1. `PostByNames(repoGuid, "Folder", ...parentNames)` resolves (creating
 *    if missing, idempotent — same semantics as PostParentItem, used
 *    elsewhere in this file for writes) the folder, giving its current
 *    `loca` and its `Body` — a physicalKey -> logicalName map of every
 *    direct child. No GetItem needed for this step.
 * 2. `IManyItemsWorker.GetListOfBody(repoGuid, folderLoca)` fetches every
 *    direct child's body content in a single call. This was previously
 *    uncallable via /invoke (ValueTuple parameter — see
 *    documentation/dba/bugs/getlist-valuetuple-and-date-entries-mismap.md);
 *    Story 71 changed `IManyItemsWorker.GetListOfBody`'s C# signature to
 *    take `(string repo, string loca)` as two plain parameters instead of
 *    one ValueTuple, and rewrote its internal implementation
 *    (`ReadManyWorker.GetManyItemsBody`) to read only body.txt per child
 *    (no config.yaml at all) — both confirmed live against real data.
 * 3. The two results are cross-checked in memory (no extra requests): the
 *    child count from the parent's Body map must equal the batch result's
 *    length. A mismatch throws rather than silently returning a partial or
 *    empty list — Content Provider integrity issues must be visible, not
 *    masked as "no data" (see getAllDateEntries/getAllDailyEntries above).
 * 4. Rows are zipped by index — GetListOfBody returns bodies in ascending
 *    numeric physical-key order (confirmed live), matching the same order
 *    the parent Body's `Object.entries` is sorted into below.
 *
 * @param parentNames - logical-name path to the folder, e.g. ["views", "dates"]
 */
/**
 * Mongo/Postgres-backed equivalent of `getAllChildTextItems` below.
 *
 * Deliberately simple, per explicit direction after an initial pass built
 * this through `DbaDataRouter` (follower outbox, primary/follower
 * resolution, etc.): no router, no provider-selection abstraction here —
 * this calls whichever `CpCompatibleDataProvider` the caller passes in
 * directly (Story 81: parameterized over the provider instead of
 * hardcoding `MongoCpProvider`, so the same function serves both Mongo and
 * Postgres — both implement the exact same interface). The public
 * functions below decide Mongo vs. Postgres vs. Content Provider with a
 * plain `if (config.mongoEnabled)` / `if (config.postgresEnabled)` /
 * `if (config.contentProviderEnabled)` triple, nothing more.
 */
async function getAllChildTextItemsGeneric(
  provider: CpCompatibleDataProvider,
  parentNames: string[]
): Promise<Array<{ itemName: string; loca: string; body?: string }>> {
  const repoGuid = getCurrentRepoGuid();
  const folder = await provider.getByNames({ repoGuid, names: parentNames });
  if (!folder) return [];

  const children = await provider.getChildren(folder.config.address);
  return children.map((item) => ({
    itemName: item.config.name,
    loca: addressToRepoAndLoca(item.config.address).loca,
    body: item.body,
  }));
}

/**
 * Find-or-create of a nested folder chain under the repo root (e.g.
 * ["views", "daily"]) — the Mongo/Postgres equivalent of the CP
 * PostParentItem chain in `saveDailyEntry`/`saveDateEntry` below.
 */
async function findOrCreateFolderChainGeneric(provider: CpCompatibleDataProvider, parentNames: string[]): Promise<CpItem> {
  const repoGuid = getCurrentRepoGuid();

  let parent: CpItem = {
    _id: repoGuid,
    config: { id: repoGuid, address: repoGuid, type: "Folder", name: "root" },
    body: "",
  };
  // If the repo root itself is already a real migrated item, use it as
  // the actual parent record instead of this synthetic stand-in.
  const realRoot = await provider.getItem({ address: repoGuid });
  if (realRoot) parent = realRoot;

  for (const name of parentNames) {
    const command = buildCreateChildItemCommand(
      { parentItemId: parent._id, parentAddress: parent.config.address, name, type: "Folder" },
      systemClock
    );
    const result = await provider.executeWrite(command);
    parent = result.item;
  }
  return parent;
}

/**
 * Ensure-folder-chain-then-create-text-item-then-set-body flow used by
 * `saveDailyEntry`/`saveDateEntry`.
 */
async function saveChildTextItemGeneric(
  provider: CpCompatibleDataProvider,
  parentNames: string[],
  itemName: string,
  bodyYaml: string
): Promise<{ itemName: string; loca: string; success: boolean }> {
  const folder = await findOrCreateFolderChainGeneric(provider, parentNames);

  const command = buildCreateChildItemCommand(
    { parentItemId: folder._id, parentAddress: folder.config.address, name: itemName, type: "Text", body: bodyYaml },
    systemClock
  );
  const result = await provider.executeWrite(command);

  return {
    itemName: result.item.config.name,
    loca: addressToRepoAndLoca(result.item.config.address).loca,
    success: true,
  };
}

/**
 * `updateDailyEntry`/`updateDateEntry`'s GetItem-then-Put shape: overwrites
 * an existing item's body in place, identified by its real `loca` (never
 * by re-deriving from a name/date).
 */
async function updateItemBodyGeneric(provider: CpCompatibleDataProvider, loca: string, bodyYaml: string): Promise<void> {
  const repoGuid = getCurrentRepoGuid();
  const address = loca ? `${repoGuid}/${loca}` : repoGuid;
  const existing = await provider.getItem({ address });
  if (!existing) {
    throw new Error(`Could not find item at loca "${loca}" to update`);
  }
  const command = buildPutItemCommand({ ...existing, body: bodyYaml }, systemClock);
  await provider.executeWrite(command);
}

async function getAllChildTextItems(
  parentNames: string[]
): Promise<Array<{ itemName: string; loca: string; body?: string }>> {
  const repoGuid = getCurrentRepoGuid();
  const label = parentNames.join("/");
  const startedAt = Date.now();

  const folderResult = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "PostByNames",
    repoGuid,
    "Folder",
    ...parentNames,
  ]);
  console.log(`[dba] ${label} parent requests: 1`);

  if (!folderResult?.Settings?.address) {
    return [];
  }

  const folderLoca = folderResult.Settings.address.replace(`${repoGuid}/`, "");

  const childrenBody = folderResult?.Body;
  if (!childrenBody || typeof childrenBody !== "object") {
    return [];
  }

  // Sorted by physical key (numeric) — GetListOfBody below returns bodies
  // in this same ascending order, so index-based zipping lines up.
  const expectedChildren = Object.entries(childrenBody)
    .filter(
      ([physicalKey, logicalName]) =>
        typeof physicalKey === "string" && physicalKey.length > 0 && typeof logicalName === "string"
    )
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([physicalKey, logicalName]) => ({
      physicalKey,
      logicalName: logicalName as string,
      loca: `${folderLoca}/${physicalKey}`,
    }));

  const bodies = await invokeContentProvider([
    "IRepoService",
    "IManyItemsWorker",
    "GetListOfBody",
    repoGuid,
    folderLoca,
  ]);
  const bodyList: string[] = Array.isArray(bodies) ? bodies : [];
  console.log(`[dba] ${label} batch requests: 1, per-row requests: 0`);
  console.log(
    `[dba] ${label} children declared in parent Body: ${expectedChildren.length}, items returned by batch: ${bodyList.length}`
  );

  if (expectedChildren.length !== bodyList.length) {
    console.error(`[dba] ${label} integrity comparison: ERROR`);
    throw new Error(
      `Batch fetch integrity error for ${label}: parent declares ${expectedChildren.length} children, ` +
        `but GetListOfBody returned ${bodyList.length} bodies`
    );
  }
  console.log(`[dba] ${label} integrity comparison: OK`);

  const entries = expectedChildren.map((child, index) => ({
    itemName: child.logicalName,
    loca: child.loca,
    body: bodyList[index],
  }));

  console.log(`[dba] ${label} total loading time: ${Date.now() - startedAt}ms`);
  return entries;
}

/**
 * Gets all date entries from the views/dates folder.
 *
 * Distinguishes (same contract as getAllReportEntries):
 * - folder not found -> [] (getAllChildTextItems already treats a missing
 *   folder as empty, not an error)
 * - any other failure (CP timeout/network/500) -> throws, so the caller/route
 *   surfaces an explicit error instead of a silent, indistinguishable-from-
 *   real-data empty list. Previously this caught and swallowed EVERY error
 *   (including timeouts) into `[]` — a real CP timeout on a slow/large
 *   folder looked exactly like "no entries yet" with zero indication
 *   anything had failed.
 *
 * @returns Promise resolving to array of date entry items
 * @throws Error if the Content Provider call fails for a reason other than
 *   the folder not existing
 */
export async function getAllDateEntries(): Promise<DateEntryItem[]> {
  const config = loadDataProvidersConfig();
  if (config.primaryBackend === "postgres") {
    return getAllChildTextItemsGeneric(getPostgresProvider(), ["views", "dates"]);
  }
  if (config.primaryBackend === "mongo") {
    return getAllChildTextItemsGeneric(getMongoProvider(), ["views", "dates"]);
  }
  return getAllChildTextItems(["views", "dates"]);
}

/**
 * Gets all daily entries from the views/daily folder.
 *
 * Note: The body is returned as a raw string. YAML parsing should be done
 * in the dashboard layer where js-yaml is available.
 *
 * Distinguishes (same contract as getAllReportEntries): folder-not-found ->
 * [], any other failure -> throws. See getAllDateEntries for why this no
 * longer swallows every error into [].
 *
 * @returns Promise resolving to array of daily entry items
 * @throws Error if the Content Provider call fails for a reason other than
 *   the folder not existing
 */
export async function getAllDailyEntries(): Promise<DailyEntryItem[]> {
  const config = loadDataProvidersConfig();
  if (config.primaryBackend === "postgres") {
    return getAllChildTextItemsGeneric(getPostgresProvider(), ["views", "daily"]);
  }
  if (config.primaryBackend === "mongo") {
    return getAllChildTextItemsGeneric(getMongoProvider(), ["views", "daily"]);
  }
  return getAllChildTextItems(["views", "daily"]);
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
  const config = loadDataProvidersConfig();
  let result: { itemName: string; loca: string; success: boolean };
  if (config.primaryBackend === "postgres") {
    result = await saveChildTextItemGeneric(getPostgresProvider(), ["views", "dates"], itemName, bodyYaml);
  } else if (config.primaryBackend === "mongo") {
    result = await saveChildTextItemGeneric(getMongoProvider(), ["views", "dates"], itemName, bodyYaml);
  } else {
    result = await saveDateEntryContentProvider(itemName, bodyYaml);
  }
  // Google Sheets follower (Story 75) — same non-throwing enqueue pattern as
  // saveDailyEntry; no AUTO fields here, Date Entry's own "Dates" tab has none.
  if (result.success) {
    await queueDateEntrySheetSyncIfEnabled({
      repoGuid: getCurrentRepoGuid(),
      username: getCurrentUsername(),
      loca: result.loca,
      itemName: result.itemName,
      fields: parseYamlFieldsForSheetSync(bodyYaml),
      kind: "upsert",
    });
  }
  return result;
}

async function saveDateEntryContentProvider(
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

/** Parses a Daily/Date Entry's YAML body into string-coerced fields, for the Google Sheets sync only (Story 75). */
function parseYamlFieldsForSheetSync(bodyYaml: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = yaml.load(bodyYaml);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object") return {};

  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    fields[key] = value === undefined || value === null ? "" : String(value);
  }
  return fields;
}

/**
 * Computes the four "— AUTO" columns for `dateStr` fresh from current Date
 * Entry data, for the Google Sheets mirror only — never persisted to
 * CHAD's own storage (see `updateDailyEntry`'s doc comment on why callers
 * must never pass these to it). Mirrors exactly what
 * `computeDailyAutoFieldsByDate` computes for the Dashboard's own
 * `/api/forms/daily-entry` GET handler, so the sheet stays a faithful copy
 * of what the user actually sees in the Tracker view (Story 75, revised
 * 2026-07-21 after the user asked for AUTO columns to be included).
 */
async function computeDailyAutoFieldsForSheetSync(dateStr: string): Promise<Record<string, string>> {
  if (!dateStr) return {};
  const dateEntries = await getAllDateEntries();
  const parsedDateFields = dateEntries.map((entry) => {
    try {
      return (yaml.load(entry.body ?? "") as Record<string, unknown>) || {};
    } catch {
      return {};
    }
  });
  const auto = computeDailyAutoFieldsByDate(parsedDateFields).get(dateStr);
  if (!auto) return {};
  return {
    "PULLS AUTO": String(auto.pullsAuto),
    "CLOSES AUTO": String(auto.closesAuto),
    "QUALITY DP AUTO": auto.qualityDpAuto === null ? "" : String(auto.qualityDpAuto),
    "QUALITY C AUTO": auto.qualityCAuto === null ? "" : String(auto.qualityCAuto),
  };
}

/**
 * Backfills the Google Sheets sync for every EXISTING Daily/Date Entry the
 * current user already has — not just entries created after the worker
 * started (Story 75 follow-up, 2026-07-22: the live sync hooks in
 * `saveDailyEntry`/`updateDailyEntry`/`saveDateEntry`/`updateDateEntry`
 * only ever fire for a write made *after* they existed; nothing backfilled
 * whatever a user already had in Mongo before this integration went live —
 * confirmed empty sheets were the result). Must be called inside
 * `runWithRepoContext({ repoGuid, username })` for the target user, same as
 * every other function in this file.
 *
 * Uses the exact same field-parsing/AUTO-computation/enqueue path as a real
 * write (`parseYamlFieldsForSheetSync`, `computeDailyAutoFieldsForSheetSync`,
 * `queueDailyEntrySheetSyncIfEnabled`/`queueDateEntrySheetSyncIfEnabled`) —
 * not a separate, divergent code path — so a backfilled row is byte-for-byte
 * what a real save would have produced. Safe to re-run: each call enqueues
 * a fresh `operationId`, and the worker's upsert-by-`CHAD_RECORD_KEY`
 * behavior means replaying the same record's current state twice just
 * converges the same row to the same values again, never a duplicate row.
 */
export async function backfillGoogleSheetsSyncForCurrentUser(): Promise<{ dailyCount: number; dateCount: number }> {
  const repoGuid = getCurrentRepoGuid();
  const username = getCurrentUsername();

  const dailyEntries = await getAllDailyEntries();
  for (const entry of dailyEntries) {
    if (!entry.loca) continue;
    const fields = parseYamlFieldsForSheetSync(entry.body ?? "");
    const autoFields = await computeDailyAutoFieldsForSheetSync(fields.DATE ?? "");
    await queueDailyEntrySheetSyncIfEnabled({
      repoGuid,
      username,
      loca: entry.loca,
      itemName: entry.itemName,
      fields: { ...fields, ...autoFields },
      kind: "upsert",
    });
  }

  const dateEntries = await getAllDateEntries();
  for (const entry of dateEntries) {
    if (!entry.loca) continue;
    const fields = parseYamlFieldsForSheetSync(entry.body ?? "");
    await queueDateEntrySheetSyncIfEnabled({
      repoGuid,
      username,
      loca: entry.loca,
      itemName: entry.itemName,
      fields,
      kind: "upsert",
    });
  }

  return { dailyCount: dailyEntries.length, dateCount: dateEntries.length };
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
  const config = loadDataProvidersConfig();
  let result: { itemName: string; loca: string; success: boolean };
  if (config.primaryBackend === "postgres") {
    result = await saveChildTextItemGeneric(getPostgresProvider(), ["views", "daily"], itemName, bodyYaml);
  } else if (config.primaryBackend === "mongo") {
    result = await saveChildTextItemGeneric(getMongoProvider(), ["views", "daily"], itemName, bodyYaml);
  } else {
    result = await saveDailyEntryContentProvider(itemName, bodyYaml);
  }
  // Google Sheets follower (Story 75) — enqueued only after the primary
  // write(s) above already succeeded, using the primary's own decided
  // `loca`; never throws into this call (see
  // queueDailyEntrySheetSyncIfEnabled's own doc comment).
  if (result.success) {
    const fields = parseYamlFieldsForSheetSync(bodyYaml);
    const autoFields = await computeDailyAutoFieldsForSheetSync(fields.DATE ?? "");
    await queueDailyEntrySheetSyncIfEnabled({
      repoGuid: getCurrentRepoGuid(),
      username: getCurrentUsername(),
      loca: result.loca,
      itemName: result.itemName,
      fields: { ...fields, ...autoFields },
      kind: "upsert",
    });
  }
  return result;
}

async function saveDailyEntryContentProvider(
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
 * Updates an existing Daily Entry's body in place, identified by its real
 * `loca` — never by matching on its DATE field (dates aren't guaranteed
 * unique) and never via `generateEntryName`/`PostParentItem` (those are
 * create-only; using them here would create a duplicate instead of
 * overwriting). Mirrors `updateReportEntry`'s proven `GetItem`-then-`Put`
 * shape in `report-entries.ts` (Story 62 — see
 * documentation/dashboard/forms/features/daily-tracker-dates.md and
 * documentation/ai-docs/begin_here/05_endpoint-rules.md).
 *
 * Callers must not include the computed "— AUTO" fields (PULLS AUTO,
 * CLOSES AUTO, QUALITY DP AUTO, QUALITY C AUTO) in `bodyYaml` — those are
 * derived server-side on every read from Date Entry data and are never
 * persisted.
 *
 * @param loca The numeric loca of the daily entry item (from
 *   `saveDailyEntry`/`getAllDailyEntries`)
 * @param bodyYaml The full new YAML body content (not a partial patch —
 *   callers should merge with the existing body themselves before calling)
 */
export async function updateDailyEntry(loca: string, bodyYaml: string): Promise<void> {
  const config = loadDataProvidersConfig();
  if (config.primaryBackend === "postgres") {
    await updateItemBodyGeneric(getPostgresProvider(), loca, bodyYaml);
  } else if (config.primaryBackend === "mongo") {
    await updateItemBodyGeneric(getMongoProvider(), loca, bodyYaml);
  }
  if (config.contentProviderEnabled) {
    await updateDailyEntryContentProvider(loca, bodyYaml);
  }
  // Google Sheets follower (Story 75) — same non-throwing enqueue as
  // saveDailyEntry above. `itemName` is left blank: this record's row
  // already exists in the sheet from its original saveDailyEntry sync, and
  // the worker never overwrites CHAD_ITEM_NAME on an update (see
  // mapper.ts's IMMUTABLE_ON_UPDATE_COLUMNS) — it's only used if the row
  // has to be self-healed via append, a rare edge case.
  const fields = parseYamlFieldsForSheetSync(bodyYaml);
  const autoFields = await computeDailyAutoFieldsForSheetSync(fields.DATE ?? "");
  await queueDailyEntrySheetSyncIfEnabled({
    repoGuid: getCurrentRepoGuid(),
    username: getCurrentUsername(),
    loca,
    itemName: "",
    fields: { ...fields, ...autoFields },
    kind: "upsert",
  });
}

/**
 * Permanently removes a Daily Entry, identified by its real `loca`. Real
 * deletion is only possible on Mongo/Postgres — the .NET Content
 * Provider's own `Delete` is a permanent no-op stub (confirmed dead code
 * there), so this throws rather than silently pretending to succeed when
 * neither Mongo nor Postgres is the primary backend. Callers on that
 * backend must keep using the existing "blank the fields in place"
 * workaround (`updateDailyEntry` with blanked field values) instead.
 */
export async function deleteDailyEntry(loca: string): Promise<void> {
  const config = loadDataProvidersConfig();
  if (config.primaryBackend === "postgres" || config.primaryBackend === "mongo") {
    const provider = config.primaryBackend === "postgres" ? getPostgresProvider() : getMongoProvider();
    const repoGuid = getCurrentRepoGuid();
    const address = loca ? `${repoGuid}/${loca}` : repoGuid;
    const deleted = await provider.deleteItem(address);
    if (!deleted) {
      throw new Error(`Could not find daily entry at loca "${loca}" to delete (${config.primaryBackend})`);
    }
    // Google Sheets follower (Story 75) — marks the row CHAD_SYNC_STATUS =
    // DELETED in place rather than physically removing it (matches the
    // existing CP convention of never truly deleting rows/items, avoids
    // row-index shift hazards). Only after the real delete above succeeded.
    await queueDailyEntrySheetSyncIfEnabled({
      repoGuid,
      username: getCurrentUsername(),
      loca,
      itemName: "",
      fields: {},
      kind: "delete",
    });
    return;
  }
  throw new Error(
    "Daily entry deletion requires the Mongo or Postgres backend — the Content Provider's own Delete is a non-functional stub."
  );
}

/**
 * Permanently removes a Date Entry, identified by its real `loca` — mirrors
 * `deleteDailyEntry` exactly (Story 78; before this, Date Entry had no
 * delete at all, and the "Delete" button in the UI could only PATCH-blank
 * a record's fields, leaving an empty row behind — see
 * `human-docs/dashboard/forms/features/daily-tracker-dates.md` and
 * `ai-docs/google-sheets/architecture.md` §9's own note on this gap). Same
 * Mongo-only constraint as `deleteDailyEntry`: the .NET Content Provider's
 * own `Delete` is a permanent no-op stub, so this throws (never a pretend
 * success) when only that backend is active — per
 * `ai-docs/begin_here/05_endpoint-rules.md` §3.
 */
export async function deleteDateEntry(loca: string): Promise<void> {
  const config = loadDataProvidersConfig();
  if (config.primaryBackend === "postgres" || config.primaryBackend === "mongo") {
    const provider = config.primaryBackend === "postgres" ? getPostgresProvider() : getMongoProvider();
    const repoGuid = getCurrentRepoGuid();
    const address = loca ? `${repoGuid}/${loca}` : repoGuid;
    const deleted = await provider.deleteItem(address);
    if (!deleted) {
      throw new Error(`Could not find date entry at loca "${loca}" to delete (${config.primaryBackend})`);
    }
    // Google Sheets follower (Story 75/78) — marks the row CHAD_SYNC_STATUS =
    // DELETED in place, same convention as deleteDailyEntry above. Only
    // after the real delete above succeeded.
    await queueDateEntrySheetSyncIfEnabled({
      repoGuid,
      username: getCurrentUsername(),
      loca,
      itemName: "",
      fields: {},
      kind: "delete",
    });
    return;
  }
  throw new Error(
    "Date entry deletion requires the Mongo or Postgres backend — the Content Provider's own Delete is a non-functional stub."
  );
}

async function updateDailyEntryContentProvider(loca: string, bodyYaml: string): Promise<void> {
  const repoGuid = getCurrentRepoGuid();

  const item = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetItem",
    repoGuid,
    loca,
  ]);

  if (!item?.Settings?.name) {
    throw new Error(`Could not find daily entry at loca "${loca}" to update`);
  }

  await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "Put",
    repoGuid,
    loca,
    item.Settings.type || "Text",
    item.Settings.name,
    bodyYaml,
  ]);
}

/**
 * Updates an existing Date Entry's body in place, identified by its real
 * `loca` — same `GetItem`-then-`Put` shape as `updateDailyEntry` above,
 * for the same reasons (Story 62 Round 8: DATES gets edit-mode parity
 * with DAILY TRACKER). No "— AUTO" fields exist on Date Entries, so no
 * stripping is needed here.
 *
 * @param loca The numeric loca of the date entry item (from
 *   `saveDateEntry`/`getAllDateEntries`)
 * @param bodyYaml The full new YAML body content (not a partial patch —
 *   callers should merge with the existing body themselves before calling)
 */
export async function updateDateEntry(loca: string, bodyYaml: string): Promise<void> {
  const config = loadDataProvidersConfig();
  if (config.primaryBackend === "postgres") {
    await updateItemBodyGeneric(getPostgresProvider(), loca, bodyYaml);
  } else if (config.primaryBackend === "mongo") {
    await updateItemBodyGeneric(getMongoProvider(), loca, bodyYaml);
  }
  if (config.contentProviderEnabled) {
    await updateDateEntryContentProvider(loca, bodyYaml);
  }
  // Google Sheets follower (Story 75) — same non-throwing enqueue pattern as
  // updateDailyEntry above.
  await queueDateEntrySheetSyncIfEnabled({
    repoGuid: getCurrentRepoGuid(),
    username: getCurrentUsername(),
    loca,
    itemName: "",
    fields: parseYamlFieldsForSheetSync(bodyYaml),
    kind: "upsert",
  });
}

async function updateDateEntryContentProvider(loca: string, bodyYaml: string): Promise<void> {
  const repoGuid = getCurrentRepoGuid();

  const item = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetItem",
    repoGuid,
    loca,
  ]);

  if (!item?.Settings?.name) {
    throw new Error(`Could not find date entry at loca "${loca}" to update`);
  }

  await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "Put",
    repoGuid,
    loca,
    item.Settings.type || "Text",
    item.Settings.name,
    bodyYaml,
  ]);
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
    const leadAddress = repoAndLocaToAddress(getCurrentRepoGuid(), leadLoca);
    const lead = await getItemByAddress(leadAddress);
    if (!lead) {
      return { workouts: [], notFound: true };
    }

    const leadChildren = await getChildrenOf(lead.config.address);
    const msgWorkoutFolder = leadChildren.find((c) => c.config.name === "msg workout");
    if (!msgWorkoutFolder) {
      return { workouts: [], notFound: true };
    }

    const workoutItems = await getChildrenOf(msgWorkoutFolder.config.address);
    const workouts: MsgWorkoutItem[] = workoutItems.map((w) => ({
      physicalKey: w.config.address.slice(msgWorkoutFolder.config.address.length + 1),
      logicalName: w.config.name,
      loca: addressToRepoAndLoca(w.config.address).loca,
    }));

    return { workouts, notFound: false };
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

  const lead = await getItemByAddress(repoAndLocaToAddress(repo, leadLoca));
  if (!lead) {
    throw new Error(`ensureLeadSubItems: no item found at loca "${leadLoca}"`);
  }

  // find-or-create "contacts" (Text)
  await createOrGetChild(lead, "contacts", "Text");

  // find-or-create "msg workout" (Folder)
  await createOrGetChild(lead, "msg workout", "Folder");
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
  const leadsFolder = await resolveByNames(["leads", "all items"]);
  if (!leadsFolder) {
    return { total: 0, ensured: 0, errors: [] };
  }

  const leadChildren = await getChildrenOf(leadsFolder.config.address);
  const errors: EnsureAllLeadsResult["errors"] = [];
  let ensured = 0;

  for (const lead of leadChildren) {
    const leadLoca = addressToRepoAndLoca(lead.config.address).loca;
    const leadKey = lead.config.address.slice(leadsFolder.config.address.length + 1);
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

  return { total: leadChildren.length, ensured, errors };
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
 * Gets leads with //todo marker in their messages.
 * Uses the same logic as chad-console's "Find Todo" feature.
 * 
 * @returns Array of TodoMsgResult with lead information
 */
export async function getTodoMsgLeads(): Promise<TodoMsgResult[]> {
  const leadsFolder = await resolveByNames(["leads", "all items"]);
  if (!leadsFolder) return [];

  // Build map of leadKey -> leadName from the leads folder's direct children
  const leadChildren = await getChildrenOf(leadsFolder.config.address);
  const leadsNameMap = new Map<string, string>();
  for (const lead of leadChildren) {
    const leadKey = lead.config.address.slice(leadsFolder.config.address.length + 1);
    leadsNameMap.set(leadKey, lead.config.name);
  }

  const baseLoca = addressToRepoAndLoca(leadsFolder.config.address).loca;

  // Search the whole leads subtree for the "//todo" marker
  const items = await findRecursively(leadsFolder.config.address, "//todo");
  if (items.length === 0) {
    return [];
  }

  const results: TodoMsgResult[] = items.map((item) => {
    const loca = addressToRepoAndLoca(item.config.address).loca;

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

    // Look up lead name from the leads map using leadKey
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
  const leadsFolder = await resolveByNames(["leads", "all items"]);
  if (!leadsFolder) return [];

  const leadChildren = await getChildrenOf(leadsFolder.config.address);
  const statusChildren = await Promise.all(
    leadChildren.map(async (lead) => {
      const children = await getChildrenOf(lead.config.address);
      return children.find((c) => c.config.name === "status") ?? null;
    })
  );

  // Build results for leads with your-first-message: true
  const results: TodoMsgResult[] = [];
  leadChildren.forEach((lead, i) => {
    const status = statusChildren[i];
    if (!status) return;
    if (getYamlFieldValue(status.body, "your-first-message") !== "true") return;

    const leadKey = lead.config.address.slice(leadsFolder.config.address.length + 1);
    results.push({
      leadKey,
      leadName: lead.config.name,
      loca: addressToRepoAndLoca(lead.config.address).loca,
      valid: true,
    });
  });

  // Sort by leadKey (numeric)
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
  const address = repoAndLocaToAddress(getCurrentRepoGuid(), loca);
  const item = await getItemByAddress(address);
  if (!item) {
    return null;
  }

  // Get lead name: the lead is the loca segment right after "leads/all
  // items" (found and fixed here — the previous implementation took
  // `loca.split("/")[0]`, the leads folder's OWN first segment, not the
  // lead's key, so this lookup silently always missed in practice).
  let leadName = "";
  const leadsFolder = await resolveByNames(["leads", "all items"]);
  if (leadsFolder) {
    const leadsBaseLoca = addressToRepoAndLoca(leadsFolder.config.address).loca;
    if (loca.startsWith(`${leadsBaseLoca}/`)) {
      const leadKey = loca.slice(leadsBaseLoca.length + 1).split("/")[0];
      const lead = await getItemByAddress(`${leadsFolder.config.address}/${leadKey}`);
      leadName = lead?.config.name ?? "";
    }
  }

  return {
    leadName,
    address,
    body: item.body,
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
  const address = repoAndLocaToAddress(getCurrentRepoGuid(), loca);
  const item = await getItemByAddress(address);
  if (!item) {
    throw new Error(`Could not find item at loca "${loca}" to save msg workout content`);
  }

  await putItemBody(address, content);
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
    const lead = await resolveByNames(["leads", "all items", leadName]);
    return !!lead;
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
    // Step 1: Ensure leads/all-items exists, Step 2: create the lead
    const parent = await findOrCreateFolderChain(["leads", "all items"]);
    const lead = await createOrGetChild(parent, leadName, "Folder");
    const leadLoca = addressToRepoAndLoca(lead.config.address).loca;

    // Step 3: Create contacts text item under the lead (always, even if empty)
    await createOrGetChild(lead, "contacts", "Text", contactsYaml || "");

    // Step 4: Create msg workout folder under the lead
    await createOrGetChild(lead, "msg workout", "Folder");

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
  const msgPlannerFolder = await resolveByNames(["leads", "msg planner"]);
  if (!msgPlannerFolder) {
    return [];
  }

  const children = await getChildrenOf(msgPlannerFolder.config.address);
  const dateFolders: MsgPlannerDateFolder[] = children
    .filter((c) => isValidDateFolderName(c.config.name))
    .map((c) => ({ date: c.config.name, loca: addressToRepoAndLoca(c.config.address).loca }));

  // Sort by date descending (newest first)
  dateFolders.sort((a, b) => {
    const parseDate = (d: string) => {
      const parts = d.split("-");
      // Assume 20YY for years
      return new Date(parseInt(`20${parts[0]}`), parseInt(parts[1]) - 1, parseInt(parts[2]));
    };
    return parseDate(b.date).getTime() - parseDate(a.date).getTime();
  });

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
  // The date item itself is a Text item. Its content lives directly in body.
  const address = repoAndLocaToAddress(getCurrentRepoGuid(), dateFolderLoca);
  const item = await getItemByAddress(address);
  if (!item) {
    return null;
  }

  return {
    date,
    loca: dateFolderLoca,
    body: item.body,
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
  const address = repoAndLocaToAddress(getCurrentRepoGuid(), dateFolderLoca);
  const item = await getItemByAddress(address);
  if (!item) {
    throw new Error(`Could not resolve msg planner item at loca "${dateFolderLoca}"`);
  }

  await putItemBody(address, content);
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

  // Step 1: Ensure the msg planner folder exists
  const msgPlannerFolder = await findOrCreateFolderChain(["leads", "msg planner"]);

  // Step 2: Get existing children to find unique name if needed
  const existingChildren = await getChildrenOf(msgPlannerFolder.config.address);
  const existingLogicalNames = existingChildren.map((c) => c.config.name);

  // Step 3: Determine the actual name to use (may include suffix if duplicate)
  const actualName = findNextAvailableName(date, existingLogicalNames);

  // Step 4: Create the date folder (find-or-create by exact name)
  const dateItem = await createOrGetChild(msgPlannerFolder, actualName, "Text");
  const dateItemLoca = addressToRepoAndLoca(dateItem.config.address).loca;

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
