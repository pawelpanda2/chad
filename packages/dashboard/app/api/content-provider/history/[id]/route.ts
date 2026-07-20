/**
 * API Endpoint: Get CP history entry details
 *
 * GET /api/content-provider/history/[id] - Get details of a specific history entry
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCpHistoryEntry } from 'dba';
import { getCurrentUserFromCookies } from '@/lib/session';

/**
 * GET /api/content-provider/history/[id]
 *
 * Returns full details of a history entry, including the complete change diff.
 *
 * Repo isolation: entry address must match the caller's repoGuid — a
 * caller-supplied id cannot leak another repo's data.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'NOT_AUTHENTICATED' },
      { status: 401 }
    );
  }

  try {
    const entry = await getCpHistoryEntry(id, user.repoGuid);

    if (!entry) {
      return NextResponse.json(
        { error: 'History entry not found or access denied', success: false },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: entry,
    });
  } catch (error) {
    console.error('[dashboard] getCpHistoryEntry failed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch history entry', success: false },
      { status: 500 }
    );
  }
}
