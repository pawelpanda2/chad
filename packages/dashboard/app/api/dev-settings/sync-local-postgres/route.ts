import { NextResponse } from "next/server";
import {
  syncLocalPostgresFromQnap,
  closePostgresConnection,
} from "dba";
import { invalidateUsersCache } from "@/lib/user-service";

/**
 * POST /api/dev-settings/sync-local-postgres
 *
 * Story 89 — replace local Mac Docker Postgres volume contents with a
 * snapshot from QNAP (production/shared). Then points the runtime override
 * at local so the dashboard reads the fresh mirror.
 */

function assertDevOnly(): NextResponse | null {
  const chadEnv = process.env.CHAD_ENVIRONMENT;
  const allowed =
    chadEnv === "local" ||
    (chadEnv !== "test" && chadEnv !== "prod" && process.env.NODE_ENV !== "production");
  if (!allowed) {
    return NextResponse.json({ error: "DISABLED_OUTSIDE_LOCAL" }, { status: 403 });
  }
  return null;
}

export async function POST() {
  const blocked = assertDevOnly();
  if (blocked) return blocked;

  try {
    const result = await syncLocalPostgresFromQnap();
    await closePostgresConnection();
    invalidateUsersCache();
    return NextResponse.json({
      ok: true,
      ...result,
      deprecated: "Local Postgres mirror is opt-in (compose profile local-postgres-mirror). Use infrastructure/offline-readonly-backup/refresh-from-server.sh for emergency snapshots.",
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
