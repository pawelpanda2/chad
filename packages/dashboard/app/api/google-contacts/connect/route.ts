import { NextResponse } from "next/server";
import { buildGoogleContactsAuthUrl, requireGoogleContactsConfig, GoogleContactsError } from "google-contacts";
import { getCurrentUserFromCookies } from "@/lib/session";
import { createGoogleContactsOAuthState } from "@/lib/google-contacts-oauth-state";

/**
 * GET /api/google-contacts/connect
 * Returns { authUrl } for the current user — browser navigates there.
 */
export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  try {
    const config = requireGoogleContactsConfig();
    const state = createGoogleContactsOAuthState(user.repoGuid);
    const authUrl = buildGoogleContactsAuthUrl(config, state);
    return NextResponse.json({ success: true, authUrl });
  } catch (error) {
    if (error instanceof GoogleContactsError && error.code === "not_configured") {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 503 });
    }
    console.error("[google-contacts/connect]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
