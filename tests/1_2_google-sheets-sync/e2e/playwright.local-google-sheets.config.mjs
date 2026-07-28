import { defineConfig } from "@playwright/test";

// Story 89 — History → Google Sheets against local Mac Docker only.
export default defineConfig({
  testDir: ".",
  testMatch: "local-google-sheets-history.spec.mjs",
  timeout: 30_000,
  retries: 0,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.LOCAL_DASHBOARD_BASE_URL || "http://localhost:12020",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
