import { NextResponse } from 'next/server';
import { getCurrentUserFromCookies } from '@/lib/session';
import { entry } from 'cp-entry';
import { ContentProviderError } from 'cp-core';

/**
 * GET /api/folders?loca=<slash-joined loca, omit or "" for repo root>
 *
 * Generic Content Provider item fetch for the dashboard's Folders tab
 * (see documentation/stories/57). Scoped strictly to the current
 * authenticated user's own repoGuid — repoGuid is never accepted from the
 * client, matching every other Content-Provider-touching endpoint in this
 * app (documentation/dashboard/common/features/chad-user-data-isolation.md).
 * cp-entry's methods already take repoGuid as an explicit parameter, so
 * this follows the same safe pattern app/api/flow/cp-flow.ts uses — no
 * dba runWithRepoContext needed (that's dba's own AsyncLocalStorage
 * pattern for its ~70 SHARED_REPO_ID call sites, a different module).
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
    const item = await entry.GetItem(user.repoGuid, loca);
    return NextResponse.json({ item, repoGuid: user.repoGuid, username: user.username });
  } catch (err) {
    const status = err instanceof ContentProviderError ? 404 : 400;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'UNKNOWN_ERROR' },
      { status }
    );
  }
}
