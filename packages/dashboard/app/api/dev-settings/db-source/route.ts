import { NextResponse } from 'next/server';
import { getMongoSource, setMongoSource, describeEffectiveMongoTarget, type MongoSource } from 'dba';

/**
 * GET/POST /api/dev-settings/db-source
 *
 * Backs the Dev Panel's Settings tab (Story 83): lets a local `next dev`
 * session see and change, live, whether `dba` talks to the local or the
 * QNAP (shared, real) Mongo — previously only decidable once, at
 * shell/container-start time, via `DBA_MONGO_MODE`.
 *
 * SAFETY: hard-blocked whenever `NODE_ENV === "production"` — every
 * Docker-built deployment (local-mac-docker, QNAP test, QNAP prod) runs
 * with `NODE_ENV=production` regardless of environment name (see
 * `lib/flags.ts`), so this can never be reachable on a shared, multi-user
 * server process, only on a single developer's own bare `next dev`. This
 * check is independent of (and in addition to) the `DEV_PANEL_ENABLED`
 * build flag that gates whether the Dev Panel UI is even mounted.
 */
function assertDevOnly(): NextResponse | null {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'DISABLED_IN_PRODUCTION' }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const blocked = assertDevOnly();
  if (blocked) return blocked;

  return NextResponse.json({ current: getMongoSource(), target: describeEffectiveMongoTarget() });
}

export async function POST(request: Request) {
  const blocked = assertDevOnly();
  if (blocked) return blocked;

  let payload: { source?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const source = payload.source;
  if (source !== 'local' && source !== 'qnap') {
    return NextResponse.json({ error: 'Invalid "source" (must be "local" or "qnap")' }, { status: 400 });
  }

  try {
    setMongoSource(source as MongoSource);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'UNKNOWN_ERROR' },
      { status: 500 }
    );
  }

  return NextResponse.json({ current: getMongoSource(), target: describeEffectiveMongoTarget() });
}
