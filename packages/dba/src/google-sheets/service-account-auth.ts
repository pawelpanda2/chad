/**
 * Google service-account OAuth2 (Story 75) — signs a JWT and exchanges it
 * for an access token, using only Node's built-in `crypto`/`fetch` (no
 * `googleapis`/`google-auth-library` dependency, matching this package's
 * existing lean dependency list — see `backlog/stories/75/02_plan.md` §3).
 *
 * Real network access — never imported by any test. Tests use
 * `FakeGoogleSheetsClient` instead, which never reaches this module.
 */

import { createSign } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
/** Google JWTs are capped at 1 hour; refresh a little early. */
const TOKEN_LIFETIME_SECONDS = 3600;
const REFRESH_SKEW_MS = 60_000;

export interface ServiceAccountCredentials {
  email: string;
  /** Real newlines already (see `config.ts`'s `normalizePrivateKey`). */
  privateKey: string;
}

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function signJwt(credentials: ServiceAccountCredentials, nowSeconds: number): string {
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: credentials.email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + TOKEN_LIFETIME_SECONDS,
  };

  const signingInput = `${base64url(Buffer.from(JSON.stringify(header)))}.${base64url(
    Buffer.from(JSON.stringify(claimSet))
  )}`;

  const signature = createSign("RSA-SHA256").update(signingInput).sign(credentials.privateKey);
  return `${signingInput}.${base64url(signature)}`;
}

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

/**
 * Caches one access token per distinct service-account email in the current
 * process — a fresh token is fetched only once per ~hour per identity, not
 * once per Sheets API call.
 */
const tokenCache = new Map<string, CachedToken>();

/** Exposed for tests that want to reset cross-test state; not used by production code paths. */
export function clearServiceAccountTokenCache(): void {
  tokenCache.clear();
}

export async function getServiceAccountAccessToken(
  credentials: ServiceAccountCredentials,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const cached = tokenCache.get(credentials.email);
  if (cached && cached.expiresAtMs - REFRESH_SKEW_MS > Date.now()) {
    return cached.accessToken;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const jwt = signJwt(credentials, nowSeconds);

  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: GRANT_TYPE, assertion: jwt }),
  });

  if (!response.ok) {
    // Never include the JWT/assertion itself (it's derived from the private
    // key) in the thrown error — only Google's own response body, which
    // describes the auth failure, not the secret.
    const bodyText = await response.text().catch(() => "");
    throw new Error(`Google service-account token exchange failed (HTTP ${response.status}): ${bodyText}`);
  }

  const body = (await response.json()) as { access_token: string; expires_in: number };
  tokenCache.set(credentials.email, {
    accessToken: body.access_token,
    expiresAtMs: Date.now() + body.expires_in * 1000,
  });
  return body.access_token;
}
