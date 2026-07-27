#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log("offline-readonly-backup test suite\n");
run("pnpm", ["--filter", "dba", "build"]);
run("pnpm", ["exec", "vitest", "run", "tests/offline-readonly-backup"]);
console.log("\noffline-readonly-backup tests: PASS");
