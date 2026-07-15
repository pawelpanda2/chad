import { NextResponse } from 'next/server';
import { getCurrentUserFromCookies } from '@/lib/session';
import { getAllRepos } from '@/app/api/flow/cp-flow';

/**
 * GET /api/folders/repos
 *
 * Lists repos for the Folders tab's repo picker (documentation/stories/57).
 *
 * Gated: only the `pawel_f` login (this system's actual owner/operator —
 * the screenshots this Story was corrected against are from Pawel's own
 * standalone Blazor admin tool, which has access to ALL repos) gets the
 * full list. Every other logged-in dashboard user gets a single-item list
 * containing only their own repo — preserving the per-user data isolation
 * model every other Content-Provider-touching endpoint in this dashboard
 * follows. There is no admin/role flag in this codebase's user model to
 * gate this more precisely; gating by username is a deliberate, narrow,
 * documented exception, not a general pattern to copy elsewhere.
 */
export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: 'NOT_AUTHENTICATED' }, { status: 401 });
  }

  if (user.username !== 'pawel_f') {
    return NextResponse.json({ repos: [{ id: user.repoGuid, name: user.username }] });
  }

  try {
    const repos = await getAllRepos();
    return NextResponse.json({ repos });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'UNKNOWN_ERROR' },
      { status: 502 }
    );
  }
}
