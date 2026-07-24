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
} from "./item-ops.js";
import type { CpItem } from "./cp-model.js";

export type FolderChildType = "Text" | "Folder";

export type FoldersErrorCode =
  | "VALIDATION"
  | "PARENT_NOT_FOUND"
  | "PARENT_NOT_FOLDER"
  | "ITEM_NOT_FOUND"
  | "NOT_TEXT_ITEM";

export class FoldersOperationError extends Error {
  constructor(public readonly code: FoldersErrorCode, message: string) {
    super(message);
    this.name = "FoldersOperationError";
  }
}

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
}

const defaultOps: FolderChildOps = {
  getItemByAddress: realGetItemByAddress,
  getChildrenOf: realGetChildrenOf,
  createOrGetChild: realCreateOrGetChild,
  putItemBody: realPutItemBody,
};

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
export async function createFolderChildItem(
  parentAddress: string,
  rawName: string,
  rawType: string,
  body?: string,
  ops: FolderChildOps = defaultOps
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

  const existingChildren = await ops.getChildrenOf(parent.config.address);
  const alreadyExisted = existingChildren.some((child) => child.config.name === name);

  const item = await ops.createOrGetChild(parent, name, type, body);
  return { item, alreadyExisted };
}

/**
 * Overwrites an existing Text item's body. Never allowed on a Folder — a
 * Folder's visible "Body" is a computed children map, not its own stored
 * content.
 *
 * @throws FoldersOperationError ITEM_NOT_FOUND / NOT_TEXT_ITEM
 */
export async function updateFolderTextBody(
  address: string,
  body: string,
  ops: FolderChildOps = defaultOps
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

  return ops.putItemBody(address, body);
}
