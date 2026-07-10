/**
 * Content Provider Client - chad-console
 * 
 * This module re-exports shared functions from chad-dba and provides
 * console-specific helper functions for Content Provider API access.
 * 
 * All requests now use the main repository GUID:
 * 21d11bdc-f1f4-44d1-b61a-3fa6b039c641
 * 
 * Data-access functions (TodoLeads, GetLeadsStatuses, createStatusForLead,
 * putStatusContent, getStatusItem) are now in chad-dba to avoid duplication
 * between chad-console and chad-dashboard.
 * 
 * Paths:
 * - leads/all items -> GetAllLeads()
 * - reports -> GetReports()
 * - beeper -> GetBeeper()
 */

// Re-export shared functions from chad-dba
export {
  // Core
  invokeContentProvider,
  checkHealth,
  getAllRepos,
  getUsersList,
  
  // Leads
  GetAllLeads,
  GetLeadByName,
  TodoLeads,
  createStatusForLead,
  putStatusContent,
  getStatusItem,
  
  // Reports
  GetReports,
  GetReportByName,
  
  // Beeper
  GetBeeper,
  GetBeeperItemByName,
  
  // Constants
  SHARED_REPO_ID,
  
  // Path resolvers
  chad_ResolveByNames,
  chad_GetLocaFromAddress,
  chad_ResolveLocaByNames,
  chad_GetLeadsLoca,
  chad_GetReportsLoca,
  chad_GetBeeperLoca,
  chad_GetRelativeLoca,
  chad_GetFirstSegment,
  chad_GetLeadsStatuses,
  chad_FindConversationByLeadName,
  chad_FindReportsByLeadName,
  
  // Utilities
  parseAddressToRepoLoca,
  joinAddress,
  readBodyMap,
  
  // AI answers
  SaveAiAnswerToMsgWorkout,
  
  // Types
  type SaveAiAnswerResult,
  type ContentProviderResponse,
  type ConversationResult,
  type ReportResult,
} from "dba";

/**
 * Prints child item names from the response Body.
 * If Body is a map like { "01": "Ania", "02": "Kasia", "03": "Ola" },
 * it prints the names (Ania, Kasia, Ola).
 * If Body is null, undefined, string, or empty object, prints a message.
 * 
 * This is a console-specific helper function.
 */
export function printChildItemNames(item: any): void {
  if (!item || !item.Body) {
    console.log("No child item map found in Body.");
    return;
  }

  const body = item.Body;

  // Check if Body is a string
  if (typeof body === "string") {
    console.log("No child item map found in Body.");
    return;
  }

  // Check if Body is an object
  if (typeof body === "object" && body !== null) {
    const keys = Object.keys(body);
    if (keys.length === 0) {
      console.log("No child item map found in Body.");
      return;
    }

    // Print all values (names) from the map
    keys.forEach((key) => {
      console.log(body[key]);
    });
    return;
  }

  console.log("No child item map found in Body.");
}