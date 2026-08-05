/**
 * Signed OAuth `state` for Google Contacts connect flow (CSRF + user binding).
 * Payload: repoGuid + nonce + exp. HMAC with SESSION_SIGNING_SECRET
 * (fallback SECRETS_ENCRYPTION_KEY). Never embeds tokens.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const STATE_TTL_MS = 10 * 60 * 1000;

function signingSecret(): string {
  const secret = process.env.SESSION_SIGNING_SECRET || process.env.SECRETS_ENCRYPTION_KEY || "";
  if (!secret) {
    throw new Error("SESSION_SIGNING_SECRET or SECRETS_ENCRYPTION_KEY required for Google Contacts OAuth state");
  }
  return secret;
}

function sign(payloadB64: string): string {
  return createHmac("sha256", signingSecret()).update(payloadB64).digest("base64url");
}

export function createGoogleContactsOAuthState(repoGuid: string): string {
  const payload = {
    r: repoGuid,
    n: randomBytes(16).toString("base64url"),
    e: Date.now() + STATE_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifyGoogleContactsOAuthState(
  state: string,
  expectedRepoGuid: string,
): { ok: true } | { ok: false; reason: string } {
  const parts = state.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [payloadB64, sig] = parts;
  const expectedSig = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad_signature" };
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as {
      r?: string;
      e?: number;
    };
    if (payload.r !== expectedRepoGuid) return { ok: false, reason: "repo_mismatch" };
    if (typeof payload.e !== "number" || Date.now() > payload.e) return { ok: false, reason: "expired" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}
