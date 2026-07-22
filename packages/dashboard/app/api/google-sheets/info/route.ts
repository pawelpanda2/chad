/**
 * API Endpoint: Google Sheets info for the History -> Google Sheets page.
 *
 * GET /api/google-sheets/info
 *
 * Returns the current user's own spreadsheet link (never another user's —
 * resolved from the session's repoGuid/username via
 * `loadGoogleSheetsInfoConfig()`, not a query/body param), the service
 * account it's shared with (non-secret — an email address, not a
 * credential), and, if configured, the shared viewing account's login
 * (GOOGLE_SHEETS_VIEWER_ACCOUNT_EMAIL/PASSWORD — optional, omitted from the
 * response entirely when unset, never guessed/defaulted).
 *
 * Story 78: `infoConfigured` (whether there's anything to show) and
 * `syncWritesEnabled` (whether the background worker may actually write to
 * Google) are now two independent fields, backed by two independent config
 * loaders — `loadGoogleSheetsInfoConfig()` (spreadsheet map + service
 * account email only, no secret key, works on any environment) and
 * `loadGoogleSheetsConfig()` (full write-sync config, still gated by
 * GOOGLE_SHEETS_ENABLED + production-guard.ts, unchanged). Before this
 * Story a single `enabled` flag conflated both, so QNAP TEST — which
 * deliberately never sets GOOGLE_SHEETS_ENABLED (see
 * docker-compose.qnap.test.yml) — always showed "Google Sheets sync is not
 * enabled on this environment." with no link at all, even though showing
 * a user's own spreadsheet link/info there is perfectly safe. This route
 * never reads or returns GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY either way.
 */

import { NextResponse } from 'next/server';
import { loadGoogleSheetsConfig, loadGoogleSheetsInfoConfig } from 'dba';
import { getCurrentUserFromCookies } from '@/lib/session';

export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'NOT_AUTHENTICATED' },
      { status: 401 }
    );
  }

  const infoConfig = loadGoogleSheetsInfoConfig();
  // Safe to call even when disabled — loadGoogleSheetsConfig() returns a
  // blank/disabled shape without requiring any other var when
  // GOOGLE_SHEETS_ENABLED is unset/false (its own existing contract,
  // unchanged by this Story). Used here only for the syncWritesEnabled
  // display flag, never to gate whether info is shown.
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

  const viewerAccountEmail = process.env.GOOGLE_SHEETS_VIEWER_ACCOUNT_EMAIL || null;
  const viewerAccountPassword = process.env.GOOGLE_SHEETS_VIEWER_ACCOUNT_PASSWORD || null;

  return NextResponse.json({
    success: true,
    data: {
      infoConfigured: true,
      syncWritesEnabled: syncConfig.enabled,
      chadUsername: user.username,
      spreadsheetId,
      spreadsheetUrl: spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` : null,
      spreadsheetError,
      serviceAccountEmail: infoConfig.serviceAccountEmail || null,
      // Only present when both are actually configured — the page must
      // never show a half-filled-in credential.
      viewerAccount:
        viewerAccountEmail && viewerAccountPassword
          ? { email: viewerAccountEmail, password: viewerAccountPassword }
          : null,
    },
  });
}
