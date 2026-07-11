/**
 * Resolves the current logged-in user from the session cookie, validated
 * against the real chad_admin user list (never trusts the cookie blindly —
 * a tampered/forged id won't resolve to any user, so it can't be used to
 * read another user's Content Provider repo).
 *
 * Every API route that touches per-user Content Provider data must call
 * this, then wrap its handler body in dba's runWithRepoContext(user, ...).
 * See documentation/dashboard/common/features/chad-user-data-isolation.md.
 */

import { cookies } from "next/headers";
import { resolveCurrentUser } from "./user-service";

export interface CurrentUser {
  repoGuid: string;
  username: string;
}

export async function getCurrentUserFromCookies(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session");
  if (!sessionCookie) {
    return null;
  }

  const [repoGuidFromCookie] = sessionCookie.value.split(":");
  if (!repoGuidFromCookie) {
    return null;
  }

  return resolveCurrentUser(repoGuidFromCookie);
}
