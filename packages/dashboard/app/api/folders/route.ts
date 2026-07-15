import { NextResponse } from 'next/server';
import { getCurrentUserFromCookies } from '@/lib/session';
import { getItemByLoca } from '@/app/api/flow/cp-flow';
import { assertOwnRepo, RepoAccessDeniedError } from 'dba';

/**
 * GET /api/folders?loca=<slash-joined loca, omit or "" for repo root>&repoGuid=<optional>
 *
 * Generic Content Provider item fetch for the dashboard's Folders tab
 * (see documentation/stories/57, critical fix in documentation/stories/60).
 *
 * SECURITY: `repoGuid` is never trusted directly. The actual repo used for
 * the Content Provider call always comes from dba's `assertOwnRepo()`,
 * which independently resolves the caller's own repo via a strict, exact
 * `chad_<username>` name match against the Content Provider's real repo
 * list (documentation/dashboard/common/features/
 * chad-user-data-isolation.md). If the client also supplies a `repoGuid`
 * query param and it does not match that resolved repo, the request is
 * denied (403) — no exceptions for any username, including `pawel_f`
 * (a prior special case that made this endpoint the source of a critical
 * data-isolation bug — documentation/stories/60 — has been removed).
 *
 * Uses cp-flow's invokeCp (the SAME direct-to-.NET-API mechanism every
 * other endpoint in this dashboard already uses), not the separate
 * cp-entry/cp-files/cp-mongo TypeScript rewrite packages — deliberately,
 * per explicit correction: this tab must keep working against the
 * existing, already-deployed .NET Content Provider, not a new dependency
 * that isn't part of the dashboard's Docker build.
 */
export async function GET(request: Request) {
  const cpApiUrl = process.env.CONTENT_PROVIDER_API_URL;
  if (!cpApiUrl) {
    return NextResponse.json(
      { error: 'CONTENT_PROVIDER_API_URL_NOT_SET' },
      { status: 503 }
    );
  }

  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json(
      { error: 'NOT_AUTHENTICATED', details: 'Cannot fetch Content Provider items without an authenticated user session' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const loca = searchParams.get('loca') ?? '';
  const requestedRepoGuid = searchParams.get('repoGuid');

  let repo;
  try {
    repo = await assertOwnRepo(user.username, requestedRepoGuid);
  } catch (err) {
    if (err instanceof RepoAccessDeniedError) {
      return NextResponse.json({ error: 'FORBIDDEN_REPO' }, { status: 403 });
    }
    return NextResponse.json({ error: 'UNKNOWN_ERROR' }, { status: 502 });
  }

  try {
    const raw = await getItemByLoca(repo.id, loca);
    const item = {
      Body: raw.Body,
      Config: raw.Settings,
      Settings: raw.Settings,
      Address: raw.Settings.address,
    };
    return NextResponse.json({ item, repoGuid: repo.id, username: user.username });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'UNKNOWN_ERROR' },
      { status: 404 }
    );
  }
}
