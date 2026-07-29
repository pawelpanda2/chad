// READY FOR BOSS audit, section 3 — a real server environment (QNAP
// TEST/PROD) must have SESSION_SIGNING_SECRET configured. session-token.ts
// silently falls back to unsigned, forgeable cookies (`repoGuid:issuedAt`,
// 2 parts) when the secret isn't set — a safe default for local dev, but a
// real regression on any server environment that's supposed to have it.
// This test fails loudly in exactly that case, instead of only logging it
// server-side (see session-token.ts's own doc comment).
//
// Run: QNAP_TEST_BASE_URL=http://100.117.139.83:12020 vitest run \
//   tests/1_1_data-protection/integration/session-signing-configured.test.mjs
import { describe, it, expect } from "vitest";

const BASE = process.env.QNAP_TEST_BASE_URL || "http://100.117.139.83:12020";
const USERNAME = "test3"; // Story 89's sanctioned disposable fixture — real on QNAP TEST too.
const PASSWORD = process.env.E2E_LOGIN_PASSWORD || "changeme";
const TEST3_REPO_GUID = "5a9c8b7d-6e5f-4a3b-2c1d-0e9f8a7b6c5d";

describe("QNAP TEST — SESSION_SIGNING_SECRET is deployed", () => {
  it("issues a signed session cookie (repoGuid:issuedAt:hmac), not the old unsigned 2-part format", async () => {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    });
    expect(res.status).toBe(200);

    const setCookie = res.headers.getSetCookie?.() ?? [];
    const sessionCookieHeader = setCookie.find((c) => c.startsWith("session="));
    expect(sessionCookieHeader, "no session cookie in Set-Cookie header").toBeTruthy();

    const rawValue = decodeURIComponent(sessionCookieHeader.split(";")[0].slice("session=".length));
    const parts = rawValue.split(":");

    expect(
      parts.length,
      "session cookie is UNSIGNED (2 parts: repoGuid:issuedAt) — SESSION_SIGNING_SECRET is not " +
        "set on this server environment. Generate one and add it to .env.qnap on QNAP (never commit " +
        "it), then redeploy — see packages/dashboard/lib/session-token.ts."
    ).toBe(3);

    const [repoGuid, issuedAtStr, hmacHex] = parts;
    expect(repoGuid).toBe(TEST3_REPO_GUID);
    expect(Number.isFinite(Number(issuedAtStr))).toBe(true);
    expect(hmacHex).toMatch(/^[0-9a-f]{64}$/); // HMAC-SHA256 hex digest — 32 bytes.
  });
});
