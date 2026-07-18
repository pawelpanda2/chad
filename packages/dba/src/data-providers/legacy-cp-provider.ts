/**
 * CpCompatibleDataProvider backed by the real, existing legacy Content
 * Provider — wraps `invokeContentProvider` (`../client.js`), never makes a
 * direct HTTP call of its own (Story 72 §9, `05_endpoint-rules.md` §2).
 *
 * **Same-GUID-parity gap CLOSED** (was documented as an open limitation in
 * Story 72's first pass; fixed in this session's follow-up). `IItemWorker.
 * Put`/`PostParentItem`'s underlying `WriteTextWorker.IfMinePut`/
 * `WriteFolderWorker.IfMinePut` still ALWAYS mint a brand-new `Guid.
 * NewGuid()` and replace `Settings` with only `{id, type, name, address}`
 * on every write — that part of the real CP code is unchanged. The gap is
 * closed by a new CP-side method, `IItemWorker.PutItemConfig(repo, loca,
 * configJson)`, added specifically for this: it writes the full config
 * dict as-is via `ConfigWorker.PutConfig` (bypassing `WriteTextWorker`/
 * `WriteFolderWorker` entirely), preserving the supplied `id` and every
 * custom field, no body write. `configJson` is a JSON-serialized dict
 * (not a `Dictionary` parameter — `FindParameters.ConvertParamFromString`
 * has no case for that) and `repo`/`loca` are separate string parameters
 * (not a tuple — also not invocable via `/invoke`), matching the same
 * wire-protocol constraints already documented for every other method
 * here.
 *
 * `putItem` below now does the two-step dance this enables: `Put` first
 * (ensures the directory/body exist, accepting CP's own transient GUID),
 * then `PutItemConfig` (overwrites the config with the exact id/custom
 * fields the command already decided). Verified live against the real
 * running Content Provider container (see Story 72's follow-up report):
 * `GetItem` afterward returns the body written in step 1 AND the exact
 * config written in step 2, together.
 */

import { invokeContentProvider } from "../client.js";
import type { CpItem, CpItemConfig } from "../cp-model.js";
import { addressToRepoAndLoca } from "../cp-model.js";
import type { DataWriteCommand, DataWriteResult } from "../data-commands.js";
import type {
  CpCompatibleDataProvider,
  GetByNames2Input,
  GetByNamesInput,
  GetItemInput,
} from "./types.js";

export class LegacyContentProviderAdapter implements CpCompatibleDataProvider {
  readonly name = "content-provider" as const;

  async getItem(input: GetItemInput): Promise<CpItem | null> {
    if ("address" in input) {
      const { repo, loca } = addressToRepoAndLoca(input.address);
      return this.getItemByRepoLoca(repo, loca);
    }
    // The real CP has no lookup-by-bare-id path over `/invoke` (only
    // `GetByGuid`, which resolves a Ref item's target — not a general
    // id lookup); this provider only supports the address form.
    throw new Error(
      "LegacyContentProviderAdapter.getItem: lookup by bare id is not supported by the " +
        "legacy Content Provider wire API — pass { address } instead."
    );
  }

  /**
   * Real, confirmed bug found while testing this against the live running
   * Content Provider (not a mock — a mock wouldn't have caught this):
   * `ItemWorker.GetItem` returns a literal empty string, not an error, when
   * the item genuinely doesn't exist (`GetItemWorker.cs`: `if (s01) {...}
   * return string.Empty;`). `client.ts`'s `invokeContentProvider` has a
   * carve-out for empty bodies only on `Put` operations; every other empty
   * body — including this legitimate "not found" case for `GetItem` — is
   * treated as a hard error and thrown. Caught here specifically (by
   * message, not by changing the shared `client.ts`, which other callers
   * rely on) and translated to `null`, matching this method's own return
   * type contract.
   */
  private async getItemByRepoLoca(repo: string, loca: string): Promise<CpItem | null> {
    try {
      const raw = await invokeContentProvider(["IRepoService", "IItemWorker", "GetItem", repo, loca]);
      return rawToCpItemOrNull(raw);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Empty response body from /invoke")) {
        return null;
      }
      throw error;
    }
  }

  async getByNames(input: GetByNamesInput): Promise<CpItem | null> {
    const raw = await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "GetByNames",
      input.repoGuid,
      ...input.names,
    ]);
    return rawToCpItemOrNull(raw);
  }

  /**
   * Real `GetByNames2` (like `GetByNames`) resolves the whole name
   * sequence in one call and returns only the FINAL item. To give callers
   * the same "full trail" shape `MongoCpProvider.getByNames2` returns
   * (cheap there — just N Mongo queries either way), this walks the
   * prefix lengths 1..N, one real CP call each. Extra network calls, not
   * extra write-path cost — acceptable for this Story (this provider
   * isn't wired into any live request path yet).
   */
  async getByNames2(input: GetByNames2Input): Promise<CpItem[]> {
    const trail: CpItem[] = [];
    for (let i = 1; i <= input.names.length; i++) {
      const raw = await invokeContentProvider([
        "IRepoService",
        "IItemWorker",
        "GetByNames2",
        input.repoGuid,
        input.loca,
        ...input.names.slice(0, i),
      ]);
      const item = rawToCpItemOrNull(raw);
      if (!item) return [];
      trail.push(item);
    }
    return trail;
  }

  async executeWrite(command: DataWriteCommand): Promise<DataWriteResult> {
    if (command.kind === "put-item") {
      return this.putItem(command.item);
    }
    return this.createChild(command);
  }

  private async putItem(item: CpItem): Promise<DataWriteResult> {
    const { repo, loca } = addressToRepoAndLoca(item.config.address);
    const existing = await this.getItemByRepoLoca(repo, loca);

    // Step 1: Put — ensures the directory/body exist. CP mints its own
    // transient id/config here; that's expected and fixed in step 2.
    await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "Put",
      repo,
      loca,
      item.config.type,
      item.config.name,
      item.body,
    ]);

    // Step 2: PutItemConfig — overwrites config with the exact id/custom
    // fields this command already decided (see class doc comment).
    const written = await this.putItemConfig(item);
    return { item: { ...written, body: item.body }, alreadyExisted: !!existing };
  }

  async putItemConfig(item: CpItem): Promise<CpItem> {
    const { repo, loca } = addressToRepoAndLoca(item.config.address);
    const raw = await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "PutItemConfig",
      repo,
      loca,
      JSON.stringify(item.config),
    ]);
    const written = rawToCpItemOrNull({ ...(raw as object), Body: item.body });
    if (!written) {
      throw new Error(
        `LegacyContentProviderAdapter.putItemConfig: CP returned no item for address "${item.config.address}"`
      );
    }
    return written;
  }

  private async createChild(
    command: Extract<DataWriteCommand, { kind: "create-child-item" }>
  ): Promise<DataWriteResult> {
    if (!command.item) {
      throw new Error(
        "LegacyContentProviderAdapter.createChild: command.item must already be decided " +
          "by the primary provider before being replayed to the follower (Story 72 §8/§23)."
      );
    }
    // Write at the EXACT decided address — never PostParentItem, which
    // would let CP allocate its own next index (see class doc comment).
    return this.putItem(command.item);
  }
}

/**
 * Parses the raw `/invoke` JSON response (`{Settings, Body}` — CP's
 * `ItemModel`) into a `CpItem`. Folder items' `Body` is a computed
 * children map on the CP side, never meaningful raw content — normalized
 * to `""` here to match `MongoCpProvider`'s "folder body is always empty,
 * children are always derived" convention (Story 72 `03_knowledge.md`).
 */
/**
 * Lists a Folder item's direct children (index segment -> logical name),
 * exactly as `ReadFolderWorker.ListOfIndexesQNames` computes it on the
 * real Content Provider: `GetItem` on a Folder returns that computed map
 * as its raw `Body` (normalized away to `""` by `rawToCpItemOrNull` for
 * the general `CpItem` shape, since folder bodies aren't meaningful
 * content — but the migrator needs the raw map to walk an unknown repo
 * tree, since there is no generic "list children" method on the real
 * `/invoke` wire API). Not part of `CpCompatibleDataProvider` — this is a
 * migrator-only concern, exported for `packages/console`'s
 * `migrateCpToMongo.ts` to use, keeping the actual CP wire-shape knowledge
 * inside `packages/dba` per `05_endpoint-rules.md` §2.
 */
export async function getFolderChildren(
  repo: string,
  loca: string
): Promise<{ index: string; name: string }[]> {
  const raw = await invokeContentProvider(["IRepoService", "IItemWorker", "GetItem", repo, loca]);
  if (!raw || typeof raw !== "object") return [];
  const body = (raw as { Body?: unknown }).Body;
  if (!body || typeof body !== "object") return [];
  return Object.entries(body as Record<string, string>).map(([index, name]) => ({ index, name }));
}

function rawToCpItemOrNull(raw: unknown): CpItem | null {
  if (!raw || typeof raw !== "object") return null;
  const settings = (raw as { Settings?: Record<string, unknown> }).Settings;
  if (!settings || !settings.id) return null;

  const body = (raw as { Body?: unknown }).Body;
  const config = settings as unknown as CpItemConfig;

  return {
    _id: String(settings.id),
    config,
    body: typeof body === "string" ? body : "",
  };
}
