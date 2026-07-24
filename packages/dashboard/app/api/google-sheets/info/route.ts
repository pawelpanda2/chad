import { NextResponse } from 'next/server';
import {
  loadGoogleSheetsConfig,
  loadGoogleSheetsInfoConfig,
  runWithRepoContext,
  resolveByNames,
} from 'dba';
import { getCurrentUserFromCookies } from '@/lib/session';

/**
 * GET /api/google-sheets/info
 *
 * Returns the current user's spreadsheet link/info. Viewer password is NEVER
 * returned here — only email + `hasPassword`. Decryption happens only via
 * POST /api/google-sheets/reveal-password after an explicit UI confirm.
 */

export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'NOT_AUTHENTICATED' },
      { status: 401 }
    );
  }

  const infoConfig = loadGoogleSheetsInfoConfig();
  const syncConfig = loadGoogleSheetsConfig();

  const infoConfigured = Object.keys(infoConfig.spreadsheetMap).length > 0;
  if (!infoConfigured) {
    return NextResponse.json({
      success: true,
      data: { infoConfigured: false, syncWritesEnabled: syncConfig.enabled },
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

  return NextResponse.json({
    success: true,
    data: {
      infoConfigured: true,
      syncWritesEnabled: syncConfig.enabled,
      chadUsername: user.username,
      spreadsheetId,
      spreadsheetUrl: spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/` : null,
      spreadsheetError,
      serviceAccountEmail: infoConfig.serviceAccountEmail || null,
      viewerAccount:
        viewerAccountEmail
          ? { email: viewerAccountEmail, hasPassword }
          : null,
    },
  });
}
