/**
 * Data providers for OpenAI prompt data.
 * These functions fetch real data from the Content Provider API.
 */

import { chad_FindConversationByLeadName, chad_FindReportsByLeadName, type ReportResult } from "dba";

/**
 * Result of fetching data for a girl
 */
export interface GirlData {
  name: string;
  reports: ReportResult[];
  conversation: string | null;
  conversationLoca: string | null;
  conversationChannel: string | null;
  conversationError?: string;
}

/**
 * Gets the beeper conversation for a specific girl from the Content Provider.
 * Uses the proper beeper traversal algorithm to find conversations.
 * 
 * @param girlName - The name of the girl (e.g., "26-05-30_pn_Olia")
 * @returns The conversation body as a string, or null if not found
 */
export async function getConversationBody(girlName: string): Promise<{ body: string | null; channel: string | null; error?: string }> {
  const result = await chad_FindConversationByLeadName(girlName);
  
  return {
    body: result.body,
    channel: result.channel,
    error: result.error,
  };
}

/**
 * Gets reports for a specific girl from the Content Provider.
 * Uses FindRecursively to search through report categories.
 * 
 * @param girlName - The name of the girl (e.g., "26-05-30_pn_Olia")
 * @returns Array of report results
 */
export async function getReports(girlName: string): Promise<ReportResult[]> {
  return await chad_FindReportsByLeadName(girlName);
}

/**
 * Gets all data for a specific girl (report and conversation).
 * 
 * @param girlName - The name of the girl (e.g., "26-05-30_pn_Olia")
 * @returns Object containing all data for the girl
 */
export async function getGirlData(girlName: string): Promise<GirlData> {
  const [conversationResult, reports] = await Promise.all([
    getConversationBody(girlName),
    getReports(girlName),
  ]);

  return {
    name: girlName,
    reports,
    conversation: conversationResult.body,
    conversationLoca: conversationResult.body ? `beeper/${girlName}` : null,
    conversationChannel: conversationResult.channel,
    conversationError: conversationResult.error,
  };
}

/**
 * Gets the first N lines of a text (for preview purposes).
 * 
 * @param text - The text to truncate
 * @param maxLines - Maximum number of lines to return (default: 30)
 * @returns The truncated text
 */
export function getPreviewLines(text: string, maxLines: number = 30): string {
  if (!text) return "";
  
  const lines = text.split(/\r?\n/);
  if (lines.length <= maxLines) {
    return text;
  }
  
  return lines.slice(0, maxLines).join("\n") + `\n... [${lines.length - maxLines} more lines]`;
}
