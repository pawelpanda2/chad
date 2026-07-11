import { NextResponse } from 'next/server';
import { getCurrentUserForms } from '@/app/api/flow/cp-flow';
import { getCurrentUserFromCookies } from '@/lib/session';

/**
 * GET /api/folders
 *
 * Returns the folder structure for the current user from Content Provider.
 * Uses cp-flow layer - does NOT construct CP args directly.
 */
export async function GET() {
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
      {
        error: 'NOT_AUTHENTICATED',
        details: 'Cannot fetch folders without authenticated user session',
        debug: { CONTENT_PROVIDER_API_URL: cpApiUrl },
      },
      { status: 401 }
    );
  }

  // Use cp-flow to get forms, scoped to this user's own repo
  const result = await getCurrentUserForms(user.repoGuid);

  return NextResponse.json({
    userGuid: user.repoGuid,
    username: user.username,
    repoKey: user.repoGuid,
    actionRecords: result.actionRecords,
    leadRecords: result.leadRecords,
    cpCalls: result.cpCalls,
    debug: {
      CONTENT_PROVIDER_API_URL: cpApiUrl,
    },
  });
}
