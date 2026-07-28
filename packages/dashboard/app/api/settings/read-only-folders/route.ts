import { NextResponse } from 'next/server';
import { listReadOnlyFolders } from 'dba';
import { getCurrentUserFromCookies } from '@/lib/session';

/**
 * GET /api/settings/read-only-folders
 *
 * Lists the CP folders the Folders GUI must treat as read-only because
 * they're actually owned/managed by a dedicated Dashboard table (Daily
 * Tracker, Dates, Leads) — see `dba`'s `system-folders.ts` for the single
 * source of truth this reads from. Static, non-secret, per-repo-identical
 * information; still requires a session so it's not reachable anonymously.
 */
export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: 'NOT_AUTHENTICATED' }, { status: 401 });
  }

  try {
    return NextResponse.json({
      success: true,
      data: listReadOnlyFolders(),
      canUnlock: user.isAdmin,
      currentUser: {
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('[settings/read-only-folders] failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to list read-only folders' },
      { status: 500 }
    );
  }
}
