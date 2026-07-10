import * as readline from "node:readline/promises";
import { checkHealth, GetAllLeads, TodoLeads, chad_GetLeadsStatuses, createStatusForLead, putStatusContent, getStatusItem, chad_GetLeadsLoca, chad_GetRelativeLoca, chad_GetFirstSegment, SHARED_REPO_ID } from "./contentProviderClient.js";

/**
 * Strips the repo GUID prefix from a full address to get the numeric loca.
 * Example: "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/89/03" -> "03/06/89/03"
 *
 * @param address The full address (may include repo GUID prefix)
 * @returns The numeric loca without the repo GUID prefix
 */
function stripRepoPrefix(address: string): string {
  if (!address) return "";
  const slashIndex = address.indexOf("/");
  if (slashIndex === -1) return address; // No slash, return as-is
  return address.substring(slashIndex + 1);
}
import * as clack from "@clack/prompts";
import { 
  buildMigratedStatusBody, 
  getStatusLoca,
  displayStatusValue,
  STATUS_STANDARD_FIELDS,
  STATUS_DEFAULTS,
  STATUS_FIELD_ALIASES
} from "./statusMigration.js";
import { askOpenAiAboutGirlFlow } from "./openai/askOpenAiAboutGirl.js";

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalizes an address by replacing the first segment "Active" with "girls".
 * Examples:
 *   "Active/06/62/02/01" -> "girls/06/62/02/01"
 *   "girls/06/62/02/01" -> "girls/06/62/02/01"
 */
function normalizeAddress(address: string): string {
  if (!address) return "";

  const parts = address.split("/");
  if (parts.length === 0) return "";

  // Replace first segment with "girls" if it's "Active"
  if (parts[0] === "Active") {
    parts[0] = "girls";
  }

  return parts.join("/");
}

/**
 * Extracts the loca (location) from an address by removing the first segment.
 * Examples:
 *   "girls/06/61/02/01" -> "06/61/02/01"
 *   "Active/06/61/02/01" -> "06/61/02/01"
 */
function getLocaFromAddress(address: string): string {
  if (!address) return "";

  const normalizedAddress = normalizeAddress(address);
  const slashIndex = normalizedAddress.indexOf("/");
  if (slashIndex === -1) return "";

  return normalizedAddress.substring(slashIndex + 1);
}

/**
 * Extracts the parent girl address from a todo item address.
 * Examples:
 *   "girls/06/62/02/01" -> "girls/06/62"
 *   "Active/06/62/02/01" -> "girls/06/62"
 */
function getParentGirlAddress(address: string): string | null {
  if (!address) return null;

  const normalizedAddress = normalizeAddress(address);
  const parts = normalizedAddress.split("/");

  // We need at least 3 parts: repo/loca06/girlNumber (e.g., girls/06/62)
  if (parts.length < 3) return null;

  // Return first 3 parts: girls/06/XX
  return parts.slice(0, 3).join("/");
}

/**
 * Builds a map from full parent girl address to girl name.
 * The response Body is expected to be a map like { "62": "26-05-11_pn_Luba", ... }
 * The base path is "girls/06".
 * Result: { "girls/06/62": "26-05-11_pn_Luba", ... }
 */
function buildGirlParentAddressMap(allGirlsItem: any): Map<string, string> {
  const map = new Map<string, string>();

  if (!allGirlsItem || !allGirlsItem.Body) {
    return map;
  }

  const body = allGirlsItem.Body;

  if (typeof body !== "object" || body === null) {
    return map;
  }

  const keys = Object.keys(body);
  keys.forEach((key) => {
    // Build full parent address: girls/06/{key}
    const parentAddress = `girls/06/${key}`;
    map.set(parentAddress, body[key]);
  });

  return map;
}

/**
 * Formats a header line from an item using full parent address comparison.
 * Format: LOCA; NAME
 * Example: "06/62/02/01; 26-05-11_pn_Luba"
 */
function formatHeader(item: any, girlParentAddressMap: Map<string, string>): { header: string; missingParent: string | null } {
  const address = item?.Settings?.address || "";
  const loca = getLocaFromAddress(address);
  const parentAddress = getParentGirlAddress(address);

  if (!parentAddress) {
    return { header: `${loca}; [invalid address]`, missingParent: null };
  }

  const girlName = girlParentAddressMap.get(parentAddress);

  if (girlName) {
    return { header: `${loca}; ${girlName}`, missingParent: null };
  } else {
    return { header: `${loca}; [missing parent: ${parentAddress}]`, missingParent: parentAddress };
  }
}

/**
 * Checks if the input is a positive response.
 * Accepts: "t", "tak", "y", "yes" (case-insensitive)
 */
function isPositiveResponse(input: string): boolean {
  const lower = input.trim().toLowerCase();
  return ["t", "tak", "y", "yes"].includes(lower);
}

/**
 * Field name mapping for surgical migration.
 * Maps old field names to new field names.
 */
const FIELD_NAME_MAPPING: Record<string, string> = {
  "her-fist-msg": "her-first-msg",
  "your-fist-message": "your-first-message",
  "writing deadline": "writing-deadline"
};

/**
 * Standard fields in the new status format, in order.
 */
const NEW_STANDARD_FIELDS = [
  "city",
  "only-friends",
  "her-first-msg",
  "your-first-message",
  "writing-deadline",
  "priority-today"
];

/**
 * Default values for new standard fields.
 */
const FIELD_DEFAULTS: Record<string, string> = {
  "city": "",
  "only-friends": "false",
  "her-first-msg": "false",
  "your-first-message": "false",
  "writing-deadline": "2099-01-01",
  "priority-today": "0"
};

/**
 * Performs surgical migration of a status body.
 * 
 * This function:
 * - Parses the existing body into fields
 * - Maps old field names to new field names
 * - Adds missing new standard fields with defaults
 * - Preserves additional (non-standard) fields
 * - Maintains the new standard field order at the top
 * - Handles conflicts when both old and new names exist
 * 
 * @param body The current status body string
 * @returns The migrated status body string
 */
function surgicalMigrateStatus(body: string): string {
  // If body is empty, return full standard with defaults
  if (!body || body.trim() === "") {
    const lines: string[] = [];
    for (const field of NEW_STANDARD_FIELDS) {
      lines.push(`${field}: ${FIELD_DEFAULTS[field]}`);
    }
    return lines.join('\n');
  }

  // Parse existing body into fields and non-field lines
  const existingFields: Map<string, string> = new Map();
  const otherLines: string[] = [];
  const fieldOrder: string[] = []; // Track original order of fields

  const lines = body.split('\n');
  for (const line of lines) {
    const fieldMatch = line.match(/^([\w\s-]+)\s*:\s*(.*)/);
    if (fieldMatch) {
      const fieldName = fieldMatch[1].trim();
      const value = fieldMatch[2].trim();
      existingFields.set(fieldName, value);
      fieldOrder.push(fieldName);
    } else if (line.trim() !== '') {
      // Keep non-field lines (comments, etc.)
      otherLines.push(line);
    }
  }

  // Step 1: Apply field name mapping (old -> new)
  // Create a map of migrated fields
  const migratedFields: Map<string, string> = new Map();
  const processedOldFields: Set<string> = new Set();

  for (const [oldName, newName] of Object.entries(FIELD_NAME_MAPPING)) {
    if (existingFields.has(oldName)) {
      processedOldFields.add(oldName);
      
      const oldValue = existingFields.get(oldName) || "";
      
      // Check if new field already exists
      if (existingFields.has(newName)) {
        const newValue = existingFields.get(newName) || "";
        // Priority: new field value if non-empty, otherwise old field value
        if (newValue !== "") {
          migratedFields.set(newName, newValue);
        } else if (oldValue !== "") {
          migratedFields.set(newName, oldValue);
        } else {
          // Both empty, use default
          migratedFields.set(newName, FIELD_DEFAULTS[newName] || "");
        }
      } else {
        // New field doesn't exist, use old field value or default
        if (oldValue !== "") {
          migratedFields.set(newName, oldValue);
        } else {
          migratedFields.set(newName, FIELD_DEFAULTS[newName] || "");
        }
      }
    }
  }

  // Step 2: Copy existing fields that are already in new standard format
  for (const field of NEW_STANDARD_FIELDS) {
    if (existingFields.has(field) && !migratedFields.has(field)) {
      const value = existingFields.get(field) || "";
      migratedFields.set(field, value);
    }
  }

  // Step 3: Add defaults for missing standard fields
  for (const field of NEW_STANDARD_FIELDS) {
    if (!migratedFields.has(field)) {
      migratedFields.set(field, FIELD_DEFAULTS[field] || "");
    }
  }

  // Step 4: Collect additional (non-standard) fields to preserve
  const additionalFields: { name: string; value: string }[] = [];
  
  for (const [fieldName, value] of existingFields) {
    // Skip if it's a standard field (already handled)
    if (NEW_STANDARD_FIELDS.includes(fieldName)) continue;
    
    // Skip if it's an old field name that was mapped
    if (processedOldFields.has(fieldName)) continue;
    
    // Preserve this field
    additionalFields.push({ name: fieldName, value });
  }

  // Step 5: Build the new body
  const resultLines: string[] = [];

  // Add standard fields in order
  for (const field of NEW_STANDARD_FIELDS) {
    const value = migratedFields.get(field) || "";
    resultLines.push(`${field}: ${value}`);
  }

  // Add additional fields (preserving their original values)
  for (const { name, value } of additionalFields) {
    resultLines.push(`${name}: ${value}`);
  }

  // Add other lines (comments, etc.)
  for (const line of otherLines) {
    resultLines.push(line);
  }

  return resultLines.join('\n');
}

// ============================================================================
// STATUS EDITOR SHARED TYPES AND FUNCTIONS
// These are used by both option 3 (Statuses Setup) and option 4 (Statuses Update)
// ============================================================================

/**
 * Status classification types
 */
type StatusCategory = "missing" | "empty" | "outdated" | "valid";

interface GirlStatusInfo {
  id: string;
  name: string;
  category: StatusCategory;
  statusAddress?: string;
  statusItem?: any;
}

/**
 * Context loaded for status operations
 */
interface StatusesContext {
  girlsMap: Map<string, string>;
  statusCategories: {
    missing: GirlStatusInfo[];
    empty: GirlStatusInfo[];
    outdated: GirlStatusInfo[];
    valid: GirlStatusInfo[];
  };
  allGirlsWithStatus: GirlStatusInfo[];
  allLeadsCount: number;
  statusesCount: number;
}

// Required fields for valid status format
const STATUS_REQUIRED_FIELDS = [
  "her-first-msg",
  "your-first-message",
  "writing-deadline",
  "priority-today"
];

// YAML template for new status items with default values
const STATUS_YAML_TEMPLATE = `city:
only-friends: false
her-first-msg: false
your-first-message: false
writing-deadline: 2099-01-01
priority-today: 0`;

/**
 * Checks if a body string is empty (after trimming).
 * Handles empty strings and whitespace-only strings.
 */
function isEmptyBody(body: any): boolean {
  if (body === null || body === undefined) return true;
  if (typeof body === "string") return body.trim() === "";
  return false;
}

/**
 * Checks if body contains a specific field (as a key in YAML format).
 * The field should be at the start of a line followed by colon.
 */
function hasField(body: string, field: string): boolean {
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
function parseStatusBody(body: string): Record<string, string> {
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
function getYamlFieldValue(body: string, field: string): string {
  const parsed = parseStatusBody(body);
  return parsed[field] || "";
}

/**
 * Checks if body contains all required fields.
 */
function hasAllRequiredFields(body: string): boolean {
  return STATUS_REQUIRED_FIELDS.every(field => hasField(body, field));
}

/**
 * Classifies a status based on its body content.
 * Returns the status category.
 */
function classifyStatus(body: any): StatusCategory {
  // If body is empty, it's "empty" category
  if (isEmptyBody(body)) {
    return "empty";
  }

  const bodyStr = typeof body === "string" ? body : "";

  // Check if it has all required fields -> valid
  if (hasAllRequiredFields(bodyStr)) {
    return "valid";
  }

  // If it doesn't have all required fields -> outdated
  return "outdated";
}

/**
 * Merges template fields into existing body, preserving other fields.
 * @param existingBody The current body content
 * @param template The template with required fields
 * @returns Merged body content
 */
function mergeYamlBody(existingBody: string, template: string): string {
  // Parse existing body into lines
  const existingLines = existingBody.split('\n');
  const existingFields = new Map<string, string>();
  const otherLines: string[] = [];

  // Parse existing fields and other content
  for (const line of existingLines) {
    const fieldMatch = line.match(/^([\w-]+)\s*:/);
    if (fieldMatch) {
      const fieldName = fieldMatch[1];
      const value = line.substring(fieldMatch.index! + fieldMatch[0].length).trim();
      existingFields.set(fieldName, line);
    } else if (line.trim() !== '' || otherLines.length > 0) {
      // Keep non-field lines (comments, empty lines, etc.)
      otherLines.push(line);
    }
  }

  // Build new body: start with template fields, then add other existing content
  const resultLines: string[] = [];

  // Add template fields (which will override existing ones)
  const templateLines = template.split('\n');
  for (const line of templateLines) {
    const fieldMatch = line.match(/^([\w-]+)\s*:/);
    if (fieldMatch) {
      const fieldName = fieldMatch[1];
      // Use template line for required fields (overrides existing)
      resultLines.push(line);
      // Remove from existing fields map so we don't add it again
      existingFields.delete(fieldName);
    } else {
      resultLines.push(line);
    }
  }

  // Add remaining existing fields that weren't in template
  for (const [fieldName, line] of existingFields) {
    resultLines.push(line);
  }

  // Add other content (comments, etc.)
  for (const line of otherLines) {
    resultLines.push(line);
  }

  return resultLines.join('\n');
}

/**
 * Parses user selection input and returns array of indices.
 * Supports: single number (1), comma-separated (1,2,3), range (1-5), all
 */
function parseSelection(input: string, max: number): number[] {
  const trimmed = input.trim().toLowerCase();
  
  if (trimmed === 'all') {
    return Array.from({ length: max }, (_, i) => i);
  }

  if (trimmed === '0') {
    return [];
  }

  const indices = new Set<number>();
  const parts = trimmed.split(',').map(p => p.trim());
  
  for (const part of parts) {
    if (part.includes('-')) {
      // Range like "1-5"
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr);
      const end = parseInt(endStr);
      if (!isNaN(start) && !isNaN(end) && start >= 1 && end <= max) {
        for (let i = start; i <= end; i++) {
          indices.add(i - 1);
        }
      }
    } else {
      // Single number
      const num = parseInt(part);
      if (!isNaN(num) && num >= 1 && num <= max) {
        indices.add(num - 1);
      }
    }
  }
  
  return Array.from(indices).sort((a, b) => a - b);
}

/**
 * Validates a date string in YYYY-MM-DD format.
 * Returns true if valid format, false otherwise.
 */
function validateDateYYYYMMDD(value: string): boolean {
  if (!value || value.trim() === '') return false;
  
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(value)) return false;
  
  const [year, mm, dd] = value.split('-').map(Number);
  const month = mm;
  const day = dd;
  
  // Check valid ranges
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  
  // Check if the date is actually valid (e.g., not Feb 30)
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && 
         date.getMonth() === month - 1 && 
         date.getDate() === day;
}

/**
 * Checks if a date is more than 10 days in the future.
 * Returns true if the date is more than 10 days ahead of today.
 */
function isDateMoreThan10DaysAhead(value: string): boolean {
  const [year, mm, dd] = value.split('-').map(Number);
  const month = mm - 1; // JavaScript months are 0-indexed
  const day = dd;
  
  const inputDate = new Date(year, month, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const tenDaysLater = new Date(today);
  tenDaysLater.setDate(tenDaysLater.getDate() + 10);
  
  return inputDate > tenDaysLater;
}

/**
 * Updates or inserts a YAML field in the body string.
 * Preserves all other fields and formatting.
 */
function upsertYamlField(body: string, key: string, value: string): string {
  const lines = body.split('\n');
  const escapedKey = escapeRegex(key);
  const fieldRegex = new RegExp(`^${escapedKey}\\s*:`);
  let found = false;
  
  const newLines = lines.map(line => {
    if (fieldRegex.test(line)) {
      found = true;
      return `${key}: ${value}`;
    }
    return line;
  });
  
  if (!found) {
    // Add field at the end
    newLines.push(`${key}: ${value}`);
  }
  
  return newLines.join('\n');
}

/**
 * Ensures all required status fields exist in the body.
 * Adds missing fields at the end with empty values.
 */
function ensureRequiredStatusFields(body: string): string {
  let result = body;
  for (const field of STATUS_REQUIRED_FIELDS) {
    if (!hasField(result, field)) {
      result += `\n${field}:`;
    }
  }
  return result;
}

/**
 * Loads all status data and creates the merged context.
 * This function fetches all leads and statuses, then merges them
 * so every lead is represented (with or without a status).
 */
async function loadStatusesContext(): Promise<StatusesContext> {
  // Step 1: Fetch all leads
  console.log("Fetching all leads...");
  const allLeadsResponse = await GetAllLeads();

  // Build map of girlId -> girlName from all leads
  const girlsMap = new Map<string, string>();
  if (allLeadsResponse && allLeadsResponse.Body && typeof allLeadsResponse.Body === "object") {
    const body = allLeadsResponse.Body;
    Object.keys(body).forEach((key) => {
      girlsMap.set(key, body[key]);
    });
  }

  // Step 2: Fetch statuses
  console.log("Fetching statuses...");
  const statusItems = await chad_GetLeadsStatuses();

  // DEBUG: Log all status items to understand the address format
  console.log(`[DEBUG] Found ${Array.isArray(statusItems) ? statusItems.length : 0} status items`);
  if (Array.isArray(statusItems)) {
    statusItems.forEach((item, idx) => {
      const address = item?.Settings?.address || "";
      const loca = address.includes('/') ? address.split('/').slice(1).join('/') : address;
      console.log(`[DEBUG] Status #${idx}: address="${address}", loca="${loca}", parts=[${address.split('/').join(', ')}]`);
    });
  }

  // Build map of girlIds that have statuses
  // IMPORTANT: The status address is in numeric format (e.g., "repo/03/06/89/03")
  // We need to extract the girlId from the leads Body map, not from address segments.
  // 
  // The status loca format is: {leadsBaseLoca}/{girlId}/{statusItemNumber}
  // For example: "03/06/89/03" where:
  //   - "03/06" is the leads base loca
  //   - "89" is the girlId
  //   - "03" is the status item number within the girl's folder
  //
  // To extract girlId, we need to:
  // 1. Get the leads base loca (e.g., "03/06")
  // 2. Strip that prefix from the status loca
  // 3. Take the first segment of the remaining path (which is the girlId)
  
  const girlsWithStatusesMap = new Map<string, { address: string; item: any }>();
  if (Array.isArray(statusItems)) {
    // Get leads base loca to properly extract girlId from status addresses
    const leadsBaseLoca = await chad_GetLeadsLoca();
    console.log(`[DEBUG] Leads base loca: "${leadsBaseLoca}"`);
    
    statusItems.forEach((item) => {
      const address = item?.Settings?.address || "";
      if (address) {
        // Strip repo GUID prefix to get numeric loca
        const loca = stripRepoPrefix(address);
        console.log(`[DEBUG] Processing status: address="${address}", loca="${loca}"`);
        
        // Extract girlId from loca by:
        // 1. Stripping the leads base loca prefix
        // 2. Taking the first segment of the remainder
        let girlId: string | null = null;
        if (loca.startsWith(leadsBaseLoca + '/')) {
          const relativeLoca = loca.substring(leadsBaseLoca.length + 1);
          const segments = relativeLoca.split('/');
          if (segments.length >= 1) {
            girlId = segments[0];
            console.log(`[DEBUG] Extracted girlId: "${girlId}" from relativeLoca: "${relativeLoca}"`);
          }
        } else {
          console.log(`[DEBUG] WARNING: loca "${loca}" does not start with leads base "${leadsBaseLoca}/"`);
        }
        
        if (girlId) {
          girlsWithStatusesMap.set(girlId, { address, item });
        }
      }
    });
  }
  
  // DEBUG: Log the final girlsWithStatusesMap
  console.log(`[DEBUG] girlsWithStatusesMap size: ${girlsWithStatusesMap.size}`);
  girlsWithStatusesMap.forEach((value, girlId) => {
    console.log(`[DEBUG] girlId="${girlId}" -> address="${value.address}"`);
  });

  // Step 3: Categorize all girls
  const statusCategories: {
    missing: GirlStatusInfo[];
    empty: GirlStatusInfo[];
    outdated: GirlStatusInfo[];
    valid: GirlStatusInfo[];
  } = { missing: [], empty: [], outdated: [], valid: [] };
  const allGirlsWithStatus: GirlStatusInfo[] = [];

  girlsMap.forEach((name, girlId) => {
    const statusData = girlsWithStatusesMap.get(girlId);
    if (!statusData) {
      // No status item exists
      statusCategories.missing.push({ id: girlId, name, category: "missing" });
    } else {
      // Status item exists - check body
      const body = statusData.item?.Body;
      const category = classifyStatus(body);

      const info: GirlStatusInfo = {
        id: girlId,
        name,
        category,
        statusAddress: statusData.address,
        statusItem: statusData.item
      };

      statusCategories[category].push(info);
      allGirlsWithStatus.push(info);
    }
  });

  // Sort all categories by id (numeric)
  statusCategories.missing.sort((a, b) => parseInt(a.id) - parseInt(b.id));
  statusCategories.empty.sort((a, b) => parseInt(a.id) - parseInt(b.id));
  statusCategories.outdated.sort((a, b) => parseInt(a.id) - parseInt(b.id));
  statusCategories.valid.sort((a, b) => parseInt(a.id) - parseInt(b.id));
  allGirlsWithStatus.sort((a, b) => parseInt(a.id) - parseInt(b.id));

  return {
    girlsMap,
    statusCategories,
    allGirlsWithStatus,
    allLeadsCount: girlsMap.size,
    statusesCount: allGirlsWithStatus.length
  };
}

async function main() {
  // Step 1: Health check on startup
  console.log("Checking API health...");
  const isHealthy = await checkHealth();

  if (!isHealthy) {
    console.error("Error: API is not healthy. Make sure the Docker container is running.");
    console.error("Run: docker ps | grep webapi");
    process.exit(1);
  }

  console.log("API is healthy.\n");

  let rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Track if readline is closed to prevent questions after close
  let isClosed = false;

  // Handle EOF (Ctrl+D) and close events gracefully
  rl.on("close", () => {
    isClosed = true;
  });

  // Step 2: Show menu loop - runs until EOF (Ctrl+D) or exit option
  while (!isClosed) {
    console.log("1. PrintAllLeads");
    console.log("2. Find Todo");
    console.log("3. Statuses Setup");
    console.log("4. Statuses Update");
    console.log("5. FilterStatuses");
    console.log("6. Ask OpenAI about girl");
    console.log("0. Exit");

    let answer: string;
    try {
      answer = (await rl.question("Choose option: ")).trim().toLowerCase();
    } catch (error) {
      // readline was closed during question (e.g., piped input ended, Ctrl+D)
      console.log("\nGoodbye!");
      return;
    }

    if (answer === "0" || answer === "exit") {
      console.log("Goodbye!");
      return;
    } else if (answer === "1" || answer === "printallleads") {
      try {
        // Temporary log to verify correct arguments
        console.log("DEBUG: About to call GetAllLeads() with args:");
        console.log('["IRepoService","IItemWorker","GetByNames","21d11bdc-f1f4-44d1-b61a-3fa6b039c641","leads","all items"]');
        const result = await GetAllLeads();
        if (result && result.Body && typeof result.Body === "object") {
          const body = result.Body;
          const keys = Object.keys(body);
          if (keys.length === 0) {
            console.log("No girls found.");
          } else {
            keys.forEach((key) => {
              console.log(`${key}. ${body[key]}`);
            });
          }
        } else {
          console.log("No data found in response Body.");
        }
      } catch (error) {
        console.error(
          "Error:",
          error instanceof Error ? error.message : error
        );
      }
      console.log(); // Empty line for readability
    } else if (answer === "2" || answer === "todogirls") {
      try {
        // Step 1: Fetch all leads to build the lead name map
        console.log("Fetching all leads to build lead name map...");
        const allLeadsResponse = await GetAllLeads();

        // Build map of leadKey -> leadName from allLeads.Body
        const leadsNameMap = new Map<string, string>();
        if (allLeadsResponse && allLeadsResponse.Body && typeof allLeadsResponse.Body === "object") {
          const body = allLeadsResponse.Body;
          Object.keys(body).forEach((key) => {
            leadsNameMap.set(key, body[key]);
          });
        }

        // Step 2: Get the base leads loca (e.g., "03/06")
        const baseLoca = await chad_GetLeadsLoca();
        console.log(`Base leads loca: ${baseLoca}`);

        // Step 3: Fetch todo leads
        const items = await TodoLeads();

        if (!Array.isArray(items) || items.length === 0) {
          console.log("No todo items found.");
          console.log();
          continue;
        }

        // Step 4: Format headers using lead key lookup
        console.log("\nFound todo items:");
        const missingLeadKeys = new Set<string>();
        const formattedResults = items.map((item) => {
          const address = item?.Settings?.address || "";
          
          // Get loca from address (remove first segment like "girls/" or repo prefix)
          const loca = getLocaFromAddress(address);
          
          // Get relative loca: strip baseLoca prefix from fullLoca
          let relativeLoca = "";
          let leadKey = "";
          try {
            relativeLoca = chad_GetRelativeLoca(loca, baseLoca);
            leadKey = chad_GetFirstSegment(relativeLoca);
          } catch (e) {
            // If relative loca cannot be computed, show error
            return { header: `${loca}; [invalid path]`, missingLeadKey: null };
          }

          // Look up lead name from allLeads.Body using leadKey
          const leadName = leadsNameMap.get(leadKey);

          if (leadName) {
            return { header: `${loca}; ${leadName}`, missingLeadKey: null };
          } else {
            return { header: `${loca}; [missing lead key: ${leadKey}]`, missingLeadKey: leadKey };
          }
        });

        formattedResults.forEach((result) => {
          console.log(result.header);
          if (result.missingLeadKey) {
            missingLeadKeys.add(result.missingLeadKey);
          }
        });

        // Print missing lead keys summary
        if (missingLeadKeys.size > 0) {
          console.log(`\nMissing lead keys: ${Array.from(missingLeadKeys).join(", ")}`);
        }

        // Ask if user wants to see the content
        if (isClosed) return;

        let showContent: string;
        try {
          showContent = (await rl.question("\nCzy wyświetlić zawartość tych plików? (t/n): ")).trim();
        } catch (error) {
          console.log();
          continue;
        }

        if (isPositiveResponse(showContent)) {
          console.log();
          items.forEach((item) => {
            const address = item?.Settings?.address || "";
            const loca = getLocaFromAddress(address);
            
            // Get relative loca and lead key
            let relativeLoca = "";
            let leadKey = "";
            try {
              relativeLoca = chad_GetRelativeLoca(loca, baseLoca);
              leadKey = chad_GetFirstSegment(relativeLoca);
            } catch (e) {
              // Skip if cannot compute
            }

            const leadName = leadsNameMap.get(leadKey);
            let header: string;
            if (leadName) {
              header = `${loca}; ${leadName}`;
            } else {
              header = `${loca}; [missing lead key: ${leadKey}]`;
            }

            const body = item?.Body || "";
            // Replace tabs with 2 spaces
            const formattedBody = typeof body === "string" ? body.replace(/\t/g, "  ") : body;

            console.log("==============================");
            console.log(header);
            console.log("==============================");
            console.log(formattedBody);
            console.log();
          });
        }
      } catch (error) {
        console.error(
          "Error:",
          error instanceof Error ? error.message : error
        );
      }
      console.log(); // Empty line for readability
    } else if (answer === "3" || answer === "getgirlsstatuses") {
      // Option 3: Statuses Setup - submenu for managing statuses
      try {
        // Load statuses context
        const context = await loadStatusesContext();
        const { girlsMap, statusCategories, allGirlsWithStatus } = context;

        // Submenu loop
        let inSubmenu = true;
        while (inSubmenu && !isClosed) {
          console.log("\n--- Podmenu ---");
          console.log("1. Utwórz brakujące itemy `status`");
          console.log("2. Pokaż szczegóły istniejących statusów");
          console.log("3. Uzupełnij statusy");
          console.log("4. Migruj statusy do nowego formatu");
          console.log("5. Migracja chirurgiczna statusów");
          console.log("0. Wróć");

          let submenuAnswer: string;
          try {
            submenuAnswer = (await rl.question("Wybierz opcję: ")).trim();
          } catch (error) {
            console.log();
            break;
          }

          if (submenuAnswer === "0") {
            inSubmenu = false;
            continue;
          }

          if (submenuAnswer === "1") {
            // Option 1: Create missing status items
            // Only handles: Missing status item + Empty status body
            const missingCount = statusCategories.missing.length;
            const emptyCount = statusCategories.empty.length;
            const totalCount = missingCount + emptyCount;

            if (totalCount === 0) {
              console.log("\nWszystkie dziewczyny mają prawidłowe statusy.");
              continue;
            }

            console.log(`\nDo przetworzenia: ${missingCount} brakujących + ${emptyCount} z pustym body`);

            // Build combined list of girls to process (missing first, then empty)
            const girlsToProcess = [
              ...statusCategories.missing.map(g => ({ ...g, source: 'missing' as const })),
              ...statusCategories.empty.map(g => ({ ...g, source: 'empty' as const }))
            ];

            // Show list of girls for selection
            console.log("\nDostępne dziewczyny do przetworzenia:");
            girlsToProcess.forEach((girl, index) => {
              const sourceLabel = girl.source === 'missing' ? '[brakujący]' : '[pusty]';
              console.log(`  ${index + 1}. ${girl.id}. ${girl.name} ${sourceLabel}`);
            });

            // Ask for selection
            let selectedIndices: number[] = [];
            if (!isClosed) {
              let selectionInput: string;
              try {
                selectionInput = (await rl.question("\nWybierz zakres (np. 1,2,3 lub 1-5 lub all): ")).trim();
              } catch (error) {
                console.log();
                continue;
              }

              selectedIndices = parseSelection(selectionInput, girlsToProcess.length);
              
              if (selectedIndices.length === 0) {
                console.log("\nNieprawidłowy wybór lub anulowano.");
                continue;
              }

              console.log(`\nWybrano ${selectedIndices.length} dziewczyn do przetworzenia:`);
              selectedIndices.forEach(idx => {
                const girl = girlsToProcess[idx];
                console.log(`  ${girl.id}. ${girl.name}`);
              });

              // Ask for confirmation
              let confirmAnswer: string;
              try {
                confirmAnswer = (await rl.question("\nCzy na pewno utworzyć/zainicjalizować wybrane statusy? (t/n): ")).trim();
              } catch (error) {
                console.log();
                continue;
              }

              if (!isPositiveResponse(confirmAnswer)) {
                continue;
              }
            }

            console.log("\nProcessing selected status items...");

            // Process only selected girls
            for (const idx of selectedIndices) {
              const girl = girlsToProcess[idx];
              
              if (girl.source === 'missing') {
                // Process girls with missing status (POST + PUT)
                // Get the full leads base loca (e.g., "03/06") and append girl's id
                // IMPORTANT: Never use partial loca like "06/89" - must use full path "03/06/89"
                const leadsBaseLoca = await chad_GetLeadsLoca();
                const girlLoca = `${leadsBaseLoca}/${girl.id}`;

                try {
                  // Diagnostic logging before PostParentItem
                  console.log(`[DEBUG] PostParentItem: repo=${SHARED_REPO_ID}, loca=${girlLoca}, type=Text, name=status`);

                  // Validate loca has expected structure (at least 3 segments: "XX/YY/girlId")
                  const locaSegments = girlLoca.split('/');
                  if (locaSegments.length < 3) {
                    throw new Error(`Invalid loca "${girlLoca}": expected at least 3 segments (e.g., "03/06/89"), got ${locaSegments.length}. Never truncate loca!`);
                  }

                  // Step 1: POST to create the status item
                  const postResult = await createStatusForLead(girlLoca);

                  // Step 2: Get the new item's address from the response
                  const newAddress = postResult?.Settings?.address || "";
                  if (!newAddress) {
                    throw new Error("No address in POST response");
                  }

                  // Step 3: Strip repo GUID prefix to get the numeric loca
                  // The address is like "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/89/03"
                  // We need just "03/06/89/03" for putStatusContent
                  const newLoca = stripRepoPrefix(newAddress);

                  // Step 4: PUT to initialize with YAML content
                  await putStatusContent(newLoca, STATUS_YAML_TEMPLATE);

                  console.log(`created + initialized: ${newLoca} for ${girl.name}`);
                } catch (error) {
                  const errorMsg = error instanceof Error ? error.message : String(error);
                  console.log(`failed: ${girlLoca}/status for ${girl.name}`);
                  console.log(errorMsg);
                }
              } else {
                // Process girls with empty status body (PUT only - preserve existing fields)
                if (!girl.statusAddress) continue;

                // Get loca from address (remove "girls/" prefix)
                let loca = girl.statusAddress;
                if (loca.startsWith("girls/")) {
                  loca = loca.substring(6);
                }

                try {
                  // Step 1: Fetch existing item to preserve other fields
                  const existingItem = await getStatusItem(loca);
                  const existingBody = existingItem?.Body || "";
                  
                  // Step 2: Merge template with existing body (preserves extra fields)
                  const mergedBody = typeof existingBody === "string" 
                    ? mergeYamlBody(existingBody, STATUS_YAML_TEMPLATE)
                    : STATUS_YAML_TEMPLATE;

                  // Step 3: PUT the merged content
                  await putStatusContent(loca, mergedBody);
                  console.log(`initialized: ${loca} for ${girl.name}`);
                } catch (error) {
                  const errorMsg = error instanceof Error ? error.message : String(error);
                  console.log(`failed: ${loca} for ${girl.name}`);
                  console.log(errorMsg);
                }
              }
            }

            // Refresh data after updates
            console.log("\nRefreshing data...");
            const newContext = await loadStatusesContext();
            // Update the context references
            Object.assign(statusCategories, newContext.statusCategories);
            allGirlsWithStatus.length = 0;
            allGirlsWithStatus.push(...newContext.allGirlsWithStatus);
          } else if (submenuAnswer === "2") {
            // Option 2: Show details of statuses by category
            // Show category selection
            let inCategorySelect = true;
            while (inCategorySelect && !isClosed) {
              console.log("\n--- Wybierz kategorię ---");
              console.log(`1. Empty status body (${statusCategories.empty.length})`);
              console.log(`2. Outdated status format (${statusCategories.outdated.length})`);
              console.log(`3. Valid status (${statusCategories.valid.length})`);
              console.log(`4. All existing statuses (${allGirlsWithStatus.length})`);
              console.log("0. Wróć");

              let categoryAnswer: string;
              try {
                categoryAnswer = (await rl.question("Wybierz kategorię: ")).trim();
              } catch (error) {
                console.log();
                break;
              }

              if (categoryAnswer === "0") {
                inCategorySelect = false;
                continue;
              }

              let selectedList: GirlStatusInfo[] = [];
              let categoryLabel = "";

              switch (categoryAnswer) {
                case "1":
                  selectedList = statusCategories.empty;
                  categoryLabel = "Empty status body";
                  break;
                case "2":
                  selectedList = statusCategories.outdated;
                  categoryLabel = "Outdated status format";
                  break;
                case "3":
                  selectedList = statusCategories.valid;
                  categoryLabel = "Valid status";
                  break;
                case "4":
                  selectedList = allGirlsWithStatus;
                  categoryLabel = "All existing statuses";
                  break;
                default:
                  console.log("\nNieznana kategoria. Wybierz 1-4 lub 0.");
                  continue;
              }

              if (selectedList.length === 0) {
                console.log(`\nBrak statusów w kategorii: ${categoryLabel}`);
                continue;
              }

              // Show list of statuses in selected category
              let inStatusList = true;
              while (inStatusList && !isClosed) {
                console.log(`\n--- ${categoryLabel} ---`);
                selectedList.forEach((girl, index) => {
                  console.log(`${index + 1}. ${girl.id}. ${girl.name}`);
                });
                console.log("0. Wróć do wyboru kategorii");

                let statusAnswer: string;
                try {
                  statusAnswer = (await rl.question("Wybierz numer statusu: ")).trim();
                } catch (error) {
                  console.log();
                  break;
                }

                if (statusAnswer === "0") {
                  inStatusList = false;
                  continue;
                }

                const selectedIndex = parseInt(statusAnswer) - 1;
                if (selectedIndex >= 0 && selectedIndex < selectedList.length) {
                  const selectedGirl = selectedList[selectedIndex];
                  const statusItem = selectedGirl.statusItem;
                  const body = statusItem?.Body;
                  const address = selectedGirl.statusAddress || "";

                  console.log("\n==============================");
                  console.log(`${selectedGirl.id}. ${selectedGirl.name}`);
                  console.log(address);
                  console.log("==============================");

                  if (isEmptyBody(body)) {
                    console.log("[empty status body]");
                  } else {
                    const bodyStr = typeof body === "string" ? body : String(body);
                    // Replace tabs with 2 spaces
                    const formattedBody = bodyStr.replace(/\t/g, "  ");
                    console.log(formattedBody);
                  }
                } else {
                  console.log("\nNieprawidłowy numer.");
                }
              }
            }
          } else if (submenuAnswer === "3") {
            // Option 3: Uzupełnij statusy (Complete statuses) - NEW UX with single select
            console.log("\n--- Uzupełnij statusy ---");
            
            // Show all existing statuses (empty, outdated, valid) for selection
            const statusesToComplete = [
              ...statusCategories.empty,
              ...statusCategories.outdated,
              ...statusCategories.valid
            ];

            if (statusesToComplete.length === 0) {
              console.log("\nBrak statusów do uzupełnienia.");
              continue;
            }

            // Show list of statuses
            console.log("\nDostępne statusy do uzupełnienia:");
            statusesToComplete.forEach((girl, index) => {
              const categoryLabel = girl.category === 'empty' ? '[pusty]' : 
                                    girl.category === 'outdated' ? '[nieaktualny]' : '[ważny]';
              console.log(`  ${index + 1}. ${girl.id}. ${girl.name} ${categoryLabel}`);
            });
            console.log("0. Wróć");

            // Ask for selection
            let selectionInput: string;
            try {
              selectionInput = (await rl.question("\nKtóre statusy uzupełnić? Wpisz numer, zakres albo all: ")).trim();
            } catch (error) {
              console.log();
              continue;
            }

            if (selectionInput === "0") {
              continue;
            }

            const selectedIndices = parseSelection(selectionInput, statusesToComplete.length);
            
            if (selectedIndices.length === 0) {
              console.log("\nNieprawidłowy wybór lub anulowano.");
              continue;
            }

            console.log(`\nWybrano ${selectedIndices.length} statusów do uzupełnienia:`);
            selectedIndices.forEach(idx => {
              const girl = statusesToComplete[idx];
              console.log(`  ${girl.id}. ${girl.name}`);
            });

            /**
             * Helper function to get display value for a field.
             * Returns "[empty]" for empty values.
             */
            function getDisplayValue(body: string, field: string): string {
              const parsed = parseStatusBody(body);
              const value = parsed[field] || "";
              return value === "" ? "[empty]" : value;
            }

            /**
             * Helper function to get current value of a field.
             * Returns empty string for empty values.
             */
            function getFieldValue(body: string, field: string): string {
              const parsed = parseStatusBody(body);
              return parsed[field] || "";
            }

            /**
             * Validates required fields before saving.
             * Sets defaults for missing required fields:
             * - her-first-msg -> false
             * - your-first-message -> false
             * - writing-deadline -> 2099-01-01
             * - priority-today -> 0
             */
            function validateRequiredFields(body: string): string {
              let result = body;
              const defaults: Record<string, string> = {
                "her-first-msg": "false",
                "your-first-message": "false",
                "writing-deadline": "2099-01-01",
                "priority-today": "0"
              };

              for (const [field, defaultValue] of Object.entries(defaults)) {
                const currentValue = getFieldValue(result, field);
                if (currentValue === "") {
                  result = upsertYamlField(result, field, defaultValue);
                }
              }

              return result;
            }

            // Process each selected status
            for (const idx of selectedIndices) {
              const girl = statusesToComplete[idx];
              
              if (!girl.statusAddress || !girl.statusItem) {
                console.log(`\nPominięto: ${girl.name} - brak adresu statusu`);
                continue;
              }

              // Get loca from address (remove "girls/" prefix)
              let loca = girl.statusAddress;
              if (loca.startsWith("girls/")) {
                loca = loca.substring(6);
              }

              // Get current body and ensure all required fields exist
              let currentBody = typeof girl.statusItem.Body === "string" ? girl.statusItem.Body : "";
              currentBody = ensureRequiredStatusFields(currentBody);

              // Store original body for before/after comparison
              const originalBody = currentBody;

              // Show "Edycja statusu:" header
              console.log("\n==============================");
              console.log(`Edycja statusu: ${girl.id}. ${girl.name}`);
              console.log("==============================\n");

              // Main editing loop - keep showing select until user chooses exit
              let editing = true;
              while (editing && !isClosed) {
                // Build select options showing current values and old values
                const selectOptions: { value: string; label: string }[] = [];

                for (const field of STATUS_REQUIRED_FIELDS) {
                  const currentValue = getDisplayValue(currentBody, field);
                  const originalValue = getDisplayValue(originalBody, field);
                  selectOptions.push({
                    value: field,
                    label: `${field}: ${currentValue} (old: ${originalValue})`
                  });
                }

                // Add exit options
                selectOptions.push(
                  { value: '__exit_save__', label: 'exit and save' },
                  { value: '__exit_nosave__', label: 'exit without save' }
                );

                // Show single select for field selection using clack
                const selectedField = await clack.select({
                  message: 'Co chcesz zmienić?',
                  options: selectOptions,
                  initialValue: STATUS_REQUIRED_FIELDS[0]
                });

                if (clack.isCancel(selectedField)) {
                  console.log('Anulowano.');
                  break;
                }

                // Handle exit options
                if (selectedField === '__exit_save__' || selectedField === '__exit_nosave__') {
                  if (selectedField === '__exit_save__') {
                    // Validate required fields before saving
                    let bodyToSave = validateRequiredFields(currentBody);

                    // Show preview
                    console.log("\n==============================");
                    console.log(`Podgląd zmian: ${girl.id}. ${girl.name}`);
                    console.log("==============================");
                    console.log("\nBefore:");
                    console.log(originalBody || "[empty]");
                    console.log("\nAfter:");
                    console.log(bodyToSave || "[empty]");

                    // No confirmation needed - user already chose "exit and save"
                    try {
                      await putStatusContent(loca, bodyToSave);
                      console.log(`\nupdated: ${loca}; ${girl.name}`);
                      
                      // Update the cached status item
                      girl.statusItem.Body = bodyToSave;
                    } catch (error) {
                      const errorMsg = error instanceof Error ? error.message : String(error);
                      console.log(`failed to update: ${loca} for ${girl.name}`);
                      console.log(errorMsg);
                    }
                  } else {
                    console.log("Anulowano zapis.");
                  }
                  editing = false;
                  continue;
                }

                // Process the selected field
                const field = selectedField as string;
                const currentValue = getFieldValue(currentBody, field);

                let newValue: string | null = null; // null means "leave unchanged"

                if (field === "her-first-msg" || field === "your-first-message") {
                  // Show current value
                  console.log(`\n--- Pole: ${field} ---`);
                  console.log(`current: ${currentValue || "[empty]"}`);

                  // Use clack select for options (boolean only - no date)
                  const choice = await clack.select({
                    message: 'Wybierz opcję:',
                    options: [
                      { value: 'unchanged', label: 'zostaw bez zmian' },
                      { value: 'true', label: 'true' },
                      { value: 'false', label: 'false' }
                    ],
                    initialValue: 'unchanged'
                  });

                  if (clack.isCancel(choice)) {
                    continue;
                  }

                  switch (choice) {
                    case 'true':
                      newValue = 'true';
                      break;
                    case 'false':
                      newValue = 'false';
                      break;
                    case 'unchanged':
                    default:
                      newValue = null;
                      break;
                  }
                } else if (field === "writing-deadline") {
                  // Show current value
                  console.log(`\n--- Pole: ${field} ---`);
                  console.log(`current: ${currentValue || "[empty]"}`);

                  // Use clack select for options
                  const choice = await clack.select({
                    message: 'Wybierz opcję:',
                    options: [
                      { value: 'unchanged', label: 'zostaw bez zmian' },
                      { value: 'date', label: 'wybierz datę' }
                    ],
                    initialValue: 'unchanged'
                  });

                  if (clack.isCancel(choice)) {
                    continue;
                  }

                  if (choice === 'date') {
                    // Use clack text for date input
                    const dateInput = await clack.text({
                      message: 'Podaj datę w formacie YYYY-MM-DD:',
                      placeholder: 'np. 2026-06-18'
                    });

                    if (!clack.isCancel(dateInput) && dateInput) {
                      if (!validateDateYYYYMMDD(dateInput)) {
                        console.log("Błąd: Niepoprawny format daty. Użyj formatu YYYY-MM-DD (np. 2026-06-18).");
                        continue;
                      }

                      if (isDateMoreThan10DaysAhead(dateInput)) {
                        console.log("Błąd: Data nie może być dalej niż 10 dni w przyszłość.");
                        continue;
                      }

                      newValue = dateInput;
                    }
                  } else {
                    newValue = null;
                  }
                } else if (field === "priority-today") {
                  // Direct edit - skip intermediate menu since there's only one action
                  console.log(`\n--- Pole: ${field} ---`);
                  console.log(`current: ${currentValue || "[empty]"}`);

                  const inputValue = await clack.text({
                    message: 'Podaj wartość (0-30):',
                    placeholder: currentValue || '0'
                  });

                  if (clack.isCancel(inputValue)) {
                    continue;
                  }

                  if (inputValue) {
                    const numValue = parseInt(inputValue);
                    if (isNaN(numValue) || numValue < 0 || numValue > 30) {
                      console.log("Błąd: Wartość musi być liczbą całkowitą z zakresu 0-30.");
                      continue;
                    }
                    newValue = String(numValue);
                  }
                  // Empty input means leave unchanged (newValue stays null)
                }

                // Update body if newValue is not null
                if (newValue !== null) {
                  currentBody = upsertYamlField(currentBody, field, newValue);
                  console.log(`Zaktualizowano ${field}: "${newValue || "[empty]"}"`);
                }
                // Loop back to the select menu (don't exit)
              }

              if (isClosed) break;
            }

            // Refresh data after updates
            console.log("\nRefreshing data...");
            const newContext = await loadStatusesContext();
            // Update the context references
            Object.assign(statusCategories, newContext.statusCategories);
            allGirlsWithStatus.length = 0;
            allGirlsWithStatus.push(...newContext.allGirlsWithStatus);
          } else if (submenuAnswer === "4") {
            // Option 4: Migration without preview
            console.log("\n--- Migration without preview ---");
            
            // Show all existing statuses (empty, outdated, valid) for migration
            const statusesToMigrate = [
              ...statusCategories.empty,
              ...statusCategories.outdated,
              ...statusCategories.valid
            ];

            if (statusesToMigrate.length === 0) {
              console.log("\nBrak statusów do migracji.");
              continue;
            }

            // Show list of statuses
            console.log("\nDostępne statusy do migracji:");
            statusesToMigrate.forEach((girl, index) => {
              const categoryLabel = girl.category === 'empty' ? '[pusty]' : 
                                    girl.category === 'outdated' ? '[nieaktualny]' : '[ważny]';
              console.log(`  ${index + 1}. ${girl.id}. ${girl.name} ${categoryLabel}`);
            });
            console.log("0. Wróć");

            // Ask for selection
            let selectionInput: string;
            try {
              selectionInput = (await rl.question("\nKtóre statusy migrować? Wpisz numer, zakres albo all: ")).trim();
            } catch (error) {
              console.log();
              continue;
            }

            if (selectionInput === "0") {
              continue;
            }

            const selectedIndices = parseSelection(selectionInput, statusesToMigrate.length);
            
            if (selectedIndices.length === 0) {
              console.log("\nNieprawidłowy wybór lub anulowano.");
              continue;
            }

            console.log(`\nWybrano ${selectedIndices.length} statusów do migracji:`);
            selectedIndices.forEach(idx => {
              const girl = statusesToMigrate[idx];
              console.log(`  ${girl.id}. ${girl.name}`);
            });

            // Ask for confirmation
            let confirmAnswer: string;
            try {
              confirmAnswer = (await rl.question("\nCzy na pewno migrować wybrane statusy? (t/n): ")).trim();
            } catch (error) {
              console.log();
              continue;
            }

            if (!isPositiveResponse(confirmAnswer)) {
              continue;
            }

            // Counters for summary
            let migratedCount = 0;
            let skippedCount = 0;
            let failedCount = 0;

            // Process each selected status
            for (const idx of selectedIndices) {
              const girl = statusesToMigrate[idx];
              
              if (!girl.statusAddress || !girl.statusItem) {
                console.log(`\nPominięto: ${girl.name} - brak adresu statusu`);
                skippedCount++;
                continue;
              }

              // Get loca from address using shared function
              let loca = getStatusLoca(girl.statusAddress);
              if (!loca) {
                console.log(`\nPominięto: ${girl.name} - nieprawidłowy adres`);
                skippedCount++;
                continue;
              }

              // Get current body
              const currentBody = typeof girl.statusItem.Body === "string" ? girl.statusItem.Body : "";

              // Use shared migration function
              const migratedBody = buildMigratedStatusBody(currentBody);

              // Save
              try {
                await putStatusContent(loca, migratedBody);
                console.log(`zmigrowano: ${loca}; ${girl.name}`);
                
                // Update the cached status item
                girl.statusItem.Body = migratedBody;
                migratedCount++;
              } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.log(`failed to migrate: ${loca} for ${girl.name}`);
                console.log(errorMsg);
                failedCount++;
              }
            }

            // Show summary
            console.log("\n==============================");
            console.log("Podsumowanie migracji:");
            console.log(`  zmigrowano: ${migratedCount}`);
            console.log(`  pominięto: ${skippedCount}`);
            console.log(`  nieudane: ${failedCount}`);
            console.log("==============================");

            // Refresh data after updates
            console.log("\nRefreshing data...");
            const newContext = await loadStatusesContext();
            // Update the context references
            Object.assign(statusCategories, newContext.statusCategories);
            allGirlsWithStatus.length = 0;
            allGirlsWithStatus.push(...newContext.allGirlsWithStatus);
          } else if (submenuAnswer === "5") {
            // Option 5: Migration with preview (details)
            console.log("\n--- Migration with preview (details) ---");
            
            // Show all existing statuses for selection
            const statusesToMigrate = [
              ...statusCategories.empty,
              ...statusCategories.outdated,
              ...statusCategories.valid
            ];

            if (statusesToMigrate.length === 0) {
              console.log("\nBrak statusów do migracji.");
              continue;
            }

            // Show list of statuses
            console.log("\nDostępne statusy do migracji:");
            statusesToMigrate.forEach((girl, index) => {
              const categoryLabel = girl.category === 'empty' ? '[pusty]' : 
                                    girl.category === 'outdated' ? '[nieaktualny]' : '[ważny]';
              console.log(`  ${index + 1}. ${girl.id}. ${girl.name} ${categoryLabel}`);
            });
            console.log("0. Wróć");

            // Ask for selection
            let selectionInput: string;
            try {
              selectionInput = (await rl.question("\nKtóre statusy migrować? Wpisz numer, zakres, all lub 0: ")).trim();
            } catch (error) {
              console.log();
              continue;
            }

            if (selectionInput === "0") {
              continue;
            }

            const selectedIndices = parseSelection(selectionInput, statusesToMigrate.length);
            
            if (selectedIndices.length === 0) {
              console.log("\nNieprawidłowy wybór lub anulowano.");
              continue;
            }

            console.log(`\nWybrano ${selectedIndices.length} statusów do migracji:`);
            selectedIndices.forEach(idx => {
              const girl = statusesToMigrate[idx];
              console.log(`  ${girl.id}. ${girl.name}`);
            });

            // Counters for summary
            let migratedCount = 0;
            let skippedCount = 0;
            let failedCount = 0;

            // Process each selected status with surgical migration
            for (const idx of selectedIndices) {
              const girl = statusesToMigrate[idx];
              
              if (!girl.statusAddress || !girl.statusItem) {
                console.log(`\nPominięto: ${girl.name} - brak adresu statusu`);
                skippedCount++;
                continue;
              }

              // Get loca from address using shared function
              let loca = getStatusLoca(girl.statusAddress);
              if (!loca) {
                console.log(`\nPominięto: ${girl.name} - nieprawidłowy adres`);
                skippedCount++;
                continue;
              }

              // Get current body
              const currentBody = typeof girl.statusItem.Body === "string" ? girl.statusItem.Body : "";
              const originalBody = currentBody;

              // Use shared migration function
              const migratedBody = buildMigratedStatusBody(currentBody);

              // Show Before/After preview
              console.log("\n==============================");
              console.log(`Migracja statusu: ${loca}; ${girl.name}`);
              console.log("==============================\n");
              
              console.log("Before:");
              console.log(originalBody || "[empty]");
              console.log("\nAfter:");
              console.log(migratedBody);

              // Ask for confirmation
              let confirmAnswer: string;
              try {
                confirmAnswer = (await rl.question("\nZapisać? (t/n): ")).trim();
              } catch (error) {
                console.log();
                continue;
              }

              if (!isPositiveResponse(confirmAnswer)) {
                console.log("Pominięto.");
                skippedCount++;
                continue;
              }

              // Save the migrated body
              try {
                await putStatusContent(loca, migratedBody);
                console.log(`zmigrowano: ${loca}; ${girl.name}`);
                
                // Update the cached status item
                girl.statusItem.Body = migratedBody;
                migratedCount++;
              } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.log(`failed to migrate: ${loca} for ${girl.name}`);
                console.log(errorMsg);
                failedCount++;
              }
            }

            // Show summary
            console.log("\n==============================");
            console.log("Podsumowanie migracji:");
            console.log(`  zmigrowano: ${migratedCount}`);
            console.log(`  pominięto: ${skippedCount}`);
            console.log(`  nieudane: ${failedCount}`);
            console.log("==============================");

            // Refresh data after updates
            console.log("\nRefreshing data...");
            const newContext = await loadStatusesContext();
            // Update the context references
            Object.assign(statusCategories, newContext.statusCategories);
            allGirlsWithStatus.length = 0;
            allGirlsWithStatus.push(...newContext.allGirlsWithStatus);
          } else {
            console.log("\nNieznana komenda. Wybierz 1, 2, 3, 4, 5 lub 0.");
          }
        }
      } catch (error) {
        console.error(
          "Error:",
          error instanceof Error ? error.message : error
        );
      }
      console.log(); // Empty line for readability
    } else if (answer === "4" || answer === "statusesupdate") {
      // Option 4: Statuses Update - works on ALL leads (merged with statuses)
      try {
        console.log("\n--- Statuses Update ---");
        console.log("Loading all leads and merging with statuses...\n");

        // Load statuses context (fetches all leads and statuses)
        const context = await loadStatusesContext();
        const { girlsMap, statusCategories, allGirlsWithStatus } = context;

        // Show diagnostic info
        console.log(`Loaded leads: ${context.allLeadsCount}`);
        console.log(`Loaded statuses: ${context.statusesCount}`);
        console.log(`Merged leads: ${context.allLeadsCount}`);
        
        // Count categories for diagnostics
        const missingCount = statusCategories.missing.length;
        const emptyCount = statusCategories.empty.length;
        const outdatedCount = statusCategories.outdated.length;
        const validCount = statusCategories.valid.length;
        console.log(`Missing status: ${missingCount}`);
        console.log(`Empty status: ${emptyCount}`);
        console.log(`Outdated status: ${outdatedCount}`);
        console.log(`Valid status: ${validCount}`);
        console.log();

        /**
         * Extracts date from lead name for sorting.
         * Format: YY-MM-DD_name (e.g., "26-05-30_pn_Roksana")
         * Returns a comparable string in YYYY-MM-DD format.
         */
        function extractDateFromName(name: string): string {
          const match = name.match(/^(\d{2})-(\d{2})-(\d{2})_/);
          if (match) {
            const yy = parseInt(match[1]);
            const mm = match[2];
            const dd = match[3];
            // Assume 20xx century for years
            const year = 2000 + yy;
            return `${year}-${mm}-${dd}`;
          }
          // If no date found, return empty string (will be sorted first)
          return "";
        }

        // Build merged list of ALL leads (including those without statuses)
        // Sort by date from name (oldest first, newest last)
        const allLeads: GirlStatusInfo[] = [];
        girlsMap.forEach((name, girlId) => {
          const statusData = statusCategories.missing.find(g => g.id === girlId) ||
                            statusCategories.empty.find(g => g.id === girlId) ||
                            statusCategories.outdated.find(g => g.id === girlId) ||
                            statusCategories.valid.find(g => g.id === girlId);
          if (statusData) {
            allLeads.push(statusData);
          } else {
            // This shouldn't happen, but just in case
            allLeads.push({ id: girlId, name, category: "missing" });
          }
        });
        
        // Sort by date extracted from name (oldest at top, newest at bottom)
        allLeads.sort((a, b) => {
          const dateA = extractDateFromName(a.name);
          const dateB = extractDateFromName(b.name);
          return dateA.localeCompare(dateB);
        });

        // Show all leads
        console.log("\nAll leads (sorted by date - oldest first):");
        allLeads.forEach((girl, index) => {
          const categoryLabel = girl.category === 'missing' ? '[brak statusu]' :
                                girl.category === 'empty' ? '[pusty]' :
                                girl.category === 'outdated' ? '[nieaktualny]' : '[ważny]';
          console.log(`  ${index + 1}. ${girl.id}. ${girl.name} ${categoryLabel}`);
        });

        // Ask for range selection
        console.log("\nKtóry zakres leadów pokazać?");
        console.log("  all       - wszystkie");
        console.log("  1,4,5     - konkretne pozycje");
        console.log("  1-10      - zakres");
        console.log("  -10       - ostatnie 10 najnowszych");
        
        let selectionInput: string;
        try {
          selectionInput = (await rl.question("\nZakres: ")).trim();
        } catch (error) {
          console.log();
          continue;
        }

        // Parse range including negative indices for "last N"
        let selectedIndices: number[];
        const trimmed = selectionInput.trim().toLowerCase();
        
        if (trimmed === 'all') {
          selectedIndices = Array.from({ length: allLeads.length }, (_, i) => i);
        } else if (trimmed.startsWith('-')) {
          // Negative range: -N means last N items
          const count = parseInt(trimmed.substring(1));
          if (!isNaN(count) && count > 0) {
            const start = Math.max(0, allLeads.length - count);
            selectedIndices = Array.from({ length: Math.min(count, allLeads.length) }, (_, i) => start + i);
          } else {
            selectedIndices = [];
          }
        } else {
          selectedIndices = parseSelection(selectionInput, allLeads.length);
        }
        
        if (selectedIndices.length === 0) {
          console.log("\nNieprawidłowy wybór lub anulowano.");
          continue;
        }

        console.log(`\nWybrano ${selectedIndices.length} leadów do edycji:`);
        selectedIndices.forEach(idx => {
          const girl = allLeads[idx];
          const categoryLabel = girl.category === 'missing' ? '[brak statusu]' :
                                girl.category === 'empty' ? '[pusty]' :
                                girl.category === 'outdated' ? '[nieaktualny]' : '[ważny]';
          console.log(`  ${girl.id}. ${girl.name} ${categoryLabel}`);
        });

        // Interactive picker loop - keep showing until user exits
        let pickerIndices = [...selectedIndices];
        let inPicker = true;

        while (inPicker && !isClosed) {
          // Build options for clack select
          const pickerOptions = pickerIndices.map((idx, listIdx) => {
            const girl = allLeads[idx];
            const categoryLabel = girl.category === 'missing' ? '[brak statusu]' :
                                  girl.category === 'empty' ? '[pusty]' :
                                  girl.category === 'outdated' ? '[nieaktualny]' : '[ważny]';
            return {
              value: idx.toString(),
              label: `${girl.id}. ${girl.name} ${categoryLabel}`
            };
          });
          
          // Add back option
          pickerOptions.push({ value: '__back__', label: '0. Wróć' });

          // Show interactive picker with clack - default to last real lead (not back option)
          const selectedValue = await clack.select({
            message: 'Wybierz leada do edycji:',
            options: pickerOptions,
            initialValue: pickerIndices.length > 0 ? pickerIndices[pickerIndices.length - 1].toString() : undefined
          });

          if (clack.isCancel(selectedValue)) {
            console.log('Anulowano.');
            break;
          }

          if (selectedValue === '__back__') {
            inPicker = false;
            continue;
          }

          const girlIdx = parseInt(selectedValue);
          const girl = allLeads[girlIdx];

          // Handle editing this lead
          if (girl.category === 'missing') {
            // Ask if user wants to create status
            const createConfirm = await clack.confirm({
              message: 'Status nie istnieje. Utworzyć teraz? (t/n)'
            });

            if (clack.isCancel(createConfirm) || !createConfirm) {
              console.log('Pominięto.');
              continue;
            }

            // Create new status for this lead
            console.log(`\nTworzenie statusu dla: ${girl.id}. ${girl.name}`);
            // Get the full leads base loca (e.g., "03/06") and append girl's id
            // IMPORTANT: Never use partial loca like "06/89" - must use full path "03/06/89"
            const leadsBaseLoca = await chad_GetLeadsLoca();
            const girlLoca = `${leadsBaseLoca}/${girl.id}`;

            try {
              // Diagnostic logging before PostParentItem
              console.log(`[DEBUG] PostParentItem: repo=${SHARED_REPO_ID}, loca=${girlLoca}, type=Text, name=status`);

              // Validate loca has expected structure (at least 3 segments: "XX/YY/girlId")
              const locaSegments = girlLoca.split('/');
              if (locaSegments.length < 3) {
                throw new Error(`Invalid loca "${girlLoca}": expected at least 3 segments (e.g., "03/06/89"), got ${locaSegments.length}. Never truncate loca!`);
              }

              // Step 1: POST to create the status item
              const postResult = await createStatusForLead(girlLoca);

              // Step 2: Get the new item's address from the response
              const newAddress = postResult?.Settings?.address || "";
              if (!newAddress) {
                throw new Error("No address in POST response");
              }

              // Step 3: Strip repo GUID prefix to get the numeric loca
              // The address is like "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/89/03"
              // We need just "03/06/89/03" for putStatusContent
              const newLoca = stripRepoPrefix(newAddress);

              // Step 4: PUT to initialize with YAML content
              await putStatusContent(newLoca, STATUS_YAML_TEMPLATE);

              console.log(`created + initialized: ${newLoca} for ${girl.name}`);

              // Update the girl's category and data
              girl.category = 'valid';
              girl.statusAddress = newAddress;
              girl.statusItem = postResult;
              girl.statusItem.Body = STATUS_YAML_TEMPLATE;
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              console.log(`failed: ${girlLoca}/status for ${girl.name}`);
              console.log(errorMsg);
              continue;
            }
          }

          // Now edit the status (if it exists now)
          if (girl.statusAddress && girl.statusItem) {
              // Get loca from address - strip repo GUID prefix
              // Address format: "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/89/03"
              // We need just "03/06/89/03" for putStatusContent
              let loca = stripRepoPrefix(girl.statusAddress);

              // Get current body and ensure all required fields exist
              let currentBody = typeof girl.statusItem.Body === "string" ? girl.statusItem.Body : "";
              currentBody = ensureRequiredStatusFields(currentBody);

              // Store original body for before/after comparison
              const originalBody = currentBody;

              // Show "Edycja statusu:" header
              console.log("\n==============================");
              console.log(`Edycja statusu: ${girl.id}. ${girl.name}`);
              console.log("==============================\n");

              // Main editing loop
              let editing = true;
              while (editing && !isClosed) {
                // Build select options showing current values and old values
                const selectOptions: { value: string; label: string }[] = [];

                for (const field of STATUS_REQUIRED_FIELDS) {
                  const currentValue = (() => {
                    const parsed = parseStatusBody(currentBody);
                    const value = parsed[field] || "";
                    return value === "" ? "[empty]" : value;
                  })();
                  const originalValue = (() => {
                    const parsed = parseStatusBody(originalBody);
                    const value = parsed[field] || "";
                    return value === "" ? "[empty]" : value;
                  })();
                  selectOptions.push({
                    value: field,
                    label: `${field}: ${currentValue} (old: ${originalValue})`
                  });
                }

                // Add exit options
                selectOptions.push(
                  { value: '__exit_save__', label: 'exit and save' },
                  { value: '__exit_nosave__', label: 'exit without save' }
                );

                // Show single select for field selection using clack
                const selectedField = await clack.select({
                  message: 'Co chcesz zmienić?',
                  options: selectOptions,
                  initialValue: STATUS_REQUIRED_FIELDS[0]
                });

                if (clack.isCancel(selectedField)) {
                  console.log('Anulowano.');
                  break;
                }

                // Handle exit options
                if (selectedField === '__exit_save__' || selectedField === '__exit_nosave__') {
                  if (selectedField === '__exit_save__') {
                    // Validate required fields before saving
                    let bodyToSave = currentBody;
                    const defaults: Record<string, string> = {
                      "her-first-msg": "false",
                      "your-first-message": "false",
                      "writing-deadline": "2099-01-01",
                      "priority-today": "0"
                    };
                    for (const [field, defaultValue] of Object.entries(defaults)) {
                      const parsed = parseStatusBody(bodyToSave);
                      const currentValue = parsed[field] || "";
                      if (currentValue === "") {
                        bodyToSave = upsertYamlField(bodyToSave, field, defaultValue);
                      }
                    }

                    // Show preview
                    console.log("\n==============================");
                    console.log(`Podgląd zmian: ${girl.id}. ${girl.name}`);
                    console.log("==============================");
                    console.log("\nBefore:");
                    console.log(originalBody || "[empty]");
                    console.log("\nAfter:");
                    console.log(bodyToSave || "[empty]");

                    // No confirmation needed - user already chose "exit and save"
                    try {
                      await putStatusContent(loca, bodyToSave);
                      console.log(`\nupdated: ${loca}; ${girl.name}`);
                      
                      // Update the cached status item
                      girl.statusItem.Body = bodyToSave;
                      // Re-classify
                      girl.category = classifyStatus(bodyToSave);
                    } catch (error) {
                      const errorMsg = error instanceof Error ? error.message : String(error);
                      console.log(`failed to update: ${loca} for ${girl.name}`);
                      console.log(errorMsg);
                    }
                  } else {
                    console.log("Anulowano zapis.");
                  }
                  editing = false;
                  continue;
                }

                // Process the selected field
                const field = selectedField as string;
                const currentValue = (() => {
                  const parsed = parseStatusBody(currentBody);
                  return parsed[field] || "";
                })();

                let newValue: string | null = null;

                if (field === "her-first-msg" || field === "your-first-message") {
                  console.log(`\n--- Pole: ${field} ---`);
                  console.log(`current: ${currentValue || "[empty]"}`);

                  const choice = await clack.select({
                    message: 'Wybierz opcję:',
                    options: [
                      { value: 'unchanged', label: 'zostaw bez zmian' },
                      { value: 'true', label: 'true' },
                      { value: 'false', label: 'false' }
                    ],
                    initialValue: 'unchanged'
                  });

                  if (clack.isCancel(choice)) {
                    continue;
                  }

                  switch (choice) {
                    case 'true':
                      newValue = 'true';
                      break;
                    case 'false':
                      newValue = 'false';
                      break;
                    case 'unchanged':
                    default:
                      newValue = null;
                      break;
                  }
                } else if (field === "writing-deadline") {
                  console.log(`\n--- Pole: ${field} ---`);
                  console.log(`current: ${currentValue || "[empty]"}`);

                  const choice = await clack.select({
                    message: 'Wybierz opcję:',
                    options: [
                      { value: 'unchanged', label: 'zostaw bez zmian' },
                      { value: 'date', label: 'wybierz datę' }
                    ],
                    initialValue: 'unchanged'
                  });

                  if (clack.isCancel(choice)) {
                    continue;
                  }

                  if (choice === 'date') {
                    const dateInput = await clack.text({
                      message: 'Podaj datę w formacie YYYY-MM-DD:',
                      placeholder: 'np. 2026-06-18'
                    });

                    if (!clack.isCancel(dateInput) && dateInput) {
                      if (!validateDateYYYYMMDD(dateInput)) {
                        console.log("Błąd: Niepoprawny format daty. Użyj formatu YYYY-MM-DD (np. 2026-06-18).");
                        continue;
                      }

                      if (isDateMoreThan10DaysAhead(dateInput)) {
                        console.log("Błąd: Data nie może być dalej niż 10 dni w przyszłość.");
                        continue;
                      }

                      newValue = dateInput;
                    }
                  } else {
                    newValue = null;
                  }
                } else if (field === "priority-today") {
                  // Direct edit - skip intermediate menu since there's only one action
                  console.log(`\n--- Pole: ${field} ---`);
                  console.log(`current: ${currentValue || "[empty]"}`);

                  const inputValue = await clack.text({
                    message: 'Podaj wartość (0-30):',
                    placeholder: currentValue || '0'
                  });

                  if (clack.isCancel(inputValue)) {
                    continue;
                  }

                  if (inputValue) {
                    const numValue = parseInt(inputValue);
                    if (isNaN(numValue) || numValue < 0 || numValue > 30) {
                      console.log("Błąd: Wartość musi być liczbą całkowitą z zakresu 0-30.");
                      continue;
                    }
                    newValue = String(numValue);
                  }
                  // Empty input means leave unchanged (newValue stays null)
                }

                // Update body if newValue is not null
                if (newValue !== null) {
                  currentBody = upsertYamlField(currentBody, field, newValue);
                  console.log(`Zaktualizowano ${field}: "${newValue || "[empty]"}"`);
                }
                // Loop back to the select menu
              }

              if (isClosed) break;
            }
          }

          // Refresh data after all updates
        console.log("\nRefreshing data...");
    } catch (error) {
        console.error(
          "Error:",
          error instanceof Error ? error.message : error
        );
      }
      console.log(); // Empty line for readability

      // After clack operations, we need to ensure the process stays alive
      // clack may have called process.stdin.unref() which allows the process to exit
      // even when there's pending I/O. We need to ref() it to keep the process running.
      if (typeof process.stdin.ref === 'function') {
        process.stdin.ref();
      }
      
      // Also resume stdin if clack paused it
      if (typeof process.stdin.resume === 'function') {
        process.stdin.resume();
      }

      // Re-create readline if it was closed by clack
      if (isClosed) {
        isClosed = false;
        rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        rl.on("close", () => {
          isClosed = true;
        });
      }
    } else if (answer === "5" || answer === "filterstatuses") {
      try {
        console.log("Fetching all leads and statuses...");
        const allLeadsResponse = await GetAllLeads();
        const statusItems = await chad_GetLeadsStatuses();

        // Build leads map
        const girlsMap = new Map<string, string>();
        if (allLeadsResponse && allLeadsResponse.Body && typeof allLeadsResponse.Body === "object") {
          const body = allLeadsResponse.Body;
          Object.keys(body).forEach((key) => {
            girlsMap.set(key, body[key]);
          });
        }

        // Build status map: girlId -> { address, body }
        interface StatusEntry {
          girlId: string;
          girlName: string;
          address: string;
          body: string;
          fields: Map<string, string>;
        }

        const statusEntries: StatusEntry[] = [];
        let skippedCount = 0;

        // Get leads base loca to correctly extract girlId from status addresses
        // Address format: "{repoGuid}/{leadsBaseLoca}/{girlId}/{statusItemNum}"
        // e.g.: "21d11bdc-.../03/06/89/03" where leadsBaseLoca="03/06", girlId="89"
        const leadsBaseLocaForFilter = await chad_GetLeadsLoca();

        if (Array.isArray(statusItems)) {
          for (const item of statusItems) {
            const address = item?.Settings?.address || "";
            if (!address) continue;

            // Strip repo GUID prefix to get numeric loca
            const numericLoca = stripRepoPrefix(address);

            // Extract girlId: strip leadsBaseLoca prefix, then take first segment
            let girlId: string | null = null;
            if (numericLoca.startsWith(leadsBaseLocaForFilter + "/")) {
              const relativeLoca = numericLoca.substring(leadsBaseLocaForFilter.length + 1);
              const segments = relativeLoca.split("/");
              if (segments.length >= 1) {
                girlId = segments[0];
              }
            }

            if (!girlId) continue;

            const girlName = girlsMap.get(girlId) || `[unknown: ${girlId}]`;
            const body = typeof item?.Body === "string" ? item.Body : "";

            // Skip empty bodies or bodies without required fields
            if (!body || body.trim() === "") {
              skippedCount++;
              continue;
            }

            // Parse fields from body
            const fields = new Map<string, string>();
            const lines = body.split('\n');
            for (const line of lines) {
              const match = line.match(/^([\w-]+)\s*:\s*(.*)/);
              if (match) {
                fields.set(match[1], match[2].trim());
              }
            }

            // Check if has at least some required fields (not completely invalid)
            const requiredFields = ["her-first-msg", "your-first-message", "writing-deadline", "priority-today"];
            const hasAnyRequiredField = requiredFields.some(f => fields.has(f));

            if (!hasAnyRequiredField) {
              skippedCount++;
              continue;
            }

            statusEntries.push({
              girlId,
              girlName,
              address,
              body,
              fields
            });
          }
        }

        // Sort by girlId numerically
        statusEntries.sort((a, b) => parseInt(a.girlId) - parseInt(b.girlId));

        // Filter submenu
        let inFilterMenu = true;
        while (inFilterMenu && !isClosed) {
          console.log("\n--- FilterStatuses ---");
          console.log("1. Neither wrote first (her-first-msg == false && your-first-message == false)");
          console.log("2. She wrote, I did not (her-first-msg == true && your-first-message == false)");
          console.log("3. Priority today 1 (priority-today == 1)");
          console.log("4. Custom exact filter");
          console.log("0. Wróć");

          let filterAnswer: string;
          try {
            filterAnswer = (await rl.question("Wybierz filtr: ")).trim();
          } catch (error) {
            console.log();
            break;
          }

          if (filterAnswer === "0") {
            inFilterMenu = false;
            continue;
          }

          let filteredEntries: StatusEntry[] = [];

          switch (filterAnswer) {
            case "1":
              // Neither wrote first
              filteredEntries = statusEntries.filter(entry => {
                const herMsg = entry.fields.get("her-first-msg");
                const yourMsg = entry.fields.get("your-first-message");
                return herMsg === "false" && yourMsg === "false";
              });
              console.log(`\nFiltr: Ani ona, ani ja nie napisaliśmy (${filteredEntries.length} wyników)`);
              break;

            case "2":
              // She wrote, I did not
              filteredEntries = statusEntries.filter(entry => {
                const herMsg = entry.fields.get("her-first-msg");
                const yourMsg = entry.fields.get("your-first-message");
                return herMsg === "true" && yourMsg === "false";
              });
              console.log(`\nFiltr: Ona napisała, ja nie (${filteredEntries.length} wyników)`);
              break;

            case "3":
              // Priority today 1
              filteredEntries = statusEntries.filter(entry => {
                const priority = entry.fields.get("priority-today");
                return priority === "1";
              });
              console.log(`\nFiltr: Priorytet dzisiaj = 1 (${filteredEntries.length} wyników)`);
              break;

            case "4": {
              // Custom exact filter
              try {
                const fieldName = (await rl.question("Podaj nazwę pola: ")).trim();
                const expectedValue = (await rl.question("Podaj oczekiwaną wartość: ")).trim();

                filteredEntries = statusEntries.filter(entry => {
                  const value = entry.fields.get(fieldName);
                  return value === expectedValue;
                });
                console.log(`\nFiltr: ${fieldName} == ${expectedValue} (${filteredEntries.length} wyników)`);
              } catch (error) {
                console.log("Błąd podczas pobierania danych filtra.");
                continue;
              }
              break;
            }

            default:
              console.log("\nNieznana opcja. Wybierz 1-4 lub 0.");
              continue;
          }

          // Display results
          if (filteredEntries.length === 0) {
            console.log("\nBrak wyników spełniających kryteria.");
          } else {
            console.log("\n==============================");
            console.log("Wyniki:");
            console.log("==============================\n");
            for (const entry of filteredEntries) {
              // Extract loca from address (girls/06/XX/YY -> 06/XX/YY)
              const locaParts = entry.address.split("/");
              const loca = locaParts.length >= 3 ? locaParts.slice(1).join("/") : entry.address;
              console.log(`${loca}; ${entry.girlName}`);

              // Print all fields
              const requiredFields = ["her-first-msg", "your-first-message", "writing-deadline", "priority-today"];
              for (const field of requiredFields) {
                const value = entry.fields.get(field);
                console.log(`  ${field}: ${value !== undefined ? value : "(brak)"}`);
              }
              console.log();
            }
          }

          // Show skipped count if any
          if (skippedCount > 0) {
            console.log(`Skipped invalid/empty statuses: ${skippedCount}`);
          }
        }
      } catch (error) {
        console.error(
          "Error:",
          error instanceof Error ? error.message : error
        );
      }
      console.log(); // Empty line for readability
    } else if (answer === "6" || answer === "askopenai") {
      try {
        await askOpenAiAboutGirlFlow();
      } catch (error) {
        console.error(
          "Error:",
          error instanceof Error ? error.message : error
        );
      }
      console.log(); // Empty line for readability

      // After clack operations, we need to ensure the process stays alive
      // clack may have called process.stdin.unref() which allows the process to exit
      // even when there's pending I/O. We need to ref() it to keep the process running.
      if (typeof process.stdin.ref === 'function') {
        process.stdin.ref();
      }
      
      // Also resume stdin if clack paused it
      if (typeof process.stdin.resume === 'function') {
        process.stdin.resume();
      }

      // Re-create readline if it was closed by clack
      if (isClosed) {
        isClosed = false;
        rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        rl.on("close", () => {
          isClosed = true;
        });
      }
    } else {
      console.log("Unknown command. Use 1 for PrintAllLeads, 2 for Find Todo, 3 for Statuses Setup, 4 for Statuses Update, 5 for FilterStatuses, 6 for Ask OpenAI about girl, or 0 for Exit.\n");
    }
  }

  rl.close();
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});