// Story 79 GUI rewrite — Playwright E2E against the real, already-running
// QNAP TEST Dashboard, logged in as test3. Covers the new History table +
// separate details route (replacing the old accordion/pagination list) —
// see backlog/stories/79 for the full write-up. Requires test3 to already
// have at least one Daily/Date Entry create+update+delete so the table has
// Created/Updated/Deleted rows to filter/click through; this spec does not
// itself provision that data (see test/integration/qnap-test3-daily-dates.test.mjs).
import { test, expect } from "@playwright/test";

const TEST3_PASSWORD = process.env.E2E_TEST3_PASSWORD;
test.skip(!TEST3_PASSWORD, "E2E_TEST3_PASSWORD not set — skipping (never hardcoded/committed)");

test.describe("QNAP TEST — test3 History table + details route", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: "Username" }).fill("test3");
    await page.getByRole("textbox", { name: "Password" }).fill(TEST3_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("History -> All Items renders as a table, not an accordion, with no pagination controls", async ({ page }) => {
    await page.goto("/dashboard/history?view=items");

    const table = page.getByTestId("history-table");
    await expect(table).toBeVisible();

    // Columns, in order.
    await expect(table.getByRole("columnheader").nth(0)).toHaveText("Date");
    await expect(table.getByRole("columnheader").nth(1)).toHaveText("Op");
    await expect(table.getByRole("columnheader").nth(2)).toHaveText("loca");

    // No pagination remnants anywhere on the page.
    await expect(page.getByRole("button", { name: "Previous" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Next" })).toHaveCount(0);
    await expect(page.getByText(/Page \d+ of \d+/)).toHaveCount(0);
    await expect(page.getByText(/^\d+–\d+ of \d+$/)).toHaveCount(0);

    // No accordion affordance (chevron expand/collapse) on any row.
    await expect(page.locator('[data-testid="history-row"] button')).toHaveCount(0);

    // Default filter label is "All", not "All operations".
    await expect(page.getByRole("combobox", { name: "Operation" })).toHaveValue("");
    await expect(page.getByRole("combobox", { name: "Operation" }).locator("option", { hasText: "All operations" })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Operation" }).locator("option", { hasText: "All" }).first()).toBeAttached();
  });

  test("Operation filter (Created/Updated/Deleted) narrows the table without any pagination", async ({ page }) => {
    await page.goto("/dashboard/history?view=items");
    const table = page.getByTestId("history-table");
    await expect(table).toBeVisible();

    const filter = page.getByRole("combobox", { name: "Operation" });

    await filter.selectOption("insert");
    await page.waitForTimeout(300); // fetch settle — no loading spinner assertion needed for this quick check
    const insertRows = page.getByTestId("history-row");
    const insertCount = await insertRows.count();
    if (insertCount > 0) {
      for (let i = 0; i < insertCount; i++) {
        await expect(insertRows.nth(i).locator("td").nth(1)).toHaveText("C");
      }
    }

    await filter.selectOption("delete");
    await page.waitForTimeout(300);
    const deleteRows = page.getByTestId("history-row");
    const deleteCount = await deleteRows.count();
    if (deleteCount > 0) {
      for (let i = 0; i < deleteCount; i++) {
        await expect(deleteRows.nth(i).locator("td").nth(1)).toHaveText("D");
      }
    }

    await filter.selectOption("");
  });

  test("loca column shows path (no repoGuid) + name on two lines, and clicking a row opens details", async ({ page }) => {
    await page.goto("/dashboard/history?view=items");
    const table = page.getByTestId("history-table");
    await expect(table).toBeVisible();

    const firstRow = page.getByTestId("history-row").first();
    await expect(firstRow).toBeVisible();

    const locaCell = firstRow.locator("td").nth(2);
    const locaCellText = (await locaCell.textContent())?.trim() ?? "";
    expect(locaCellText.length).toBeGreaterThan(0);
    // Must not show the full repoGuid (UUID) in the loca path line.
    expect(locaCellText).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );

    await firstRow.click();
    await expect(page).toHaveURL(/\/dashboard\/history\/entry\/.+/);

    // Details page shows the expected fields.
    await expect(page.getByTestId("history-entry-summary")).toBeVisible();
    await expect(page.getByTestId("history-entry-summary")).toContainText("Date:");
    await expect(page.getByTestId("history-entry-summary")).toContainText("Operation:");
    await expect(page.getByTestId("history-entry-summary")).toContainText("Item:");
    await expect(page.getByTestId("history-entry-summary")).toContainText("Address:");
    await expect(page.getByTestId("history-entry-summary")).toContainText("Actor:");
    await expect(page.getByTestId("history-entry-summary")).toContainText("Version:");

    // Back returns to the table (real navigation, not a modal close).
    await page.goBack();
    await expect(page.getByTestId("history-table")).toBeVisible();
  });

  test("mobile viewport: the page body never scrolls horizontally (frame owns overflow)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto("/dashboard/history?view=items");
    await expect(page.getByTestId("history-table")).toBeVisible();

    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth + 1); // +1 for sub-pixel rounding
  });
});
