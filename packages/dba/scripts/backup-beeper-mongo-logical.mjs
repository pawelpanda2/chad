#!/usr/bin/env node
// Official logical Beeper MongoDB backup (2026-07-28, section 9.1).
// Wraps `mongodump --archive --gzip` with a manifest, checksum, atomic
// rename, and flat-count retention pruning.
//
// Usage: BEEPER_MONGODB_URI=... node packages/dba/scripts/backup-beeper-mongo-logical.mjs [--retain=14]

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, statSync, renameSync, unlinkSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

function parseArgs(argv) {
  const args = { retain: 14 };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--retain=")) args.retain = Number(raw.split("=")[1]);
  }
  return args;
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function main() {
  const args = parseArgs(process.argv);
  const uri = process.env.BEEPER_MONGODB_URI;
  if (!uri) {
    console.error("[backup-beeper-mongo-logical] BEEPER_MONGODB_URI is not set.");
    process.exitCode = 1;
    return;
  }

  const repoRoot = new URL("../../../", import.meta.url).pathname;
  const backupDir = join(repoRoot, ".runtime", "backups", "mongo-dump");
  mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const tmpFile = join(backupDir, `.tmp-beeper-${timestamp}.archive.gz`);
  const finalFile = join(backupDir, `beeper-${timestamp}.archive.gz`);

  console.log(`[backup-beeper-mongo-logical] running mongodump --archive --gzip -> ${tmpFile}`);
  const result = spawnSync("mongodump", [`--uri=${uri}`, `--archive=${tmpFile}`, "--gzip"], { stdio: "inherit" });

  if (result.status !== 0) {
    console.error(`[backup-beeper-mongo-logical] mongodump FAILED (exit ${result.status}) — no manifest, no rename.`);
    try {
      unlinkSync(tmpFile);
    } catch {
      // nothing to clean up
    }
    process.exitCode = 1;
    return;
  }

  renameSync(tmpFile, finalFile);
  const checksum = sha256File(finalFile);
  writeFileSync(
    `${finalFile}.manifest.json`,
    JSON.stringify({ createdAt: new Date().toISOString(), file: finalFile.split("/").pop(), sha256: checksum, tool: "mongodump --archive --gzip" }, null, 2)
  );
  console.log(`[backup-beeper-mongo-logical] DONE — ${finalFile} (sha256=${checksum})`);

  const files = readdirSync(backupDir)
    .filter((f) => f.startsWith("beeper-") && f.endsWith(".archive.gz"))
    .map((f) => ({ f, mtime: statSync(join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const { f } of files.slice(args.retain)) {
    unlinkSync(join(backupDir, f));
    try {
      unlinkSync(join(backupDir, `${f}.manifest.json`));
    } catch {
      // no manifest for a pre-policy dump
    }
    console.log(`[backup-beeper-mongo-logical] pruned old backup: ${f}`);
  }
}

main();
