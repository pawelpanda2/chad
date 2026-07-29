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
 * Uses the Web Crypto API (`crypto.subtle`), not `node:crypto` — this same
 * module is imported directly by `middleware.ts`, which runs on the Edge
 * runtime (no `node:crypto`) as well as by Node-runtime route handlers.
 * `crypto.subtle` is available in both, and HMAC-SHA256 output is identical
 * either way, so tokens verify the same regardless of which runtime issued
 * or checks them.
 *
 * Backward-compatible rollout: if `SESSION_SIGNING_SECRET` isn't set yet in
 * this environment's compose (not deployed everywhere in one commit), this
 * module falls back to the old unsigned/unexpiring behavior so login
 * doesn't break on an environment that hasn't been given the new secret —
 * but logs loudly every time, since running without it is the exact
 * vulnerability this module exists to close. Set `SESSION_SIGNING_SECRET`
 * in `.env.local`/`.env.qnap` and redeploy to activate real signing.
 */

const SESSION_LIFETIME_MS = 1000 * 60 * 60 * 24 * 7; // 7 days — matches the cookie's own Max-Age.

const encoder = new TextEncoder();

function getSigningSecret(): string | null {
  return process.env.SESSION_SIGNING_SECRET || null;
}

async function getHmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    bytes[i] = byte;
  }
  return bytes;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sign(repoGuid: string, issuedAtMs: number, secret: string): Promise<string> {
  const key = await getHmacKey(secret, "sign");
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${repoGuid}:${issuedAtMs}`));
  return bytesToHex(signature);
}

export async function createSessionToken(repoGuid: string): Promise<string> {
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
  return `${repoGuid}:${issuedAtMs}:${await sign(repoGuid, issuedAtMs, secret)}`;
}

/** Returns the repoGuid if the token is validly signed and not expired, else null. */
export async function verifySessionToken(token: string): Promise<string | null> {
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
  const [repoGuid, issuedAtStr, signatureHex] = parts;
  const issuedAtMs = Number(issuedAtStr);
  if (!repoGuid || !Number.isFinite(issuedAtMs)) return null;
  if (Date.now() - issuedAtMs > SESSION_LIFETIME_MS) return null; // expired — server-side, not just the cookie's Max-Age.

  const signatureBytes = hexToBytes(signatureHex);
  if (!signatureBytes) return null;

  const key = await getHmacKey(secret, "verify");
  const valid = await crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(`${repoGuid}:${issuedAtMs}`));
  return valid ? repoGuid : null;
}
