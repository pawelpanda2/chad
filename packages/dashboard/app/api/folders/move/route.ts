/**
 * POST /api/folders/move
 *
 * Reparents an existing Text/Folder item (and its whole subtree) to a new
 * parent Folder, both within the currently-selected repo (Story 109
 * follow-up — "move" was the one write op the Folders tab never had; added
 * so a user can reorganize an existing tree, e.g. moving several existing
 * Knowledge categories under a newly-created grouping Folder, without a
 * one-off manual script).
 *
 * Body: `{ loca: string, targetLoca: string, allowSystemFolderWrite?: boolean, repoGuid?: string }`
 * `targetLoca` may be `""` for the repo root.
 *
 * SECURITY: same repo-isolation rule as the other `/api/folders/*` routes —
 * both `loca` and `targetLoca` are only ever resolved relative to the same
 * `access.repoGuid` from the session; the client never supplies (and this
 * route never trusts) a repo id or a full address directly. `dba`'s
 * `moveFolderItem` additionally refuses a cross-repo move even if it were
 * ever passed one.
 */
import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/session";
import { toApiItem, statusForFoldersError } from "@/lib/folders-api";
import {
  moveFolderItem,
  moveFolderItemAllowingSystemFolderWrite,
  getItemByAddress,
  FoldersOperationError,
  runWithRepoContext,
  resolveFoldersRepoAccess,
} from "dba";

export async function POST(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  let payload: { loca?: unknown; targetLoca?: unknown; allowSystemFolderWrite?: unknown; repoGuid?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const loca = payload.loca;
  const targetLoca = payload.targetLoca;
  const allowSystemFolderWrite = payload.allowSystemFolderWrite === true;

  if (typeof loca !== "string" || !loca) {
    return NextResponse.json({ error: 'Missing or invalid "loca" — refusing to move the repo root' }, { status: 400 });
  }
  if (typeof targetLoca !== "string") {
    return NextResponse.json({ error: 'Missing or invalid "targetLoca"' }, { status: 400 });
  }

  const access = resolveFoldersRepoAccess(user, typeof payload.repoGuid === "string" ? payload.repoGuid : null);
  if (!access.allowed) {
    return NextResponse.json({ error: "FORBIDDEN_REPO" }, { status: 403 });
  }

  const address = `${access.repoGuid}/${loca}`;
  const newParentAddress = targetLoca ? `${access.repoGuid}/${targetLoca}` : access.repoGuid;

  try {
    const { item, moved } = await runWithRepoContext(user, () =>
      user.isAdmin && allowSystemFolderWrite
        ? moveFolderItemAllowingSystemFolderWrite(address, newParentAddress)
        : moveFolderItem(address, newParentAddress)
    );

    // The item's own new parent (freshly fetched — its child map now
    // includes the moved item), so the client can jump straight there and
    // see the result, same convention as POST/DELETE returning `parent`.
    const newParent = await getItemByAddress(newParentAddress);

    return NextResponse.json({
      item: await toApiItem(item),
      moved,
      parent: newParent ? await toApiItem(newParent) : null,
    });
  } catch (err) {
    if (err instanceof FoldersOperationError) {
      return NextResponse.json({ error: err.code, details: err.message }, { status: statusForFoldersError(err) });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "UNKNOWN_ERROR" },
      { status: 500 }
    );
  }
}
