/**
 * API Endpoint: Get CP history entry details
 *
 * GET /api/content-provider/history/[id] - Get details of a specific history entry
 * including linked Google Sheets outbox status (mutationId / recordKey).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getCpHistoryEntry,
  getGoogleSheetsSyncStatusForHistoryEntry,
  loadGoogleSheetsInfoConfig,
} from 'dba';
import { getCurrentUserFromCookies } from '@/lib/session';

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

    let spreadsheetConfigured = false;
    try {
      const info = loadGoogleSheetsInfoConfig();
      spreadsheetConfigured = Boolean(info.spreadsheetMap[user.username]);
    } catch {
      spreadsheetConfigured = false;
    }

    const googleSheets = await getGoogleSheetsSyncStatusForHistoryEntry({
      mutationId: entry.mutationId,
      repoGuid: user.repoGuid,
      address: entry.address,
      username: user.username,
      spreadsheetConfigured,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...entry,
        googleSheets,
      },
    });
  } catch (error) {
    console.error('[dashboard] getCpHistoryEntry failed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch history entry', success: false },
      { status: 500 }
    );
  }
}
