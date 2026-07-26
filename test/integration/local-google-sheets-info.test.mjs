/**
 * Story 89 — History → Google Sheets regression (no browser).
 *
 * Guards the failure mode where /api/google-sheets/info returned HTTP 500
 * with an empty body → UI: "Failed to execute 'json' on 'Response':
 * Unexpected end of JSON input".
 *
 * Run (local Docker up):
 *   pnpm test:integration:local-google-sheets-info
 */
import { describe, it, expect, beforeAll } from "vitest";

const BASE = process.env.LOCAL_DASHBOARD_BASE_URL || "http://localhost:12020";
const PASSWORD = process.env.E2E_LOGIN_PASSWORD || "changeme";

async function loginAs(username) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookieHeader = setCookie.map((c) => c.split(";")[0]).join("; ");
  expect(res.status, `login ${username}`).toBe(200);
  return cookieHeader;
}

async function getSheetsInfo(cookieHeader) {
  const res = await fetch(`${BASE}/api/google-sheets/info`, {
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
  });
  const text = await res.text();
  return { status: res.status, text, contentType: res.headers.get("content-type") || "" };
}

beforeAll(async () => {
  const probe = await fetch(`${BASE}/login`).catch(() => null);
  if (!probe || !probe.ok) {
    throw new Error(
      `Local dashboard not reachable at ${BASE} — start with bash-scripts/dashboard/03_local_mac_docker/03_re-start.sh`
    );
  }
});

describe("Local Docker — History Google Sheets info API", () => {
  it("never returns an empty body (regression: Unexpected end of JSON input)", async () => {
    const cookie = await loginAs("pawel_f");
    const { status, text, contentType } = await getSheetsInfo(cookie);

    expect(text.length, `empty body would break res.json() — HTTP ${status}`).toBeGreaterThan(0);
    expect(contentType).toMatch(/json/i);

    let json;
    expect(() => {
      json = JSON.parse(text);
    }).not.toThrow();
    expect(json).toHaveProperty("success");
    // Authenticated: must be JSON success envelope, not a bare Next crash.
    expect(typeof json.success).toBe("boolean");
  });

  it("pawel_f gets a configured spreadsheet link when map is present", async () => {
    const cookie = await loginAs("pawel_f");
    const { status, text } = await getSheetsInfo(cookie);
    expect(status).toBe(200);
    const json = JSON.parse(text);
    expect(json.success).toBe(true);
    expect(json.data).toBeTruthy();
    if (json.data.infoConfigured) {
      expect(json.data.chadUsername).toBe("pawel_f");
      expect(json.data.spreadsheetId).toBeTruthy();
      expect(json.data.spreadsheetUrl).toMatch(/^https:\/\/docs\.google\.com\/spreadsheets\//);
    }
  });

  it("unauthenticated call returns JSON 401, never empty", async () => {
    const { status, text } = await getSheetsInfo("");
    expect(text.length).toBeGreaterThan(0);
    const json = JSON.parse(text);
    expect(status).toBe(401);
    // Middleware returns `{ error: "Unauthorized" }`; route itself would
    // return `{ success: false, error: "NOT_AUTHENTICATED" }`. Either is fine
    // — the regression is empty/non-JSON body.
    expect(json.error === "Unauthorized" || json.error === "NOT_AUTHENTICATED").toBe(true);
  });
});
