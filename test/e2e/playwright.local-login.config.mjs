import { defineConfig } from "@playwright/test";

// Story 87 — Playwright against local Mac Docker Dashboard only
// (http://localhost:12020). Separate from QNAP TEST e2e config.
export default defineConfig({
  testDir: ".",
  testMatch: "local-login.spec.mjs",
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
