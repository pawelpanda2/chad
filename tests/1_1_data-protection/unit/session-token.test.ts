// READY FOR BOSS audit, section 3 — pure unit coverage for
// packages/dashboard/lib/session-token.ts's signature + expiry logic,
// independent of any live server. Complements
// session-signing-configured.test.mjs (which checks a real deployment
// actually has SESSION_SIGNING_SECRET set) and the live curl-based tamper
// check done manually against QNAP TEST during this audit.
import { describe, it, expect, beforeEach, afterEach } from "vitest";

const ORIGINAL_SECRET = process.env.SESSION_SIGNING_SECRET;

describe("session-token — signature + expiry", () => {
  beforeEach(() => {
    process.env.SESSION_SIGNING_SECRET = "test-only-secret-do-not-use-in-prod";
  });

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.SESSION_SIGNING_SECRET;
    else process.env.SESSION_SIGNING_SECRET = ORIGINAL_SECRET;
  });

  it("creates a 3-part signed token and verifies it back to the same repoGuid", async () => {
    const { createSessionToken, verifySessionToken } = await import("../../../packages/dashboard/lib/session-token");
    const token = await createSessionToken("some-repo-guid");
    expect(token.split(":").length).toBe(3);
    expect(await verifySessionToken(token)).toBe("some-repo-guid");
  });

  it("rejects a tampered signature", async () => {
    const { createSessionToken, verifySessionToken } = await import("../../../packages/dashboard/lib/session-token");
    const token = await createSessionToken("some-repo-guid");
    const [repoGuid, issuedAt, sig] = token.split(":");
    const flippedChar = sig[0] === "0" ? "1" : "0";
    const tampered = `${repoGuid}:${issuedAt}:${flippedChar}${sig.slice(1)}`;
    expect(await verifySessionToken(tampered)).toBeNull();
  });

  it("rejects a tampered repoGuid (signature no longer matches)", async () => {
    const { createSessionToken, verifySessionToken } = await import("../../../packages/dashboard/lib/session-token");
    const token = await createSessionToken("some-repo-guid");
    const [, issuedAt, sig] = token.split(":");
    const forged = `someone-elses-repo-guid:${issuedAt}:${sig}`;
    expect(await verifySessionToken(forged)).toBeNull();
  });

  it("rejects an expired token even with a valid signature", async () => {
    const { verifySessionToken } = await import("../../../packages/dashboard/lib/session-token");
    // Build a validly-signed token whose issuedAt is 8 days in the past
    // (SESSION_LIFETIME_MS is 7 days) — the same HMAC math session-token.ts
    // itself uses, so this is a legitimately-signed but expired token, not a
    // forged one.
    const encoder = new TextEncoder();
    const secret = process.env.SESSION_SIGNING_SECRET!;
    const repoGuid = "some-repo-guid";
    const issuedAtMs = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(`${repoGuid}:${issuedAtMs}`));
    const sigHex = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const expiredToken = `${repoGuid}:${issuedAtMs}:${sigHex}`;

    expect(await verifySessionToken(expiredToken)).toBeNull();
  });

  it("rejects a malformed (old unsigned 2-part) token once a secret is configured", async () => {
    const { verifySessionToken } = await import("../../../packages/dashboard/lib/session-token");
    expect(await verifySessionToken("some-repo-guid:1234567890")).toBeNull();
  });
});
