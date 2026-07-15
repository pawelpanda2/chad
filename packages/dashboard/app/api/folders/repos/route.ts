import { NextResponse } from 'next/server';
import { getCurrentUserFromCookies } from '@/lib/session';
import { getAllRepos } from 'dba';

/**
 * GET /api/folders/repos
 *
 * Lists repos for the Folders tab's repo picker (documentation/stories/57).
 *
 * Uses `dba`'s existing `getAllRepos()` (`packages/dba/src/client.ts`) —
 * NOT a duplicate written in `cp-flow.ts`, which is what the first version
 * of this route did. `dba` already had this exact operation
 * (`["IRepoService","IMethodWorker","GetAllReposNames"]`), already used by
 * `packages/console`, with a proper 30s timeout and request tracing built
 * in — reusing it here instead of re-deriving the same call is both less
 * code and more robust. `dba` was already a `packages/dashboard`
 * dependency (unlike the `cp-entry`/`cp-core` attempt earlier in this
 * Story, which had to be reverted — see `02_plan.md`'s "Correction 2" —
 * `dba` needs no Dockerfile changes, it's already built there).
 *
 * `dba`'s `getAllRepos()` returns the RAW `/invoke` array
 * (`[{Body, Settings: {id, name, ...}}, ...]`) — mapped to `{id, name}[]`
 * here, matching what this route's own client expects.
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
    const raw: unknown = await getAllRepos();
    if (!Array.isArray(raw)) {
      throw new Error(`GetAllReposNames returned an unexpected shape: ${JSON.stringify(raw)}`);
    }
    const repos = raw
      .map((entry) => (entry as { Settings?: { id?: string; name?: string } })?.Settings)
      .filter((settings): settings is { id: string; name: string } => !!settings?.id && !!settings?.name)
      .map(({ id, name }) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ repos });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'UNKNOWN_ERROR' },
      { status: 502 }
    );
  }
}
