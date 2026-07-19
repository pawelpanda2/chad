import { NextResponse } from 'next/server';
import { getCurrentUserFromCookies } from '@/lib/session';

/**
 * GET /api/folders/repos
 *
 * Lists repos for the Folders tab's repo picker (documentation/stories/57,
 * critical fix in documentation/stories/60).
 *
 * SECURITY: every user, with no exceptions, gets at most a single-item
 * list: the repo the login session itself already resolved (`user.repoGuid`,
 * set by `resolveCurrentUser()` against the Mongo-backed chad_admin
 * users-list at login time — documentation/dashboard/common/features/
 * chad-user-data-isolation.md). This used to re-derive the repo via a
 * separate direct call to the Content Provider (`resolveOwnRepo()`); now
 * that CP is no longer deployed (Story 72), the session's own repoGuid is
 * the single source of truth — there is no second system to cross-check
 * against, and there never was more than one repo per user anyway.
 */
export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: 'NOT_AUTHENTICATED' }, { status: 401 });
  }

  return NextResponse.json({
    repos: [{ id: user.repoGuid, name: `chad_${user.username}` }],
  });
}
