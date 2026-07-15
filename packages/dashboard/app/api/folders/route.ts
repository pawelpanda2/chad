import { NextResponse } from 'next/server';
import { getCurrentUserFromCookies } from '@/lib/session';
import { getItemByLoca } from '@/app/api/flow/cp-flow';

/**
 * GET /api/folders?loca=<slash-joined loca, omit or "" for repo root>
 *
 * Generic Content Provider item fetch for the dashboard's Folders tab
 * (see documentation/stories/57). Scoped strictly to the current
 * authenticated user's own repoGuid — repoGuid is never accepted from the
 * client, matching every other Content-Provider-touching endpoint in this
 * app (documentation/dashboard/common/features/chad-user-data-isolation.md).
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

  try {
    const raw = await getItemByLoca(user.repoGuid, loca);
    const item = {
      Body: raw.Body,
      Config: raw.Settings,
      Settings: raw.Settings,
      Address: raw.Settings.address,
    };
    return NextResponse.json({ item, repoGuid: user.repoGuid, username: user.username });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'UNKNOWN_ERROR' },
      { status: 404 }
    );
  }
}
