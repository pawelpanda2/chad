/**
 * User Service - Fetches users from Sharp Content Provider via HTTP API
 *
 * This service provides a unified way to fetch users from the Content Provider
 * using the Content Provider API (C# ASP.NET service) via the GetByNames method.
 *
 * The API is called with:
 *   POST /invoke { "args": ["IRepoService", "IItemWorker", "GetByNames", "root", "users", "users-list"] }
 *
 * All user-related operations should use this service to ensure consistency
 * and to avoid duplicating the user fetching logic.
 */

import * as yaml from 'js-yaml';

// Content Provider API URL - must be set in environment
// Default is port 5055 which is the local SimpleRun API port
const CONTENT_PROVIDER_API_URL = process.env.CONTENT_PROVIDER_API_URL || 'http://localhost:5055';

/**
 * User data structure as stored in Content Provider
 */
export interface CpUser {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Normalized user data structure for application use
 */
export interface AppUser {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Response structure from GetByNames method (Sharp runner output)
 * The runner returns a JSON object with Body (YAML content) and Settings (metadata)
 */
interface SharpRunnerResponse {
  Body?: string;
  Settings?: {
    id?: string;
    type?: string;
    name?: string;
    address?: string;
    primaryBody?: string;
  };
}

/**
 * Response structure after parsing the Body YAML
 */
interface GetByNamesResponse {
  users: CpUser[];
}

/**
 * Diagnostic information for debugging
 */
export interface UserServiceDebugInfo {
  runnerCalled: boolean;
  arguments: string[];
  rawResult: string;
  rawSharpJson?: string; // Raw JSON from C# Sharp runner
  parseError?: string;
  usersCount: number;
  usersSample?: Partial<CpUser>[];
  error?: string;
}

/**
 * Invokes the Content Provider API with the provided arguments via HTTP.
 *
 * @param args - Array of arguments to pass to the C# application
 * @returns Promise that resolves with the result from the API
 * @throws Error if the API call fails
 */
async function invokeSharp(args: string[]): Promise<string> {
  const apiUrl = CONTENT_PROVIDER_API_URL;
  const invokeUrl = `${apiUrl}/invoke`;

  console.log('[UserService] Calling Content Provider API:', invokeUrl, 'with args:', args.join(' '));

  try {
    const response = await fetch(invokeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    // The backend returns { Body, Settings } directly, not { success, result }
    // Check if the response has the expected structure
    if (data.Body !== undefined || data.Settings !== undefined) {
      console.log('[UserService] Content Provider API call completed successfully');
      return JSON.stringify(data);
    }

    // If it has success/result format, use that
    if (data.success !== undefined) {
      if (!data.success) {
        const errorMsg = data.error?.message || 'Unknown error from Content Provider API';
        throw new Error(`Content Provider API error: ${errorMsg}`);
      }
      console.log('[UserService] Content Provider API call completed successfully');
      return data.result || '';
    }

    // Unknown format
    console.log('[UserService] Unknown response format:', JSON.stringify(data).substring(0, 200));
    throw new Error('Unknown response format from Content Provider API');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = `[UserService] Failed to call Content Provider API: ${errorMessage}`;

    console.error(errorDetails);
    throw new Error(errorDetails);
  }
}

/**
 * Calls GetByNames method through the Sharp runner to fetch users.
 *
 * Equivalent C# call:
 *   IRepoService IItemWorker GetByNames root users users-list
 *
 * @returns Promise resolving to the raw string result from the runner
 */
export async function getUsersFromSharpRaw(): Promise<string> {
  const args = [
    'IRepoService',
    'IItemWorker',
    'GetByNames',
    'root',
    'users',
    'users-list'
  ];

  console.log('[UserService] Calling getUsersFromSharp with args:', args.join(' '));

  const result = await invokeSharp(args);

  console.log('[UserService] getUsersFromSharp completed, received', result.length, 'characters');

  return result;
}

/**
 * Fetches users from the Content Provider via Sharp runner.
 * Parses the result and returns normalized user data.
 *
 * @param options - Optional configuration
 * @param options.includeDebug - If true, returns debug information along with users
 * @returns Promise resolving to array of users (or users with debug info)
 */
export async function getUsersFromSharp(options?: { includeDebug?: boolean }): Promise<AppUser[] | { users: AppUser[]; debug: UserServiceDebugInfo }> {
  const debug: UserServiceDebugInfo = {
    runnerCalled: true,
    arguments: ['IRepoService', 'IItemWorker', 'GetByNames', 'root', 'users', 'users-list'],
    rawResult: '',
    usersCount: 0,
  };

  try {
    const rawResult = await getUsersFromSharpRaw();
    debug.rawResult = rawResult;
    debug.rawSharpJson = rawResult; // Store raw C# output for debugging

    // The Sharp runner returns JSON with Body (YAML content) and Settings
    // First, parse the JSON response
    let bodyYaml: string;

    try {
      const sharpResponse: SharpRunnerResponse = JSON.parse(rawResult);
      if (!sharpResponse.Body) {
        debug.parseError = `No Body field in Sharp runner response. Response (first 500 chars): ${rawResult.substring(0, 500)}`;
        console.error('[UserService]', debug.parseError);

        if (options?.includeDebug) {
          return { users: [], debug };
        }
        return [];
      }
      bodyYaml = sharpResponse.Body;
    } catch (jsonError) {
      debug.parseError = `Failed to parse Sharp runner response as JSON. Error: ${(jsonError as Error).message}. Raw result (first 500 chars): ${rawResult.substring(0, 500)}`;
      console.error('[UserService]', debug.parseError);

      if (options?.includeDebug) {
        return { users: [], debug };
      }
      return [];
    }

    // Now parse the YAML body content
    let parsedData: GetByNamesResponse;

    try {
      const parsed = yaml.load(bodyYaml) as Record<string, unknown>;
      if (!parsed.users || !Array.isArray(parsed.users)) {
        throw new Error('No users array in parsed YAML body');
      }
      parsedData = parsed as unknown as GetByNamesResponse;
    } catch (yamlError) {
      debug.parseError = `Failed to parse Body YAML. Error: ${(yamlError as Error).message}. Body (first 200 chars): ${bodyYaml.substring(0, 200)}`;
      console.error('[UserService]', debug.parseError);

      if (options?.includeDebug) {
        return { users: [], debug };
      }
      return [];
    }

    // Validate the structure
    if (!parsedData || !Array.isArray(parsedData.users)) {
      debug.parseError = `Invalid data structure: expected { users: [] }, got: ${JSON.stringify(parsedData).substring(0, 100)}`;
      console.error('[UserService]', debug.parseError);

      if (options?.includeDebug) {
        return { users: [], debug };
      }
      return [];
    }

    // Map to application user format
    const users: AppUser[] = parsedData.users.map((user: CpUser) => ({
      id: user.id,
      username: user.username,
      displayName: user.username, // Use username as displayName
      email: user.email,
      isActive: true, // All users from Content Provider are active
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));

    debug.usersCount = users.length;
    debug.usersSample = users.slice(0, 3).map(u => ({
      id: u.id,
      username: u.username,
      email: u.email,
    }));

    console.log('[UserService] Successfully parsed', users.length, 'users from Content Provider');

    if (options?.includeDebug) {
      return { users, debug };
    }
    return users;

  } catch (error) {
    debug.error = error instanceof Error ? error.message : String(error);
    console.error('[UserService] Error fetching users:', debug.error);

    if (options?.includeDebug) {
      return { users: [], debug };
    }
    return [];
  }
}

/**
 * Fetches raw users from Content Provider (with password hashes).
 * Useful for authentication where we need the password hash.
 *
 * @returns Promise resolving to array of raw CP users
 */
export async function getRawUsersFromSharp(): Promise<CpUser[]> {
  try {
    const rawResult = await getUsersFromSharpRaw();

    // The Sharp runner returns JSON with Body (YAML content) and Settings
    // First, parse the JSON response
    let bodyYaml: string;

    try {
      const sharpResponse: SharpRunnerResponse = JSON.parse(rawResult);
      if (!sharpResponse.Body) {
        console.error('[UserService] No Body field in Sharp runner response for getRawUsersFromSharp');
        return [];
      }
      bodyYaml = sharpResponse.Body;
    } catch (jsonError) {
      console.error('[UserService] Failed to parse Sharp runner response as JSON:', jsonError instanceof Error ? jsonError.message : jsonError);
      return [];
    }

    // Now parse the YAML body content
    const parsed = yaml.load(bodyYaml) as Record<string, unknown>;
    if (!parsed.users || !Array.isArray(parsed.users)) {
      console.error('[UserService] No users array in parsed YAML body');
      return [];
    }
    const parsedData = parsed as unknown as GetByNamesResponse;

    if (!parsedData || !Array.isArray(parsedData.users)) {
      console.error('[UserService] Invalid data structure for raw users');
      return [];
    }

    return parsedData.users;
  } catch (error) {
    console.error('[UserService] Error fetching raw users:', error);
    return [];
  }
}

/**
 * Finds a user by username (case-insensitive)
 *
 * @param username - The username to search for
 * @returns Promise resolving to the user or null if not found
 */
export async function findUserByUsername(username: string): Promise<CpUser | null> {
  const users = await getRawUsersFromSharp();
  return users.find(
    u => u.username.toLowerCase() === username.toLowerCase()
  ) || null;
}

/**
 * Cache for users to avoid repeated Sharp runner calls within a short time window.
 * This is a simple in-memory cache that lasts for the duration of the process.
 */
let usersCache: { data: AppUser[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 30000; // 30 seconds cache

/**
 * Fetches users with caching to avoid repeated Sharp runner calls.
 *
 * @param forceRefresh - If true, bypasses cache and fetches fresh data
 * @returns Promise resolving to array of users
 */
export async function getCachedUsers(forceRefresh: boolean = false): Promise<AppUser[]> {
  const now = Date.now();

  if (!forceRefresh && usersCache && (now - usersCache.timestamp < CACHE_TTL_MS)) {
    console.log('[UserService] Returning cached users');
    return usersCache.data;
  }

  console.log('[UserService] Cache miss or force refresh, fetching from Sharp');
  const users = await getUsersFromSharp() as AppUser[];

  usersCache = {
    data: users,
    timestamp: now,
  };

  return users;
}

/**
 * Invalidates the users cache.
 * Call this after creating/updating/deleting a user.
 */
export function invalidateUsersCache(): void {
  console.log('[UserService] Invalidating users cache');
  usersCache = null;
}