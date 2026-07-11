/**
 * AI Answer Service
 * 
 * Handles saving AI answers to the "msg workout" folder under a lead item.
 * Uses PostParentItem for find-or-create semantics.
 */

import { invokeContentProvider } from "./client.js";
import { getCurrentRepoGuid } from "./repo-context.js";
import { parseAddressToRepoLoca, readBodyMap } from "./beeper.js";

/**
 * Result of saving an AI answer
 */
export interface SaveAiAnswerResult {
  success: boolean;
  createdLoca?: string;
  itemName?: string;
  error?: string;
}

/**
 * Builds the next AI bot item name based on today's date and existing names.
 * 
 * Format: "YY-MM-DD; ai bot" for the first one, then "YY-MM-DDb; ai bot", "YY-MM-DDc; ai bot", etc.
 * 
 * @param today - Today's date in "yy-MM-dd" format (e.g., "26-06-19")
 * @param existingNames - List of existing item names in the msg workout folder
 * @returns The next unique name for the AI answer item
 */
export function BuildNextAiBotName(today: string, existingNames: string[]): string {
  const baseName = `${today}; ai bot`;
  
  // If no existing names or base name doesn't exist, use base name
  if (existingNames.length === 0 || !existingNames.includes(baseName)) {
    return baseName;
  }
  
  // Find the highest suffix letter used today
  const todayPattern = new RegExp(`^${today}([a-z]); ai bot$`);
  let maxLetter = 'a'.charCodeAt(0) - 1; // Start before 'a'
  
  for (const name of existingNames) {
    const match = name.match(todayPattern);
    if (match) {
      const letter = match[1];
      const letterCode = letter.charCodeAt(0);
      if (letterCode > maxLetter) {
        maxLetter = letterCode;
      }
    }
  }
  
  // Use the next letter
  const nextLetter = String.fromCharCode(maxLetter + 1);
  return `${today}${nextLetter}; ai bot`;
}

/**
 * Saves an AI answer to the "msg workout" folder under a specific lead.
 * 
 * Flow:
 * 1. Get all leads to find the lead item by name
 * 2. Build the lead's location address
 * 3. Find or create the "msg workout" folder under the lead
 * 4. Read existing children to generate a unique name
 * 5. Create the AI answer item under "msg workout"
 * 6. Save the AI answer content to the item's body
 * 
 * @param leadName - The name of the lead (e.g., "26-05-30_pn_Olia")
 * @param aiAnswer - The AI answer content to save
 * @returns Promise resolving to the result of the save operation
 */
export async function SaveAiAnswerToMsgWorkout(
  leadName: string,
  aiAnswer: string
): Promise<SaveAiAnswerResult> {
  try {
    const today = new Date().toISOString().slice(2, 10).replace(/^(\d{2})-/, "$1-"); // "yy-MM-dd"
    
    // Step 1: Get all leads to find the lead item by name
    const allLeadsResponse = await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "GetByNames",
      getCurrentRepoGuid(),
      "leads",
      "all items"
    ]);
    
    if (!allLeadsResponse?.Settings?.address) {
      return {
        success: false,
        error: "Cannot find 'leads/all items' folder"
      };
    }
    
    const allLeadsBody = readBodyMap(allLeadsResponse);
    
    // Step 2: Find the lead by name in the leads map
    const leadEntry = Object.entries(allLeadsBody).find(([key, value]) => value === leadName);
    
    if (!leadEntry) {
      return {
        success: false,
        error: `Lead "${leadName}" not found in leads`
      };
    }
    
    const [leadKey] = leadEntry;
    const allLeadsAddress = allLeadsResponse.Settings.address;
    const leadAddress = `${allLeadsAddress}/${leadKey}`;
    const { repo, loca: leadLoca } = parseAddressToRepoLoca(leadAddress);
    
    // Step 3: Find or create "msg workout" folder under the lead
    const msgWorkoutResponse = await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "PostParentItem",
      repo,
      leadLoca,
      "Text",
      "msg workout"
    ]);
    
    if (!msgWorkoutResponse?.Settings?.address) {
      return {
        success: false,
        error: "Failed to create or find 'msg workout' folder"
      };
    }
    
    // Step 4: Read existing children to generate a unique name
    const msgWorkoutBody = readBodyMap(msgWorkoutResponse);
    const existingNames = Object.values(msgWorkoutBody);
    const newName = BuildNextAiBotName(today, existingNames);
    
    // Get the location of the msg workout folder
    const { loca: msgWorkoutLoca } = parseAddressToRepoLoca(msgWorkoutResponse.Settings.address);
    
    // Step 5: Create the AI answer item under "msg workout"
    const createdItemResponse = await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "PostParentItem",
      repo,
      msgWorkoutLoca,
      "Text",
      newName
    ]);
    
    if (!createdItemResponse?.Settings?.address) {
      return {
        success: false,
        error: `Failed to create AI answer item "${newName}"`
      };
    }
    
    const { loca: createdLoca } = parseAddressToRepoLoca(createdItemResponse.Settings.address);
    
    // Step 6: Save the AI answer content to the item's body
    await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "Put",
      repo,
      createdLoca,
      "Text",
      newName,
      aiAnswer
    ]);
    
    // Success!
    console.log(`\n✅ AI answer saved`);
    console.log(`loca: ${createdLoca}`);
    console.log(`name: ${newName}`);
    console.log(`address: ${createdItemResponse?.Settings?.address || "N/A"}`);
    
    return {
      success: true,
      createdLoca,
      itemName: newName
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Error saving AI answer: ${errorMessage}`
    };
  }
}