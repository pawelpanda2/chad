/**
 * Generic, business-agnostic Item operations — the one shared layer every
 * `dba` business function should call instead of either hand-rolling
 * `invokeContentProvider([...])` directly or duplicating its own
 * `if (mongoEnabled) ... if (contentProviderEnabled) ...` pair.
 *
 * Corrected architecture (provider-migration-audit.md follow-up): CP and
 * Mongo already implement one shared contract on the exact same universal
 * `CpItem { _id, config, body }` model (`CpCompatibleDataProvider` in
 * `data-providers/types.ts`) — one CP item is one Mongo item, no
 * per-feature schema. Routing between backends (primary/follower, shadow
 * reads) already lives in `DbaDataRouter` (`getDataRouter()`); business
 * functions call these generic operations, which call the router, and
 * never touch a provider or a config flag themselves.
 */

import { getDataRouter } from "./data-router-instance.js";
import { getCurrentRepoGuid } from "./repo-context.js";
import { systemClock } from "./data-clock.js";
import { buildCreateChildItemCommand, buildPutItemCommand } from "./data-commands.js";
import { repoAndLocaToAddress, type CpItem } from "./cp-model.js";

/** Resolves a logical name path from the repo root, e.g. `["leads", "all items"]`. */
export async function resolveByNames(names: string[]): Promise<CpItem | null> {
  return getDataRouter().getByNames({ repoGuid: getCurrentRepoGuid(), names });
}

/** Resolves an item by its full address (`repoGuid/loca` or bare repoGuid for the root). */
export async function getItemByAddress(address: string): Promise<CpItem | null> {
  return getDataRouter().getItem({ address });
}

/** Resolves an item by its numeric `repo`/`loca` pair — thin wrapper over `getItemByAddress`. */
export async function getItemByLoca(loca: string): Promise<CpItem | null> {
  return getItemByAddress(repoAndLocaToAddress(getCurrentRepoGuid(), loca));
}

/**
 * Resolves a full name-sequence trail starting at `loca` (may be `""` for
 * the repo root), returning one `CpItem` per name level — the same shape
 * `IItemWorker.GetByNames2`/`GetItemBySeqOfNames` return over the wire,
 * generalized across both providers.
 */
export async function resolveSequence(loca: string, names: string[]): Promise<CpItem[]> {
  return getDataRouter().getByNames2({ repoGuid: getCurrentRepoGuid(), loca, names });
}

/** Lists a Folder's direct children (Folder and Text), in CP's own numeric index order. */
export async function getChildrenOf(parentAddress: string): Promise<CpItem[]> {
  return getDataRouter().getChildren(parentAddress);
}

/** Every descendant (any depth) of `rootAddress` whose body contains `phrase`. */
export async function findRecursively(rootAddress: string, phrase: string): Promise<CpItem[]> {
  return getDataRouter().findRecursively(rootAddress, phrase);
}

/**
 * Find-or-create a single child under `parent` by exact name match
 * (mirrors CP's own `PostParentItem`/`PostByNames` create-or-get
 * semantics) — the one write primitive nearly every CP-only function
 * used directly before this refactor.
 */
export async function createOrGetChild(
  parent: CpItem,
  name: string,
  type: string,
  body?: string
): Promise<CpItem> {
  const command = buildCreateChildItemCommand(
    { parentItemId: parent._id, parentAddress: parent.config.address, name, type, body },
    systemClock
  );
  const result = await getDataRouter().executeWrite(command);
  return result.item;
}

/**
 * Find-or-create a nested folder chain from the repo root (e.g.
 * `["views", "reports"]`) — the generalized form of the CP `PostParentItem`
 * chain every "ensure folder path exists" flow already used.
 */
export async function findOrCreateFolderChain(names: string[]): Promise<CpItem> {
  const repoGuid = getCurrentRepoGuid();
  let parent: CpItem | null = await getItemByAddress(repoGuid);
  if (!parent) {
    // Synthetic stand-in for the repo root when it isn't itself a real,
    // migrated item yet (matches the existing Mongo-only helper this
    // replaces) — `createOrGetChild` only reads `_id`/`config.address`.
    parent = { _id: repoGuid, config: { id: repoGuid, address: repoGuid, type: "Folder", name: "root" }, body: "" };
  }
  for (const name of names) {
    parent = await createOrGetChild(parent, name, "Folder");
  }
  return parent;
}

/** Overwrites an existing item's body in place (never re-allocates address/id). */
export async function putItemBody(address: string, body: string): Promise<CpItem> {
  const existing = await getItemByAddress(address);
  if (!existing) {
    throw new Error(`putItemBody: no item found at address "${address}" to update`);
  }
  const command = buildPutItemCommand({ ...existing, body }, systemClock);
  const result = await getDataRouter().executeWrite(command);
  return result.item;
}

/** Writes a full, already-known item as-is (create or overwrite at its own decided address). */
export async function putItem(item: CpItem): Promise<CpItem> {
  const command = buildPutItemCommand(item, systemClock);
  const result = await getDataRouter().executeWrite(command);
  return result.item;
}
