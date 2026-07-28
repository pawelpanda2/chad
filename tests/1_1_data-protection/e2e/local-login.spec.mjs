// Story 87 — local Docker login panel regression.
//
// Against the already-running local Mac Docker stack (http://localhost:12020).
// Guards the failure mode where DBA_MONGO_MODE=local had an empty/partial
// users-list (Invalid credentials for pawel_f even with the correct password).
//
// Password defaults to "changeme" (local seed). Override with E2E_LOGIN_PASSWORD
// if needed — never commit real secrets.
import { test, expect } from "@playwright/test";

const BASE = process.env.LOCAL_DASHBOARD_BASE_URL || "http://localhost:12020";
const PASSWORD = process.env.E2E_LOGIN_PASSWORD || "changeme";

const LOCAL_USERS = ["pawel_f", "test3", "local_dev"];

test.describe("Local Docker — login panel regression", () => {
  test.use({ baseURL: BASE });

  for (const username of LOCAL_USERS) {
    test(`${username} can sign in via the login panel`, async ({ page }) => {
      await page.goto("/login");
      await expect(page.getByRole("heading", { name: "Personal Dashboard" })).toBeVisible();

      await page.getByLabel("Username").fill(username);
      await page.getByLabel("Password").fill(PASSWORD);
      await page.getByRole("button", { name: "Sign in" }).click();

      await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
      await expect(page.getByText("Invalid credentials")).toHaveCount(0);
    });
  }

  test("wrong password shows Invalid credentials and stays on login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("pawel_f");
    await page.getByLabel("Password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Invalid credentials")).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
