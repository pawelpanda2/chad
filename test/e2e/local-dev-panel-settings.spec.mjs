// Story 89 — superseded by offline-readonly-backup Dev Panel (ACTIVE / CHANGE OPTIONS).
// Kept as smoke test for Server PostgreSQL active state.
import { test, expect } from "@playwright/test";

const BASE = process.env.LOCAL_DASHBOARD_BASE_URL || "http://localhost:12020";
const PASSWORD = process.env.E2E_LOGIN_PASSWORD || "changeme";

test.describe("Local Docker — Dev Panel data source", () => {
  test.use({ baseURL: BASE });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("pawel_f");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("ACTIVE shows Server PostgreSQL by default", async ({ page }) => {
    const handle = page.locator(".dev-panel-handle");
    await expect(handle).toBeVisible({ timeout: 10_000 });
    await handle.click();
    await page.getByRole("button", { name: /Settings/i }).click();
    await expect(page.getByTestId("dev-panel-active-status")).toContainText("Server PostgreSQL", {
      timeout: 15_000,
    });
  });
});
