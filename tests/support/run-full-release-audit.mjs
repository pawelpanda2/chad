#!/usr/bin/env node
// Runs all 4 mandatory pillars (2026-07-28 audit requirement) — every
// pillar ALWAYS runs, even if an earlier one fails, so a full audit never
// silently skips a pillar because of an unrelated earlier failure. Exits
// non-zero if ANY pillar failed.
import { spawnSync } from "node:child_process";

const PILLARS = [
  ["1_1_data-protection", "test:regression:data-protection"],
  ["1_2_google-sheets-sync", "test:regression:google-sheets"],
  ["1_3_history-integrity", "test:regression:history"],
  ["1_4_tables-release", "test:regression:tables-release"],
];

const results = [];
for (const [label, script] of PILLARS) {
  console.log(`\n=== Running pillar: ${label} (pnpm ${script}) ===`);
  const result = spawnSync("pnpm", [script], { stdio: "inherit" });
  const exitCode = result.status ?? 1;
  results.push({ label, script, exitCode });
  console.log(`=== Pillar ${label}: ${exitCode === 0 ? "PASS" : "FAIL"} (exit ${exitCode}) ===`);
}

console.log("\n=== Full release audit summary ===");
for (const r of results) {
  console.log(`  ${r.label}: ${r.exitCode === 0 ? "PASS" : "FAIL"}`);
}

const anyFailed = results.some((r) => r.exitCode !== 0);
if (anyFailed) {
  console.error("\n[release-audit] At least one pillar FAILED — NOT READY FOR BOSS.");
}
process.exit(anyFailed ? 1 : 0);
