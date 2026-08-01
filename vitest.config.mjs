import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Root-level Vitest config (Story 78) — the one standard runner for every
// unit/integration test in this monorepo. Existing self-executing
// `tsc && node dist/x.test.js` files under packages/dba, packages/console
// stay as-is (Input 1 §9 — don't rewrite for aesthetics) and are still run
// via their own package scripts from pnpm's root scripts; this config only
// governs new/converted Vitest-based tests.
export default defineConfig({
  // Story 98 — `packages/dashboard/tsconfig.json` sets `"jsx": "preserve"`
  // (Next.js transforms JSX itself via SWC at build time), which esbuild
  // would otherwise inherit here and refuse to parse a `.tsx` test file's
  // own JSX. Vitest/esbuild needs to actually transform it, since nothing
  // else in this standalone test run does.
  oxc: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      // Story 98 — `packages/dashboard`'s own `@/*` tsconfig path alias
      // (`@/*` -> `packages/dashboard/*`), needed only by component tests
      // that import a dashboard component directly (e.g.
      // `text-editor-with-toolbar.test.tsx`) rather than by relative path
      // like every prior `packages/dashboard/**/*.test.ts` pure-logic test.
      "@": path.resolve(dirname, "packages/dashboard"),
    },
  },
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
      // Story 96 — Knowledge tree mapper (chad_shared/knowledge → menu/
      // sections/documents, slug safety) and the Folders shared-repo
      // selection guard: pure, fake-ops-based, no real DB needed.
      "packages/dba/src/knowledge.test.ts",
      "packages/dba/src/shared-repo-access.test.ts",
      // Story 88 — AI Prompts registry (CRUD, validation, corrupt-JSON
      // guard, draft/published filtering, version increment): pure,
      // fake-ops-based, no real DB needed.
      "packages/dba/src/ai-prompts.test.ts",
      "packages/dba/src/ai-prompts-openai.test.ts",
      "packages/dba/src/audio-recordings.test.ts",
      // Story 93 follow-up — draft recordings (segments, isolation,
      // idempotent finalize, real-fixture merge via ffmpeg+mkvmerge).
      "packages/dba/src/audio-recording-drafts.test.ts",
      "packages/dashboard/components/forms/audio-recording-utils.test.ts",
      "packages/dashboard/components/forms/audio-recorder-session.test.ts",
      // Story 98 — shared editor Save-button regression (showPreview=false
      // must render Save/WCH/Saved unconditionally, not only when a caller
      // remembers to also pass defaultTab="editor").
      "packages/dashboard/components/shared/text-editor-with-toolbar.test.tsx",
      // Msg Auto AI Prompts — kind labels / Category mapping (mockup v4).
      "packages/dashboard/components/msg-automation/ai-prompt-kind.test.ts",
      // Story 90 — Lead ↔ Beeper Links (phone match / save validation).
      "packages/dba/src/lead-beeper-links.test.ts",
      // Story 94 — Beeper Conversations split-view pure logic (filter,
      // handle icon/aria-label, empty-state gate).
      "packages/dashboard/components/beeper/beeper-conversations-logic.test.ts",
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
      // Story 97 — CHAD MCP server (packages/mcp): unit (config/logging/
      // cp-output/errors/identity guard rails), a static no-direct-provider-
      // access check, protocol smoke over an in-memory transport, and real
      // integration/stdio tests against test3 on QNAP Postgres (both
      // self-skip via `describe.skipIf` when their real prerequisites — a
      // built dist/ or a real .env.mcp — aren't present, same convention as
      // the QNAP-targeted tests above).
      "packages/mcp/src/config.test.ts",
      "packages/mcp/src/logging.test.ts",
      "packages/mcp/src/cp-output.test.ts",
      "packages/mcp/src/errors.test.ts",
      "packages/mcp/src/identity.test.ts",
      "packages/mcp/src/no-direct-provider-access.test.ts",
      "packages/mcp/src/protocol-smoke.test.ts",
      "packages/mcp/src/stdio-smoke.test.ts",
      "packages/mcp/src/integration.test.ts",
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
