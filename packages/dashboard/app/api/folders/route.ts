import { NextResponse } from 'next/server';
import { getCurrentUserFromCookies } from '@/lib/session';
import { getItemByLoca } from '@/app/api/flow/cp-flow';

/**
 * GET /api/folders?loca=<slash-joined loca, omit or "" for repo root>&repoGuid=<optional>
 *
 * Generic Content Provider item fetch for the dashboard's Folders tab
 * (see documentation/stories/57). `repoGuid` is optional and defaults to
 * the current user's own repo. An explicit `repoGuid` is only honored for
 * the `pawel_f` login (matching /api/folders/repos' same gate — see that
 * route's comment) or when it equals the caller's own repoGuid; any other
 * value is rejected with 403, never silently substituted — matching every
 * other Content-Provider-touching endpoint's per-user data isolation
 * (documentation/dashboard/common/features/chad-user-data-isolation.md).
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

  let repoGuid = user.repoGuid;
  if (requestedRepoGuid && requestedRepoGuid !== user.repoGuid) {
    if (user.username !== 'pawel_f') {
      return NextResponse.json({ error: 'FORBIDDEN_REPO' }, { status: 403 });
    }
    repoGuid = requestedRepoGuid;
  }

  try {
    const raw = await getItemByLoca(repoGuid, loca);
    const item = {
      Body: raw.Body,
      Config: raw.Settings,
      Settings: raw.Settings,
      Address: raw.Settings.address,
    };
    return NextResponse.json({ item, repoGuid, username: user.username });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'UNKNOWN_ERROR' },
      { status: 404 }
    );
  }
}
