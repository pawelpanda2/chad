/**
 * CpCompatibleDataProvider backed by the real, existing legacy Content
 * Provider — wraps `invokeContentProvider` (`../client.js`), never makes a
 * direct HTTP call of its own (Story 72 §9, `05_endpoint-rules.md` §2).
 *
 * IMPORTANT, audited limitation of the real CP wire contract (Story 72
 * `02_plan.md`, "Correction" below): `IItemWorker.Put` and
 * `PostParentItem`'s underlying `WriteTextWorker.IfMinePut`/
 * `WriteFolderWorker.IfMinePut` ALWAYS mint a brand-new `Guid.NewGuid()`
 * and replace `Settings` with only `{id, type, name, address}` — they do
 * NOT accept or preserve an externally-decided `id`, and they DROP any
 * custom config fields on every write. `IItemWorker.PutConfig` (which
 * would write an arbitrary full config dict as-is, preserving `id`) takes
 * a `Dictionary<string, object>` parameter, which
 * `StringArgsResolver/FindParameters.cs`'s `ConvertParamFromString` has no
 * case for — it is **not callable through the reflection-based `/invoke`
 * string-args wire protocol at all**.
 *
 * Practical consequence: when Content Provider is the FOLLOWER, this
 * adapter can and does guarantee the **same address** as the primary
 * decided (Story 72 §23's emphasized invariant — achieved by calling
 * `Put` at the exact repo+loca the command already carries, never
 * `PostParentItem`, which would let CP re-run its own next-index
 * allocation). It CANNOT currently guarantee the same `id`/GUID as the
 * primary (Story 72 §8/§29) — CP always assigns its own. This is a real,
 * confirmed limitation of the current Content Provider API, not a
 * shortcut taken here; closing it would require adding a new CP-side
 * write method that accepts a caller-supplied id (a `packages/net-content-provider`
 * change, explicitly out of this Story's scope per §27). Recorded as a
 * known risk in `06_others_from_report.md`.
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

  private async getItemByRepoLoca(repo: string, loca: string): Promise<CpItem | null> {
    const raw = await invokeContentProvider(["IRepoService", "IItemWorker", "GetItem", repo, loca]);
    return rawToCpItemOrNull(raw);
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
    const raw = await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "Put",
      repo,
      loca,
      item.config.type,
      item.config.name,
      item.body,
    ]);
    const written = rawToCpItemOrNull(raw);
    if (!written) {
      throw new Error(
        `LegacyContentProviderAdapter.putItem: CP returned no item for address "${item.config.address}"`
      );
    }
    return { item: written, alreadyExisted: !!existing };
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
