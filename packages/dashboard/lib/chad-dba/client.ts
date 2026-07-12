/**
 * Content Provider API Client
 * 
 * Core client for invoking the Content Provider API.
 * This is the foundation for all database operations.
 */

import dotenv from "dotenv";

dotenv.config();

// Read lazily inside each function rather than at module load — Next.js
// imports this module during `next build`'s page-data collection, before
// docker-compose has injected the runtime env var, so throwing here would
// fail every build regardless of what's actually configured at runtime.
function getContentProviderApiUrl(): string {
  const url = process.env.CONTENT_PROVIDER_API_URL;
  if (!url) {
    throw new Error(
      "CONTENT_PROVIDER_API_URL environment variable is not set"
    );
  }
  return url;
}

/**
 * Response structure from Content Provider API
 */
export interface ContentProviderResponse {
  Body?: string;
  Settings?: {
    id?: string;
    type?: string;
    name?: string;
    address?: string;
    primaryBody?: string;
  };
  success?: boolean;
  result?: string;
  error?: { message?: string };
}

/**
 * Invokes the Content Provider API with the given arguments.
 * 
 * @param args - Array of string arguments to pass to the API
 * @returns Promise resolving to the JSON response
 * @throws Error if the API call fails or returns an error response
 * 
 * @example
 * ```typescript
 * const result = await invokeContentProvider([
 *   "IRepoService",
 *   "IItemWorker", 
 *   "GetByNames",
 *   "21d11bdc-f1f4-44d1-b61a-3fa6b039c641",
 *   "leads",
 *   "all items"
 * ]);
 * ```
 */
export async function invokeContentProvider(args: string[]): Promise<any> {
  const url = `${getContentProviderApiUrl()}/invoke`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `API request failed with status ${response.status} ${response.statusText}.\nArgs: ${JSON.stringify(args)}\nResponse: ${text}`
      );
    }

    // For Put operations, empty response body is valid (2xx status = success)
    // The Put method is at index 2 in the args array
    const isPutOperation = args.length >= 3 && args[2] === "Put";
    if (!text && isPutOperation) {
      return { success: true };
    }

    if (!text) {
      throw new Error(
        `Empty response body from /invoke.\nArgs: ${JSON.stringify(args)}`
      );
    }

    try {
      return JSON.parse(text);
    } catch (parseError) {
      throw new Error(
        `Failed to parse JSON response.\nArgs: ${JSON.stringify(args)}\nRaw response: ${text}`
      );
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Unknown error occurred: ${error}`);
  }
}

/**
 * Checks the health of the Content Provider API.
 * 
 * @returns Promise resolving to true if the API is healthy
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const url = `${getContentProviderApiUrl()}/health`;
    const response = await fetch(url, {
      method: "GET",
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Gets all repository names.
 * 
 * @returns Promise resolving to the list of repositories
 */
export async function getAllRepos(): Promise<any> {
  return invokeContentProvider([
    "IRepoService",
    "IMethodWorker",
    "GetAllReposNames",
  ]);
}

/**
 * Gets users list from the root repository.
 * 
 * @returns Promise resolving to the users list
 */
export async function getUsersList(): Promise<any> {
  return invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetByNames",
    "chad_admin",
    "users",
    "users-list",
  ]);
}