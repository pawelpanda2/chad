import { NextResponse } from 'next/server';
import {
  getMongoSource,
  setMongoSource,
  describeEffectiveMongoTarget,
  getPostgresSource,
  setPostgresSource,
  describeEffectivePostgresTarget,
  closePostgresConnection,
  withPostgresClient,
  type DbSource,
} from 'dba';
import { invalidateUsersCache } from '@/lib/user-service';

/**
 * GET/POST /api/dev-settings/db-source
 *
 * Dev Panel Settings: live switches for Postgres + Mongo (local vs QNAP).
 * Story 89: invalidate users cache + probe the new connection so the UI
 * shows a real failure instead of a silent stale login.
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

async function probePostgres(): Promise<{ ok: boolean; itemCount?: number; error?: string }> {
  try {
    await closePostgresConnection();
    const itemCount = await withPostgresClient(async (client) => {
      const { rows } = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM cp_items');
      return Number(rows[0]?.count ?? 0);
    });
    return { ok: true, itemCount };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function snapshot() {
  const postgresProbe = await probePostgres();
  return {
    postgres: {
      current: getPostgresSource(),
      target: describeEffectivePostgresTarget(),
      probe: postgresProbe,
    },
    mongo: {
      current: getMongoSource(),
      target: describeEffectiveMongoTarget(),
    },
  };
}

export async function GET() {
  const blocked = assertDevOnly();
  if (blocked) return blocked;

  return NextResponse.json(await snapshot());
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
      await closePostgresConnection();
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

  // Login/users-list cache must not keep serving the previous DB's users.
  invalidateUsersCache();

  const snap = await snapshot();
  if (postgres !== undefined && snap.postgres.probe && !snap.postgres.probe.ok) {
    return NextResponse.json(
      {
        error: `Postgres switch applied but connection failed: ${snap.postgres.probe.error}`,
        ...snap,
      },
      { status: 502 }
    );
  }

  return NextResponse.json(snap);
}
