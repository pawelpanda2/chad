import { NextResponse } from 'next/server';
import { getCurrentUserFromCookies } from '@/lib/session';
import { statusForFoldersError } from '@/lib/folders-api';
import {
  exportFolderTree,
  parseFolderExportContent,
  parseFolderExportDepth,
  FoldersOperationError,
  runWithRepoContext,
  resolveFoldersRepoAccess,
} from 'dba';

/**
 * GET /api/folders/export?loca=<relative loca>&content=body|config|both&depth=<0..N>&repoGuid=<optional>
 *
 * Read-only Folder-tree export for the Folders GUI's Copy feature (Story
 * 98, unified content/depth contract — Story 121) — built for pasting
 * Folder context into AI. Never writes anything; always reads whatever is
 * currently saved server-side, never a client's unsaved draft (the client
 * only ever sends `loca` + `content` + `depth`, never body/config content).
 *
 * `content`: `body` (body only), `config` (config only), or `both`.
 * `depth`: levels below the export root — `1` = direct children only, `2`
 * = direct children + their children, `0` = unlimited (recurse to the
 * bottom of the tree; the hard safety caps below still apply).
 *
 * SECURITY: identical repo-isolation rule as the sibling `/api/folders`
 * route — `loca`/`repoGuid` are only ever resolved through
 * `resolveFoldersRepoAccess` against the session (never trusted directly),
 * so every descendant pulled into the export is guaranteed to live inside
 * a repo this session is actually allowed to read. `exportFolderTree`
 * additionally enforces a hard item-count and total-body-size limit
 * regardless of `depth`, surfaced as an explicit `EXPORT_LIMIT_EXCEEDED`
 * (413) — never a silently truncated result.
 */
export async function GET(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: 'NOT_AUTHENTICATED' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const loca = searchParams.get('loca') ?? '';
  const rawContent = searchParams.get('content') ?? '';
  const rawDepth = searchParams.get('depth') ?? '';
  const requestedRepoGuid = searchParams.get('repoGuid');

  const content = parseFolderExportContent(rawContent);
  if (!content) {
    return NextResponse.json(
      { error: 'UNSUPPORTED_CONTENT', details: 'content must be one of: body, config, both' },
      { status: 400 }
    );
  }

  const depth = parseFolderExportDepth(rawDepth);
  if (depth === null) {
    return NextResponse.json(
      { error: 'INVALID_DEPTH', details: 'depth must be a non-negative integer (0 = unlimited)' },
      { status: 400 }
    );
  }

  const access = resolveFoldersRepoAccess(user, requestedRepoGuid);
  if (!access.allowed) {
    return NextResponse.json({ error: 'FORBIDDEN_REPO' }, { status: 403 });
  }

  const address = loca ? `${access.repoGuid}/${loca}` : access.repoGuid;

  try {
    const { result, itemCount } = await runWithRepoContext(user, () => exportFolderTree(address, content, depth));
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
