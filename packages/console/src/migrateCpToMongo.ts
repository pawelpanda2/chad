/**
 * Content Provider -> MongoDB migrator (Story 72 §18).
 *
 * Walks one CP repo's full item tree via the legacy adapter (never a
 * direct `/invoke` call from here — see `05_endpoint-rules.md` §2) and
 * imports every item as one `PutItemCommand` executed against
 * `MongoCpProvider`, built through the exact same `cp-model.ts`/
 * `data-commands.ts` machinery every other write path uses (no separate
 * ad-hoc mapping).
 *
 * Follows this package's existing convention (`statusMigration.ts`,
 * `main.ts`): a plain module run via `tsx`, no command-registry system
 * exists in `packages/console` to plug into (confirmed by reading
 * `package.json`/`cli.ts` — Story 72 `03_knowledge.md`).
 *
 * Naturally resumable: every write is an idempotent Mongo upsert, so a
 * crash mid-run just means re-running the whole traversal again — already
 * -migrated items become no-op re-upserts, not duplicates.
 *
 * Modes:
 *   --dry-run        (default) no writes; reports what WOULD happen
 *   --validate-only  no Mongo access at all; only validates CP data itself
 *   --apply          actually writes to MongoDB
 *
 * Usage: tsx src/migrateCpToMongo.ts --repo=<repoGuid> [--dry-run|--apply|--validate-only]
 */

import "dotenv/config";
import {
  LegacyContentProviderAdapter,
  getFolderChildren,
  MongoCpProvider,
  validateCpItem,
  buildPutItemCommand,
  systemClock,
  repoAndLocaToAddress,
  closeMongoConnection,
  type CpItem,
} from "dba";

export type MigratorMode = "dry-run" | "validate-only" | "apply";

export interface MigrationReport {
  reposScanned: number;
  itemsScanned: number;
  itemsValid: number;
  itemsImported: number;
  itemsUnchanged: number;
  itemsConflicting: number;
  itemsFailed: number;
  duplicateIds: string[];
  duplicateAddresses: string[];
  missingConfig: number;
  missingBody: number;
}

function emptyReport(): MigrationReport {
  return {
    reposScanned: 0,
    itemsScanned: 0,
    itemsValid: 0,
    itemsImported: 0,
    itemsUnchanged: 0,
    itemsConflicting: 0,
    itemsFailed: 0,
    duplicateIds: [],
    duplicateAddresses: [],
    missingConfig: 0,
    missingBody: 0,
  };
}

interface WalkContext {
  legacy: { getItem: (input: { address: string }) => Promise<CpItem | null> };
  mongo: MongoCpProvider | null; // null in --validate-only mode
  getFolderChildrenFn: typeof getFolderChildren;
  mode: MigratorMode;
  report: MigrationReport;
  seenIds: Set<string>;
  seenAddresses: Set<string>;
  log: (message: string) => void;
}

/**
 * Injectable dependencies, defaulting to the real legacy CP adapter /
 * `getFolderChildren` / `MongoCpProvider` — overridable so tests can
 * substitute a fake in-process tree instead of a real running Content
 * Provider (Story 72 §28, "testowalny clock i generator GUID" extended to
 * this module's own CP-access dependencies).
 */
export interface MigrateRepoDeps {
  getItem: (input: { address: string }) => Promise<CpItem | null>;
  getFolderChildren: typeof getFolderChildren;
  mongo: MongoCpProvider | null;
}

/**
 * Migrates one repo, starting at its root ("" loca). Returns the full
 * report; never throws on a single item's failure — that's counted in
 * `itemsFailed` and traversal continues (so one bad item can't abort the
 * whole run).
 */
export async function migrateRepo(
  repoGuid: string,
  mode: MigratorMode,
  log: (message: string) => void = console.log,
  deps?: Partial<MigrateRepoDeps>
): Promise<MigrationReport> {
  const legacy = new LegacyContentProviderAdapter();
  const ctx: WalkContext = {
    legacy: { getItem: deps?.getItem ?? ((input) => legacy.getItem(input)) },
    mongo: deps?.mongo ?? (mode === "validate-only" ? null : new MongoCpProvider(systemClock)),
    getFolderChildrenFn: deps?.getFolderChildren ?? getFolderChildren,
    mode,
    report: emptyReport(),
    seenIds: new Set(),
    seenAddresses: new Set(),
    log,
  };

  ctx.report.reposScanned = 1;
  await walk(ctx, repoGuid, "");
  return ctx.report;
}

async function walk(ctx: WalkContext, repo: string, loca: string): Promise<void> {
  const address = repoAndLocaToAddress(repo, loca);
  const item = await ctx.legacy.getItem({ address });
  if (!item) {
    ctx.log(`  [skip] no item at "${address}" (nothing to migrate here)`);
    return;
  }

  await processItem(ctx, item);

  if (item.config.type === "Folder") {
    const children = await ctx.getFolderChildrenFn(repo, loca);
    for (const child of children) {
      const childLoca = loca ? `${loca}/${child.index}` : child.index;
      await walk(ctx, repo, childLoca);
    }
  }
}

async function processItem(ctx: WalkContext, item: CpItem): Promise<void> {
  ctx.report.itemsScanned++;

  if (!item.config) {
    ctx.report.missingConfig++;
    ctx.report.itemsFailed++;
    ctx.log(`  [FAIL] "${item._id}": missing config`);
    return;
  }
  if (typeof item.body !== "string") {
    ctx.report.missingBody++;
  }

  const validation = validateCpItem(item);
  if (!validation.ok) {
    ctx.report.itemsFailed++;
    ctx.log(`  [FAIL] "${item.config.address}": ${validation.errors.join("; ")}`);
    return;
  }
  ctx.report.itemsValid++;

  if (ctx.seenIds.has(item._id)) {
    ctx.report.duplicateIds.push(item._id);
  }
  ctx.seenIds.add(item._id);

  if (ctx.seenAddresses.has(item.config.address)) {
    ctx.report.duplicateAddresses.push(item.config.address);
  }
  ctx.seenAddresses.add(item.config.address);

  if (ctx.mode === "validate-only") {
    ctx.log(`  [ok] "${item.config.address}" (${item.config.type}, name="${item.config.name}") — valid`);
    return;
  }

  const existing = await ctx.mongo!.getItem({ id: item._id });
  const unchanged = existing !== null && existing.body === item.body && configsEqual(existing.config, item.config);

  if (ctx.mode === "dry-run") {
    if (unchanged) {
      ctx.report.itemsUnchanged++;
      ctx.log(`  [dry-run] "${item.config.address}" — already up to date, would skip`);
    } else if (existing) {
      ctx.report.itemsImported++;
      ctx.log(`  [dry-run] "${item.config.address}" — would UPDATE existing Mongo item`);
    } else {
      ctx.report.itemsImported++;
      ctx.log(`  [dry-run] "${item.config.address}" — would CREATE new Mongo item`);
    }
    return;
  }

  // --apply
  try {
    const command = buildPutItemCommand(item, systemClock);
    await ctx.mongo!.executeWrite(command);
    if (unchanged) {
      ctx.report.itemsUnchanged++;
      ctx.log(`  [apply] "${item.config.address}" — unchanged (re-upserted, idempotent)`);
    } else {
      ctx.report.itemsImported++;
      ctx.log(`  [apply] "${item.config.address}" — imported`);
    }
  } catch (error) {
    ctx.report.itemsFailed++;
    ctx.report.itemsConflicting++;
    ctx.log(`  [FAIL] "${item.config.address}": ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Compares configs ignoring `created`/`modified` — both are
 * server-assigned by `MongoCpProvider.putItem` (`created` preserved from
 * the first insert, `modified` refreshed on every write) and are never
 * part of the source CP item being migrated, so they must not make an
 * otherwise-identical item look "changed" on every re-run.
 */
function configsEqual(a: CpItem["config"], b: CpItem["config"]): boolean {
  const normalize = (c: CpItem["config"]) => {
    const { created: _created, modified: _modified, ...rest } = c;
    return JSON.stringify(Object.entries(rest).sort(([x], [y]) => x.localeCompare(y)));
  };
  return normalize(a) === normalize(b);
}

export function printReport(report: MigrationReport): void {
  console.log("\n=== Migration report ===");
  console.log(`repos scanned:        ${report.reposScanned}`);
  console.log(`items scanned:        ${report.itemsScanned}`);
  console.log(`items valid:          ${report.itemsValid}`);
  console.log(`items imported:       ${report.itemsImported}`);
  console.log(`items unchanged:      ${report.itemsUnchanged}`);
  console.log(`items conflicting:    ${report.itemsConflicting}`);
  console.log(`items failed:         ${report.itemsFailed}`);
  console.log(`duplicate ids:        ${report.duplicateIds.length} ${report.duplicateIds.length ? JSON.stringify(report.duplicateIds) : ""}`);
  console.log(`duplicate addresses:  ${report.duplicateAddresses.length} ${report.duplicateAddresses.length ? JSON.stringify(report.duplicateAddresses) : ""}`);
  console.log(`missing config:       ${report.missingConfig}`);
  console.log(`missing body:         ${report.missingBody}`);
}

async function main() {
  const args = process.argv.slice(2);
  const repoArg = args.find((a) => a.startsWith("--repo="));
  const repoGuid = repoArg?.split("=")[1];

  let mode: MigratorMode = "dry-run";
  if (args.includes("--apply")) mode = "apply";
  else if (args.includes("--validate-only")) mode = "validate-only";
  else if (args.includes("--dry-run")) mode = "dry-run";

  if (!repoGuid) {
    console.error("Usage: tsx src/migrateCpToMongo.ts --repo=<repoGuid> [--dry-run|--apply|--validate-only]");
    process.exit(1);
  }

  console.log(`Migrating repo "${repoGuid}" in ${mode} mode...\n`);
  const report = await migrateRepo(repoGuid, mode);
  printReport(report);
  await closeMongoConnection();
  process.exit(report.itemsFailed > 0 ? 1 : 0);
}

// Only run as a CLI when invoked directly (not when imported by tests).
if (process.argv[1]?.endsWith("migrateCpToMongo.ts") || process.argv[1]?.endsWith("migrateCpToMongo.js")) {
  main();
}
