/**
 * User Service - Fetches the login user list via `dba` (Mongo-backed).
 *
 * Previously called Content Provider directly over HTTP
 * (`GetByNames("chad_admin", "users", "users-list")`), independent of
 * `DBA_CONTENT_PROVIDER_ENABLED` — a violation of `05_endpoint-rules.md`
 * §2 (Dashboard must never call a provider directly) that also meant login
 * couldn't survive Content Provider being removed from deployment. Now
 * calls `getUsersListBody()` from `dba`, which routes through the same
 * `DbaDataRouter`/`MongoCpProvider` every other business function uses.
 *
 * All user-related operations should use this service to ensure consistency
 * and to avoid duplicating the user fetching logic.
 */

import * as yaml from 'js-yaml';
import { getUsersListBody } from 'dba';

/**
 * User data structure as stored in Content Provider.
 *
 * repoGuid = userId: one GUID, not two. It's both this user's identity
 * (embedded in the session cookie at login) and the Content Provider repo
 * GUID for their data root — see chad_admin's body.txt comment.
 */
export interface CpUser {
  repoGuid: string;
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
  parseError?: string;
  usersCount: number;
  usersSample?: Partial<CpUser>[];
  error?: string;
}

/**
 * Fetches the raw YAML body of `chad_admin/users/users-list` via `dba`.
 *
 * @returns Promise resolving to the raw YAML string, or `''` if the item
 *   doesn't exist (matching this function's original "always a string"
 *   contract — callers below distinguish "no users" via the YAML parse,
 *   same as before).
 */
export async function getUsersFromSharpRaw(): Promise<string> {
  console.log('[UserService] Fetching users-list body via dba (Mongo)');

  const body = await getUsersListBody();

  console.log('[UserService] getUsersFromSharpRaw completed, received', body?.length ?? 0, 'characters');

  return body ?? '';
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
    arguments: ['dba', 'getUsersListBody'],
    rawResult: '',
    usersCount: 0,
  };

  try {
    const bodyYaml = await getUsersFromSharpRaw();
    debug.rawResult = bodyYaml;

    if (!bodyYaml) {
      debug.parseError = 'users-list item not found (empty body from dba)';
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
      id: user.repoGuid,
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
    const bodyYaml = await getUsersFromSharpRaw();

    if (!bodyYaml) {
      console.error('[UserService] users-list item not found (empty body from dba)');
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
 * Resolves the current user's { repoGuid, username } from the raw id stored
 * in the session cookie (see app/api/auth/login/route.ts — the cookie value
 * IS the user's repoGuid). Validates the id against chad_admin's real user
 * list rather than trusting the cookie blindly, so a forged/arbitrary GUID
 * in a tampered cookie can't be used to read another repo's data.
 *
 * Uses the same cache as getCachedUsers() — this is called on EVERY
 * authenticated API route (see lib/session.ts), so an uncached Sharp
 * runner round-trip here was multiplying with every concurrent request a
 * page fires (e.g. the Beeper tab alone loads several endpoints at once).
 * The Content Provider API's GetByNames call also degrades badly under
 * concurrent load (observed 3ms -> 900ms -> ~4s -> full hang for the
 * identical call within one dashboard session) — caching this collapses
 * many redundant concurrent calls into one.
 *
 * Returns null if the id doesn't match any known user (invalid session, or
 * an account like test2/test3 that has no repo provisioned yet).
 */
export async function resolveCurrentUser(
  repoGuidFromCookie: string
): Promise<{ repoGuid: string; username: string } | null> {
  const users = await getCachedUsers();
  const user = users.find(u => u.id === repoGuidFromCookie);
  if (!user) {
    return null;
  }
  return { repoGuid: user.id, username: user.username };
}

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