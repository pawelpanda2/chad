#!/usr/bin/env node
/**
 * Story 111 — idempotent referenced-files migrator.
 *
 * Modes:
 *   --inventory   read-only counts (default if no flags)
 *   --dry-run     map old→new without writing
 *   --execute     COPY→VERIFY into canonical paths + insert PG metadata
 *   --recover-decoy  include `.runtime/cp1-decoy/02_files_refrenced` as a source
 *
 * Never deletes source in this script (cleanup is a separate accepted step).
 *
 * Usage:
 *   POSTGRES_URI=… CHAD_CONTACT_PHOTOS_DIR=/Volumes/cp_1/02_files_refrenced \
 *     node packages/dba/scripts/migrate-referenced-files.mjs --dry-run --recover-decoy
 */

import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function arg(flag) {
  return process.argv.includes(flag);
}

function sanitizeSegment(raw, fallback = "item") {
  const stripped = String(raw || "")
    .replace(/[\\/]/g, "-")
    .replace(/\.\./g, ".")
    .trim()
    .replace(/\s+/g, "_");
  let out = "";
  for (const ch of stripped) {
    if (/[A-Za-z0-9._\-]/.test(ch) || ch.charCodeAt(0) > 127) out += ch;
    else out += "_";
  }
  out = out.replace(/_+/g, "_").replace(/^[._-]+|[._-]+$/g, "");
  return (out || fallback).slice(0, 160);
}

async function sha256File(filePath) {
  const buf = await readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

async function listImagePairs(photosDir) {
  let entries;
  try {
    entries = await readdir(photosDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);
  const images = files.filter((n) => /\.(png|jpe?g|webp)$/i.test(n) && !n.startsWith("."));
  const out = [];
  for (const name of images) {
    const imagePath = path.join(photosDir, name);
    const sidecarPath = path.join(photosDir, `${name}.json`);
    let sidecar = null;
    try {
      sidecar = JSON.parse(await readFile(sidecarPath, "utf8"));
    } catch {
      /* orphan image */
    }
    const st = await stat(imagePath);
    out.push({
      imagePath,
      sidecarPath,
      sidecar,
      name,
      size: st.size,
      hash: await sha256File(imagePath),
    });
  }
  return out;
}

function stemFromOriginal(originalFileName, fallback) {
  const base = path.basename(originalFileName || fallback || "photo");
  return sanitizeSegment(base.replace(/\.(png|jpe?g|webp)$/i, ""), "photo");
}

async function main() {
  const dryRun = arg("--dry-run") || !arg("--execute");
  const execute = arg("--execute");
  const recoverDecoy = arg("--recover-decoy");
  const destRoot = process.env.CHAD_CONTACT_PHOTOS_DIR?.trim();
  if (!destRoot) {
    console.error("CHAD_CONTACT_PHOTOS_DIR is required");
    process.exitCode = 1;
    return;
  }

  const sources = [{ label: "canonical", root: destRoot }];
  if (recoverDecoy) {
    sources.push({
      label: "decoy",
      root: path.join(REPO_ROOT, ".runtime/cp1-decoy/02_files_refrenced"),
    });
  }

  const report = { sources: [], planned: [], skipped: [], errors: [] };

  for (const src of sources) {
    const users = await readdir(src.root, { withFileTypes: true }).catch(() => []);
    for (const u of users.filter((e) => e.isDirectory() && !e.name.startsWith("."))) {
      if (u.name === "10_files_audio") continue;
      const photosDir = path.join(src.root, u.name, "01_files_photos");
      const pairs = await listImagePairs(photosDir);
      report.sources.push({
        label: src.label,
        user: u.name,
        photosDir,
        count: pairs.length,
        bytes: pairs.reduce((s, p) => s + p.size, 0),
      });

      for (const pair of pairs) {
        const leadLoca = pair.sidecar?.leadLoca || "";
        const owner = pair.sidecar?.ownerUsername || u.name;
        const repoGuid = pair.sidecar?.repoGuid || "";
        const original = pair.sidecar?.originalFileName || pair.name;
        const entityName = stemFromOriginal(original, pair.name);
        const ext = path.extname(pair.name).replace(/^\./, "").toLowerCase() || "png";
        const destDir = path.join(destRoot, owner, "01_files_photos", "lead-info", entityName);
        let destName = `${entityName}.${ext}`;
        // collision: leave __N for execute to resolve
        const destPath = path.join(destDir, destName);
        const plan = {
          source: pair.imagePath,
          dest: destPath,
          hash: pair.hash,
          size: pair.size,
          owner,
          repoGuid,
          leadLoca,
          entityName,
          hasSidecar: Boolean(pair.sidecar),
          from: src.label,
        };
        if (!pair.sidecar?.leadLoca && !pair.sidecar?.contactResourceName) {
          report.skipped.push({ ...plan, reason: "unresolved entity (no sidecar leadLoca)" });
          continue;
        }
        if (pair.sidecar?.contactResourceName && !pair.sidecar?.leadLoca) {
          report.skipped.push({ ...plan, reason: "google-contact photo — separate feature path; not auto-migrated here" });
          continue;
        }
        report.planned.push(plan);

        if (!execute) continue;

        // resolve lead uuid from loca is NOT done here — store entity_id as leadLoca
        // until a CP lookup fills uuid (metadata keeps leadLoca in jsonb)
        try {
          await mkdir(destDir, { recursive: true });
          let finalName = destName;
          let n = 2;
          while (true) {
            try {
              await stat(path.join(destDir, finalName));
              finalName = `${entityName}__${n}.${ext}`;
              n += 1;
            } catch {
              break;
            }
          }
          const finalPath = path.join(destDir, finalName);
          await copyFile(pair.imagePath, finalPath);
          const destHash = await sha256File(finalPath);
          if (destHash !== pair.hash) {
            report.errors.push({ ...plan, reason: `hash mismatch after copy ${destHash}` });
            continue;
          }

          if (process.env.POSTGRES_URI && repoGuid) {
            const client = new Client({ connectionString: process.env.POSTGRES_URI });
            await client.connect();
            try {
              const id = randomUUID();
              const storagePath = `02_files_refrenced/${owner}/01_files_photos/lead-info/${entityName}/${finalName}`;
              await client.query(
                `INSERT INTO cp_referenced_files (
                   id, repo_guid, owner_username, feature, entity_type, entity_id,
                   entity_name_snapshot, file_name, storage_path, original_file_name,
                   mime_type, size_bytes, sha256, metadata
                 ) VALUES ($1,$2,$3,$4,'lead',$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
                 ON CONFLICT (repo_guid, storage_path) DO NOTHING`,
                [
                  id,
                  repoGuid,
                  owner,
                  "01_files_photos/lead-info",
                  leadLoca, // temporary entity_id = loca until uuid backfill
                  entityName,
                  finalName,
                  storagePath,
                  original,
                  pair.sidecar?.mimeType || "image/png",
                  pair.size,
                  pair.hash,
                  JSON.stringify({ leadLoca, migratedFrom: pair.imagePath, sourceLabel: src.label }),
                ],
              );
            } finally {
              await client.end();
            }
          }
          console.log(`[ok] COPY ${pair.imagePath} → ${finalPath}`);
        } catch (error) {
          report.errors.push({
            ...plan,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  const outPath = path.join(REPO_ROOT, "backlog/stories/111/07_migration_report.json");
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(
    outPath,
    JSON.stringify({ dryRun: !execute, recoverDecoy, ...report, at: new Date().toISOString() }, null, 2),
  );
  console.log(`[report] ${outPath}`);
  console.log(
    `[summary] planned=${report.planned.length} skipped=${report.skipped.length} errors=${report.errors.length} mode=${execute ? "execute" : "dry-run"}`,
  );
}

main().catch((error) => {
  console.error("[migrate-referenced-files] FATAL:", error);
  process.exitCode = 1;
});
