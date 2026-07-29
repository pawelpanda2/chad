// offline-readonly-backup — Dev Panel radio data-source E2E
import { test, expect } from "@playwright/test";

const BASE = process.env.LOCAL_DASHBOARD_BASE_URL || "http://localhost:12020";
const PASSWORD = process.env.E2E_LOGIN_PASSWORD || "changeme";

test.describe("Dev Panel — offline-readonly-backup radio controls", () => {
  test.use({ baseURL: BASE });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("pawel_f");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("radio groups render; label click selects; one per group", async ({ page }) => {
    await page.locator(".dev-panel-handle").click();
    await page.getByRole("button", { name: /Settings/i }).click();

    await expect(page.getByTestId("dev-panel-data-source-grid")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("dev-panel-chad-postgres-fieldset")).toBeVisible();
    await expect(page.getByTestId("dev-panel-beeper-mongo-fieldset")).toBeVisible();
    await expect(page.locator("select#dev-panel-chad-source-select")).toHaveCount(0);
    await expect(page.locator("select#dev-panel-mongo-source-select")).toHaveCount(0);

    // Click text label for offline — radio checks
    await page.getByTestId("dev-panel-radio-postgres-offline").click();
    await expect(page.getByTestId("dev-panel-radio-postgres-offline").locator('input[type="radio"]')).toBeChecked();
    await expect(page.getByTestId("dev-panel-radio-postgres-server").locator('input[type="radio"]')).not.toBeChecked();
    await expect(page.getByTestId("dev-panel-offline-warning")).toContainText("Tryb awaryjny: tylko odczyt");

    // Mongo independent
    await page.getByTestId("dev-panel-radio-mongo-local").click();
    await expect(page.getByTestId("dev-panel-radio-mongo-local").locator('input[type="radio"]')).toBeChecked();
    await expect(page.getByTestId("dev-panel-radio-mongo-server").locator('input[type="radio"]')).not.toBeChecked();
    // Postgres selection unchanged
    await expect(page.getByTestId("dev-panel-radio-postgres-offline").locator('input[type="radio"]')).toBeChecked();

    await expect(page.getByTestId("dev-panel-apply-postgres")).toBeVisible();
    await expect(page.getByTestId("dev-panel-apply-mongo")).toBeVisible();
  });

  test("offline Apply disabled without confirm; short warning only", async ({ page }) => {
    await page.locator(".dev-panel-handle").click();
    await page.getByRole("button", { name: /Settings/i }).click();
    await page.getByTestId("dev-panel-radio-postgres-offline").click();
    await expect(page.getByTestId("dev-panel-offline-warning")).toBeVisible();
    await expect(page.getByTestId("dev-panel-offline-warning")).not.toContainText("Google Sheets");
    await expect(page.getByTestId("dev-panel-apply-postgres")).toBeDisabled();
  });
});
