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
      // Story 80 — Postgres-backed provider/outbox tests.
      "packages/dba/src/data-providers/postgres-cp-provider.test.ts",
      "packages/dba/src/data-outbox-postgres.test.ts",
      // Story 81 — TEST-restricted-to-test3 repo allowlist guard (unit only).
      "packages/dba/src/data-providers/repo-allowlist-guard.test.ts",
      // Story 81 — leads.ts business functions against a Postgres primary.
      "packages/dba/src/leads-postgres.test.ts",
      // Story 82 — Folders write path (create child / update Text body):
      // pure, fake-ops-based, no real DB needed.
      "packages/dba/src/folders.test.ts",
      // Story 88 — AI Prompts registry (CRUD, validation, corrupt-JSON
      // guard, draft/published filtering, version increment): pure,
      // fake-ops-based, no real DB needed.
      "packages/dba/src/ai-prompts.test.ts",
      "packages/dba/src/ai-prompts-openai.test.ts",
      "packages/dba/src/audio-recordings.test.ts",
      "packages/dashboard/components/forms/audio-recording-utils.test.ts",
      // Msg Auto AI Prompts — kind labels / Category mapping (mockup v4).
      "packages/dashboard/components/msg-automation/ai-prompt-kind.test.ts",
      // Story 90 — Lead ↔ Beeper Links (phone match / save validation).
      "packages/dba/src/lead-beeper-links.test.ts",
      // tests/ reorg (2026-07-28) — only the Vitest-based files from each
      // pillar's unit/integration dirs; the node:test-based files in the
      // same directories (no-chad-mongo-runtime, config-validator,
      // delete-physical, worker-order, status-shape, mapping-schema,
      // system-folders) run via `node --test` (see package.json), never
      // through this config.
      "tests/1_1_data-protection/integration/local-login-api.test.mjs",
      "tests/1_1_data-protection/integration/session-signing-configured.test.mjs",
      "tests/1_1_data-protection/unit/session-token.test.ts",
      "tests/1_1_data-protection/integration/offline-readonly-backup-workers.test.ts",
      "tests/1_1_data-protection/unit/offline-readonly-backup-mode-and-formatters.test.ts",
      "tests/1_2_google-sheets-sync/integration/local-google-sheets-info.test.mjs",
      "tests/1_2_google-sheets-sync/integration/qnap-test3-google-sheets.test.mjs",
      // 2026-07-28 — real-user (pawel_f/kamil_s) read-only reconciliation,
      // added after the Story 82 migration was found to have left pawel_f's
      // Daily entries without any Google Sheets outbox job ever.
      "tests/1_2_google-sheets-sync/integration/reconcile-real-users.test.mjs",
      "tests/1_2_google-sheets-sync/integration/blocked-outbox-job.test.mjs",
      "tests/1_2_google-sheets-sync/integration/history-outbox-sheet-lifecycle.test.mjs",
      "tests/1_1_data-protection/integration/cross-user-data-integrity.test.mjs",
      "tests/1_4_tables-release/daily/integration/qnap-test3-daily-dates.test.mjs",
      "tests/1_4_tables-release/leads/integration/local-msg-auto-links-api.test.mjs",
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
