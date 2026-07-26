#!/usr/bin/env node
/**
 * Orchestrator for the tables<->Google Sheets sync regression suite (see
 * README.md in this directory). Two steps:
 *
 *   1. Build `dba` (`pnpm --filter dba build`) — every test file here
 *      imports from `packages/dba/dist`, never `src/`, same convention as
 *      the rest of the repo's dist-consuming tests/scripts (see root
 *      package.json's `test:unit:google-sheets-config`).
 *   2. Run every `*.test.mjs` under this directory with Node's built-in
 *      test runner (`node --test`) — no extra test-framework dependency
 *      needed beyond what's already in this repo.
 *
 * Flags:
 *   --qnap-test   Forwarded to the test files as TABLES_SYNC_QNAP_TEST=1
 *                 (see helpers/env.mjs's `isQnapTestRun()`) — currently
 *                 informational only (no test file changes behavior on it
 *                 yet beyond being available), reserved for a future
 *                 QNAP-TEST-only check without needing a second runner.
 *   --skip-build  Skips step 1 (assumes `pnpm --filter dba build` already
 *                 ran) — useful for a fast local re-run loop.
 *
 * Exit code is non-zero if the build fails OR any test fails — per
 * ai-docs/begin_here/01_ai_start.md's tables-sync rule, a non-zero exit
 * here must block marking any related task DONE or deploying TEST.
 */

import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

const args = process.argv.slice(2);
const qnapTest = args.includes("--qnap-test");
const skipBuild = args.includes("--skip-build");

function findTestFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "fixtures" || entry === "helpers") continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...findTestFiles(full));
    } else if (entry.endsWith(".test.mjs")) {
      out.push(full);
    }
  }
  return out;
}

function run(command, commandArgs, options = {}) {
  console.log(`\n$ ${command} ${commandArgs.join(" ")}`);
  const result = spawnSync(command, commandArgs, {
    stdio: "inherit",
    cwd: REPO_ROOT,
    env: process.env,
    ...options,
  });
  if (result.error) {
    console.error(`[test:tables-sync] Failed to run "${command}":`, result.error.message);
    return 1;
  }
  return result.status ?? 1;
}

function main() {
  if (!skipBuild) {
    console.log("[test:tables-sync] Building dba (packages/dba/dist)...");
    const buildStatus = run("pnpm", ["--filter", "dba", "build"]);
    if (buildStatus !== 0) {
      console.error("[test:tables-sync] dba build FAILED — aborting before running any test.");
      process.exit(buildStatus);
    }
  } else {
    console.log("[test:tables-sync] --skip-build set, assuming packages/dba/dist is already up to date.");
  }

  const testFiles = findTestFiles(__dirname).sort();
  if (testFiles.length === 0) {
    console.error("[test:tables-sync] No *.test.mjs files found under tests/tables-sync — nothing to run.");
    process.exit(1);
  }

  console.log(`\n[test:tables-sync] Running ${testFiles.length} test file(s) via node --test:`);
  for (const f of testFiles) console.log(`  - ${path.relative(REPO_ROOT, f)}`);

  const testEnv = { ...process.env };
  if (qnapTest) testEnv.TABLES_SYNC_QNAP_TEST = "1";

  // --test-concurrency=1 is required: several *.test.mjs files under
  // google-sheets/ and history/ deliberately drain the SAME shared local
  // MongoDB `google_sheets_sync_outbox` collection (see their file-header
  // comments) with their OWN FakeGoogleSheetsClient instance. `node --test`
  // runs multiple test FILES concurrently by default (each its own
  // process), so without this flag two files can race: file A's
  // `drainGoogleSheetsSyncOnce` call can claim and apply file B's
  // just-enqueued job against file A's fake client, silently producing 0 or
  // duplicate rows in whichever client "wins" the race — a flaky false
  // failure, not a real regression. Forcing serial execution here keeps
  // each test file's outbox drain isolated in time, same as it would be in
  // CI running them one at a time.
  const testStatus = run(
    "node",
    ["--test", "--test-concurrency=1", ...testFiles.map((f) => path.relative(REPO_ROOT, f))],
    { env: testEnv }
  );

  if (testStatus !== 0) {
    console.error(
      "\n[test:tables-sync] FAILED — this is a data-integrity regression signal. " +
        "Do not mark related work DONE or deploy TEST until this passes (see ai-docs/begin_here/01_ai_start.md)."
    );
  } else {
    console.log("\n[test:tables-sync] All tables<->Google Sheets sync regression tests passed.");
  }
  process.exit(testStatus);
}

main();
