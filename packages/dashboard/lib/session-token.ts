/**
 * Signed, expiring session tokens (2026-07-28 P0 fix).
 *
 * Previously the `session` cookie was `${repoGuid}:${timestamp}` with no
 * signature and no server-side expiry check — `getCurrentUserFromCookies()`
 * only confirmed the repoGuid matched a real user, never that the cookie
 * was actually issued by this server for that login. Any client that knew
 * or guessed a valid repoGuid could set that exact cookie value themselves
 * (e.g. via devtools/curl) and be treated as that user indefinitely — the
 * 7-day `Max-Age` is a browser-side hint only, never enforced server-side.
 *
 * New format: `${repoGuid}:${issuedAtMs}:${hmacHex}`, where
 * `hmacHex = HMAC-SHA256(SESSION_SIGNING_SECRET, "repoGuid:issuedAtMs")`.
 * `verifySessionToken` rejects a tampered signature or an expired token.
 *
 * Backward-compatible rollout: if `SESSION_SIGNING_SECRET` isn't set yet in
 * this environment's compose (not deployed everywhere in one commit), this
 * module falls back to the old unsigned/unexpiring behavior so login
 * doesn't break on an environment that hasn't been given the new secret —
 * but logs loudly every time, since running without it is the exact
 * vulnerability this module exists to close. Set `SESSION_SIGNING_SECRET`
 * in `.env.local`/`.env.qnap` and redeploy to activate real signing.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_LIFETIME_MS = 1000 * 60 * 60 * 24 * 7; // 7 days — matches the cookie's own Max-Age.

function getSigningSecret(): string | null {
  return process.env.SESSION_SIGNING_SECRET || null;
}

function sign(repoGuid: string, issuedAtMs: number, secret: string): string {
  return createHmac("sha256", secret).update(`${repoGuid}:${issuedAtMs}`).digest("hex");
}

export function createSessionToken(repoGuid: string): string {
  const issuedAtMs = Date.now();
  const secret = getSigningSecret();
  if (!secret) {
    console.error(
      "[session-token] SESSION_SIGNING_SECRET is not set — issuing an UNSIGNED session token. " +
        "This is a known P0 vulnerability (forgeable session cookies) — set SESSION_SIGNING_SECRET " +
        "in .env.local/.env.qnap and redeploy to fix."
    );
    return `${repoGuid}:${issuedAtMs}`;
  }
  return `${repoGuid}:${issuedAtMs}:${sign(repoGuid, issuedAtMs, secret)}`;
}

/** Returns the repoGuid if the token is validly signed and not expired, else null. */
export function verifySessionToken(token: string): string | null {
  const parts = token.split(":");
  const secret = getSigningSecret();

  if (!secret) {
    // Same unsigned fallback as createSessionToken — never reject a token
    // this same (unconfigured) deployment issued, but still never trust an
    // empty/malformed value.
    console.error("[session-token] SESSION_SIGNING_SECRET is not set — accepting UNSIGNED session token (see createSessionToken).");
    return parts[0] || null;
  }

  if (parts.length !== 3) return null; // malformed, or an old-format unsigned token from before this fix — reject, force re-login.
  const [repoGuid, issuedAtStr, signature] = parts;
  const issuedAtMs = Number(issuedAtStr);
  if (!repoGuid || !Number.isFinite(issuedAtMs)) return null;
  if (Date.now() - issuedAtMs > SESSION_LIFETIME_MS) return null; // expired — server-side, not just the cookie's Max-Age.

  const expected = sign(repoGuid, issuedAtMs, secret);
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) return null;

  return repoGuid;
}
