import { getChildrenOf, type CpItem, type FoldersOperationError } from 'dba';

/**
 * Shape returned to the Folders GUI for a single item. Shared by
 * `app/api/folders/route.ts` (GET/POST/PUT/DELETE) and
 * `app/api/folders/config/route.ts` (PUT config) — factored out here
 * because a Next.js App Router `route.ts` file may only export the
 * HTTP-verb handlers (plus a few reserved names), so the two route files
 * cannot import this from each other directly.
 */
export async function toApiItem(found: CpItem) {
  let body = found.body;
  if (found.config.type === 'Folder') {
    const children = await getChildrenOf(found.config.address);
    const childMap: Record<string, string> = {};
    for (const child of children) {
      const index = child.config.address.split('/').pop() ?? child.config.address;
      childMap[index] = child.config.name;
    }
    body = JSON.stringify(childMap);
  }
  return {
    Body: body,
    Config: found.config,
    Settings: found.config,
    Address: found.config.address,
  };
}

export function statusForFoldersError(error: FoldersOperationError): number {
  switch (error.code) {
    case 'VALIDATION':
      return 400;
    case 'PARENT_NOT_FOUND':
    case 'ITEM_NOT_FOUND':
      return 404;
    case 'PARENT_NOT_FOLDER':
    case 'NOT_TEXT_ITEM':
      return 409;
    case 'SYSTEM_FOLDER_READ_ONLY':
      return 403;
    case 'FOLDER_NOT_EMPTY':
      return 409;
    case 'FORBIDDEN_IDENTITY_CHANGE':
      return 409;
    case 'ROOT_NOT_FOLDER':
      return 409;
    case 'EXPORT_LIMIT_EXCEEDED':
      return 413;
    case 'MOVE_ROOT_ITEM':
    case 'MOVE_CROSS_REPO':
      return 400;
    case 'MOVE_INTO_OWN_SUBTREE':
    case 'MOVE_NAME_CONFLICT':
    case 'ADDRESS_TAKEN':
      return 409;
    default:
      return 500;
  }
}
