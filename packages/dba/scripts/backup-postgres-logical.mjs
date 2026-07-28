#!/usr/bin/env node
// Official logical PostgreSQL backup (2026-07-28, section 9.1 of the READY
// FOR BOSS audit). Wraps `pg_dump -Fc` with a manifest, checksum, atomic
// rename, and retention pruning — never overwrites a partial/failed dump
// with a "successful" name.
//
// Usage: POSTGRES_URI=... node packages/dba/scripts/backup-postgres-logical.mjs [--retain-daily=14] [--retain-weekly=8] [--retain-monthly=12]

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, statSync, renameSync, unlinkSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

function parseArgs(argv) {
  const args = { retainDaily: 14, retainWeekly: 8, retainMonthly: 12 };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--retain-daily=")) args.retainDaily = Number(raw.split("=")[1]);
    if (raw.startsWith("--retain-weekly=")) args.retainWeekly = Number(raw.split("=")[1]);
    if (raw.startsWith("--retain-monthly=")) args.retainMonthly = Number(raw.split("=")[1]);
  }
  return args;
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function main() {
  const args = parseArgs(process.argv);
  const uri = process.env.POSTGRES_URI;
  if (!uri) {
    console.error("[backup-postgres-logical] POSTGRES_URI is not set.");
    process.exitCode = 1;
    return;
  }

  const repoRoot = new URL("../../../", import.meta.url).pathname;
  const backupDir = join(repoRoot, ".runtime", "backups", "pg-dump");
  mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const tmpFile = join(backupDir, `.tmp-chad-${timestamp}.dump`);
  const finalFile = join(backupDir, `chad-${timestamp}.dump`);

  console.log(`[backup-postgres-logical] running pg_dump -Fc -> ${tmpFile}`);
  const result = spawnSync("pg_dump", ["-Fc", "-f", tmpFile, uri], { stdio: "inherit" });

  if (result.status !== 0) {
    console.error(`[backup-postgres-logical] pg_dump FAILED (exit ${result.status}) — no manifest written, no rename.`);
    try {
      unlinkSync(tmpFile);
    } catch {
      // nothing to clean up
    }
    process.exitCode = 1;
    return;
  }

  // Atomic: only rename to the final, "real" name once pg_dump exits 0 —
  // a crashed/partial dump never masquerades as a successful backup.
  renameSync(tmpFile, finalFile);
  const checksum = sha256File(finalFile);
  const manifest = {
    createdAt: new Date().toISOString(),
    file: finalFile.split("/").pop(),
    sha256: checksum,
    tool: "pg_dump -Fc",
  };
  writeFileSync(`${finalFile}.manifest.json`, JSON.stringify(manifest, null, 2));
  console.log(`[backup-postgres-logical] DONE — ${finalFile} (sha256=${checksum})`);

  pruneOldBackups(backupDir, args);
}

function pruneOldBackups(backupDir, { retainDaily }) {
  // Simple retention: keep the most recent N dumps. Weekly/monthly tiers
  // require a real backup calendar (see tests/release-audit-report.md's
  // "manual action" note) — this script alone only enforces a flat count.
  const files = readdirSync(backupDir)
    .filter((f) => f.startsWith("chad-") && f.endsWith(".dump"))
    .map((f) => ({ f, mtime: statSync(join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const { f } of files.slice(retainDaily)) {
    unlinkSync(join(backupDir, f));
    try {
      unlinkSync(join(backupDir, `${f}.manifest.json`));
    } catch {
      // manifest may not exist for a pre-retention-policy dump
    }
    console.log(`[backup-postgres-logical] pruned old backup: ${f}`);
  }
}

main();
