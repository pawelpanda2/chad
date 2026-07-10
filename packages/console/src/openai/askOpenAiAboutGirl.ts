import OpenAI from "openai";
import * as clack from "@clack/prompts";
import {
  GetAllLeads,
  chad_GetLeadsStatuses,
  SaveAiAnswerToMsgWorkout,
  invokeContentProvider,
  SHARED_REPO_ID,
} from "../contentProviderClient.js";
import { getGirlData, getPreviewLines, GirlData } from "./dataProviders.js";

/**
 * Configuration for the OpenAI prepared prompt
 */
const OPENAI_PROMPT_ID = "pmpt_6a2d9932e7708197bf9a60767e94dcfb07c8292b52f64217";
const OPENAI_PROMPT_VERSION = "1";

/**
 * Represents a girl/lead with her basic information
 */
export interface GirlInfo {
  id: string;
  name: string;
  loca: string; // e.g., "06/80"
}

/**
 * Parses a date from a lead name.
 * Name format: YY-MM-DD_prefix_name (e.g., "26-02-17_pi_Ira_Babenko")
 * Returns a Date object for comparison, or null if parsing fails.
 */
export function parseLeadDateFromName(name: string): Date | null {
  const match = name.match(/^(\d{2})-(\d{2})-(\d{2})_/);
  if (!match) return null;
  
  const [, yearStr, monthStr, dayStr] = match;
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  
  // Assume 20xx for years
  const fullYear = 2000 + year;
  
  // Validate the date
  const date = new Date(fullYear, month - 1, day);
  if (date.getFullYear() !== fullYear || 
      date.getMonth() !== month - 1 || 
      date.getDate() !== day) {
    return null;
  }
  
  return date;
}

/**
 * Sorts leads by date descending (newest first).
 * Leads without parseable dates are placed at the end.
 */
export function sortLeadsByDateDesc(leads: GirlInfo[]): GirlInfo[] {
  return [...leads].sort((a, b) => {
    const dateA = parseLeadDateFromName(a.name);
    const dateB = parseLeadDateFromName(b.name);
    
    // If both dates are null, maintain original order
    if (!dateA && !dateB) return 0;
    // Null dates go to the end
    if (!dateA) return 1;
    if (!dateB) return -1;
    // Sort by date descending (newest first)
    return dateB.getTime() - dateA.getTime();
  });
}

/**
 * Returns the last N leads (newest N leads based on date in name).
 */
export function getLastNLeads(leads: GirlInfo[], n: number): GirlInfo[] {
  const sorted = sortLeadsByDateDesc(leads);
  return sorted.slice(0, Math.max(0, n));
}

/**
 * Extracts the city from a status body (YAML format).
 * Returns null if city is not found or body is invalid.
 */
export function getLeadCityFromStatus(statusBody: any): string | null {
  if (!statusBody || typeof statusBody !== "string") return null;
  
  const lines = statusBody.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith("city:")) {
      const city = trimmed.substring(5).trim();
      return city || null;
    }
  }
  
  return null;
}

/**
 * Filters leads by city using their statuses.
 * Comparison is case-insensitive and trimmed.
 * Leads without status or without city field are excluded.
 */
export async function filterLeadsByCity(
  leads: GirlInfo[], 
  city: string
): Promise<GirlInfo[]> {
  const normalizedCity = city.trim().toLowerCase();
  
  // Get all statuses
  const statusesResponse = await chad_GetLeadsStatuses();
  
  // Build a map of girlId -> status body
  const statusMap = new Map<string, string>();
  if (Array.isArray(statusesResponse)) {
    for (const item of statusesResponse) {
      const address = item?.Settings?.address || "";
      const body = item?.Body;
      
      if (address && body !== undefined) {
        // Extract girlId from address: girls/06/XX/...
        const parts = address.split("/");
        if (parts.length >= 3) {
          const girlId = parts[2];
          statusMap.set(girlId, typeof body === "string" ? body : "");
        }
      }
    }
  }
  
  // Filter leads by city
  const filtered = leads.filter((lead) => {
    const statusBody = statusMap.get(lead.id);
    if (statusBody === undefined) return false; // No status, skip
    
    const leadCity = getLeadCityFromStatus(statusBody);
    if (!leadCity) return false; // No city field, skip
    
    return leadCity.trim().toLowerCase() === normalizedCity;
  });
  
  return filtered;
}

/**
 * Main flow for asking OpenAI about a girl
 */
export async function askOpenAiAboutGirlFlow(): Promise<void> {
  // Check for API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log("\n⚠️  Missing OPENAI_API_KEY env variable.");
    console.log("Please set it in your .env file.");
    return;
  }

  // Step 1: Show filtering menu
  const filterChoice = await clack.select({
    message: "Ask OpenAI about girl - wybierz opcję:",
    options: [
      { value: "last_n", label: "1. Show last N leads" },
      { value: "city", label: "2. Show only from city" },
      { value: "back", label: "0. Back" },
    ],
  });

  if (filterChoice === "back" || clack.isCancel(filterChoice)) {
    console.log("Returning to menu.");
    return;
  }

  // Step 2: Get filtered leads based on choice
  let filteredLeads: GirlInfo[] = [];

  if (filterChoice === "last_n") {
    // Ask how many leads to show
    const nInput = await clack.text({
      message: "Ile leadów pokazać?",
      placeholder: "10",
      validate: (value: string | undefined) => {
        if (!value) return "Proszę wpisać liczbę";
        const n = parseInt(value, 10);
        if (isNaN(n) || n <= 0) {
          return "Proszę wpisać dodatnią liczbę";
        }
        if (n > 100) {
          return "Maksymalnie 100 leadów";
        }
      },
    });

    if (clack.isCancel(nInput)) {
      console.log("Cancelled.");
      return;
    }

    const n = parseInt(nInput as string, 10);

    // Fetch all leads
    console.log("\n📋 Fetching all leads...");
    const allLeadsResponse = await GetAllLeads();

    if (!allLeadsResponse || !allLeadsResponse.Body || typeof allLeadsResponse.Body !== "object") {
      console.log("No leads found in the repository.");
      return;
    }

    const body = allLeadsResponse.Body;
    const allLeads: GirlInfo[] = [];

    Object.keys(body).forEach((key) => {
      allLeads.push({
        id: key,
        name: body[key],
        loca: `06/${key}`,
      });
    });

    filteredLeads = getLastNLeads(allLeads, n);
  } else if (filterChoice === "city") {
    // Ask for city
    const cityInput = await clack.text({
      message: "Miasto?",
      placeholder: "Warszawa",
      validate: (value) => {
        if (!value || value.trim() === "") {
          return "Proszę wpisać nazwę miasta";
        }
      },
    });

    if (clack.isCancel(cityInput)) {
      console.log("Cancelled.");
      return;
    }

    const city = cityInput.trim();

    // Ask how many leads to show
    const nInput = await clack.text({
      message: "Ile leadów pokazać (maksymalnie)?",
      placeholder: "10",
      validate: (value: string | undefined) => {
        if (!value) return "Proszę wpisać liczbę";
        const n = parseInt(value, 10);
        if (isNaN(n) || n <= 0) {
          return "Proszę wpisać dodatnią liczbę";
        }
        if (n > 100) {
          return "Maksymalnie 100 leadów";
        }
      },
    });

    if (clack.isCancel(nInput)) {
      console.log("Cancelled.");
      return;
    }

    const maxLeads = parseInt(nInput as string, 10);

    // Fetch all leads
    console.log("\n📋 Fetching all leads...");
    const allLeadsResponse = await GetAllLeads();

    if (!allLeadsResponse || !allLeadsResponse.Body || typeof allLeadsResponse.Body !== "object") {
      console.log("No leads found in the repository.");
      return;
    }

    const body = allLeadsResponse.Body;
    const allLeads: GirlInfo[] = [];

    Object.keys(body).forEach((key) => {
      allLeads.push({
        id: key,
        name: body[key],
        loca: `06/${key}`,
      });
    });

    // Filter by city
    console.log(`🔍 Filtering leads from city: ${city}...`);
    const cityFiltered = await filterLeadsByCity(allLeads, city);
    
    // Sort by date and limit
    filteredLeads = sortLeadsByDateDesc(cityFiltered).slice(0, maxLeads);

    if (filteredLeads.length === 0) {
      console.log(`No leads found from city: ${city}`);
      return;
    }

    console.log(`Found ${filteredLeads.length} lead(s) from ${city}.`);
  }

  if (filteredLeads.length === 0) {
    console.log("No leads found matching the criteria.");
    return;
  }

  // Step 3: Show picker for lead selection
  const selectedLead = await selectLead(filteredLeads);
  if (!selectedLead) {
    console.log("Selection cancelled.");
    return;
  }

  console.log(`\n🔍 Selected: ${selectedLead.name} (loca: ${selectedLead.loca})`);

  // Step 4: Fetch girl data and show summary + submenu
  const girlData = await getGirlData(selectedLead.name);
  
  // Build the prompt (but don't display it yet)
  const currentCasePrompt = buildCurrentCasePromptFromData(selectedLead, girlData);
  
  // Show summary and submenu
  await showSummaryAndSubmenu(selectedLead, girlData, currentCasePrompt);
}

/**
 * Shows summary of found data and a submenu for user to choose what to display
 */
async function showSummaryAndSubmenu(lead: GirlInfo, girlData: import("./dataProviders.js").GirlData, currentCasePrompt: string): Promise<void> {
  while (true) {
    // Display summary
    console.log("\n" + "=".repeat(60));
    console.log(`Znaleziono dla: ${lead.name}`);
    console.log("=".repeat(60));
    
    const foundReports = girlData.reports.filter(r => r.found);
    const foundConversations = girlData.conversation ? 1 : 0;
    
    if (foundReports.length > 0) {
      for (const report of foundReports) {
        console.log(`- 1 raport w ${report.category}: ${report.name || "full report"}`);
      }
    } else {
      console.log("- brak raportów");
    }
    
    if (girlData.conversation) {
      console.log(`- 1 chat w ${girlData.conversationChannel || "beeper"}`);
    } else {
      console.log("- brak chatów");
    }
    
    console.log("\nCo teraz?");
    
    const choice = await clack.select({
      message: "Wybierz opcję:",
      options: [
        { value: "show_prompt", label: "1. Wyświetl cały prompt" },
        { value: "show_reports", label: "2. Wyświetl raporty znalezione" },
        { value: "show_chats", label: "3. Wyświetl chaty znalezione" },
        { value: "back", label: "4. Powrót" },
      ],
    });
    
    if (choice === "back" || choice === undefined || clack.isCancel(choice)) {
      console.log("Returning to main menu.");
      return;
    }
    
    if (choice === "show_prompt") {
      // Show full prompt preview
      console.log("\n" + "=".repeat(60));
      console.log("📄 PREVIEW - Full prompt:");
      console.log("=".repeat(60));
      console.log(currentCasePrompt);
      console.log("=".repeat(60));
      
      // Ask if send to OpenAI
      const confirmation = await clack.select({
        message: "Wysłać ten prompt do OpenAI?",
        options: [
          { value: "yes", label: "1. tak" },
          { value: "no", label: "2. nie / wróć" },
        ],
      });
      
        if (confirmation === "yes") {
          // Call OpenAI API
          console.log("\n🤖 Asking OpenAI...");
          const response = await callOpenAiPreparedPrompt(currentCasePrompt);
          
          if (!response) {
            console.log("⚠️  Empty response from OpenAI.");
            return;
          }
          
          // Save the AI answer to msg workout
          console.log("\n💾 Saving AI answer to msg workout...");
          const saveResult = await SaveAiAnswerToMsgWorkout(lead.name, response);
          
          if (!saveResult.success) {
            console.log(`⚠️  Failed to save AI answer: ${saveResult.error}`);
            return;
          }
          
          // Show summary (don't print full answer)
          console.log("\n✅ OpenAI answer received");
          console.log(`📝 Lead: ${lead.name}`);
          console.log(`💾 Saved to: ${saveResult.itemName}`);
          
          // Show post-save menu with option to view content
          await showPostSaveMenu(lead, saveResult, response);
          return;
        }
      // If "no", loop back to submenu
    } else if (choice === "show_reports") {
      // Show list of reports
      await showReportsSubmenu(girlData);
    } else if (choice === "show_chats") {
      // Show list of chats - after viewing, loop continues to show submenu again
      await showChatsSubmenu(girlData);
    }
  }
}

/**
 * Shows a list of found reports and lets user select one to view
 */
async function showReportsSubmenu(girlData: import("./dataProviders.js").GirlData): Promise<void> {
  const foundReports = girlData.reports.filter(r => r.found);
  
  if (foundReports.length === 0) {
    console.log("\nBrak raportów dla tego leada.");
    return;
  }
  
  const choices = foundReports.map((report, index) => ({
    value: index.toString(),
    label: `${index + 1}. ${report.category}; ${report.name || "full report"}; ${report.address}`,
  }));
  choices.push({ value: "back", label: "0. Powrót" });
  
  const selection = await clack.select({
    message: "Wybierz raport do wyświetlenia:",
    options: choices,
  });
  
  if (selection === "back" || selection === undefined || clack.isCancel(selection)) {
    return;
  }
  
  const index = parseInt(selection as string, 10);
  if (!isNaN(index) && index >= 0 && index < foundReports.length) {
    const report = foundReports[index];
    console.log("\n" + "=".repeat(60));
    console.log(`RAPORT: ${report.name || "full report"}`);
    console.log("=".repeat(60));
    console.log(`Kategoria: ${report.category}`);
    console.log(`Address: ${report.address}`);
    console.log("-".repeat(60));
    if (report.body) {
      console.log(report.body);
    } else {
      console.log("[Brak treści]");
    }
    console.log("=".repeat(60));
  }
}

/**
 * Shows a list of found chats and lets user select one to view
 * @returns true if user chose to go back, false otherwise
 */
async function showChatsSubmenu(girlData: import("./dataProviders.js").GirlData): Promise<boolean> {
  if (!girlData.conversation) {
    console.log("\nBrak chatów dla tego leada.");
    return false;
  }
  
  const choices = [
    { value: "0", label: `1. ${girlData.conversationChannel || "beeper"}; ${girlData.name}` },
    { value: "back", label: "0. Powrót" },
  ];
  
  const selection = await clack.select({
    message: "Wybierz chat do wyświetlenia:",
    options: choices,
  });
  
  if (selection === "back" || selection === undefined || clack.isCancel(selection)) {
    return true;
  }
  
  if (selection === "0") {
    console.log("\n" + "=".repeat(60));
    console.log(`CHAT: ${girlData.name}`);
    console.log("=".repeat(60));
    console.log(`Kanał: ${girlData.conversationChannel || "beeper"}`);
    console.log("-".repeat(60));
    console.log(girlData.conversation);
    console.log("=".repeat(60));
  }
  
  return true;
}

/**
 * Builds the current_case prompt from pre-fetched data (synchronous version)
 */
function buildCurrentCasePromptFromData(
  lead: GirlInfo,
  girlData: import("./dataProviders.js").GirlData
): string {
  const foundReports = girlData.reports.filter(r => r.found);
  const lines: string[] = [];

  // Opening tag
  lines.push("<current_case>");
  lines.push("");

  // Name
  lines.push(`name: ${lead.name}`);
  lines.push("");

  // Report
  lines.push("report:");
  if (foundReports.length > 0 && foundReports[0].body) {
    lines.push(foundReports[0].body);
  } else {
    lines.push("[not found]");
  }
  lines.push("");

  // Conversation
  lines.push("conversation:");
  if (girlData.conversation) {
    lines.push(girlData.conversation);
  } else {
    lines.push("[not found]");
  }
  lines.push("");

  // My question
  lines.push("my_question:");
  lines.push("Przeanalizuj tę sytuację według materiału mentora i powiedz co teraz zrobić.");

  // Closing tag
  lines.push("");
  lines.push("</current_case>");

  return lines.join("\n");
}

/**
 * Shows a picker for lead selection using @clack/prompts
 */
async function selectLead(leads: GirlInfo[]): Promise<GirlInfo | null> {
  // Sort leads by date descending for display
  const sortedLeads = sortLeadsByDateDesc(leads);
  
  const choices = sortedLeads.map((lead) => ({
    value: lead.id,
    label: `${lead.name} (loca: ${lead.loca})`,
  }));

  // Add "Go back" option
  choices.unshift({
    value: "0",
    label: "0. Go back",
  });

  const selection = await clack.select({
    message: "Which lead would you like to analyze?",
    options: choices,
  });

  if (selection === "0" || clack.isCancel(selection)) {
    return null;
  }

  return sortedLeads.find((l) => l.id === selection) || null;
}

/**
 * Shows the post-save menu after AI answer is saved
 * @param lead - The lead info
 * @param saveResult - The result of saving the AI answer
 * @param aiAnswer - The AI answer content (stored in memory for quick access)
 */
async function showPostSaveMenu(
  lead: GirlInfo, 
  saveResult: Awaited<ReturnType<typeof SaveAiAnswerToMsgWorkout>>,
  aiAnswer: string
): Promise<void> {
  // Use clack instead of creating a new readline to avoid conflicts with main CLI's readline
  while (true) {
    console.log("\n--- Menu ---");
    console.log("1. Wyświetl zapisany item z Content Providera");
    console.log("2. Wyświetl odpowiedź AI z pamięci");
    console.log("0. Powrót");

    const answer = await clack.select({
      message: "Wybierz opcję:",
      options: [
        { value: "1", label: "1. Wyświetl zapisany item" },
        { value: "2", label: "2. Wyświetl odpowiedź AI" },
        { value: "0", label: "0. Powrót" },
      ],
    });

    if (answer === "0" || answer === undefined || clack.isCancel(answer)) {
      console.log("Returning to main menu.");
      return;
    }

    if (answer === "1") {
      if (!saveResult.success || !saveResult.createdLoca) {
        console.log("⚠️  No saved item to display.");
        continue;
      }

      try {
        // Get the saved item from Content Provider
        const savedItem = await invokeContentProvider([
          "IRepoService",
          "IItemWorker",
          "GetItem",
          SHARED_REPO_ID,
          saveResult.createdLoca,
        ]);

        if (savedItem?.Body) {
          console.log("\n" + "=".repeat(60));
          console.log(`Zapisany item: ${saveResult.itemName}`);
          console.log(`Loca: ${saveResult.createdLoca}`);
          console.log("=".repeat(60));
          console.log(savedItem.Body);
          console.log("=".repeat(60));
        } else {
          console.log("⚠️  Could not retrieve saved item.");
        }
      } catch (error) {
        console.error("Error retrieving saved item:", error instanceof Error ? error.message : error);
      }
    } else if (answer === "2") {
      // Display AI answer from memory (variable)
      console.log("\n" + "=".repeat(60));
      console.log(`Odpowiedź AI dla: ${lead.name}`);
      console.log("=".repeat(60));
      console.log(aiAnswer);
      console.log("=".repeat(60));
    }
  }
}

/**
 * Calls OpenAI Responses API with the prepared prompt
 */
export async function callOpenAiPreparedPrompt(inputText: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const openai = new OpenAI({
    apiKey,
  });

  try {
    const response = await openai.responses.create({
      prompt: {
        id: OPENAI_PROMPT_ID,
        version: OPENAI_PROMPT_VERSION,
      },
      input: [
        {
          role: "user",
          content: inputText,
        },
      ],
      reasoning: {
        summary: "auto",
      },
      store: true,
      include: [
        "reasoning.encrypted_content",
        "web_search_call.action.sources",
      ],
    });

    return response.output_text || null;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
    throw error;
  }
}