import { defineConfig } from "vitest/config";

// Root-level Vitest config (Story 78) — the one standard runner for every
// unit/integration test in this monorepo. Existing self-executing
// `tsc && node dist/x.test.js` files under packages/dba, packages/console
// stay as-is (Input 1 §9 — don't rewrite for aesthetics) and are still run
// via their own package scripts from pnpm's root scripts; this config only
// governs new/converted Vitest-based tests.
export default defineConfig({
  test: {
    include: [
      "packages/dba/src/cp-history/**/*.test.ts",
      "packages/dba/src/testing/**/*.test.ts",
      "test/**/*.test.{ts,mjs}",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Sequential by default — several of these tests run real MongoDB
    // transactions (cp-history/mutate.test.ts, Story 79) against a shared
    // local Mongo server (a different scratch database per test file, but
    // the same mongod) and rely on ordering guarantees that concurrent
    // runs would make flaky.
    fileParallelism: false,
  },
});
