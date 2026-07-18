/**
 * Content Provider -> MongoDB migrator (Story 72 §18).
 *
 * Walks one CP repo's full item tree **directly on the filesystem**
 * (`dba`'s `cp-fs-reader.ts`: `config.yaml`/`body.txt` read straight off
 * disk, no `/invoke` HTTP call of any kind) and imports every item as one
 * `PutItemCommand` executed against `MongoCpProvider`, built through the
 * exact same `cp-model.ts`/`data-commands.ts` machinery every other write
 * path uses (no separate ad-hoc mapping).
 *
 * **Architecture note (changed after the initial version):** the first
 * version of this migrator walked the tree through
 * `NetFileCpProvider`/`getFolderChildren` — one `/invoke` HTTP
 * round trip per item. That is fine for normal request traffic, but far too
 * slow for a full-repo migration on a Dropbox/SMB network mount: every
 * single item pays HTTP + reflection-dispatch + JSON-serialization overhead
 * on top of the same underlying disk read this module now does directly.
 * Content Provider is intentionally **not** touched by this traversal at
 * all anymore — it remains the legacy application serving normal
 * request/write traffic, not a read layer the migrator depends on. This
 * also means the migrator now works even when CP itself is down/disabled
 * (`DBA_CONTENT_PROVIDER_ENABLED=false`).
 *
 * The validators (`validateCpItem`), the data model (`CpItem`/
 * `CpItemConfig`), and the Mongo import logic (`buildPutItemCommand` +
 * `MongoCpProvider.executeWrite`, unchanged/duplicate/conflict handling)
 * are exactly the same as before — only the tree-traversal source changed.
 *
 * **Parallel-ready by construction:** `migrateRepo` takes one already-
 * resolved repo (or resolves its own root from env) and touches nothing
 * shared except the one Mongo connection (safe for concurrent use — the
 * MongoDB driver multiplexes operations over one client). Filesystem reads
 * have no per-request queueing/lock contention the way CP's HTTP endpoint
 * does, so migrating N repos concurrently is now just running N of these
 * walks at once — see `migrateRepos` below, the multi-repo orchestrator
 * this enables.
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
 * Usage:
 *   tsx src/migrateCpToMongo.ts --repo=<repoGuid> [--dry-run|--apply|--validate-only]
 *   tsx src/migrateCpToMongo.ts --repos=<guid1>,<guid2>,... [--concurrency=4] [--dry-run|--apply|--validate-only]
 */

import "dotenv/config";
import {
  MongoCpProvider,
  AddressConflictError,
  validateCpItem,
  buildPutItemCommand,
  systemClock,
  repoAndLocaToAddress,
  closeMongoConnection,
  resolveRepoRoot,
  getCpFsSearchRootsFromEnv,
  makeFsGetItem,
  makeFsGetFolderChildren,
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

type GetItemFn = (input: { address: string }) => Promise<CpItem | null>;
type GetFolderChildrenFn = (repo: string, loca: string) => Promise<{ index: string; name: string }[]>;

interface WalkContext {
  getItemFn: GetItemFn;
  mongo: MongoCpProvider | null; // null in --validate-only mode
  getFolderChildrenFn: GetFolderChildrenFn;
  mode: MigratorMode;
  report: MigrationReport;
  seenIds: Set<string>;
  seenAddresses: Set<string>;
  log: (message: string) => void;
}

/**
 * Injectable dependencies, defaulting to the real filesystem reader
 * (`cp-fs-reader.ts`) / `MongoCpProvider` — overridable so tests can
 * substitute a fake in-process tree instead of real disk I/O (Story 72
 * §28, "testowalny clock i generator GUID" extended to this module's own
 * CP-access dependencies). `searchRoots` only matters when `getItem`/
 * `getFolderChildren` aren't both supplied — it's where the real reader
 * looks for the repo's physical root (defaults to
 * `getCpFsSearchRootsFromEnv()`, i.e. `CP_REPOS_HOST_PATH`/`CP_REPOS_HOST_PATH_2`).
 */
export interface MigrateRepoDeps {
  getItem: GetItemFn;
  getFolderChildren: GetFolderChildrenFn;
  mongo: MongoCpProvider | null;
  searchRoots: string[];
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
  // Only touch the real filesystem when the caller didn't inject both fake
  // functions (tests inject both, so this branch — and any real I/O — is
  // skipped entirely for them, same as before).
  let repoRoot: string | null = null;
  if (!deps?.getItem || !deps?.getFolderChildren) {
    const searchRoots = deps?.searchRoots ?? getCpFsSearchRootsFromEnv();
    repoRoot = await resolveRepoRoot(repoGuid, searchRoots);
  }
  const getItemFn: GetItemFn = deps?.getItem ?? makeFsGetItem(repoGuid, repoRoot!);
  const getFolderChildrenFn: GetFolderChildrenFn =
    deps?.getFolderChildren ?? makeFsGetFolderChildren(repoRoot!);

  const ctx: WalkContext = {
    getItemFn,
    mongo: deps?.mongo ?? (mode === "validate-only" ? null : new MongoCpProvider(systemClock)),
    getFolderChildrenFn,
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

/**
 * Runs `migrateRepo` for several repos concurrently — filesystem reads
 * have no per-request queueing the way CP's `/invoke` endpoint does, so
 * this is a straightforward concurrency-limited fan-out, not a queue of
 * HTTP calls. Each repo gets its own prefixed log stream; one repo's
 * failure never aborts the others (mirrors `walk`'s own
 * one-bad-item-never-aborts-the-run philosophy, one level up).
 */
export async function migrateRepos(
  repoGuids: string[],
  mode: MigratorMode,
  log: (message: string) => void = console.log,
  options?: { concurrency?: number; searchRoots?: string[] }
): Promise<{ perRepo: Record<string, MigrationReport>; combined: MigrationReport }> {
  const concurrency = Math.max(1, Math.min(options?.concurrency ?? 4, repoGuids.length || 1));
  const perRepo: Record<string, MigrationReport> = {};

  let next = 0;
  async function worker(): Promise<void> {
    while (next < repoGuids.length) {
      const repoGuid = repoGuids[next++];
      perRepo[repoGuid] = await migrateRepo(repoGuid, mode, (message) => log(`[${repoGuid}] ${message}`), {
        searchRoots: options?.searchRoots,
      });
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const combined = emptyReport();
  for (const report of Object.values(perRepo)) {
    combined.reposScanned += report.reposScanned;
    combined.itemsScanned += report.itemsScanned;
    combined.itemsValid += report.itemsValid;
    combined.itemsImported += report.itemsImported;
    combined.itemsUnchanged += report.itemsUnchanged;
    combined.itemsConflicting += report.itemsConflicting;
    combined.itemsFailed += report.itemsFailed;
    combined.duplicateIds.push(...report.duplicateIds);
    combined.duplicateAddresses.push(...report.duplicateAddresses);
    combined.missingConfig += report.missingConfig;
    combined.missingBody += report.missingBody;
  }
  return { perRepo, combined };
}

async function walk(ctx: WalkContext, repo: string, loca: string): Promise<void> {
  const address = repoAndLocaToAddress(repo, loca);

  let item;
  try {
    item = await ctx.getItemFn({ address });
  } catch (error) {
    // One corrupted/unreadable item (bad config.yaml, filesystem lock,
    // etc.) must never abort the whole migration run — report and move
    // on. We can't tell if this was a Folder, so its children (if any)
    // are simply unreachable from this walk; re-running after the
    // underlying problem is fixed will pick them up (migration is
    // naturally resumable — see this file's top doc comment).
    ctx.report.itemsScanned++;
    ctx.report.itemsFailed++;
    ctx.log(`  [FAIL] "${address}": ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (!item) {
    ctx.log(`  [skip] no item at "${address}" (nothing to migrate here)`);
    return;
  }

  await processItem(ctx, item);

  if (item.config.type === "Folder") {
    let children;
    try {
      children = await ctx.getFolderChildrenFn(repo, loca);
    } catch (error) {
      ctx.report.itemsFailed++;
      ctx.log(`  [FAIL] could not list children of "${address}": ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
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
    ctx.log(`  [DUP-ID] "${item._id}" also at "${item.config.address}" (type=${item.config.type}, name="${item.config.name}")`);
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
    await writeWithStaleAddressRecovery(ctx, item);
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
 * Writes `item`, and if it hits an `AddressConflictError` (a previously-
 * migrated Mongo doc at this address under a now-stale, different `_id` —
 * see `MongoCpProvider.resolveStaleAddressConflict`'s doc comment, this
 * happens after a source id gets legitimately corrected, e.g. the
 * duplicate-id repair), removes the stale orphan and retries ONCE.
 */
async function writeWithStaleAddressRecovery(ctx: WalkContext, item: CpItem): Promise<void> {
  const command = buildPutItemCommand(item, systemClock);
  try {
    await ctx.mongo!.executeWrite(command);
  } catch (error) {
    if (error instanceof AddressConflictError) {
      const recovered = await ctx.mongo!.resolveStaleAddressConflict(item.config.address, item._id);
      if (recovered) {
        ctx.log(`  [repair] removed stale Mongo doc at "${item.config.address}" (different, now-outdated _id), retrying`);
        await ctx.mongo!.executeWrite(command);
        return;
      }
    }
    throw error;
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
  const reposArg = args.find((a) => a.startsWith("--repos="));
  const concurrencyArg = args.find((a) => a.startsWith("--concurrency="));
  const repoGuid = repoArg?.split("=")[1];
  const repoGuids = reposArg
    ?.split("=")[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const concurrency = concurrencyArg ? parseInt(concurrencyArg.split("=")[1], 10) : undefined;

  let mode: MigratorMode = "dry-run";
  if (args.includes("--apply")) mode = "apply";
  else if (args.includes("--validate-only")) mode = "validate-only";
  else if (args.includes("--dry-run")) mode = "dry-run";

  if (!repoGuid && !repoGuids?.length) {
    console.error(
      "Usage: tsx src/migrateCpToMongo.ts --repo=<repoGuid> [--dry-run|--apply|--validate-only]\n" +
        "   or: tsx src/migrateCpToMongo.ts --repos=<guid1>,<guid2>,... [--concurrency=4] [--dry-run|--apply|--validate-only]"
    );
    process.exit(1);
  }

  if (repoGuids?.length) {
    console.log(`Migrating ${repoGuids.length} repos in ${mode} mode (concurrency=${concurrency ?? 4})...\n`);
    const { perRepo, combined } = await migrateRepos(repoGuids, mode, console.log, { concurrency });
    for (const [guid, report] of Object.entries(perRepo)) {
      console.log(`\n--- ${guid} ---`);
      printReport(report);
    }
    console.log("\n=== Combined report ===");
    printReport(combined);
    await closeMongoConnection();
    process.exit(combined.itemsFailed > 0 ? 1 : 0);
  }

  console.log(`Migrating repo "${repoGuid}" in ${mode} mode...\n`);
  const report = await migrateRepo(repoGuid!, mode);
  printReport(report);
  await closeMongoConnection();
  process.exit(report.itemsFailed > 0 ? 1 : 0);
}

// Only run as a CLI when invoked directly (not when imported by tests).
if (process.argv[1]?.endsWith("migrateCpToMongo.ts") || process.argv[1]?.endsWith("migrateCpToMongo.js")) {
  main();
}
