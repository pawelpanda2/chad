import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getCurrentUserForms } from '@/app/api/flow/cp-flow';

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

  // Get session from cookie
  let session: { user?: { id?: string; username?: string } } | null = null;
  const sessionDebug: Record<string, unknown> = { hasCookie: false };

  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');
    if (sessionCookie) {
      sessionDebug.hasCookie = true;
      sessionDebug.cookieValue = sessionCookie.value.substring(0, 20) + '...';
      const [userId] = sessionCookie.value.split(':');
      sessionDebug.parsedUserId = userId;
      session = { user: { id: userId, username: userId } };
    }
  } catch {
    sessionDebug.hasCookie = false;
  }

  if (!session) {
    return NextResponse.json(
      {
        error: 'NOT_AUTHENTICATED',
        details: 'Cannot fetch folders without authenticated user session',
        debug: { sessionDebug, CONTENT_PROVIDER_API_URL: cpApiUrl },
      },
      { status: 401 }
    );
  }

  // Use cp-flow to get forms
  const result = await getCurrentUserForms(session);

  return NextResponse.json({
    userGuid: session.user?.id,
    username: session.user?.username,
    repoKey: session.user?.username,
    actionRecords: result.actionRecords,
    leadRecords: result.leadRecords,
    cpCalls: result.cpCalls,
    debug: {
      CONTENT_PROVIDER_API_URL: cpApiUrl,
      sessionDebug,
    },
  });
}
