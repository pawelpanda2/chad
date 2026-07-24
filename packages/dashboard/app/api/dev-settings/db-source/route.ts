import { NextResponse } from 'next/server';
import {
  getMongoSource,
  setMongoSource,
  describeEffectiveMongoTarget,
  getPostgresSource,
  setPostgresSource,
  describeEffectivePostgresTarget,
  type DbSource,
} from 'dba';

/**
 * GET/POST /api/dev-settings/db-source
 *
 * Backs the Dev Panel's Settings tab: live, independent switches for
 * Postgres (CHAD primary, Story 80/81) and Mongo (Beeper / leftover paths)
 * between local docker and QNAP-over-Tailscale — previously only decidable
 * at shell start via `DBA_MONGO_MODE`.
 *
 * SAFETY: allowed only for local — `CHAD_ENVIRONMENT=local` (official
 * local-mac-docker) or bare `next dev`. Hard-blocked on QNAP TEST/PROD.
 */

function assertDevOnly(): NextResponse | null {
  const chadEnv = process.env.CHAD_ENVIRONMENT;
  const allowed =
    chadEnv === 'local' || (chadEnv !== 'test' && chadEnv !== 'prod' && process.env.NODE_ENV !== 'production');
  if (!allowed) {
    return NextResponse.json({ error: 'DISABLED_OUTSIDE_LOCAL' }, { status: 403 });
  }
  return null;
}

function snapshot() {
  return {
    postgres: { current: getPostgresSource(), target: describeEffectivePostgresTarget() },
    mongo: { current: getMongoSource(), target: describeEffectiveMongoTarget() },
  };
}

export async function GET() {
  const blocked = assertDevOnly();
  if (blocked) return blocked;

  return NextResponse.json(snapshot());
}

export async function POST(request: Request) {
  const blocked = assertDevOnly();
  if (blocked) return blocked;

  let payload: { postgres?: unknown; mongo?: unknown; source?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Backward compat: old UI sent `{ source }` for Mongo only.
  const postgres = payload.postgres ?? undefined;
  const mongo = payload.mongo ?? payload.source ?? undefined;

  if (postgres === undefined && mongo === undefined) {
    return NextResponse.json(
      { error: 'Provide "postgres" and/or "mongo" ("local" | "qnap")' },
      { status: 400 }
    );
  }

  try {
    if (postgres !== undefined) {
      if (postgres !== 'local' && postgres !== 'qnap') {
        return NextResponse.json({ error: 'Invalid "postgres" (must be "local" or "qnap")' }, { status: 400 });
      }
      setPostgresSource(postgres as DbSource);
    }
    if (mongo !== undefined) {
      if (mongo !== 'local' && mongo !== 'qnap') {
        return NextResponse.json({ error: 'Invalid "mongo" (must be "local" or "qnap")' }, { status: 400 });
      }
      setMongoSource(mongo as DbSource);
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'UNKNOWN_ERROR' },
      { status: 500 }
    );
  }

  return NextResponse.json(snapshot());
}
