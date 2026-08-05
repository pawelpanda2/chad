import { NextResponse } from "next/server";
import {
  getGoogleContactsRefreshToken,
  clearGoogleContactsTokens,
  runWithRepoContext,
} from "dba";
import {
  GoogleContactsError,
  listAllGoogleContacts,
  refreshGoogleContactsAccessToken,
  requireGoogleContactsConfig,
} from "google-contacts";
import { getCurrentUserFromCookies } from "@/lib/session";

/**
 * GET /api/google-contacts/list
 * Returns { contacts: GoogleContactDto[] } for the current user only.
 * Never includes access/refresh tokens.
 */
export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  try {
    const config = requireGoogleContactsConfig();
    const refreshToken = await runWithRepoContext(user, () => getGoogleContactsRefreshToken());
    if (!refreshToken) {
      return NextResponse.json(
        { success: false, error: "Google account not connected", code: "not_connected", contacts: [] },
        { status: 409 },
      );
    }

    let accessToken: string;
    try {
      const refreshed = await refreshGoogleContactsAccessToken(config, refreshToken);
      accessToken = refreshed.accessToken;
    } catch (err) {
      if (err instanceof GoogleContactsError && err.code === "auth_expired") {
        await runWithRepoContext(user, () => clearGoogleContactsTokens());
        return NextResponse.json(
          { success: false, error: "Google authorization expired", code: "auth_expired", contacts: [] },
          { status: 401 },
        );
      }
      throw err;
    }

    const contacts = await listAllGoogleContacts(accessToken);
    return NextResponse.json({ success: true, contacts });
  } catch (error) {
    if (error instanceof GoogleContactsError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code, contacts: [] },
        { status: error.code === "not_configured" ? 503 : 500 },
      );
    }
    console.error("[google-contacts/list]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: "Failed to load contacts", contacts: [] },
      { status: 500 },
    );
  }
}
