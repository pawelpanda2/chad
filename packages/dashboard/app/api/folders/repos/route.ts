import { NextResponse } from 'next/server';
import { getCurrentUserFromCookies } from '@/lib/session';
import { listSelectableFoldersRepos } from 'dba';

/**
 * GET /api/folders/repos
 *
 * Lists repos for the Folders tab's repo picker (documentation/stories/57,
 * critical fix in documentation/stories/60; Story 96 added the shared
 * `chad_shared` repo for admin sessions).
 *
 * SECURITY: the list is derived entirely server-side from the session
 * (`listSelectableFoldersRepos` in dba): every user gets their own repo
 * (`user.repoGuid`, resolved at login against the chad_admin users-list —
 * documentation/dashboard/common/features/chad-user-data-isolation.md);
 * an admin session additionally gets `chad_shared`. Nothing else, ever —
 * other users' private repos are never listed, and every /api/folders verb
 * re-validates the selection independently (resolveFoldersRepoAccess), so
 * this list is UI convenience, not the enforcement point.
 */
export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: 'NOT_AUTHENTICATED' }, { status: 401 });
  }

  return NextResponse.json({ repos: listSelectableFoldersRepos(user) });
}
