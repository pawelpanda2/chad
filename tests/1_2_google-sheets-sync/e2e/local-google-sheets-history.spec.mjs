// Story 89 — History → Google Sheets UI regression against local Docker.
// Guards empty-body /api/google-sheets/info (Unexpected end of JSON input).
import { test, expect } from "@playwright/test";

const BASE = process.env.LOCAL_DASHBOARD_BASE_URL || "http://localhost:12020";
const PASSWORD = process.env.E2E_LOGIN_PASSWORD || "changeme";

test.describe("Local Docker — History Google Sheets", () => {
  test.use({ baseURL: BASE });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("pawel_f");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("Google Sheets view loads without Unexpected end of JSON input", async ({ page }) => {
    const infoResponsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/google-sheets/info") && res.request().method() === "GET",
      { timeout: 15_000 }
    );

    await page.goto("/dashboard/history?view=google-sheets");

    const infoRes = await infoResponsePromise;
    const text = await infoRes.text();
    expect(text.length, "info API must not return empty body").toBeGreaterThan(0);
    const json = JSON.parse(text);
    expect(json.success).toBe(true);

    await expect(page.getByText("Unexpected end of JSON input")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Google Sheets" })).toBeVisible();
    await expect(page.getByText(/Sync writes are disabled/i)).toHaveCount(0);

    if (json.data?.infoConfigured) {
      await expect(page.getByTestId("google-sheets-sync-status")).toBeVisible();
      await expect(page.getByTestId("google-sheets-sync-status")).toContainText(/status = /);
    }

    // Either configured (spreadsheet link) or explicit empty-config message —
    // never a raw JSON parse crash.
    const errorBox = page.locator(".text-destructive, [class*='error']").filter({
      hasText: /Unexpected end of JSON|Failed to execute 'json'/i,
    });
    await expect(errorBox).toHaveCount(0);
  });
});
