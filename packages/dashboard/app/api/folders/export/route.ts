import { NextResponse } from 'next/server';
import { getCurrentUserFromCookies } from '@/lib/session';
import { statusForFoldersError } from '@/lib/folders-api';
import {
  exportFolderTree,
  parseFolderExportMode,
  FoldersOperationError,
  runWithRepoContext,
  resolveFoldersRepoAccess,
} from 'dba';

/**
 * GET /api/folders/export?loca=<relative loca>&mode=body-l1|body-l2|all-l1&repoGuid=<optional>
 *
 * Read-only Folder-tree export for the Folders GUI's Copy feature (Story
 * 98) — built for pasting Folder context into AI. Never writes anything;
 * always reads whatever is currently saved server-side, never a client's
 * unsaved draft (the client only ever sends `loca` + `mode`, never body/
 * config content).
 *
 * Three fixed modes (see `dba`'s `buildFolderExport` for the exact shape):
 * - `body-l1`: the folder's direct children, body only, depth 1.
 * - `body-l2`: direct children + each direct child Folder's own children,
 *   body only, depth 2 (never deeper).
 * - `all-l1`: direct children with full config + body, depth 1.
 *
 * SECURITY: identical repo-isolation rule as the sibling `/api/folders`
 * route — `loca`/`repoGuid` are only ever resolved through
 * `resolveFoldersRepoAccess` against the session (never trusted directly),
 * so every descendant pulled into the export is guaranteed to live inside
 * a repo this session is actually allowed to read. `exportFolderTree`
 * additionally enforces a hard item-count and total-body-size limit,
 * surfaced as an explicit `EXPORT_LIMIT_EXCEEDED` (413) — never a silently
 * truncated result.
 */
export async function GET(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: 'NOT_AUTHENTICATED' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const loca = searchParams.get('loca') ?? '';
  const rawMode = searchParams.get('mode') ?? '';
  const requestedRepoGuid = searchParams.get('repoGuid');

  const mode = parseFolderExportMode(rawMode);
  if (!mode) {
    return NextResponse.json(
      { error: 'UNSUPPORTED_MODE', details: 'mode must be one of: body-l1, body-l2, all-l1' },
      { status: 400 }
    );
  }

  const access = resolveFoldersRepoAccess(user, requestedRepoGuid);
  if (!access.allowed) {
    return NextResponse.json({ error: 'FORBIDDEN_REPO' }, { status: 403 });
  }

  const address = loca ? `${access.repoGuid}/${loca}` : access.repoGuid;

  try {
    const { result, itemCount } = await runWithRepoContext(user, () => exportFolderTree(address, mode));
    return NextResponse.json({ export: result, itemCount });
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
