import { defineConfig } from "@playwright/test";

// 2026-07-28 P0 fix — reveal-password reauth regression, against the
// already-running LOCAL Docker dashboard (never a locally-started dev
// server — same convention as this directory's other e2e configs).
export default defineConfig({
  testDir: ".",
  testMatch: "reveal-password-reauth.spec.mjs",
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
