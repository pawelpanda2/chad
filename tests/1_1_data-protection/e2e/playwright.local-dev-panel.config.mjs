import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "local-dev-panel-settings.spec.mjs",
  timeout: 45_000,
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
