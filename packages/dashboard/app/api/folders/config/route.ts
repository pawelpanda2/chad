import { NextResponse } from 'next/server';
import { getCurrentUserFromCookies } from '@/lib/session';
import { toApiItem, statusForFoldersError } from '@/lib/folders-api';
import {
  updateFolderItemConfig,
  updateFolderItemConfigAllowingSystemFolderWrite,
  FoldersOperationError,
  runWithRepoContext,
  resolveFoldersRepoAccess,
} from 'dba';

/**
 * PUT /api/folders/config
 *
 * Overwrites an existing Text or Folder item's config in place, never
 * touching its stored body (Story 95 — Folders GUI's Body/Config toggle).
 * Kept as its own route rather than extending `PUT /api/folders` (which
 * already means "overwrite this Text item's body") — per
 * `ai-docs/begin_here/05_endpoint-rules.md` §5, changing an existing
 * endpoint's meaning when unsure of every caller's expectations is riskier
 * than adding a new one.
 *
 * Body: `{ loca: string, config: object }`
 *
 * SECURITY: same repo-isolation rule as the sibling `/api/folders` route —
 * `loca` is only ever resolved relative to a repo granted by
 * `resolveFoldersRepoAccess` (session's own repo, or `chad_shared` for an
 * admin session — Story 96); the client's optional `repoGuid` is never
 * trusted beyond that check. `updateFolderItemConfig` additionally rejects any
 * attempt to change `id`/`address`/`type` (409), a rename that collides with a
 * sibling's name (400), and any read-only system folder (403), same as
 * create/update-body/delete. Renaming is allowed: CP identity is the numeric
 * address, so `name` is a display/lookup field updated in place.
 */
export async function PUT(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: 'NOT_AUTHENTICATED' }, { status: 401 });
  }

  let payload: { loca?: unknown; config?: unknown; allowSystemFolderWrite?: unknown; repoGuid?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const loca = payload.loca;
  const config = payload.config;
  const allowSystemFolderWrite = payload.allowSystemFolderWrite === true;

  if (typeof loca !== 'string' || !loca) {
    return NextResponse.json({ error: 'Missing or invalid "loca"' }, { status: 400 });
  }
  if (typeof config !== 'object' || config === null) {
    return NextResponse.json({ error: 'Missing or invalid "config" (must be a JSON object)' }, { status: 400 });
  }

  const access = resolveFoldersRepoAccess(user, typeof payload.repoGuid === 'string' ? payload.repoGuid : null);
  if (!access.allowed) {
    return NextResponse.json({ error: 'FORBIDDEN_REPO' }, { status: 403 });
  }

  const address = `${access.repoGuid}/${loca}`;

  try {
    const updated = await runWithRepoContext(user, () =>
      user.isAdmin && allowSystemFolderWrite
        ? updateFolderItemConfigAllowingSystemFolderWrite(address, config)
        : updateFolderItemConfig(address, config)
    );
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
