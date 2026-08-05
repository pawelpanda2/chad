import { NextResponse } from "next/server";
import { hasGoogleContactsConnection, runWithRepoContext } from "dba";
import { requireGoogleContactsConfig, GoogleContactsError } from "google-contacts";
import { getCurrentUserFromCookies } from "@/lib/session";

/**
 * GET /api/google-contacts/status
 * { configured, connected } — never returns tokens.
 */
export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  let configured = true;
  let redirectUri: string | null = null;
  try {
    const config = requireGoogleContactsConfig();
    redirectUri = config.redirectUri;
  } catch (err) {
    if (err instanceof GoogleContactsError && err.code === "not_configured") configured = false;
    else configured = false;
  }

  try {
    const connected = configured
      ? await runWithRepoContext(user, () => hasGoogleContactsConnection())
      : false;
    // redirectUri is public (must match Google Cloud Console); never tokens/secrets.
    return NextResponse.json({ success: true, configured, connected, redirectUri });
  } catch (error) {
    console.error("[google-contacts/status]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
