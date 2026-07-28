import base from "./playwright.local-dev-panel.config.mjs";

/** @type {import('@playwright/test').PlaywrightTestConfig} */
export default {
  ...base,
  testDir: ".",
  testMatch: "offline-readonly-backup-dev-panel.spec.mjs",
};
