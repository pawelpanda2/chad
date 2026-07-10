/**
 * Path Resolver Service
 * 
 * Provides helpers for resolving paths by names to numeric loca addresses.
 * This is essential for working with Content Provider API methods that require
 * numeric loca paths instead of name-based paths.
 * 
 * Key Concept:
 * - Path by names: ["leads", "all items"] - human-readable but not usable directly
 * - Numeric loca: "03/06" - the actual address used by API methods
 * 
 * Resolution Process:
 * 1. Call GetByNames with repoId and path segments
 * 2. Extract Settings.address from response (e.g., "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06")
 * 3. Extract numeric loca from address (e.g., "03/06")
 * 4. Use numeric loca with methods like FindRecursively, GetItem, Put
 */

import { invokeContentProvider } from "./client";
import { SHARED_REPO_ID } from "./leads";

/**
 * Resolves a path by names to get the actual item.
 * 
 * This function calls GetByNames to resolve a path of names to an actual item,
 * which contains Settings.address with the real numeric path.
 * 
 * @param repoId - The repository GUID (e.g., "21d11bdc-f1f4-44d1-b61a-3fa6b039c641")
 * @param names - Variable number of path segments (e.g., "leads", "all items")
 * @returns Promise resolving to the item with Settings.address
 * 
 * @example
 * ```typescript
 * // Resolve leads/all items
 * const item = await chad_ResolveByNames(SHARED_REPO_ID, "leads", "all items");
 * console.log(item.Settings.address); // "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06"
 * ```
 */
export async function chad_ResolveByNames(
  repoId: string,
  ...names: string[]
): Promise<any> {
  const args = [
    "IRepoService",
    "IItemWorker",
    "GetByNames",
    repoId,
    ...names,
  ];
  return invokeContentProvider(args);
}

/**
 * Extracts the numeric loca from a full address string.
 * 
 * Given an address like "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06" and
 * a repoId like "21d11bdc-f1f4-44d1-b61a-3fa6b039c641", this function
 * returns "03/06".
 * 
 * @param address - The full address (e.g., "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06")
 * @param repoId - The repository GUID to strip from the address
 * @returns The numeric loca path (e.g., "03/06")
 * 
 * @example
 * ```typescript
 * const address = "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06";
 * const repoId = "21d11bdc-f1f4-44d1-b61a-3fa6b039c641";
 * const loca = chad_GetLocaFromAddress(address, repoId);
 * console.log(loca); // "03/06"
 * ```
 */
export function chad_GetLocaFromAddress(address: string, repoId: string): string {
  if (!address) {
    throw new Error("Address is empty or undefined");
  }
  
  const prefix = `${repoId}/`;
  if (!address.startsWith(prefix)) {
    throw new Error(
      `Address "${address}" does not start with repo prefix "${prefix}"`
    );
  }
  
  return address.substring(prefix.length);
}

/**
 * Resolves a path by names and returns the numeric loca.
 * 
 * This is a convenience function that combines chad_ResolveByNames and
 * chad_GetLocaFromAddress to directly get the numeric loca from a name path.
 * 
 * @param repoId - The repository GUID
 * @param names - Variable number of path segments
 * @returns Promise resolving to the numeric loca (e.g., "03/06")
 * 
 * @example
 * ```typescript
 * const loca = await chad_ResolveLocaByNames(SHARED_REPO_ID, "leads", "all items");
 * console.log(loca); // "03/06"
 * ```
 */
export async function chad_ResolveLocaByNames(
  repoId: string,
  ...names: string[]
): Promise<string> {
  const item = await chad_ResolveByNames(repoId, ...names);
  
  if (!item?.Settings?.address) {
    throw new Error(
      `Could not resolve path [${names.join(", ")}]: no Settings.address in response`
    );
  }
  
  return chad_GetLocaFromAddress(item.Settings.address, repoId);
}

/**
 * Gets the resolved loca for leads "all items" folder.
 * 
 * @returns Promise resolving to the numeric loca for leads
 */
export async function chad_GetLeadsLoca(): Promise<string> {
  return chad_ResolveLocaByNames(SHARED_REPO_ID, "leads", "all items");
}

/**
 * Gets the resolved loca for reports folder.
 * 
 * @returns Promise resolving to the numeric loca for reports
 */
export async function chad_GetReportsLoca(): Promise<string> {
  return chad_ResolveLocaByNames(SHARED_REPO_ID, "reports");
}

/**
 * Gets the resolved loca for beeper folder.
 * 
 * @returns Promise resolving to the numeric loca for beeper
 */
export async function chad_GetBeeperLoca(): Promise<string> {
  return chad_ResolveLocaByNames(SHARED_REPO_ID, "beeper");
}

/**
 * Gets the relative loca by stripping the base loca prefix.
 * 
 * Example:
 * - fullLoca = "03/06/71/02/02"
 * - baseLoca = "03/06"
 * - result = "71/02/02"
 * 
 * @param fullLoca - The full numeric loca
 * @param baseLoca - The base loca to strip
 * @returns The relative loca after stripping the base prefix
 */
export function chad_GetRelativeLoca(fullLoca: string, baseLoca: string): string {
  if (!fullLoca || !baseLoca) {
    throw new Error("fullLoca and baseLoca must not be empty");
  }
  
  if (!fullLoca.startsWith(baseLoca)) {
    throw new Error(`fullLoca "${fullLoca}" does not start with baseLoca "${baseLoca}"`);
  }
  
  // Strip the baseLoca prefix and the following slash
  const prefix = baseLoca.endsWith("/") ? baseLoca : `${baseLoca}/`;
  if (!fullLoca.startsWith(prefix)) {
    throw new Error(`fullLoca "${fullLoca}" does not start with baseLoca prefix "${prefix}"`);
  }
  
  return fullLoca.substring(prefix.length);
}

/**
 * Gets the first segment of a relative loca.
 * 
 * Example:
 * - relativeLoca = "71/02/02"
 * - result = "71"
 * 
 * @param relativeLoca - The relative loca
 * @returns The first segment of the relative loca
 */
export function chad_GetFirstSegment(relativeLoca: string): string {
  if (!relativeLoca) {
    throw new Error("relativeLoca must not be empty");
  }
  
  const parts = relativeLoca.split("/");
  if (parts.length === 0) {
    throw new Error(`Cannot extract first segment from "${relativeLoca}"`);
  }
  
  return parts[0];
}

/**
 * Gets leads statuses using resolved loca.
 * 
 * This function:
 * 1. Resolves the leads "all items" path to get the numeric loca
 * 2. Calls GetManyByName with the resolved loca to get all status items
 * 
 * IMPORTANT: GetManyByName accepts only 3 arguments after service/method:
 * - repo: the repository GUID
 * - loca: the numeric path (resolved from names)
 * - name: the item name to search for (e.g., "status")
 * 
 * @returns An array of status items
 */
export async function chad_GetLeadsStatuses(): Promise<any> {
  // Step 1: Resolve the leads "all items" path to get numeric loca
  const leadsLoca = await chad_GetLeadsLoca();
  
  // Step 2: Get all status items using resolved loca
  return invokeContentProvider([
    "IRepoService",
    "ManyItemsWorker",
    "GetManyByName",
    SHARED_REPO_ID,
    leadsLoca,
    "status",
  ]);
}
