import { NextResponse } from 'next/server';
import { getCurrentUserFromCookies } from '@/lib/session';
import { resolveOwnRepo, RepoAccessDeniedError } from 'dba';

/**
 * GET /api/folders/repos
 *
 * Lists repos for the Folders tab's repo picker (documentation/stories/57,
 * critical fix in documentation/stories/60).
 *
 * SECURITY: this route used to special-case the `pawel_f` login to return
 * dba's raw `getAllRepos()` list — every repo known to the Content
 * Provider, across all users and all apps. That was a critical data
 * isolation bug (documentation/stories/60) and has been removed. Every
 * user, with no exceptions, gets at most a single-item list: the repo
 * dba's `resolveOwnRepo()` resolves via a strict, exact `chad_<username>`
 * name match (documentation/dashboard/common/features/
 * chad-user-data-isolation.md). Deny-by-default: any failure to resolve
 * (no username, no match, ambiguous match) returns a generic error with no
 * repo names in the payload — never the full list, never a fallback repo.
 */
export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: 'NOT_AUTHENTICATED' }, { status: 401 });
  }

  try {
    const repo = await resolveOwnRepo(user.username);
    return NextResponse.json({ repos: [{ id: repo.id, name: repo.name }] });
  } catch (err) {
    if (err instanceof RepoAccessDeniedError) {
      return NextResponse.json({ error: 'REPO_ACCESS_DENIED' }, { status: 403 });
    }
    return NextResponse.json({ error: 'UNKNOWN_ERROR' }, { status: 502 });
  }
}
