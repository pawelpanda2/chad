// offline-readonly-backup — Dev Panel data source E2E (unit-level DOM checks via Playwright if stack up).
import { test, expect } from "@playwright/test";

const BASE = process.env.LOCAL_DASHBOARD_BASE_URL || "http://localhost:12020";
const PASSWORD = process.env.E2E_LOGIN_PASSWORD || "changeme";

test.describe("Dev Panel — offline-readonly-backup data source", () => {
  test.use({ baseURL: BASE });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("pawel_f");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("two-column ACTIVE / CHANGE OPTIONS layout", async ({ page }) => {
    await page.locator(".dev-panel-handle").click();
    await page.getByRole("button", { name: /Settings/i }).click();

    await expect(page.getByTestId("dev-panel-data-source-grid")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("dev-panel-active-column")).toContainText("ACTIVE");
    await expect(page.getByTestId("dev-panel-change-options-column")).toContainText("CHANGE OPTIONS");
    await expect(page.getByTestId("dev-panel-chad-source-select")).toBeVisible();
    await expect(page.getByTestId("dev-panel-active-status")).toContainText("Server PostgreSQL");
  });

  test("offline-readonly-backup warning and disabled Switch without backup", async ({ page }) => {
    await page.locator(".dev-panel-handle").click();
    await page.getByRole("button", { name: /Settings/i }).click();
    await page.getByTestId("dev-panel-chad-source-select").selectOption("offline-readonly-backup");
    await expect(page.getByTestId("dev-panel-offline-warning")).toBeVisible();
    await expect(page.getByTestId("dev-panel-switch-button")).toBeDisabled();
  });
});
