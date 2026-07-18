import { NextResponse } from 'next/server';
import { getCurrentUserFromCookies } from '@/lib/session';
import { getItemByAddress, getChildrenOf } from 'dba';

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

    const item = {
      Body: body,
      Config: found.config,
      Settings: found.config,
      Address: found.config.address,
    };
    return NextResponse.json({ item, repoGuid: user.repoGuid, username: user.username });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'UNKNOWN_ERROR' },
      { status: 404 }
    );
  }
}
