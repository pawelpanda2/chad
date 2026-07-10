/**
 * Reports Service
 * 
 * Provides access to reports data through the Content Provider API.
 * Uses the shared repository: 21d11bdc-f1f4-44d1-b61a-3fa6b039c641
 */

import { invokeContentProvider } from "./client";
import { SHARED_REPO_ID } from "./leads";

/**
 * Gets all reports from the shared repository.
 * 
 * Args: ["IRepoService", "IItemWorker", "GetByNames", "21d11bdc-f1f4-44d1-b61a-3fa6b039c641", "reports"]
 * 
 * @returns Promise resolving to the reports data
 */
export async function GetReports(): Promise<any> {
  return invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetByNames",
    SHARED_REPO_ID,
    "reports",
  ]);
}

/**
 * Gets a specific report by name.
 * 
 * @param reportName - The name of the report to retrieve
 * @returns Promise resolving to the report data
 */
export async function GetReportByName(reportName: string): Promise<any> {
  return invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetByNames",
    SHARED_REPO_ID,
    "reports",
    reportName,
  ]);
}