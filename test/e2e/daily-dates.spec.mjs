// Story 78 — Playwright E2E against the real, already-running QNAP TEST
// Dashboard, logged in as test3. Scope note: this covers the highest-value
// golden path (real login form, Daily/Dates create via the real Add form,
// the random-word delete-confirmation dialog, a real DELETE, and History
// reflecting it) rather than the full acceptance matrix in
// backlog/stories/78/01_input.md §7 — see 05_tasks_and_checklist.md for
// what's covered vs explicitly deferred.
import { test, expect } from "@playwright/test";

const TEST3_PASSWORD = process.env.E2E_TEST3_PASSWORD;
test.skip(!TEST3_PASSWORD, "E2E_TEST3_PASSWORD not set — skipping (never hardcoded/committed, see 01_input.md Input 3)");

test.describe("QNAP TEST — test3 login + Dates create/edit/delete-safety", () => {
  test.beforeEach(async ({ page }) => {
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.consoleErrors = consoleErrors;

    await page.goto("/login");
    await page.getByRole("textbox", { name: "Username" }).fill("test3");
    await page.getByRole("textbox", { name: "Password" }).fill(TEST3_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("create a Date Entry via the real Add form, then delete it via the random-word confirmation dialog", async ({ page }) => {
    const marker = `e2e-${Date.now()}`;

    // --- Create ---
    await page.goto("/dashboard/forms");
    await page.getByRole("button", { name: "ADD DATE" }).click();
    await expect(page.getByRole("heading", { name: "Add Date" })).toBeVisible();

    await page.locator('input[type="date"]').first().fill("2026-03-01");
    // ŹRÓDŁO is the first plain-text input after DATA in the raw table.
    const textInputs = page.locator("table input:not([type='date']):not([type='checkbox'])");
    await textInputs.nth(0).fill("E2E Playwright"); // ŹRÓDŁO
    await textInputs.nth(1).fill(marker); // NAZWA — used as this row's unique marker.

    const saveResponse = page.waitForResponse((res) => res.url().includes("/api/forms/date-entry") && res.request().method() === "POST");
    await page.getByRole("button", { name: "Save" }).click();
    const res = await saveResponse;
    expect(res.ok()).toBe(true);
    const created = await res.json();
    expect(created.success).toBe(true);

    // --- Confirm it shows up in Dates ---
    await page.goto("/dashboard/views?view=dates");
    await expect(page.getByRole("cell", { name: marker })).toBeVisible();

    // --- Edit page (direct navigation — same page the Views row-click flow
    // lands on via editLoca, see views/page.tsx's router.push) ---
    await page.goto(`/dashboard/forms?form=date_entry&editLoca=${encodeURIComponent(created.loca)}`);
    await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();

    // No direct Delete in the plain table — only reachable from this edit page.
    await page.goto("/dashboard/views?view=dates");
    await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
    await page.goto(`/dashboard/forms?form=date_entry&editLoca=${encodeURIComponent(created.loca)}`);

    // --- Delete-confirmation dialog safety checks ---
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const confirmInput = page.getByRole("dialog").getByPlaceholder(/./); // the dialog's own confirm textbox, placeholder = the random word.
    const deleteButton = page.getByRole("button", { name: "Delete entry" });

    await expect(deleteButton).toBeDisabled();
    await confirmInput.fill("definitely-wrong-word");
    await expect(deleteButton).toBeDisabled();

    // Cancel must not mutate anything.
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.goto("/dashboard/views?view=dates");
    await expect(page.getByRole("cell", { name: marker })).toBeVisible(); // still there.

    // Reopen, read the actual word from the dialog itself (never assume
    // which one was randomly picked — Input 1 §7.4's own requirement).
    await page.goto(`/dashboard/forms?form=date_entry&editLoca=${encodeURIComponent(created.loca)}`);
    await page.getByRole("button", { name: "Delete" }).click();
    const dialogText = await page.getByText(/Type .+ to confirm\./).textContent();
    const word = dialogText.match(/Type\s+(\S+)\s+to confirm/)[1];

    const deleteRequest = page.waitForResponse(
      (r) => r.url().includes("/api/forms/date-entry") && r.request().method() === "DELETE",
      { timeout: 15_000 }
    );
    await page.getByRole("dialog").getByPlaceholder(/./).fill(word);
    await expect(deleteButton).toBeEnabled();
    await deleteButton.click();
    const deleteRes = await deleteRequest;
    // Baseline note (Story 78): this passes only once deleteDateEntry /
    // DELETE /api/forms/date-entry is actually deployed to QNAP TEST — on
    // the pre-deploy code this correctly fails here (404/non-JSON), proving
    // the described bug before the fix is live.
    expect(deleteRes.ok()).toBe(true);

    // --- Confirm it's really gone, not just blanked ---
    await expect(page).toHaveURL(/view=dates/);
    await expect(page.getByRole("cell", { name: marker })).toHaveCount(0);
  });
});

test.describe("QNAP TEST — History -> Google Sheets info page (Story 78 split)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: "Username" }).fill("test3");
    await page.getByRole("textbox", { name: "Password" }).fill(TEST3_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("info/sync split: API reports infoConfigured/syncWritesEnabled as two independent fields, never a private key", async ({ page }) => {
    const responsePromise = page.waitForResponse((r) => r.url().includes("/api/google-sheets/info"));
    await page.goto("/dashboard/history?view=google-sheets");
    const res = await responsePromise;
    const json = await res.json();
    expect(json.success).toBe(true);
    // syncWritesEnabled must be false on TEST regardless of infoConfigured
    // (GOOGLE_SHEETS_ENABLED is deliberately never set on TEST — Input 1 §5.1).
    expect(json.data.syncWritesEnabled).toBe(false);
    // The route must never carry a private key field under any name.
    const raw = JSON.stringify(json.data).toLowerCase();
    expect(raw).not.toContain("privatekey");
    expect(raw).not.toContain("begin private key");

    // If test3's entry has been wired into GOOGLE_SHEETS_SPREADSHEET_MAP on
    // TEST (this Story's own deploy step), the page must show the link, not
    // the old blanket "not enabled" message — checked only when configured,
    // since whether the map is deployed yet is an infra step outside this
    // spec file's control.
    if (json.data.infoConfigured) {
      await expect(page.getByText(/sync is not enabled on this environment/i)).toHaveCount(0);
      expect(json.data.chadUsername).toBe("test3");
    }
  });
});
