/**
 * Business operations for the Dashboard's "Folders" Content Provider
 * browser write path (Story 82 — Story 57 built it read-only, Story 60
 * fixed repo isolation for browsing; this Story adds the first real writes:
 * creating a Text/Folder child, editing a Text item's body).
 *
 * Thin wrappers over `item-ops.ts`'s existing `createOrGetChild`/
 * `putItemBody`/`getItemByAddress`/`getChildrenOf` (already backend-agnostic
 * via `getDataRouter()`) — this file only adds the validation and
 * parent/type checks the task requires, named for the business operation
 * (05_endpoint-rules.md §6), not the underlying CP method.
 */

import {
  getItemByAddress as realGetItemByAddress,
  getChildrenOf as realGetChildrenOf,
  createOrGetChild as realCreateOrGetChild,
  putItemBody as realPutItemBody,
  putItemConfig as realPutItemConfig,
  deleteItemByAddress as realDeleteItemByAddress,
  moveItemByAddress as realMoveItemByAddress,
  readdressItemByAddress as realReaddressItemByAddress,
} from "./item-ops.js";
import type { CpItem, CpItemConfig } from "./cp-model.js";
import { splitAddress, parseChildIndex } from "./cp-model.js";
import {
  assertNotSystemFolderWrite,
  SystemFolderReadOnlyError,
  type SystemFolderManagedBy,
} from "./system-folders.js";

function isAddressConflictError(err: unknown): err is Error & { address: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: string }).name === "AddressConflictError" &&
    typeof (err as { address?: unknown }).address === "string"
  );
}

export type FolderChildType = "Text" | "Folder";

export type FoldersErrorCode =
  | "VALIDATION"
  | "PARENT_NOT_FOUND"
  | "PARENT_NOT_FOLDER"
  | "ITEM_NOT_FOUND"
  | "NOT_TEXT_ITEM"
  | "SYSTEM_FOLDER_READ_ONLY"
  | "FOLDER_NOT_EMPTY"
  | "FORBIDDEN_IDENTITY_CHANGE"
  | "ROOT_NOT_FOLDER"
  | "EXPORT_LIMIT_EXCEEDED"
  | "MOVE_ROOT_ITEM"
  | "MOVE_CROSS_REPO"
  | "MOVE_INTO_OWN_SUBTREE"
  | "MOVE_NAME_CONFLICT"
  | "ADDRESS_TAKEN";

export class FoldersOperationError extends Error {
  constructor(
    public readonly code: FoldersErrorCode,
    message: string,
    public readonly managedBy?: SystemFolderManagedBy
  ) {
    super(message);
    this.name = "FoldersOperationError";
  }
}

export { SystemFolderReadOnlyError };

/**
 * Injectable seam for unit tests only (`folders.test.ts`) — production call
 * sites never pass this, so the real `item-ops.ts`/`getDataRouter()` path is
 * always used. Mirrors `data-router.test.ts`'s existing fake-provider
 * pattern, one level up.
 */
export interface FolderChildOps {
  getItemByAddress: typeof realGetItemByAddress;
  getChildrenOf: typeof realGetChildrenOf;
  createOrGetChild: typeof realCreateOrGetChild;
  putItemBody: typeof realPutItemBody;
  putItemConfig: typeof realPutItemConfig;
  deleteItemByAddress: typeof realDeleteItemByAddress;
  moveItem: typeof realMoveItemByAddress;
  readdressItem: typeof realReaddressItemByAddress;
}

interface FolderWriteOptions {
  allowSystemFolderWrite?: boolean;
}

const defaultOps: FolderChildOps = {
  getItemByAddress: realGetItemByAddress,
  getChildrenOf: realGetChildrenOf,
  createOrGetChild: realCreateOrGetChild,
  putItemBody: realPutItemBody,
  putItemConfig: realPutItemConfig,
  deleteItemByAddress: realDeleteItemByAddress,
  moveItem: realMoveItemByAddress,
  readdressItem: realReaddressItemByAddress,
};

/** Same shape CP enforces on writes (`cp-model.ts` ADDRESS_PATTERN). */
const CP_ADDRESS_PATTERN = /^[^/]+(\/\d{2,3})*$/;

/** Walk parent chain collecting config.name → ["views","daily",...]. */
export async function resolveLogicalNamePath(
  address: string,
  ops: Pick<FolderChildOps, "getItemByAddress"> = defaultOps
): Promise<string[]> {
  const { repoGuid } = splitAddress(address);
  const names: string[] = [];
  let current = address;
  while (current && current !== repoGuid) {
    const item = await ops.getItemByAddress(current);
    if (!item) break;
    names.unshift(item.config.name);
    const parts = current.split("/");
    parts.pop();
    current = parts.join("/");
  }
  return names;
}

function rethrowSystemFolder(err: unknown): never {
  if (err instanceof SystemFolderReadOnlyError) {
    throw new FoldersOperationError("SYSTEM_FOLDER_READ_ONLY", err.message, err.managedBy);
  }
  throw err;
}

/**
 * Trims and validates a child name: non-empty after trim, and never a path
 * separator or parent-escape sequence (this repo's CP addresses are always
 * one numeric segment per level — a name is never itself part of the
 * address, but a name containing `/`, `\`, or `..` would be confusing/unsafe
 * to display and has no legitimate use here).
 */
export function validateChildName(rawName: string): string {
  const name = rawName.trim();
  if (!name) {
    throw new FoldersOperationError("VALIDATION", "Name must not be empty");
  }
  if (name.includes("/") || name.includes("\\") || name.includes("..")) {
    throw new FoldersOperationError(
      "VALIDATION",
      `Name must not contain "/", "\\", or ".." (got: "${name}")`
    );
  }
  return name;
}

export function validateChildType(type: string): FolderChildType {
  if (type !== "Text" && type !== "Folder") {
    throw new FoldersOperationError(
      "VALIDATION",
      `Unsupported item type: "${type}" (only "Text" and "Folder" are allowed)`
    );
  }
  return type;
}

/**
 * Creates (or finds) a Text/Folder child under `parentAddress`.
 *
 * @param parentAddress Full CP address, already resolved by the caller
 *   inside the authenticated user's own repo — this function never sees or
 *   trusts a client-supplied repo id.
 * @throws FoldersOperationError PARENT_NOT_FOUND / PARENT_NOT_FOLDER / VALIDATION
 */
async function createFolderChildItemInternal(
  parentAddress: string,
  rawName: string,
  rawType: string,
  body?: string,
  ops: FolderChildOps = defaultOps,
  options: FolderWriteOptions = {}
): Promise<{ item: CpItem; alreadyExisted: boolean }> {
  const name = validateChildName(rawName);
  const type = validateChildType(rawType);

  const parent = await ops.getItemByAddress(parentAddress);
  if (!parent) {
    throw new FoldersOperationError(
      "PARENT_NOT_FOUND",
      `Parent not found at address "${parentAddress}"`
    );
  }
  if (parent.config.type !== "Folder") {
    throw new FoldersOperationError(
      "PARENT_NOT_FOLDER",
      `Parent at "${parentAddress}" is not a Folder (type: "${parent.config.type}")`
    );
  }

  if (!options.allowSystemFolderWrite) {
    try {
      const parentNames = await resolveLogicalNamePath(parentAddress, ops);
      assertNotSystemFolderWrite(parentNames, "create-child");
    } catch (err) {
      rethrowSystemFolder(err);
    }
  }

  const existingChildren = await ops.getChildrenOf(parent.config.address);
  const alreadyExisted = existingChildren.some((child) => child.config.name === name);

  const item = await ops.createOrGetChild(parent, name, type, body);
  return { item, alreadyExisted };
}

export async function createFolderChildItem(
  parentAddress: string,
  rawName: string,
  rawType: string,
  body?: string,
  ops: FolderChildOps = defaultOps
): Promise<{ item: CpItem; alreadyExisted: boolean }> {
  return createFolderChildItemInternal(parentAddress, rawName, rawType, body, ops);
}

export async function createFolderChildItemAllowingSystemFolderWrite(
  parentAddress: string,
  rawName: string,
  rawType: string,
  body?: string
): Promise<{ item: CpItem; alreadyExisted: boolean }> {
  return createFolderChildItemInternal(parentAddress, rawName, rawType, body, defaultOps, {
    allowSystemFolderWrite: true,
  });
}

/**
 * Overwrites an existing Text item's body. Never allowed on a Folder — a
 * Folder's visible "Body" is a computed children map, not its own stored
 * content.
 *
 * @throws FoldersOperationError ITEM_NOT_FOUND / NOT_TEXT_ITEM
 */
async function updateFolderTextBodyInternal(
  address: string,
  body: string,
  ops: FolderChildOps = defaultOps,
  options: FolderWriteOptions = {}
): Promise<CpItem> {
  const existing = await ops.getItemByAddress(address);
  if (!existing) {
    throw new FoldersOperationError("ITEM_NOT_FOUND", `Item not found at address "${address}"`);
  }
  if (existing.config.type !== "Text") {
    throw new FoldersOperationError(
      "NOT_TEXT_ITEM",
      `Item at "${address}" is not a Text item (type: "${existing.config.type}")`
    );
  }

  if (!options.allowSystemFolderWrite) {
    try {
      const names = await resolveLogicalNamePath(address, ops);
      assertNotSystemFolderWrite(names, "update-body");
    } catch (err) {
      rethrowSystemFolder(err);
    }
  }

  return ops.putItemBody(address, body);
}

export async function updateFolderTextBody(
  address: string,
  body: string,
  ops: FolderChildOps = defaultOps
): Promise<CpItem> {
  return updateFolderTextBodyInternal(address, body, ops);
}

export async function updateFolderTextBodyAllowingSystemFolderWrite(
  address: string,
  body: string
): Promise<CpItem> {
  return updateFolderTextBodyInternal(address, body, defaultOps, {
    allowSystemFolderWrite: true,
  });
}

/**
 * Validates a client-supplied config JSON against the item it would
 * replace: must be a plain object (not null/array/primitive) carrying the
 * 4 keys CP itself enforces (`cp-model.ts`'s `CpItemConfig`). `id`/`type`
 * must stay byte-identical — changing those could orphan an item or (for
 * `type`) corrupt Text/Folder body semantics. `name` MAY change (display
 * identity; caller still runs sibling-uniqueness). `address` MAY change
 * when the target slot is free — the write path rewrites the item (and
 * its subtree) rather than a config-only put. Every other key round-trips
 * through untouched — this is a full-object replace, not a patch.
 */
function validateItemConfig(rawConfig: unknown, existing: CpItem): CpItemConfig {
  if (typeof rawConfig !== "object" || rawConfig === null || Array.isArray(rawConfig)) {
    throw new FoldersOperationError(
      "VALIDATION",
      "Config must be a JSON object (not null, an array, or a primitive value)"
    );
  }

  const candidate = rawConfig as Record<string, unknown>;
  for (const field of ["id", "type", "name", "address"] as const) {
    if (typeof candidate[field] !== "string" || candidate[field] === "") {
      throw new FoldersOperationError("VALIDATION", `Config field "${field}" must be a non-empty string`);
    }
  }

  if (candidate.id !== existing.config.id) {
    throw new FoldersOperationError(
      "FORBIDDEN_IDENTITY_CHANGE",
      `Config "id" must match the existing item's id (expected "${existing.config.id}", got "${candidate.id}")`
    );
  }
  if (candidate.type !== existing.config.type) {
    throw new FoldersOperationError(
      "FORBIDDEN_IDENTITY_CHANGE",
      `Changing "type" is not supported here (expected "${existing.config.type}", got "${candidate.type}") — Text/Folder conversion could corrupt body/children semantics`
    );
  }

  const address = String(candidate.address);
  if (!CP_ADDRESS_PATTERN.test(address)) {
    throw new FoldersOperationError(
      "VALIDATION",
      `Config "address" is not a valid CP address ("${address}")`
    );
  }

  // Same rules as create-child names: trim, reject empty / path-like values.
  // validateChildName throws VALIDATION on bad input.
  const name = validateChildName(String(candidate.name));

  return { ...candidate, name, address } as CpItemConfig;
}

async function collectSubtreeAddresses(
  rootAddress: string,
  ops: Pick<FolderChildOps, "getChildrenOf">
): Promise<string[]> {
  const addresses = [rootAddress];
  const children = await ops.getChildrenOf(rootAddress);
  for (const child of children) {
    addresses.push(...(await collectSubtreeAddresses(child.config.address, ops)));
  }
  return addresses;
}

/**
 * Allows changing `config.address` only when the new slot (and every
 * rewritten descendant slot) is free, same-repo, under an existing Folder
 * parent, and not into the item's own subtree.
 */
async function assertCanReaddress(
  existing: CpItem,
  newAddress: string,
  ops: FolderChildOps
): Promise<void> {
  const oldAddress = existing.config.address;
  if (newAddress === oldAddress) return;

  const { repoGuid: oldRepo } = splitAddress(oldAddress);
  const { repoGuid: newRepo, segments: newSegments } = splitAddress(newAddress);

  if (oldAddress === oldRepo) {
    throw new FoldersOperationError("MOVE_ROOT_ITEM", "The repo root item's address cannot be changed");
  }
  if (newSegments.length === 0) {
    throw new FoldersOperationError(
      "VALIDATION",
      "Config \"address\" cannot be changed to a bare repo GUID (only the repo root uses that form)"
    );
  }
  if (newRepo !== oldRepo) {
    throw new FoldersOperationError("MOVE_CROSS_REPO", "Changing an item's address into a different repo is not supported");
  }
  if (newAddress === oldAddress || newAddress.startsWith(`${oldAddress}/`)) {
    throw new FoldersOperationError(
      "MOVE_INTO_OWN_SUBTREE",
      `Cannot readdress "${oldAddress}" into its own subtree (target "${newAddress}")`
    );
  }

  const parentParts = newAddress.split("/");
  parentParts.pop();
  const newParentAddress = parentParts.join("/");
  const newParent = await ops.getItemByAddress(newParentAddress);
  if (!newParent) {
    throw new FoldersOperationError(
      "PARENT_NOT_FOUND",
      `Target parent not found at address "${newParentAddress}"`
    );
  }
  if (newParent.config.type !== "Folder") {
    throw new FoldersOperationError(
      "PARENT_NOT_FOLDER",
      `Target parent at "${newParentAddress}" is not a Folder (type: "${newParent.config.type}")`
    );
  }

  const subtree = await collectSubtreeAddresses(oldAddress, ops);
  const subtreeSet = new Set(subtree);
  for (const address of subtree) {
    const rewritten = newAddress + address.slice(oldAddress.length);
    if (subtreeSet.has(rewritten)) continue;
    const occupant = await ops.getItemByAddress(rewritten);
    if (occupant) {
      throw new FoldersOperationError(
        "ADDRESS_TAKEN",
        `Address "${rewritten}" is already taken`
      );
    }
  }

  const siblings = await ops.getChildrenOf(newParentAddress);
  const nameClash = siblings.find(
    (s) => s.config.address !== oldAddress && s.config.name === existing.config.name
  );
  if (nameClash) {
    throw new FoldersOperationError(
      "MOVE_NAME_CONFLICT",
      `A child named "${existing.config.name}" already exists under "${newParentAddress}" (at "${nameClash.config.address}")`
    );
  }
}

/**
 * When renaming, refuse if another direct sibling already uses that name —
 * CP's getByNames / create-child find-or-create treat sibling names as
 * unique, and leaving two siblings with the same name would later throw
 * DuplicateChildNameError on name-path lookups.
 */
async function assertRenameDoesNotCollide(
  existing: CpItem,
  newName: string,
  ops: FolderChildOps
): Promise<void> {
  if (newName === existing.config.name) return;

  const parts = existing.config.address.split("/");
  if (parts.length < 2) return; // repo root — no parent/siblings to collide with

  parts.pop();
  const parentAddress = parts.join("/");
  const siblings = await ops.getChildrenOf(parentAddress);
  const clash = siblings.find(
    (s) => s.config.address !== existing.config.address && s.config.name === newName
  );
  if (clash) {
    throw new FoldersOperationError(
      "VALIDATION",
      `A sibling item already uses the name "${newName}" (at "${clash.config.address}")`
    );
  }
}

/**
 * Overwrites an existing item's config in place, preserving its body
 * untouched — the Folders GUI's Config editor's write path (Story 95).
 * Works for both Text and Folder items (a Folder's config is real stored
 * data; only its visible "Body" is a computed children map).
 *
 * @throws FoldersOperationError ITEM_NOT_FOUND / VALIDATION /
 *   FORBIDDEN_IDENTITY_CHANGE / SYSTEM_FOLDER_READ_ONLY
 */
async function updateFolderItemConfigInternal(
  address: string,
  rawConfig: unknown,
  ops: FolderChildOps = defaultOps,
  options: FolderWriteOptions = {}
): Promise<CpItem> {
  const existing = await ops.getItemByAddress(address);
  if (!existing) {
    throw new FoldersOperationError("ITEM_NOT_FOUND", `Item not found at address "${address}"`);
  }

  const config = validateItemConfig(rawConfig, existing);
  const addressChanging = config.address !== existing.config.address;

  if (addressChanging) {
    await assertCanReaddress(existing, config.address, ops);
  }

  // Rename collision is checked against the *destination* parent's siblings
  // when the address is also changing (assertCanReaddress already rejected
  // a same-name clash under the new parent for the *current* name; here we
  // cover a simultaneous rename to a different colliding name).
  if (config.name !== existing.config.name) {
    if (addressChanging) {
      const parentParts = config.address.split("/");
      parentParts.pop();
      const newParentAddress = parentParts.join("/");
      const siblings = await ops.getChildrenOf(newParentAddress);
      const clash = siblings.find(
        (s) => s.config.address !== existing.config.address && s.config.name === config.name
      );
      if (clash) {
        throw new FoldersOperationError(
          "VALIDATION",
          `A sibling item already uses the name "${config.name}" (at "${clash.config.address}")`
        );
      }
    } else {
      await assertRenameDoesNotCollide(existing, config.name, ops);
    }
  }

  if (!options.allowSystemFolderWrite) {
    try {
      const names = await resolveLogicalNamePath(address, ops);
      assertNotSystemFolderWrite(names, "update-body");
      if (addressChanging) {
        const parentParts = config.address.split("/");
        parentParts.pop();
        const targetNames = await resolveLogicalNamePath(parentParts.join("/"), ops);
        assertNotSystemFolderWrite(targetNames, "create-child");
      }
    } catch (err) {
      rethrowSystemFolder(err);
    }
  }

  let itemAtFinalAddress = existing;
  if (addressChanging) {
    try {
      itemAtFinalAddress = await ops.readdressItem(existing.config.address, config.address);
    } catch (err) {
      if (isAddressConflictError(err)) {
        throw new FoldersOperationError("ADDRESS_TAKEN", `Address "${err.address}" is already taken`);
      }
      throw err;
    }
  }

  return ops.putItemConfig({ _id: itemAtFinalAddress._id, config, body: itemAtFinalAddress.body });
}

export async function updateFolderItemConfig(
  address: string,
  rawConfig: unknown,
  ops: FolderChildOps = defaultOps
): Promise<CpItem> {
  return updateFolderItemConfigInternal(address, rawConfig, ops);
}

export async function updateFolderItemConfigAllowingSystemFolderWrite(
  address: string,
  rawConfig: unknown
): Promise<CpItem> {
  return updateFolderItemConfigInternal(address, rawConfig, defaultOps, {
    allowSystemFolderWrite: true,
  });
}

interface FolderDeleteOptions extends FolderWriteOptions {
  /**
   * When true, a non-empty Folder is deleted deepest-first (every descendant,
   * then the folder itself). Default false keeps the historical guard that
   * refuses non-empty folders with FOLDER_NOT_EMPTY.
   */
  recursive?: boolean;
}

/**
 * Permanently deletes a Text or Folder item. By default a Folder can only
 * be deleted while empty (FOLDER_NOT_EMPTY) so nothing is silently removed
 * alongside what the user selected. Pass `recursive: true` (after an
 * explicit UI confirmation) to cascade deepest-first through the subtree.
 *
 * @throws FoldersOperationError ITEM_NOT_FOUND / FOLDER_NOT_EMPTY / SYSTEM_FOLDER_READ_ONLY
 */
async function deleteFolderItemInternal(
  address: string,
  ops: FolderChildOps = defaultOps,
  options: FolderDeleteOptions = {}
): Promise<void> {
  const existing = await ops.getItemByAddress(address);
  if (!existing) {
    throw new FoldersOperationError("ITEM_NOT_FOUND", `Item not found at address "${address}"`);
  }

  // Refuse protected system folders before any child deletion starts, so a
  // recursive call never leaves a half-deleted tree under a blocked root.
  if (!options.allowSystemFolderWrite) {
    try {
      const names = await resolveLogicalNamePath(address, ops);
      assertNotSystemFolderWrite(names, "delete");
    } catch (err) {
      rethrowSystemFolder(err);
    }
  }

  if (existing.config.type === "Folder") {
    const children = await ops.getChildrenOf(address);
    if (children.length > 0) {
      if (!options.recursive) {
        throw new FoldersOperationError(
          "FOLDER_NOT_EMPTY",
          `Folder at "${address}" still has ${children.length} child item(s) — delete those first`
        );
      }
      for (const child of children) {
        await deleteFolderItemInternal(child.config.address, ops, {
          ...options,
          recursive: true,
        });
      }
    }
  }

  await ops.deleteItemByAddress(address);
}

export async function deleteFolderItem(
  address: string,
  ops: FolderChildOps = defaultOps,
  options: { recursive?: boolean } = {}
): Promise<void> {
  return deleteFolderItemInternal(address, ops, options);
}

export async function deleteFolderItemAllowingSystemFolderWrite(
  address: string,
  options: { recursive?: boolean } = {}
): Promise<void> {
  return deleteFolderItemInternal(address, defaultOps, {
    allowSystemFolderWrite: true,
    recursive: options.recursive,
  });
}

export interface MoveFolderItemResult {
  item: CpItem;
  /** `false` when the target parent was already the item's current parent — a no-op success, not an error. */
  moved: boolean;
}

/**
 * Moves a Text/Folder item — and its whole subtree, if it's a Folder — to
 * a new parent Folder. Same repo only (moving across repos is not
 * supported — a deliberate scope decision, not a limitation of the
 * underlying storage). Refuses to move an item into its own subtree (would
 * create a cycle) and never silently overwrites a same-named sibling
 * already under the target (same "no silent overwrite" rule
 * `createFolderChildItem`'s find-or-create semantics apply at create time).
 * Moving an item to its OWN current parent is a no-op success, not an
 * error — nothing to do, not a mistake.
 *
 * @throws FoldersOperationError ITEM_NOT_FOUND / MOVE_ROOT_ITEM /
 *   PARENT_NOT_FOUND / PARENT_NOT_FOLDER / MOVE_CROSS_REPO /
 *   MOVE_INTO_OWN_SUBTREE / MOVE_NAME_CONFLICT / SYSTEM_FOLDER_READ_ONLY
 */
async function moveFolderItemInternal(
  address: string,
  newParentAddress: string,
  ops: FolderChildOps = defaultOps,
  options: FolderWriteOptions = {}
): Promise<MoveFolderItemResult> {
  const existing = await ops.getItemByAddress(address);
  if (!existing) {
    throw new FoldersOperationError("ITEM_NOT_FOUND", `Item not found at address "${address}"`);
  }

  const { repoGuid: itemRepoGuid } = splitAddress(address);
  if (address === itemRepoGuid) {
    throw new FoldersOperationError("MOVE_ROOT_ITEM", "The repo root item cannot be moved");
  }

  const newParent = await ops.getItemByAddress(newParentAddress);
  if (!newParent) {
    throw new FoldersOperationError(
      "PARENT_NOT_FOUND",
      `Target parent not found at address "${newParentAddress}"`
    );
  }
  if (newParent.config.type !== "Folder") {
    throw new FoldersOperationError(
      "PARENT_NOT_FOLDER",
      `Target parent at "${newParentAddress}" is not a Folder (type: "${newParent.config.type}")`
    );
  }

  const { repoGuid: targetRepoGuid } = splitAddress(newParentAddress);
  if (targetRepoGuid !== itemRepoGuid) {
    throw new FoldersOperationError("MOVE_CROSS_REPO", "Moving an item into a different repo is not supported");
  }

  if (newParentAddress === address || newParentAddress.startsWith(`${address}/`)) {
    throw new FoldersOperationError(
      "MOVE_INTO_OWN_SUBTREE",
      `Cannot move "${address}" into its own subtree (target "${newParentAddress}")`
    );
  }

  const addressParts = address.split("/");
  addressParts.pop();
  const currentParentAddress = addressParts.join("/");
  if (currentParentAddress === newParentAddress) {
    return { item: existing, moved: false };
  }

  const targetSiblings = await ops.getChildrenOf(newParentAddress);
  const conflict = targetSiblings.find((sibling) => sibling.config.name === existing.config.name);
  if (conflict) {
    throw new FoldersOperationError(
      "MOVE_NAME_CONFLICT",
      `A child named "${existing.config.name}" already exists under "${newParentAddress}" (at "${conflict.config.address}")`
    );
  }

  if (!options.allowSystemFolderWrite) {
    try {
      const sourceNames = await resolveLogicalNamePath(address, ops);
      assertNotSystemFolderWrite(sourceNames, "delete");
      const targetNames = await resolveLogicalNamePath(newParentAddress, ops);
      assertNotSystemFolderWrite(targetNames, "create-child");
    } catch (err) {
      rethrowSystemFolder(err);
    }
  }

  const item = await ops.moveItem(address, newParentAddress);
  return { item, moved: true };
}

export async function moveFolderItem(
  address: string,
  newParentAddress: string,
  ops: FolderChildOps = defaultOps
): Promise<MoveFolderItemResult> {
  return moveFolderItemInternal(address, newParentAddress, ops);
}

export async function moveFolderItemAllowingSystemFolderWrite(
  address: string,
  newParentAddress: string
): Promise<MoveFolderItemResult> {
  return moveFolderItemInternal(address, newParentAddress, defaultOps, { allowSystemFolderWrite: true });
}

// ============================================================================
// Folder tree export (Story 98, unified content/depth contract — Story 121)
// — read-only, for pasting context into AI.
// ============================================================================

/** What to include per item: body only, config only, or both. */
export type FolderExportContent = "body" | "config" | "both";

/** Parses a transport-form content string; returns `null` for anything else — callers turn that into a 400. */
export function parseFolderExportContent(raw: string): FolderExportContent | null {
  return raw === "body" || raw === "config" || raw === "both" ? raw : null;
}

/**
 * Parses a transport-form depth string: a non-negative integer, `0` meaning
 * unlimited (recurse to the bottom of the tree — the hard item-count/
 * body-size caps still apply regardless, see `buildFolderExport`). Rejects
 * negative numbers, decimals, and non-numeric garbage — returns `null` for
 * all of those, callers turn that into a 400.
 */
export function parseFolderExportDepth(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

export interface FolderExportItem {
  /**
   * Only present when `config` is NOT included on this item (`content ===
   * "body"`) — `config` itself already carries `address`/`name`/`type`
   * (see `CpItemConfig`), so repeating them (plus a derivable-from-address
   * `index`) would just be redundant noise once `config` is present.
   */
  address?: string;
  name?: string;
  type?: string;
  /** Present when `content` is `"body"` or `"both"`. */
  body?: string;
  /** Present when `content` is `"config"` or `"both"`. */
  config?: CpItemConfig;
  /** Only present on a Folder item the export actually recursed into (i.e. `depth` reached it) — `[]`, never omitted, when that folder has no children. Absent (not `[]`) on a Folder at the depth boundary that was never recursed into. */
  children?: FolderExportItem[];
}

export interface FolderExportResult {
  source: { address: string; name: string; type: string };
  content: FolderExportContent;
  /** Echoes the requested depth; `0` means unlimited (recursed to the bottom of the tree). */
  depth: number;
  items: FolderExportItem[];
}

export const DEFAULT_EXPORT_MAX_ITEMS = 500;
export const DEFAULT_EXPORT_MAX_BODY_CHARS = 5_000_000;

function lastAddressSegment(address: string): string {
  return address.split("/").pop() ?? address;
}

/** Stable, numeric-index order (CP's own convention) — never trusts whatever order the provider happened to return. */
function sortByCpIndex<T extends CpItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    try {
      return (
        parseChildIndex(lastAddressSegment(a.config.address)) -
        parseChildIndex(lastAddressSegment(b.config.address))
      );
    } catch {
      // A non-numeric last segment shouldn't happen for a real CP child
      // address, but fall back to a stable, deterministic order instead of
      // throwing — this is a read-only export, not a write-path invariant.
      return lastAddressSegment(a.config.address).localeCompare(lastAddressSegment(b.config.address));
    }
  });
}

/**
 * Builds the exported tree DTO for the unified `content` × `depth` contract
 * (Story 121 — replaces the old fixed `body-l1`/`body-l2`/`all-l1` modes).
 * Pure given its `getChildren` callback — no address/repo resolution, no
 * auth, no I/O beyond that one injected function — so it's fully
 * unit-testable without a real provider (mirrors `FolderChildOps`'s existing
 * injectable-seam pattern).
 *
 * `depth` counts levels below the export root: `1` = direct children only
 * (old "l1"), `2` = direct children + their children (old "l2"), `0` =
 * unlimited (recurse to the bottom of the tree).
 *
 * Enforces both a hard item-count and a hard total-body-size cap by
 * throwing `EXPORT_LIMIT_EXCEEDED` — never silently truncates the result,
 * and this cap is NOT relaxed by `depth: 0`; it's the only thing keeping
 * unlimited depth safe on a large tree.
 *
 * @throws FoldersOperationError ROOT_NOT_FOLDER / EXPORT_LIMIT_EXCEEDED
 */
export async function buildFolderExport({
  root,
  content,
  depth,
  getChildren,
  maxItems = DEFAULT_EXPORT_MAX_ITEMS,
  maxBodyChars = DEFAULT_EXPORT_MAX_BODY_CHARS,
}: {
  root: CpItem;
  content: FolderExportContent;
  /** 0 = unlimited. */
  depth: number;
  getChildren: (parentAddress: string) => Promise<CpItem[]>;
  maxItems?: number;
  maxBodyChars?: number;
}): Promise<FolderExportResult> {
  if (root.config.type !== "Folder") {
    throw new FoldersOperationError(
      "ROOT_NOT_FOLDER",
      `Export root at "${root.config.address}" is not a Folder (type: "${root.config.type}")`
    );
  }

  let itemCount = 0;
  let bodyChars = 0;
  function consume(item: CpItem): void {
    itemCount += 1;
    bodyChars += item.body.length;
    if (itemCount > maxItems || bodyChars > maxBodyChars) {
      throw new FoldersOperationError(
        "EXPORT_LIMIT_EXCEEDED",
        `Export exceeds the server limit (max ${maxItems} items / ${maxBodyChars} body chars) — narrow the scope (e.g. a smaller folder, or a lower depth)`
      );
    }
  }

  function toItem(child: CpItem): FolderExportItem {
    // "body" is the only mode where the item's own config isn't already
    // present — that's the only time address/name/type earn their keep.
    if (content === "body") {
      return {
        address: child.config.address,
        name: child.config.name,
        type: child.config.type,
        body: child.body,
      };
    }
    if (content === "config") return { config: child.config };
    return { body: child.body, config: child.config };
  }

  // levelsRemaining counts down toward 1 (the last level actually
  // recursed into); Infinity for depth: 0 (unlimited) never runs out.
  async function buildLevel(parentAddress: string, levelsRemaining: number): Promise<FolderExportItem[]> {
    const children = sortByCpIndex(await getChildren(parentAddress));
    const result: FolderExportItem[] = [];
    for (const child of children) {
      consume(child);
      const item = toItem(child);
      if (child.config.type === "Folder" && levelsRemaining > 1) {
        item.children = await buildLevel(child.config.address, levelsRemaining - 1);
      }
      result.push(item);
    }
    return result;
  }

  const items = await buildLevel(root.config.address, depth === 0 ? Infinity : depth);

  return {
    source: { address: root.config.address, name: root.config.name, type: root.config.type },
    content,
    depth,
    items,
  };
}

/** Total item count across the whole export tree (direct children + any nested `children`) — what the UI's success toast reports. */
export function countFolderExportItems(items: FolderExportItem[]): number {
  let total = 0;
  for (const item of items) {
    total += 1;
    if (item.children) total += countFolderExportItems(item.children);
  }
  return total;
}

/**
 * Read-only tree export for pasting Folder context into AI (Story 98) — the
 * Folders GUI's Copy feature. Never mutates anything; always reads the
 * item's/its descendants' already-saved backend data, never a client draft.
 *
 * @throws FoldersOperationError ITEM_NOT_FOUND / ROOT_NOT_FOLDER / EXPORT_LIMIT_EXCEEDED
 */
export async function exportFolderTree(
  address: string,
  content: FolderExportContent,
  depth: number,
  ops: Pick<FolderChildOps, "getItemByAddress" | "getChildrenOf"> = defaultOps,
  limits?: { maxItems?: number; maxBodyChars?: number }
): Promise<{ result: FolderExportResult; itemCount: number }> {
  const root = await ops.getItemByAddress(address);
  if (!root) {
    throw new FoldersOperationError("ITEM_NOT_FOUND", `Item not found at address "${address}"`);
  }

  const result = await buildFolderExport({
    root,
    content,
    depth,
    getChildren: ops.getChildrenOf,
    maxItems: limits?.maxItems,
    maxBodyChars: limits?.maxBodyChars,
  });

  return { result, itemCount: countFolderExportItems(result.items) };
}
