import { NextRequest, NextResponse } from "next/server";
import {
  exchangeGoogleContactsCode,
  requireGoogleContactsConfig,
  GoogleContactsError,
} from "google-contacts";
import {
  getGoogleContactsRefreshToken,
  runWithRepoContext,
  saveGoogleContactsRefreshToken,
} from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";
import { verifyGoogleContactsOAuthState } from "@/lib/google-contacts-oauth-state";

const SUCCESS_PATH = "/dashboard/msg-automation/google-contacts?connected=1";
const ERROR_PATH = "/dashboard/msg-automation/google-contacts";

function redirectError(request: NextRequest, code: string) {
  const url = new URL(ERROR_PATH, request.url);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url);
}

/**
 * GET /api/google-contacts/callback?code=&state=
 * Exchanges code, stores encrypted refresh token for the session user, redirects to GUI.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return redirectError(request, "not_authenticated");
  }

  const denied = request.nextUrl.searchParams.get("error");
  if (denied) {
    return redirectError(request, "auth_denied");
  }

  const code = request.nextUrl.searchParams.get("code")?.trim() ?? "";
  const state = request.nextUrl.searchParams.get("state")?.trim() ?? "";
  if (!code || !state) {
    return redirectError(request, "missing_params");
  }

  const stateCheck = verifyGoogleContactsOAuthState(state, user.repoGuid);
  if (!stateCheck.ok) {
    return redirectError(request, "invalid_state");
  }

  try {
    const config = requireGoogleContactsConfig();
    const tokens = await exchangeGoogleContactsCode(config, code);
    if (!tokens.refreshToken) {
      // Google may omit refresh_token on re-consent; keep prior token if any.
      // Without a new refresh token and without a prior one, treat as incomplete.
      const existing = await runWithRepoContext(user, () => getGoogleContactsRefreshToken());
      if (!existing) {
        return redirectError(request, "no_refresh_token");
      }
    } else {
      await runWithRepoContext(user, () => saveGoogleContactsRefreshToken(tokens.refreshToken!));
    }
    return NextResponse.redirect(new URL(SUCCESS_PATH, request.url));
  } catch (error) {
    const codeName =
      error instanceof GoogleContactsError ? error.code : "api_error";
    console.error("[google-contacts/callback]", error instanceof Error ? error.message : error);
    return redirectError(request, codeName);
  }
}
