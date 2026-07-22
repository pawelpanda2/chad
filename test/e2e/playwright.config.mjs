import { defineConfig } from "@playwright/test";

// Story 78 — Playwright E2E against the REAL, already-running QNAP TEST
// Dashboard (never a locally-started dev server — see 02_plan.md §1). Trace/
// screenshot only kept on failure (Input 1 §1.1/§9).
export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  retries: 0,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.QNAP_TEST_BASE_URL || "http://100.117.139.83:12020",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
