/**
 * Beeper Service
 * 
 * Provides access to beeper data through the Content Provider API.
 * Uses the shared repository: 21d11bdc-f1f4-44d1-b61a-3fa6b039c641
 * 
 * Beeper Structure:
 * - beeper/ (folder)
 *   - 01/ (whatsapp channel)
 *     - 01/ (lead conversation)
 *     - 02/ (lead conversation)
 *   - 02/ (instagram channel)
 *     - 01/ (lead conversation)
 */

import { invokeContentProvider } from "./client.js";
import { getCurrentRepoGuid } from "./repo-context.js";

/**
 * Result of finding a conversation for a lead
 */
export interface ConversationResult {
  found: boolean;
  body: string | null;
  address: string | null;
  channel: string | null;
  error?: string;
}

/**
 * Gets all beeper items from the shared repository.
 * 
 * Args: ["IRepoService", "IItemWorker", "GetByNames", "21d11bdc-f1f4-44d1-b61a-3fa6b039c641", "beeper"]
 * 
 * @returns Promise resolving to the beeper data
 */
export async function GetBeeper(): Promise<any> {
  return invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetByNames",
    getCurrentRepoGuid(),
    "beeper",
  ]);
}

/**
 * Gets a specific beeper item by name.
 * 
 * @param itemName - The name of the beeper item to retrieve
 * @returns Promise resolving to the beeper item data
 */
export async function GetBeeperItemByName(itemName: string): Promise<any> {
  return invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetByNames",
    getCurrentRepoGuid(),
    "beeper",
    itemName,
  ]);
}

/**
 * Parses an address string into repo and loca components.
 * 
 * @param address - Full address (e.g., "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/79")
 * @returns Object with repo and loca
 */
export function parseAddressToRepoLoca(address: string): { repo: string; loca: string } {
  if (!address) {
    throw new Error("Address is empty or undefined");
  }
  
  const slashIndex = address.indexOf("/");
  if (slashIndex === -1) {
    throw new Error(`Invalid address format: "${address}" - no slash found`);
  }
  
  const repo = address.substring(0, slashIndex);
  const loca = address.substring(slashIndex + 1);
  
  // Protection: Detect if loca starts with a GUID pattern (duplicate repoId in path)
  // This indicates a bug where an item was created with the repoId as its name,
  // resulting in paths like "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/21d11bdc-f1f4-44d1-b61a-3fa6b039c641/..."
  const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  if (guidPattern.test(loca)) {
    throw new Error(
      `Invalid address structure: loca starts with a GUID pattern. ` +
      `This indicates a duplicate repoId in the path (e.g., "repoId/repoId/..."). ` +
      `Address: "${address}". ` +
      `This is likely caused by creating an item with a name equal to the repoId. ` +
      `Please check the code that created this item.`
    );
  }
  
  return { repo, loca };
}

/**
 * Joins an address with a child key.
 * 
 * @param address - Base address (e.g., "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06")
 * @param childKey - Child key to append (e.g., "01")
 * @returns Combined address
 */
export function joinAddress(address: string, childKey: string): string {
  if (!address) {
    throw new Error("Base address is empty");
  }
  return `${address}/${childKey}`;
}

/**
 * Reads a body as a key-value map.
 * Handles both object and JSON string formats.
 * 
 * @param item - The item with a Body property
 * @returns Map of key-value pairs, or empty object if parsing fails
 */
export function readBodyMap(item: any): Record<string, string> {
  if (!item || !item.Body) {
    return {};
  }
  
  const body = item.Body;
  
  // If it's already an object, try to extract key-value pairs
  if (typeof body === "object" && body !== null) {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(body)) {
      result[key] = typeof value === "string" ? value : String(value);
    }
    return result;
  }
  
  // If it's a string, try to parse as JSON
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      if (typeof parsed === "object" && parsed !== null) {
        const result: Record<string, string> = {};
        for (const [key, value] of Object.entries(parsed)) {
          result[key] = typeof value === "string" ? value : String(value);
        }
        return result;
      }
    } catch {
      // Not a valid JSON string
    }
  }
  
  return {};
}

/**
 * Result of finding reports for a lead
 */
export interface ReportResult {
  found: boolean;
  body: string | null;
  address: string | null;
  name: string | null;
  category: string | null;
  error?: string;
}

/**
 * Finds reports for a specific lead name in the reports folder.
 * 
 * The reports structure is:
 * - reports/ (folder with categories as children)
 *   - 01/ (daygame category)
 *     - items containing lead reports
 *   - 02/ (nightgame category)
 *     - items containing lead reports
 *   - etc.
 * 
 * Uses FindRecursively to search for the lead name in each category folder.
 * 
 * @param leadName - The name of the lead to find (e.g., "26-05-30_pn_Olia")
 * @returns Promise resolving to the report result
 */
export async function chad_FindReportsByLeadName(leadName: string): Promise<ReportResult[]> {
  const results: ReportResult[] = [];
  
  try {
    // Step 1: Get the reports folder
    const reportsItem = await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "GetByNames",
      getCurrentRepoGuid(),
      "reports",
    ]);
    
    if (!reportsItem?.Settings?.address) {
      return [{
        found: false,
        body: null,
        address: null,
        name: null,
        category: null,
        error: "Reports folder not found",
      }];
    }
    
    const reportsAddress = reportsItem.Settings.address;
    const reportsBody = readBodyMap(reportsItem);
    
    if (Object.keys(reportsBody).length === 0) {
      return [{
        found: false,
        body: null,
        address: null,
        name: null,
        category: null,
        error: "Reports folder is empty - no categories found",
      }];
    }
    
    // Step 2: Iterate through all categories (children of reports)
    for (const [categoryKey, categoryName] of Object.entries(reportsBody)) {
      // Build category address: reportsAddress + "/" + categoryKey
      const categoryAddress = joinAddress(reportsAddress, categoryKey);
      const { repo, loca } = parseAddressToRepoLoca(categoryAddress);
      
      // Step 3: Use FindRecursively to search for the lead name in this category
      const findResults = await invokeContentProvider([
        "IRepoService",
        "IMethodWorker",
        "FindRecursively",
        repo,
        loca,
        leadName,
      ]);
      
      // Step 4: Check if any items were found
      if (Array.isArray(findResults) && findResults.length > 0) {
        // Take the first found item as the main report
        const firstItem = findResults[0];
        
        const body = firstItem?.Body;
        const itemBody = typeof body === "string" ? body : (body ? JSON.stringify(body) : null);
        
        results.push({
          found: true,
          body: itemBody,
          address: firstItem?.Settings?.address || null,
          name: firstItem?.Settings?.name || leadName,
          category: categoryName || categoryKey,
        });
      }
    }
    
    // If no reports found in any category
    if (results.length === 0) {
      results.push({
        found: false,
        body: null,
        address: null,
        name: null,
        category: null,
        error: `Lead "${leadName}" not found in any reports category`,
      });
    }
    
    return results;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return [{
      found: false,
      body: null,
      address: null,
      name: null,
      category: null,
      error: `Error searching for reports: ${errorMessage}`,
    }];
  }
}

/**
 * Gets all leads that have whatsapp conversations in the beeper.
 * 
 * The beeper structure for whatsapp is:
 * - beeper/whatsup/[lead_name]/beeper
 * 
 * This function scans all channels in the beeper and returns lead names
 * that have conversations stored.
 * 
 * @returns Promise resolving to an array of lead names with conversations
 */
export async function getAllBeeperWhatsappLeads(): Promise<string[]> {
  try {
    // Step 1: Get the beeper folder
    const beeperItem = await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "GetByNames",
      getCurrentRepoGuid(),
      "beeper",
    ]);
    
    if (!beeperItem?.Settings?.address) {
      return [];
    }
    
    const beeperAddress = beeperItem.Settings.address;
    const beeperBody = readBodyMap(beeperItem);
    
    if (Object.keys(beeperBody).length === 0) {
      return [];
    }
    
    const leads: string[] = [];
    
    // Step 2: Iterate through all channels (children of beeper)
    for (const [channelKey] of Object.entries(beeperBody)) {
      // Build channel address: beeperAddress + "/" + channelKey
      const channelAddress = joinAddress(beeperAddress, channelKey);
      const { repo, loca } = parseAddressToRepoLoca(channelAddress);
      
      // Step 3: Get the channel item
      const channelItem = await invokeContentProvider([
        "IRepoService",
        "IItemWorker",
        "GetItem",
        repo,
        loca,
      ]);
      
      if (!channelItem) {
        continue;
      }
      
      const channelBody = readBodyMap(channelItem);
      
      if (Object.keys(channelBody).length === 0) {
        continue;
      }
      
      // Step 4: For each lead entry in this channel, get the lead name
      for (const [leadKey, leadName] of Object.entries(channelBody)) {
        if (typeof leadName === "string" && leadName) {
          // Check if this lead has a "beeper" child (the actual conversation)
          const leadAddress = joinAddress(channelAddress, leadKey);
          const { repo: leadRepo, loca: leadLoca } = parseAddressToRepoLoca(leadAddress);
          
          const leadItem = await invokeContentProvider([
            "IRepoService",
            "IItemWorker",
            "GetItem",
            leadRepo,
            leadLoca,
          ]);
          
          if (leadItem) {
            const leadBody = readBodyMap(leadItem);
            // CP body format is usually { "01": "beeper" }, so match on value and use its key.
            const hasBeeperChild = Object.entries(leadBody).some(
              ([, value]) => value.toLowerCase() === "beeper"
            );
            if (hasBeeperChild && !leads.includes(leadName)) {
              leads.push(leadName);
            }
          }
        }
      }
    }
    
    return leads.sort();
    
  } catch (error) {
    console.error("Error fetching beeper whatsapp leads:", error);
    return [];
  }
}

/**
 * Gets the whatsapp conversation content for a specific lead.
 * 
 * The beeper structure for whatsapp is:
 * - beeper/whatsup/[lead_name]/beeper
 * 
 * @param leadName - The name of the lead (e.g., "26-05-11_pn_Luba")
 * @returns Promise resolving to the conversation content (string) or null if not found
 */
export async function getBeeperWhatsappConversation(leadName: string): Promise<string | null> {
  try {
    // Step 1: Get the beeper folder
    const beeperItem = await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "GetByNames",
      getCurrentRepoGuid(),
      "beeper",
    ]);
    
    if (!beeperItem?.Settings?.address) {
      return null;
    }
    
    const beeperAddress = beeperItem.Settings.address;
    const beeperBody = readBodyMap(beeperItem);
    
    if (Object.keys(beeperBody).length === 0) {
      return null;
    }
    
    // Step 2: Search through all channels for this lead
    for (const [channelKey] of Object.entries(beeperBody)) {
      const channelAddress = joinAddress(beeperAddress, channelKey);
      const { repo, loca } = parseAddressToRepoLoca(channelAddress);
      
      const channelItem = await invokeContentProvider([
        "IRepoService",
        "IItemWorker",
        "GetItem",
        repo,
        loca,
      ]);
      
      if (!channelItem) {
        continue;
      }
      
      const channelBody = readBodyMap(channelItem);
      
      // Step 3: Look for the lead name in this channel
      const foundEntry = Object.entries(channelBody).find(([key, value]) => value === leadName);
      
      if (foundEntry) {
        const [leadKey] = foundEntry;
        
        // Step 4: Get the lead's item and look for "beeper" child
        const leadAddress = joinAddress(channelAddress, leadKey);
        const { repo: leadRepo, loca: leadLoca } = parseAddressToRepoLoca(leadAddress);
        
        const leadItem = await invokeContentProvider([
          "IRepoService",
          "IItemWorker",
          "GetItem",
          leadRepo,
          leadLoca,
        ]);
        
        if (leadItem) {
          const leadBody = readBodyMap(leadItem);
          
          // CP body format is usually { "01": "beeper" }, so the key is numeric.
          const beeperEntry = Object.entries(leadBody).find(
            ([, value]) => value.toLowerCase() === "beeper"
          );
          const beeperKey = beeperEntry?.[0];
          
          if (beeperKey) {
            const beeperAddress = joinAddress(leadAddress, beeperKey);
            const { repo: beeperRepo, loca: beeperLoca } = parseAddressToRepoLoca(beeperAddress);
            
            const beeperConversationItem = await invokeContentProvider([
              "IRepoService",
              "IItemWorker",
              "GetItem",
              beeperRepo,
              beeperLoca,
            ]);
            
            if (beeperConversationItem?.Body) {
              return typeof beeperConversationItem.Body === "string" 
                ? beeperConversationItem.Body 
                : JSON.stringify(beeperConversationItem.Body);
            }
          }
        }
      }
    }
    
    return null;
    
  } catch (error) {
    console.error(`Error fetching conversation for lead ${leadName}:`, error);
    return null;
  }
}

/**
 * Gets all lead names from the leads/all-items folder.
 * 
 * This is the authoritative source for all leads in the system,
 * regardless of whether they have saved conversations.
 * 
 * @returns Promise resolving to an array of lead names
 */
export async function getAllLeadsFromRepository(): Promise<string[]> {
  try {
    const result = await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "GetByNames",
      getCurrentRepoGuid(),
      "leads",
      "all items",
    ]);

    if (!result?.Body) {
      return [];
    }

    const body = result.Body;
    if (typeof body !== "object" || body === null) {
      return [];
    }

    // Body is a map like { "01": "26-05-11_pn_Luba", "02": "26-05-29_pn_Amelia", ... }
    const leads = Object.values(body).filter(
      (v): v is string => typeof v === "string" && v.length > 0
    );
    return leads.sort();
  } catch (error) {
    console.error("Error fetching all lead names:", error);
    return [];
  }
}

/**
 * Finds a conversation for a specific lead name in the beeper.
 * 
 * The beeper structure is:
 * - beeper/ (folder with channels as children)
 *   - 01/ (whatsapp channel)
 *   - 02/ (instagram channel)
 *   - etc.
 * 
 * Each channel folder contains lead conversations as children.
 * 
 * @param leadName - The name of the lead to find (e.g., "26-05-30_pn_Olia")
 * @returns Promise resolving to the conversation result
 */
export async function chad_FindConversationByLeadName(leadName: string): Promise<ConversationResult> {
  try {
    // Step 1: Get the beeper folder
    const beeperItem = await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "GetByNames",
      getCurrentRepoGuid(),
      "beeper",
    ]);
    
    if (!beeperItem?.Settings?.address) {
      return {
        found: false,
        body: null,
        address: null,
        channel: null,
        error: "Beeper folder not found",
      };
    }
    
    const beeperAddress = beeperItem.Settings.address;
    const beeperBody = readBodyMap(beeperItem);
    
    if (Object.keys(beeperBody).length === 0) {
      return {
        found: false,
        body: null,
        address: null,
        channel: null,
        error: "Beeper folder is empty - no channels found",
      };
    }
    
    // Step 2: Iterate through all channels (children of beeper)
    for (const [channelKey, channelName] of Object.entries(beeperBody)) {
      // Build media address: beeperAddress + "/" + channelKey
      const mediaAddress = joinAddress(beeperAddress, channelKey);
      const { repo, loca } = parseAddressToRepoLoca(mediaAddress);
      
      // Step 3: Get the media item (channel folder)
      const mediaItem = await invokeContentProvider([
        "IRepoService",
        "IItemWorker",
        "GetItem",
        repo,
        loca,
      ]);
      
      if (!mediaItem) {
        continue;
      }
      
      const mediaBody = readBodyMap(mediaItem);
      
      if (Object.keys(mediaBody).length === 0) {
        continue;
      }
      
      // Step 4: Search for the lead name in this channel's children
      const foundEntry = Object.entries(mediaBody).find(([key, value]) => value === leadName);
      
      if (foundEntry) {
        const [foundKey] = foundEntry;
        
        // Step 5: Build final address and get the conversation item
        const leadAddress = joinAddress(mediaAddress, foundKey);
        const { repo: leadRepo, loca: leadLoca } = parseAddressToRepoLoca(leadAddress);
        
        const leadItem = await invokeContentProvider([
          "IRepoService",
          "IItemWorker",
          "GetItem",
          leadRepo,
          leadLoca,
        ]);
        
        if (!leadItem) {
          continue;
        }
        
        // Step 6: Check if this is a Text item (direct conversation) or Folder (needs traversal)
        const itemType = leadItem.Settings?.type;
        
        // If it's a Text item, its body is the conversation
        if (itemType === "Text" && leadItem.Body) {
          const body = typeof leadItem.Body === "string" 
            ? leadItem.Body 
            : JSON.stringify(leadItem.Body);
          
          return {
            found: true,
            body,
            address: leadAddress,
            channel: channelName || channelKey,
          };
        }
        
        // If it's a Folder, look for "beeper" child
        if (itemType === "Folder") {
          const leadBody = readBodyMap(leadItem);
          
          // Find the "beeper" child (case-insensitive)
          const beeperEntry = Object.entries(leadBody).find(
            ([, value]) => value.toLowerCase() === "beeper"
          );
          
          if (beeperEntry) {
            const [beeperKey] = beeperEntry;
            const beeperAddress = joinAddress(leadAddress, beeperKey);
            const { repo: beeperRepo, loca: beeperLoca } = parseAddressToRepoLoca(beeperAddress);
            
            const beeperConversationItem = await invokeContentProvider([
              "IRepoService",
              "IItemWorker",
              "GetItem",
              beeperRepo,
              beeperLoca,
            ]);
            
            if (beeperConversationItem?.Body) {
              const body = typeof beeperConversationItem.Body === "string" 
                ? beeperConversationItem.Body 
                : JSON.stringify(beeperConversationItem.Body);
              
              return {
                found: true,
                body,
                address: beeperAddress,
                channel: channelName || channelKey,
              };
            }
            
            return {
              found: false,
              body: null,
              address: beeperAddress,
              channel: channelName || channelKey,
              error: "Beeper child found but has no body",
            };
          }
          
          // Folder without "beeper" child - provide diagnostic info
          const children = Object.values(leadBody).join(", ");
          return {
            found: false,
            body: null,
            address: leadAddress,
            channel: channelName || channelKey,
            error: `Lead folder has no "beeper" child. Children: [${children}]`,
          };
        }
        
        // Unknown item type
        return {
          found: false,
          body: null,
          address: leadAddress,
          channel: channelName || channelKey,
          error: `Unexpected item type: ${itemType || "unknown"}`,
        };
      }
    }
    
    // No conversation found for this lead
    return {
      found: false,
      body: null,
      address: null,
      channel: null,
      error: `Lead "${leadName}" not found in any beeper channel`,
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      found: false,
      body: null,
      address: null,
      channel: null,
      error: `Error searching for conversation: ${errorMessage}`,
    };
  }
}
