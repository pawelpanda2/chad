import { NextResponse } from 'next/server';
import { getCurrentUserFromCookies } from '@/lib/session';
import {
  getItemByAddress,
  getChildrenOf,
  createFolderChildItem,
  updateFolderTextBody,
  FoldersOperationError,
  runWithRepoContext,
  type CpItem,
} from 'dba';

/**
 * Shape returned to the Folders GUI for a single item — same shape GET has
 * always returned, factored out here so POST/PUT can return it too (e.g.
 * "refresh the parent" after a create) without duplicating the
 * Folder-children-map assembly logic.
 */
async function toApiItem(found: CpItem) {
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

function statusForFoldersError(error: FoldersOperationError): number {
  switch (error.code) {
    case 'VALIDATION':
      return 400;
    case 'PARENT_NOT_FOUND':
    case 'ITEM_NOT_FOUND':
      return 404;
    case 'PARENT_NOT_FOLDER':
    case 'NOT_TEXT_ITEM':
      return 409;
    default:
      return 500;
  }
}

/**
 * GET /api/folders?loca=<slash-joined loca, omit or "" for repo root>&repoGuid=<optional>
 *
 * Generic Content Provider item explorer for the dashboard's Folders tab
 * (see documentation/stories/57, critical fix in documentation/stories/60).
 * Reads through `dba`'s Mongo-backed item-ops (Story 72) — the .NET
 * Content Provider is no longer deployed, so this no longer calls it.
 *
 * SECURITY: `repoGuid` is never trusted directly. The repo actually used
 * is always `user.repoGuid` from the login session (resolved once, at
 * login time, against the Mongo-backed chad_admin users-list). If the
 * client also supplies a `repoGuid` query param and it does not match, the
 * request is denied (403) — no exceptions for any username.
 *
 * A Folder item's children (the `{index: name}` map the frontend renders)
 * are NOT stored as the item's own `body` in Mongo — CP itself computes
 * that view from the folder's real children on disk, and the migrator
 * copied each item's own `body` (empty for Folders), not a derived
 * listing. So Folder children are fetched separately via `getChildrenOf`
 * and the map is rebuilt here from each child's own address (its last
 * `/NN` segment is CP's own numeric index) — same shape the frontend
 * already parses, just assembled server-side instead of read verbatim.
 */
export async function GET(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json(
      { error: 'NOT_AUTHENTICATED', details: 'Cannot fetch Content Provider items without an authenticated user session' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const loca = searchParams.get('loca') ?? '';
  const requestedRepoGuid = searchParams.get('repoGuid');

  if (requestedRepoGuid && requestedRepoGuid !== user.repoGuid) {
    return NextResponse.json({ error: 'FORBIDDEN_REPO' }, { status: 403 });
  }

  const address = loca ? `${user.repoGuid}/${loca}` : user.repoGuid;

  try {
    const found = await getItemByAddress(address);
    if (!found) {
      return NextResponse.json({ error: `Item not found: address "${address}"` }, { status: 404 });
    }

    const item = await toApiItem(found);
    return NextResponse.json({ item, repoGuid: user.repoGuid, username: user.username });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'UNKNOWN_ERROR' },
      { status: 404 }
    );
  }
}

/**
 * POST /api/folders
 *
 * Creates (or finds, per `PostParentItem`/`createOrGetChild`'s idempotent
 * find-or-create semantics) a Text or Folder child under an existing Folder
 * (Story 82 — first real write path for the Folders tab; previously GET-only
 * since Story 57).
 *
 * Body: `{ parentLoca: string, type: "Text" | "Folder", name: string, body?: string }`
 *
 * SECURITY: same repo-isolation rule as GET — `parentLoca` is only ever
 * resolved relative to `user.repoGuid` from the session; the client never
 * supplies (and this route never trusts) a repo id or a full address.
 * `createFolderChildItem` additionally confirms the parent exists and is a
 * Folder before writing anything.
 */
export async function POST(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: 'NOT_AUTHENTICATED' }, { status: 401 });
  }

  let payload: { parentLoca?: unknown; type?: unknown; name?: unknown; body?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parentLoca = typeof payload.parentLoca === 'string' ? payload.parentLoca : '';
  const type = payload.type;
  const name = payload.name;
  const body = payload.body;

  if (typeof type !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid "type"' }, { status: 400 });
  }
  if (typeof name !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid "name"' }, { status: 400 });
  }
  if (body !== undefined && typeof body !== 'string') {
    return NextResponse.json({ error: 'Invalid "body" (must be a string if present)' }, { status: 400 });
  }

  const parentAddress = parentLoca ? `${user.repoGuid}/${parentLoca}` : user.repoGuid;

  try {
    const { item: createdOrFound, alreadyExisted } = await runWithRepoContext(user, () =>
      createFolderChildItem(parentAddress, name, type, body)
    );

    const parent = await getItemByAddress(parentAddress);
    if (!parent) {
      // Cannot happen in practice (createFolderChildItem already confirmed
      // the parent exists) — kept only so the response type never has to
      // lie about `parent` being optional.
      return NextResponse.json({ error: 'Parent not found after create' }, { status: 500 });
    }

    return NextResponse.json({
      item: await toApiItem(createdOrFound),
      alreadyExisted,
      parent: await toApiItem(parent),
    });
  } catch (err) {
    if (err instanceof FoldersOperationError) {
      return NextResponse.json({ error: err.code, details: err.message }, { status: statusForFoldersError(err) });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'UNKNOWN_ERROR' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/folders
 *
 * Overwrites an existing Text item's body in place (never re-allocates its
 * address — same "overwrite, don't recreate" pattern as
 * `documentation/dashboard/forms/features/daily-tracker-dates.md`). Rejected
 * (409) for a Folder — its visible Body is a computed children map, not
 * real stored content.
 *
 * Body: `{ loca: string, body: string }`
 */
export async function PUT(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: 'NOT_AUTHENTICATED' }, { status: 401 });
  }

  let payload: { loca?: unknown; body?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const loca = payload.loca;
  const body = payload.body;

  if (typeof loca !== 'string' || !loca) {
    return NextResponse.json({ error: 'Missing or invalid "loca"' }, { status: 400 });
  }
  if (typeof body !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid "body"' }, { status: 400 });
  }

  const address = `${user.repoGuid}/${loca}`;

  try {
    const updated = await runWithRepoContext(user, () => updateFolderTextBody(address, body));
    return NextResponse.json({ item: await toApiItem(updated) });
  } catch (err) {
    if (err instanceof FoldersOperationError) {
      return NextResponse.json({ error: err.code, details: err.message }, { status: statusForFoldersError(err) });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'UNKNOWN_ERROR' },
      { status: 500 }
    );
  }
}
