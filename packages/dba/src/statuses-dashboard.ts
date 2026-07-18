/**
 * Statuses Dashboard Service
 * 
 * Provides functions for the dashboard to display and manage lead statuses.
 * All business logic for statuses is encapsulated here.
 * 
 * The dashboard calls these functions through API routes (thin wrapper pattern).
 */

import { parseStatusBody, hasField } from "./leads.js";
import { resolveByNames, getChildrenOf, createOrGetChild, putItemBody } from "./item-ops.js";
import { addressToRepoAndLoca, type CpItem } from "./cp-model.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Status category classification
 */
export type StatusCategory = "missing" | "empty" | "valid" | "outdated";

/**
 * Status fields with their default values
 */
export interface StatusFields {
  city: string;
  "only-friends": boolean;
  "her-first-msg": boolean;
  "your-first-message": boolean;
  "writing-deadline": string;
  "priority-today": number;
}

/**
 * Default status values
 */
export const DEFAULT_STATUS: StatusFields = {
  city: "",
  "only-friends": false,
  "her-first-msg": false,
  "your-first-message": false,
  "writing-deadline": "2099-01-01",
  "priority-today": 0,
};

/**
 * Lead item for the dashboard list
 */
export interface StatusLeadItem {
  leadKey: string;
  leadName: string;
  leadLoca?: string;
  statusCategory: StatusCategory;
  statusLoca?: string;
  statusBody?: string;
}

/**
 * Data for the status editor
 */
export interface StatusEditorData {
  leadKey: string;
  leadName: string;
  leadLoca: string;
  statusLoca: string;
  statusBody: string;
  statusCategory: StatusCategory;
}

// =============================================================================
// Status Classification
// =============================================================================

/**
 * Standard required fields for a valid status
 */
const REQUIRED_FIELDS = [
  "city",
  "only-friends",
  "her-first-msg",
  "your-first-message",
  "writing-deadline",
  "priority-today",
];

/**
 * Fields that cannot be empty (must have a value)
 */
const NON_EMPTY_FIELDS = [
  "only-friends",
  "her-first-msg",
  "your-first-message",
  "writing-deadline",
  "priority-today",
];

/**
 * Old field names that need migration
 */
const OLD_FIELD_NAMES: Record<string, string> = {
  "her-fist-msg": "her-first-msg",
  "your-fist-message": "your-first-message",
  "writing deadline": "writing-deadline",
};

/**
 * Classifies a status based on its body content.
 * 
 * @param body The status body content (can be empty or undefined)
 * @returns The status category
 */
export function classifyStatus(body: string | null | undefined): StatusCategory {
  if (!body || body.trim() === "") {
    return "empty";
  }

  const parsed = parseStatusBody(body);

  // Check if all required fields are present
  for (const field of REQUIRED_FIELDS) {
    if (!hasField(body, field) && !OLD_FIELD_NAMES[field]) {
      return "outdated";
    }
  }

  // Check if non-empty fields have values
  for (const field of NON_EMPTY_FIELDS) {
    const value = parsed[field];
    if (value === undefined || value === "") {
      return "outdated";
    }
  }

  return "valid";
}

/**
 * Migrates old field names to new field names in the status body.
 * 
 * @param body The original status body
 * @returns The migrated status body
 */
export function migrateStatusFields(body: string): string {
  let result = body;
  
  for (const [oldName, newName] of Object.entries(OLD_FIELD_NAMES)) {
    const oldPattern = new RegExp(`^${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, "m");
    result = result.replace(oldPattern, `${newName}:`);
  }
  
  return result;
}

/**
 * Creates a default status body with all fields initialized to defaults.
 * 
 * @returns The default status body as YAML string
 */
export function createDefaultStatusBody(): string {
  return [
    `city:`,
    `only-friends: ${DEFAULT_STATUS["only-friends"]}`,
    `her-first-msg: ${DEFAULT_STATUS["her-first-msg"]}`,
    `your-first-message: ${DEFAULT_STATUS["your-first-message"]}`,
    `writing-deadline: ${DEFAULT_STATUS["writing-deadline"]}`,
    `priority-today: ${DEFAULT_STATUS["priority-today"]}`,
  ].join("\n");
}

/**
 * Parses status body into StatusFields object.
 * 
 * @param body The status body content
 * @returns Parsed status fields with defaults applied
 */
export function parseStatusFields(body: string): StatusFields {
  const parsed = parseStatusBody(body);
  
  const result: StatusFields = { ...DEFAULT_STATUS };
  
  if (parsed.city !== undefined) {
    result.city = parsed.city;
  }
  
  if (parsed["only-friends"] !== undefined) {
    result["only-friends"] = parsed["only-friends"] === "true";
  }
  
  if (parsed["her-first-msg"] !== undefined) {
    result["her-first-msg"] = parsed["her-first-msg"] === "true";
  }
  
  if (parsed["your-first-message"] !== undefined) {
    result["your-first-message"] = parsed["your-first-message"] === "true";
  }
  
  if (parsed["writing-deadline"] !== undefined) {
    result["writing-deadline"] = parsed["writing-deadline"];
  }
  
  if (parsed["priority-today"] !== undefined) {
    result["priority-today"] = parseInt(parsed["priority-today"], 10) || 0;
  }
  
  return result;
}

/**
 * Serializes StatusFields back to YAML body.
 * Preserves any additional (non-standard) fields.
 * 
 * @param fields The status fields
 * @param existingBody Optional existing body to preserve additional fields
 * @returns YAML string
 */
export function serializeStatusFields(fields: StatusFields, existingBody?: string): string {
  const lines: string[] = [
    `city: ${fields.city}`,
    `only-friends: ${fields["only-friends"]}`,
    `her-first-msg: ${fields["her-first-msg"]}`,
    `your-first-message: ${fields["your-first-message"]}`,
    `writing-deadline: ${fields["writing-deadline"]}`,
    `priority-today: ${fields["priority-today"]}`,
  ];
  
  // Preserve additional fields from existing body
  // Only process if existingBody is a non-empty string (not an object or other type)
  if (existingBody && typeof existingBody === "string" && existingBody.trim()) {
    const existingParsed = parseStatusBody(existingBody);
    for (const [key, value] of Object.entries(existingParsed)) {
      if (!REQUIRED_FIELDS.includes(key) && !OLD_FIELD_NAMES[key]) {
        lines.push(`${key}: ${value}`);
      }
    }
  }
  
  return lines.join("\n");
}

// =============================================================================
// Range Parsing
// =============================================================================

/**
 * Parses a range string and returns the selected lead indices.
 * 
 * Supported formats:
 * - "" (empty) - all leads
 * - "-10" - last 10 newest leads
 * - "1,2,8,7" - specific positions (comma-separated)
 * - "7-20" - range from 7 to 20
 * 
 * @param rangeStr The range string
 * @param totalItems Total number of items
 * @returns Array of 0-based indices
 */
export function parseRange(rangeStr: string, totalItems: number): number[] {
  if (!rangeStr || rangeStr.trim() === "") {
    return Array.from({ length: totalItems }, (_, i) => i);
  }
  
  const trimmed = rangeStr.trim();
  
  // Format: -N (last N newest)
  if (trimmed.startsWith("-")) {
    const n = parseInt(trimmed.substring(1), 10);
    if (isNaN(n) || n <= 0) return [];
    const start = Math.max(0, totalItems - n);
    return Array.from({ length: totalItems - start }, (_, i) => start + i);
  }
  
  // Format: N-M (range)
  if (trimmed.includes("-") && !trimmed.includes(",")) {
    const parts = trimmed.split("-");
    if (parts.length === 2) {
      const start = parseInt(parts[0], 10) - 1; // 1-based to 0-based
      const end = parseInt(parts[1], 10) - 1;
      if (!isNaN(start) && !isNaN(end)) {
        const result: number[] = [];
        for (let i = Math.max(0, start); i <= Math.min(totalItems - 1, end); i++) {
          result.push(i);
        }
        return result;
      }
    }
  }
  
  // Format: 1,2,8,7 (specific positions)
  if (trimmed.includes(",")) {
    return trimmed
      .split(",")
      .map(s => parseInt(s.trim(), 10) - 1) // 1-based to 0-based
      .filter(i => !isNaN(i) && i >= 0 && i < totalItems);
  }
  
  // Single number
  const idx = parseInt(trimmed, 10) - 1;
  if (!isNaN(idx) && idx >= 0 && idx < totalItems) {
    return [idx];
  }
  
  return [];
}

// =============================================================================
// Shared lead/status resolution (routes through item-ops -> DbaDataRouter;
// see provider-migration-audit.md — one universal CpItem, no per-feature
// schema, no if(mongoEnabled) here)
// =============================================================================

async function getLeadsFolder(): Promise<CpItem> {
  const folder = await resolveByNames(["leads", "all items"]);
  if (!folder) {
    throw new Error("statuses-dashboard: leads/all items folder not found");
  }
  return folder;
}

async function findLeadChild(leadsFolder: CpItem, leadKey: string): Promise<CpItem | null> {
  const children = await getChildrenOf(leadsFolder.config.address);
  return children.find((c) => c.config.address === `${leadsFolder.config.address}/${leadKey}`) ?? null;
}

/** A lead's own "status" item is always its direct child, named "status". */
async function findLeadStatus(lead: CpItem): Promise<CpItem | null> {
  const children = await getChildrenOf(lead.config.address);
  return children.find((c) => c.config.name === "status") ?? null;
}

// =============================================================================
// Dashboard List
// =============================================================================

/**
 * Gets the list of leads with their status information for the dashboard.
 *
 * This is the main function called by the dashboard API.
 * Returns leads sorted by newest first (descending by leadKey number).
 *
 * @param range Optional range filter string (e.g., "-10", "1-20", "1,2,3")
 * @returns Array of StatusLeadItem sorted newest first
 */
export async function getStatusesDashboardList(range?: string): Promise<StatusLeadItem[]> {
  const leadsFolder = await getLeadsFolder();
  const leadChildren = await getChildrenOf(leadsFolder.config.address);
  const statusChildren = await Promise.all(leadChildren.map((lead) => findLeadStatus(lead)));

  const items: StatusLeadItem[] = leadChildren.map((lead, i) => {
    const leadKey = lead.config.address.slice(leadsFolder.config.address.length + 1);
    const status = statusChildren[i];
    return {
      leadKey,
      leadName: lead.config.name,
      leadLoca: addressToRepoAndLoca(lead.config.address).loca,
      statusCategory: status ? classifyStatus(status.body) : "missing",
      statusLoca: status ? addressToRepoAndLoca(status.config.address).loca : undefined,
      statusBody: status?.body,
    };
  });

  // Sort by leadKey descending (newest first)
  items.sort((a, b) => parseInt(b.leadKey) - parseInt(a.leadKey));

  // Apply range filter if provided
  if (range) {
    const indices = parseRange(range, items.length);
    return indices.map((i) => items[i]);
  }

  return items;
}

// =============================================================================
// Status Editor
// =============================================================================

/**
 * Gets the status editor data for a specific lead.
 *
 * @param leadKey The lead's key (numeric ID)
 * @returns StatusEditorData or null if lead not found
 */
export async function getLeadStatusEditor(leadKey: string): Promise<StatusEditorData | null> {
  const leadsFolder = await getLeadsFolder();
  const lead = await findLeadChild(leadsFolder, leadKey);
  if (!lead) return null;

  const leadLoca = addressToRepoAndLoca(lead.config.address).loca;
  const status = await findLeadStatus(lead);

  return {
    leadKey,
    leadName: lead.config.name,
    leadLoca,
    statusLoca: status ? addressToRepoAndLoca(status.config.address).loca : "",
    statusBody: status?.body ?? "",
    statusCategory: status ? classifyStatus(status.body) : "missing",
  };
}

/**
 * Saves the status for a lead.
 *
 * Uses create-or-get (find-or-create by exact name "status" under the
 * lead) to ensure the status item exists, then overwrites its body. This
 * is the same POST-then-PUT pattern the previous CP-only implementation
 * used, now routed through the universal Item provider contract.
 *
 * @param leadKey The lead's key (numeric ID)
 * @param fields The status fields to save
 * @returns true on success
 */
export async function saveLeadStatus(leadKey: string, fields: StatusFields): Promise<boolean> {
  const leadsFolder = await getLeadsFolder();
  const lead = await findLeadChild(leadsFolder, leadKey);
  if (!lead) {
    throw new Error(`saveLeadStatus: lead "${leadKey}" not found`);
  }

  const statusItem = await createOrGetChild(lead, "status", "Text");
  const newBody = serializeStatusFields(fields, statusItem.body || "");
  await putItemBody(statusItem.config.address, newBody);

  return true;
}

/**
 * Creates a default status for a lead.
 *
 * @param leadKey The lead's key (numeric ID)
 * @returns true on success
 */
export async function createLeadStatus(leadKey: string): Promise<boolean> {
  const leadsFolder = await getLeadsFolder();
  const lead = await findLeadChild(leadsFolder, leadKey);
  if (!lead) {
    throw new Error(`createLeadStatus: lead "${leadKey}" not found`);
  }

  const statusItem = await createOrGetChild(lead, "status", "Text");
  await putItemBody(statusItem.config.address, createDefaultStatusBody());

  return true;
}