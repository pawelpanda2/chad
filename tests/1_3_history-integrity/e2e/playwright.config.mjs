import { defineConfig } from "@playwright/test";

// Story 79 GUI rewrite — Playwright E2E against the REAL, already-running
// QNAP TEST Dashboard (never a locally-started dev server). Trace/
// screenshot only kept on failure. Split out from the shared
// test/e2e/playwright.config.mjs (2026-07-28 tests/ reorg) — that config
// used to implicitly pick up both history-ui.spec.mjs and
// daily-dates.spec.mjs by directory (testDir: "."); now that each pillar
// has its own e2e/ directory, each gets its own config, explicitly scoped.
export default defineConfig({
  testDir: ".",
  testMatch: "history-ui.spec.mjs",
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
