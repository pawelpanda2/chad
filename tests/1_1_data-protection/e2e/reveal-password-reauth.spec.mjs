// 2026-07-28 P0 fix regression — POST /api/google-sheets/reveal-password
// must require server-side reauth (the caller's own current account
// password), never just a valid session cookie. Requires the LOCAL
// dashboard to have been rebuilt+redeployed with this fix (see
// tests/release-audit-report.md) — a stale container will fail this with
// 500 REVEAL_FAILED instead of 403 REAUTH_REQUIRED/REAUTH_FAILED.
import { test, expect } from "@playwright/test";

const BASE = process.env.LOCAL_DASHBOARD_BASE_URL || "http://localhost:12020";
const PASSWORD = process.env.E2E_LOGIN_PASSWORD || "changeme";

test.describe("reveal-password requires server-side reauth", () => {
  test.use({ baseURL: BASE });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("test3");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("no currentPassword in the request -> 403, never reveals anything", async ({ request }) => {
    const res = await request.post("/api/google-sheets/reveal-password", { data: {} });
    expect(res.status()).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("REAUTH_REQUIRED");
  });

  test("wrong currentPassword -> 403, never reveals anything", async ({ request }) => {
    const res = await request.post("/api/google-sheets/reveal-password", {
      data: { currentPassword: "definitely-not-the-password" },
    });
    expect(res.status()).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("REAUTH_FAILED");
  });
});
