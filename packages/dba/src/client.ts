/**
 * Content Provider API Client
 * 
 * Core client for invoking the Content Provider API.
 * This is the foundation for all database operations.
 */

import dotenv from "dotenv";
import { createTrace, emitTrace, parseWorkerMethod } from "./trace.js";

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
  const startTime = Date.now();
  const { worker, method } = parseWorkerMethod(args);
  const rawRequest = JSON.stringify(args);

  // 30-second timeout to prevent infinite hanging when Content Provider is unresponsive
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: rawRequest,
      signal: controller.signal,
    });

    const text = await response.text();
    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      // Emit error trace
      const trace = createTrace({
        worker,
        method,
        args,
        endpoint: url,
        rawRequest,
        rawResponse: text || `HTTP ${response.status} ${response.statusText}`,
        statusCode: response.status,
        durationMs,
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      });
      emitTrace(trace);

      throw new Error(
        `API request failed with status ${response.status} ${response.statusText}.\nArgs: ${JSON.stringify(args)}\nResponse: ${text}`
      );
    }

    // For Put operations, empty response body is valid (2xx status = success)
    // The Put method is at index 2 in the args array
    const isPutOperation = args.length >= 3 && args[2] === "Put";
    if (!text && isPutOperation) {
      // Emit success trace for empty response
      const trace = createTrace({
        worker,
        method,
        args,
        endpoint: url,
        rawRequest,
        rawResponse: '(empty response)',
        statusCode: response.status,
        durationMs,
        success: true,
      });
      emitTrace(trace);
      return { success: true };
    }

    if (!text) {
      const trace = createTrace({
        worker,
        method,
        args,
        endpoint: url,
        rawRequest,
        rawResponse: '(empty response)',
        statusCode: response.status,
        durationMs,
        success: false,
        error: 'Empty response body',
      });
      emitTrace(trace);
      throw new Error(
        `Empty response body from /invoke.\nArgs: ${JSON.stringify(args)}`
      );
    }

    try {
      const result = JSON.parse(text);
      
      // Emit success trace
      const trace = createTrace({
        worker,
        method,
        args,
        endpoint: url,
        rawRequest,
        rawResponse: text,
        statusCode: response.status,
        durationMs,
        success: true,
      });
      emitTrace(trace);
      
      return result;
    } catch (parseError) {
      const trace = createTrace({
        worker,
        method,
        args,
        endpoint: url,
        rawRequest,
        rawResponse: text,
        statusCode: response.status,
        durationMs,
        success: false,
        error: 'Failed to parse JSON response',
      });
      emitTrace(trace);
      
      throw new Error(
        `Failed to parse JSON response.\nArgs: ${JSON.stringify(args)}\nRaw response: ${text}`
      );
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const durationMs = Date.now() - startTime;
      const trace = createTrace({
        worker,
        method,
        args,
        endpoint: url,
        rawRequest,
        rawResponse: '(timeout)',
        statusCode: 408,
        durationMs,
        success: false,
        error: 'Request timed out after 30s',
      });
      emitTrace(trace);
      
      throw new Error(
        `Content Provider request timed out after 30s.\nArgs: ${JSON.stringify(args)}\nURL: ${url}`
      );
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Unknown error occurred: ${error}`);
  } finally {
    clearTimeout(timeoutId);
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
    "root",
    "users",
    "users-list",
  ]);
}