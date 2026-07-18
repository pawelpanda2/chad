/**
 * One-off data repair (Story 72 follow-up): pawel_f's real Content
 * Provider data has several genuinely-different items sharing the same
 * `config.id` (confirmed via the migrator's [DUP-ID] log — different
 * addresses, different names, real distinct content — looks like content
 * was duplicated via Finder/Dropbox rather than the app, carrying the
 * GUID along).
 *
 * For each id shared by N items, keeps the FIRST occurrence's id
 * unchanged and assigns a fresh UUID to every subsequent occurrence,
 * writing it back to the real config.yaml on disk via the just-added
 * `PutItemConfig` (config-only, no body touched, no other field changed).
 *
 * Modes: --dry-run (default, no writes) / --apply.
 * Not a permanent part of the codebase — matches this repo's existing
 * one-off-script convention (see daily-tracker-dates.md's import-csv.mjs).
 *
 * Usage: tsx src/fixDuplicateIds.ts --repo=<repoGuid> [--dry-run|--apply]
 */

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { NetFileCpProvider, getFolderChildren, repoAndLocaToAddress, type CpItem } from "dba";

async function walkAll(repo: string, loca: string, legacy: NetFileCpProvider, out: CpItem[]): Promise<void> {
  const address = repoAndLocaToAddress(repo, loca);
  const item = await legacy.getItem({ address });
  if (!item) return;
  out.push(item);
  if (item.config.type === "Folder") {
    const children = await getFolderChildren(repo, loca);
    for (const child of children) {
      const childLoca = loca ? `${loca}/${child.index}` : child.index;
      try {
        await walkAll(repo, childLoca, legacy, out);
      } catch (error) {
        console.log(`  [skip] ${repoAndLocaToAddress(repo, childLoca)}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const repoArg = args.find((a) => a.startsWith("--repo="));
  const repo = repoArg?.split("=")[1];
  const apply = args.includes("--apply");

  if (!repo) {
    console.error("Usage: tsx src/fixDuplicateIds.ts --repo=<repoGuid> [--dry-run|--apply]");
    process.exit(1);
  }

  const legacy = new NetFileCpProvider();
  console.log(`Scanning repo "${repo}" for duplicate ids (${apply ? "APPLY" : "dry-run"})...\n`);

  const items: CpItem[] = [];
  await walkAll(repo, "", legacy, items);

  const byId = new Map<string, CpItem[]>();
  for (const item of items) {
    const list = byId.get(item._id) ?? [];
    list.push(item);
    byId.set(item._id, list);
  }

  let fixedCount = 0;
  const mapping: Array<{ oldId: string; newId: string; address: string; type: string; name: string }> = [];

  for (const [id, group] of byId) {
    if (group.length <= 1) continue;
    console.log(`Duplicate id "${id}" used by ${group.length} items:`);
    group.forEach((item, i) => {
      console.log(`  [${i === 0 ? "KEEP" : "FIX "}] ${item.config.address} (type=${item.config.type}, name="${item.config.name}")`);
    });

    // Keep the first occurrence untouched; reassign a fresh id to every
    // subsequent one.
    for (let i = 1; i < group.length; i++) {
      const item = group[i];
      const newId = randomUUID();
      mapping.push({ oldId: id, newId, address: item.config.address, type: item.config.type, name: item.config.name });
      if (apply) {
        await legacy.putItemConfig({
          _id: newId,
          config: { ...item.config, id: newId },
          body: item.body,
        });
        console.log(`    -> reassigned to new id "${newId}"`);
      } else {
        console.log(`    -> would reassign to new id "${newId}" (dry-run, not written)`);
      }
      fixedCount++;
    }
    console.log("");
  }

  const fs = await import("node:fs/promises");
  const mappingPath = `/tmp/duplicate-id-fix-mapping-${apply ? "applied" : "dryrun"}.json`;
  await fs.writeFile(mappingPath, JSON.stringify(mapping, null, 2));
  console.log(`Full old->new id mapping written to ${mappingPath}`);

  console.log(`\n${fixedCount} duplicate item(s) ${apply ? "fixed" : "would be fixed"}.`);
}

main();
