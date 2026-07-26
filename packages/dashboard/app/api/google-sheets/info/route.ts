import { NextResponse } from 'next/server';
import {
  loadGoogleSheetsConfig,
  loadGoogleSheetsInfoConfig,
  runWithRepoContext,
  resolveByNames,
  getGoogleSheetsUserSyncStatus,
} from 'dba';
import { getCurrentUserFromCookies } from '@/lib/session';

/**
 * GET /api/google-sheets/info
 *
 * Returns the current user's spreadsheet link/info. Viewer password is NEVER
 * returned here — only email + `hasPassword`. Decryption happens only via
 * POST /api/google-sheets/reveal-password after an explicit UI confirm.
 *
 * Always returns JSON — never an empty 500 body (that surfaces in the UI as
 * "Unexpected end of JSON input").
 */

export async function GET() {
  try {
    const user = await getCurrentUserFromCookies();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'NOT_AUTHENTICATED' },
        { status: 401 }
      );
    }

    const infoConfig = loadGoogleSheetsInfoConfig();
    let syncWritesEnabled = false;
    try {
      syncWritesEnabled = loadGoogleSheetsConfig().enabled;
    } catch (err) {
      // Malformed sync config (e.g. Compose-stripped SPREADSHEET_MAP JSON)
      // must not kill the info page — show links from infoConfig anyway.
      console.warn(
        '[google-sheets/info] loadGoogleSheetsConfig failed:',
        err instanceof Error ? err.message : err
      );
      syncWritesEnabled = false;
    }

    const infoConfigured = Object.keys(infoConfig.spreadsheetMap).length > 0;
    if (!infoConfigured) {
      return NextResponse.json({
        success: true,
        data: { infoConfigured: false, syncWritesEnabled },
      });
    }

    const spreadsheetId = infoConfig.spreadsheetMap[user.username] ?? null;
    const spreadsheetError = spreadsheetId
      ? null
      : `No spreadsheet configured for user "${user.username}" in GOOGLE_SHEETS_SPREADSHEET_MAP.`;

    let viewerAccountEmail = process.env.GOOGLE_SHEETS_VIEWER_ACCOUNT_EMAIL || null;
    let hasPassword = Boolean(process.env.GOOGLE_SHEETS_VIEWER_ACCOUNT_PASSWORD);
    if (!viewerAccountEmail || !hasPassword) {
      try {
        const secretsItem = await runWithRepoContext(
          { repoGuid: user.repoGuid, username: user.username },
          async () => resolveByNames(['secrets'])
        );
        const body = typeof secretsItem?.body === 'string' ? secretsItem.body : '';
        const userMatch = body.match(/^user:\s*(.+)$/m);
        const passMatch = body.match(/^pass:\s*(.+)$/m);
        if (userMatch?.[1]) viewerAccountEmail = userMatch[1].trim();
        if (passMatch?.[1]) hasPassword = true;
      } catch (err) {
        console.warn('[google-sheets/info] secrets lookup failed:', err instanceof Error ? err.message : err);
      }
    }

    const syncStatus = await getGoogleSheetsUserSyncStatus(user.username);

    return NextResponse.json({
      success: true,
      data: {
        infoConfigured: true,
        syncWritesEnabled,
        chadUsername: user.username,
        spreadsheetId,
        spreadsheetUrl: spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/` : null,
        spreadsheetError,
        serviceAccountEmail: infoConfig.serviceAccountEmail || null,
        viewerAccount:
          viewerAccountEmail
            ? { email: viewerAccountEmail, hasPassword }
            : null,
        syncStatus,
      },
    });
  } catch (err) {
    console.error('[google-sheets/info] FATAL:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'GOOGLE_SHEETS_INFO_FAILED',
      },
      { status: 500 }
    );
  }
}
