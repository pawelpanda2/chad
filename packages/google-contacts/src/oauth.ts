import {
  GOOGLE_CONTACTS_READONLY_SCOPE,
  GoogleContactsError,
  type GoogleContactsConfig,
  type GoogleOAuthTokenSet,
} from "./types.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export function requireGoogleContactsConfig(env: NodeJS.ProcessEnv = process.env): GoogleContactsConfig {
  const clientId = env.GOOGLE_CONTACTS_CLIENT_ID?.trim() || "";
  const clientSecret = env.GOOGLE_CONTACTS_CLIENT_SECRET?.trim() || "";
  const redirectUri = env.GOOGLE_CONTACTS_REDIRECT_URI?.trim() || "";
  if (!clientId || !clientSecret || !redirectUri) {
    throw new GoogleContactsError(
      "not_configured",
      "Google Contacts OAuth is not configured (GOOGLE_CONTACTS_CLIENT_ID / CLIENT_SECRET / REDIRECT_URI).",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

export function buildGoogleContactsAuthUrl(config: GoogleContactsConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_CONTACTS_READONLY_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function parseTokenResponse(res: Response): Promise<GoogleOAuthTokenSet> {
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new GoogleContactsError("api_error", "Google token endpoint returned non-JSON.");
  }
  if (!res.ok) {
    const err = typeof json.error === "string" ? json.error : `http_${res.status}`;
    if (err === "invalid_grant") {
      throw new GoogleContactsError("auth_expired", "Google authorization expired or was revoked.");
    }
    throw new GoogleContactsError("api_error", `Google token exchange failed (${err}).`);
  }
  const accessToken = typeof json.access_token === "string" ? json.access_token : "";
  if (!accessToken) {
    throw new GoogleContactsError("api_error", "Google token response missing access_token.");
  }
  return {
    accessToken,
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    expiresIn: typeof json.expires_in === "number" ? json.expires_in : undefined,
    tokenType: typeof json.token_type === "string" ? json.token_type : undefined,
    scope: typeof json.scope === "string" ? json.scope : undefined,
  };
}

export async function exchangeGoogleContactsCode(
  config: GoogleContactsConfig,
  code: string,
): Promise<GoogleOAuthTokenSet> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      code,
    }),
  });
  return parseTokenResponse(res);
}

export async function refreshGoogleContactsAccessToken(
  config: GoogleContactsConfig,
  refreshToken: string,
): Promise<GoogleOAuthTokenSet> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  return parseTokenResponse(res);
}
