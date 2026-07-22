/**
 * API Endpoint: Google Sheets info for the History -> Google Sheets page.
 *
 * GET /api/google-sheets/info
 *
 * Returns the current user's own spreadsheet link (never another user's —
 * resolved from the session's repoGuid/username via the same
 * resolveSpreadsheetIdForUser used by the real sync path, not a query/body
 * param), the service account it's shared with (non-secret — an email
 * address, not a credential), and, if configured, the shared viewing
 * account's login (GOOGLE_SHEETS_VIEWER_ACCOUNT_EMAIL/PASSWORD — optional,
 * omitted from the response entirely when unset, never guessed/defaulted).
 */

import { NextResponse } from 'next/server';
import { loadGoogleSheetsConfig, resolveSpreadsheetIdForUser } from 'dba';
import { getCurrentUserFromCookies } from '@/lib/session';

export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'NOT_AUTHENTICATED' },
      { status: 401 }
    );
  }

  const config = loadGoogleSheetsConfig();
  if (!config.enabled) {
    return NextResponse.json({ success: true, data: { enabled: false } });
  }

  let spreadsheetId: string | null = null;
  let spreadsheetError: string | null = null;
  try {
    spreadsheetId = resolveSpreadsheetIdForUser(config, user.username);
  } catch (error) {
    spreadsheetError = error instanceof Error ? error.message : 'No spreadsheet configured for this user';
  }

  const viewerAccountEmail = process.env.GOOGLE_SHEETS_VIEWER_ACCOUNT_EMAIL || null;
  const viewerAccountPassword = process.env.GOOGLE_SHEETS_VIEWER_ACCOUNT_PASSWORD || null;

  return NextResponse.json({
    success: true,
    data: {
      enabled: true,
      spreadsheetId,
      spreadsheetUrl: spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` : null,
      spreadsheetError,
      serviceAccountEmail: config.serviceAccountEmail || null,
      // Only present when both are actually configured — the page must
      // never show a half-filled-in credential.
      viewerAccount:
        viewerAccountEmail && viewerAccountPassword
          ? { email: viewerAccountEmail, password: viewerAccountPassword }
          : null,
    },
  });
}
