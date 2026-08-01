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
} from "./item-ops.js";
import type { CpItem, CpItemConfig } from "./cp-model.js";
import { splitAddress } from "./cp-model.js";
import {
  assertNotSystemFolderWrite,
  SystemFolderReadOnlyError,
  type SystemFolderManagedBy,
} from "./system-folders.js";

export type FolderChildType = "Text" | "Folder";

export type FoldersErrorCode =
  | "VALIDATION"
  | "PARENT_NOT_FOUND"
  | "PARENT_NOT_FOLDER"
  | "ITEM_NOT_FOUND"
  | "NOT_TEXT_ITEM"
  | "SYSTEM_FOLDER_READ_ONLY"
  | "FOLDER_NOT_EMPTY"
  | "FORBIDDEN_IDENTITY_CHANGE";

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
};

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
 * 4 keys CP itself enforces (`cp-model.ts`'s `CpItemConfig`). `id`/
 * `address`/`type` must stay byte-identical to the existing item —
 * changing those could silently orphan/duplicate an address, or (for
 * `type`) corrupt Text/Folder body semantics. `name` MAY change: CP
 * identity is the numeric address, not the display name, so rename is a
 * config-only write (no address rewrite, no children move). The caller
 * must still run the sibling-uniqueness check when the name actually
 * changes. Every other key round-trips through untouched — this is a
 * full-object replace, not a patch.
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
  if (candidate.address !== existing.config.address) {
    throw new FoldersOperationError(
      "FORBIDDEN_IDENTITY_CHANGE",
      `Config "address" must match the existing item's address (expected "${existing.config.address}", got "${candidate.address}")`
    );
  }
  if (candidate.type !== existing.config.type) {
    throw new FoldersOperationError(
      "FORBIDDEN_IDENTITY_CHANGE",
      `Changing "type" is not supported here (expected "${existing.config.type}", got "${candidate.type}") — Text/Folder conversion could corrupt body/children semantics`
    );
  }

  // Same rules as create-child names: trim, reject empty / path-like values.
  // validateChildName throws VALIDATION on bad input.
  const name = validateChildName(String(candidate.name));

  return { ...candidate, name } as CpItemConfig;
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

  if (config.name !== existing.config.name) {
    await assertRenameDoesNotCollide(existing, config.name, ops);
  }

  if (!options.allowSystemFolderWrite) {
    try {
      const names = await resolveLogicalNamePath(address, ops);
      assertNotSystemFolderWrite(names, "update-body");
    } catch (err) {
      rethrowSystemFolder(err);
    }
  }

  return ops.putItemConfig({ _id: existing._id, config, body: existing.body });
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

/**
 * Permanently deletes a Text or Folder item. A Folder can only be deleted
 * while empty — this never cascades to children, so nothing is silently
 * removed alongside what the user actually selected; delete the children
 * first.
 *
 * @throws FoldersOperationError ITEM_NOT_FOUND / FOLDER_NOT_EMPTY / SYSTEM_FOLDER_READ_ONLY
 */
async function deleteFolderItemInternal(
  address: string,
  ops: FolderChildOps = defaultOps,
  options: FolderWriteOptions = {}
): Promise<void> {
  const existing = await ops.getItemByAddress(address);
  if (!existing) {
    throw new FoldersOperationError("ITEM_NOT_FOUND", `Item not found at address "${address}"`);
  }

  if (existing.config.type === "Folder") {
    const children = await ops.getChildrenOf(address);
    if (children.length > 0) {
      throw new FoldersOperationError(
        "FOLDER_NOT_EMPTY",
        `Folder at "${address}" still has ${children.length} child item(s) — delete those first`
      );
    }
  }

  if (!options.allowSystemFolderWrite) {
    try {
      const names = await resolveLogicalNamePath(address, ops);
      assertNotSystemFolderWrite(names, "delete");
    } catch (err) {
      rethrowSystemFolder(err);
    }
  }

  await ops.deleteItemByAddress(address);
}

export async function deleteFolderItem(address: string, ops: FolderChildOps = defaultOps): Promise<void> {
  return deleteFolderItemInternal(address, ops);
}

export async function deleteFolderItemAllowingSystemFolderWrite(address: string): Promise<void> {
  return deleteFolderItemInternal(address, defaultOps, { allowSystemFolderWrite: true });
}
