/**
 * Reversible encryption for small secret values stored in a `cp_item`'s
 * body (e.g. `packages/dba`'s "secrets" item — the shared Google viewing
 * account credentials, see `ai-docs/google-sheets/architecture.md`).
 *
 * Deliberately NOT the same mechanism as CHAD login's `passwordHash`
 * (bcrypt, one-way, `packages/dashboard/app/api/auth/login/route.ts`) —
 * that field only ever needs to be *verified*, never displayed back to a
 * user. This module is for the opposite case: a value the app must be
 * able to show the user again on request ("click to reveal"), so it uses
 * real symmetric encryption (AES-256-GCM) instead of a hash.
 *
 * Key: `SECRETS_ENCRYPTION_KEY` env var, 32 raw bytes, base64-encoded.
 * Never derived from anything else, never defaulted — a missing/invalid
 * key throws a specific, actionable error rather than silently producing
 * unusable ciphertext.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12; // GCM standard nonce size
const KEY_LENGTH_BYTES = 32; // AES-256

function loadKey(): Buffer {
  const raw = process.env.SECRETS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "SECRETS_ENCRYPTION_KEY environment variable is not set — required to encrypt/decrypt cp_item secrets."
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `SECRETS_ENCRYPTION_KEY must decode to exactly ${KEY_LENGTH_BYTES} bytes (base64 of a 32-byte key), got ${key.length}.`
    );
  }
  return key;
}

/**
 * Encrypts `plaintext`, returning a single self-contained string
 * (`iv.authTag.ciphertext`, each base64url-encoded) safe to store directly
 * as a `cp_item`'s `body`.
 */
export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64url")).join(".");
}

/** Reverses `encryptSecret`. Throws (never returns garbage) if the value is malformed or the auth tag doesn't verify. */
export function decryptSecret(stored: string): string {
  const key = loadKey();
  const parts = stored.split(".");
  if (parts.length !== 3) {
    throw new Error("Stored secret is not in the expected iv.authTag.ciphertext format.");
  }
  const [ivB64, authTagB64, ciphertextB64] = parts;
  const iv = Buffer.from(ivB64, "base64url");
  const authTag = Buffer.from(authTagB64, "base64url");
  const ciphertext = Buffer.from(ciphertextB64, "base64url");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
