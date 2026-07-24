// Story 89 — Dev Panel Settings source toggles (Local vs Server).
import { test, expect } from "@playwright/test";

const BASE = process.env.LOCAL_DASHBOARD_BASE_URL || "http://localhost:12020";
const PASSWORD = process.env.E2E_LOGIN_PASSWORD || "changeme";

test.describe("Local Docker — Dev Panel Settings toggles", () => {
  test.use({ baseURL: BASE });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("pawel_f");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("Postgres and Mongo Local/Server toggles switch and stick", async ({ page }) => {
    const handle = page.locator(".dev-panel-handle");
    await expect(handle).toBeVisible({ timeout: 10_000 });
    await handle.click();
    await page.getByRole("button", { name: /Settings/i }).click();

    const pgLocal = page.getByTestId("dev-panel-postgres-source-local");
    const pgServer = page.getByTestId("dev-panel-postgres-source-qnap");
    const mongoLocal = page.getByTestId("dev-panel-mongo-source-local");
    const mongoServer = page.getByTestId("dev-panel-mongo-source-qnap");
    const pgStatus = page.getByTestId("dev-panel-postgres-status");
    const mongoStatus = page.getByTestId("dev-panel-mongo-status");

    await expect(pgLocal).toBeEnabled({ timeout: 15_000 });
    await expect(pgServer).toBeEnabled();
    await expect(pgStatus).toBeVisible();

    // Local → Server → Local (status must update, no snap-back).
    await pgLocal.click();
    await expect(pgStatus).toContainText(/Local Postgres/i, { timeout: 15_000 });
    await expect(pgStatus).toContainText(/postgres:5432|127\.0\.0\.1:5433/);

    await pgServer.click();
    await expect(pgStatus).toContainText(/Server Postgres|QNAP/i, { timeout: 15_000 });
    await expect(pgStatus).toContainText("100.117.139.83:12042");

    await pgLocal.click();
    await expect(pgStatus).toContainText(/Local Postgres/i, { timeout: 15_000 });

    await mongoServer.click();
    await expect(mongoStatus).toContainText(/Server Mongo|QNAP/i, { timeout: 15_000 });
    await expect(mongoStatus).toContainText("100.117.139.83:12040");

    await mongoLocal.click();
    await expect(mongoStatus).toContainText(/Local Mongo/i, { timeout: 15_000 });
  });
});
