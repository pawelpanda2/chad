#!/usr/bin/env node
/**
 * Story 112 — move referenced-files root under chad-data + user-scope audio.
 *
 * Host layout change (spelling `refrenced` kept):
 *   OLD: /…/cp_1/02_files_refrenced/
 *   NEW: /…/cp_1/chad-data/02_files_refrenced/
 *
 * Audio:
 *   OLD: …/02_files_refrenced/10_files_audio/<file>
 *   NEW: …/chad-data/02_files_refrenced/<user>/10_files_audio/recordings/<file>
 *   Drafts → …/<user>/10_files_audio/drafts/<draftId>/
 *
 * Ownership from sidecar/draft JSON `repoGuid` (known map). Unknown → pawel_f
 * only when user passes `--default-owner=pawel_f` (explicit).
 *
 * Never deletes source. COPY → hash verify.
 *
 * Usage:
 *   node packages/dba/scripts/migrate-referenced-root-to-chad-data.mjs --dry-run
 *   node packages/dba/scripts/migrate-referenced-root-to-chad-data.mjs --execute --default-owner=pawel_f
 */

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const REPO_TO_USER = {
  "21d11bdc-f1f4-44d1-b61a-3fa6b039c641": "pawel_f",
  "5a9c8b7d-6e5f-4a3b-2c1d-0e9f8a7b6c5d": "test3",
};

function arg(flag) {
  return process.argv.includes(flag);
}

function argValue(prefix) {
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : "";
}

async function sha256File(filePath) {
  const buf = await readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

async function copyFileVerified(src, dest) {
  await mkdir(path.dirname(dest), { recursive: true });
  const srcHash = await sha256File(src);
  try {
    const st = await stat(dest);
    if (st.isFile()) {
      const destHash = await sha256File(dest);
      if (destHash === srcHash) {
        return { status: "already", srcHash, size: st.size };
      }
      throw new Error(`DEST_CONFLICT ${dest}`);
    }
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  await copyFile(src, dest);
  const destHash = await sha256File(dest);
  if (destHash !== srcHash) throw new Error(`HASH_MISMATCH ${src} → ${dest}`);
  const st = await stat(dest);
  return { status: "copied", srcHash, size: st.size };
}

async function walkFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (e) {
    if (e.code === "ENOENT") return out;
    throw e;
  }
  for (const ent of entries) {
    if (ent.name === ".DS_Store" || ent.name.startsWith(".smbdelete")) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...(await walkFiles(full)));
    else if (ent.isFile()) out.push(full);
  }
  return out;
}

async function copyTree(srcDir, destDir, report) {
  const files = await walkFiles(srcDir);
  for (const src of files) {
    const rel = path.relative(srcDir, src);
    const dest = path.join(destDir, rel);
    if (report.dryRun) {
      report.planned.push({ src, dest, kind: "tree" });
      continue;
    }
    const r = await copyFileVerified(src, dest);
    report.results.push({ src, dest, ...r, kind: "tree" });
  }
}

function ownerFromRepoGuid(repoGuid, defaultOwner) {
  if (repoGuid && REPO_TO_USER[repoGuid]) return REPO_TO_USER[repoGuid];
  return defaultOwner || null;
}

async function main() {
  const dryRun = !arg("--execute");
  const defaultOwner = argValue("--default-owner=");
  const cp1 = process.env.CP1_ROOT?.trim() || "/Volumes/cp_1";
  const srcRoot = path.join(cp1, "02_files_refrenced");
  const destRoot = path.join(cp1, "chad-data", "02_files_refrenced");

  const report = {
    dryRun,
    cp1,
    srcRoot,
    destRoot,
    defaultOwner: defaultOwner || null,
    planned: [],
    results: [],
    unresolved: [],
    errors: [],
  };

  console.log(dryRun ? "[dry-run]" : "[execute]", srcRoot, "→", destRoot);

  // 1) Copy per-user trees (skip global 10_files_audio — handled below)
  for (const user of ["pawel_f", "test3"]) {
    const src = path.join(srcRoot, user);
    const dest = path.join(destRoot, user);
    try {
      await stat(src);
    } catch {
      continue;
    }
    await copyTree(src, dest, report);
  }

  // 2) Flat audio → user/10_files_audio/recordings
  const audioSrc = path.join(srcRoot, "10_files_audio");
  let audioEntries = [];
  try {
    audioEntries = await readdir(audioSrc, { withFileTypes: true });
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }

  for (const ent of audioEntries) {
    if (!ent.isFile()) continue;
    if (ent.name.endsWith(".json")) continue;
    if (ent.name.startsWith(".")) continue;
    const audioPath = path.join(audioSrc, ent.name);
    const sidecarPath = `${audioPath}.json`;
    let repoGuid = null;
    try {
      const meta = JSON.parse(await readFile(sidecarPath, "utf8"));
      repoGuid = meta.repoGuid || null;
    } catch {
      /* orphan / legacy */
    }
    const owner = ownerFromRepoGuid(repoGuid, defaultOwner);
    if (!owner) {
      report.unresolved.push({ audioPath, repoGuid, reason: "unknown_owner" });
      continue;
    }
    const destAudio = path.join(destRoot, owner, "10_files_audio", "recordings", ent.name);
    const destSide = `${destAudio}.json`;
    if (dryRun) {
      report.planned.push({ src: audioPath, dest: destAudio, kind: "audio", owner });
      continue;
    }
    try {
      report.results.push({
        src: audioPath,
        dest: destAudio,
        owner,
        kind: "audio",
        ...(await copyFileVerified(audioPath, destAudio)),
      });
      try {
        await stat(sidecarPath);
        report.results.push({
          src: sidecarPath,
          dest: destSide,
          owner,
          kind: "audio-sidecar",
          ...(await copyFileVerified(sidecarPath, destSide)),
        });
      } catch {
        /* no sidecar */
      }
    } catch (e) {
      report.errors.push(String(e.message || e));
    }
  }

  // 3) Drafts
  const draftsSrc = path.join(audioSrc, "drafts");
  let draftDirs = [];
  try {
    draftDirs = (await readdir(draftsSrc, { withFileTypes: true })).filter((e) => e.isDirectory());
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  for (const d of draftDirs) {
    const draftJson = path.join(draftsSrc, d.name, "draft.json");
    let repoGuid = null;
    try {
      const meta = JSON.parse(await readFile(draftJson, "utf8"));
      repoGuid = meta.repoGuid || null;
    } catch {
      /* */
    }
    const owner = ownerFromRepoGuid(repoGuid, defaultOwner);
    if (!owner) {
      report.unresolved.push({ draft: d.name, repoGuid, reason: "unknown_owner" });
      continue;
    }
    const srcDraftDir = path.join(draftsSrc, d.name);
    const destDraftDir = path.join(destRoot, owner, "10_files_audio", "drafts", d.name);
    await copyTree(srcDraftDir, destDraftDir, report);
  }

  const outPath = path.resolve(
    "backlog/stories/112/07_chad_data_migration_report.json",
  );
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        dryRun,
        planned: report.planned.length,
        results: report.results.length,
        unresolved: report.unresolved.length,
        errors: report.errors.length,
        report: outPath,
      },
      null,
      2,
    ),
  );
  if (report.errors.length || report.unresolved.length) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
