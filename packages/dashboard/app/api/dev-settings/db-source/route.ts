import { NextResponse } from "next/server";
import {
  buildChadDataSourceActiveView,
  buildOfflineBackupOptionDetails,
  chadPostgresSourceToLabel,
  describeEffectiveMongoTarget,
  getMongoSource,
  getPostgresSource,
  labelToChadPostgresSource,
  setMongoSource,
  setPostgresSource,
  closePostgresConnection,
  withPostgresClient,
  verifyPostgresReadonlyRole,
  type ChadPostgresSource,
  type DbSource,
} from "dba";
import { invalidateUsersCache } from "@/lib/user-service";
import { appendDevDataSourceAudit } from "@/lib/dev-panel/data-source-audit";

function assertDevOnly(): NextResponse | null {
  const chadEnv = process.env.CHAD_ENVIRONMENT;
  const allowed =
    chadEnv === "local" || (chadEnv !== "test" && chadEnv !== "prod" && process.env.NODE_ENV !== "production");
  if (!allowed) {
    return NextResponse.json({ error: "DISABLED_OUTSIDE_LOCAL" }, { status: 403 });
  }
  return null;
}

async function probePostgres(): Promise<{ ok: boolean; itemCount?: number; error?: string }> {
  try {
    await closePostgresConnection();
    const itemCount = await withPostgresClient(async (client) => {
      const { rows } = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM cp_items");
      return Number(rows[0]?.count ?? 0);
    });
    return { ok: true, itemCount };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function snapshot() {
  const postgresProbe = await probePostgres();
  const active = buildChadDataSourceActiveView({
    probeOk: postgresProbe.ok,
    probeError: postgresProbe.error,
    cpItemsCount: postgresProbe.itemCount,
    chadEnvironment: process.env.CHAD_ENVIRONMENT,
  });
  const backupOption = buildOfflineBackupOptionDetails();
  const mongoTarget = describeEffectiveMongoTarget();

  return {
    active,
    changeOptions: {
      current: chadPostgresSourceToLabel(getPostgresSource()),
      options: ["Server PostgreSQL", "offline-readonly-backup"] as const,
      offlineReadonlyBackup: backupOption,
    },
    beeper: {
      label: "Beeper CRM",
      backend: "MongoDB",
      source: mongoTarget.source === "qnap" ? "Server Mongo" : "Local Mongo",
      status: mongoTarget.error ? `error: ${mongoTarget.error}` : "informational",
      hostPort: mongoTarget.hostPort,
      current: getMongoSource(),
    },
    postgresProbe,
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

  let payload: {
    chadPostgres?: unknown;
    postgres?: unknown;
    mongo?: unknown;
    confirmOfflineReadonly?: unknown;
  };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const chadPostgresRaw = payload.chadPostgres ?? payload.postgres;
  const mongo = payload.mongo;

  if (chadPostgresRaw === undefined && mongo === undefined) {
    return NextResponse.json(
      { error: 'Provide "chadPostgres" ("Server PostgreSQL" | "offline-readonly-backup") and/or "mongo" ("local" | "qnap")' },
      { status: 400 }
    );
  }

  const previous = getPostgresSource();

  try {
    if (chadPostgresRaw !== undefined) {
      const mapped =
        typeof chadPostgresRaw === "string"
          ? labelToChadPostgresSource(chadPostgresRaw)
          : (chadPostgresRaw as ChadPostgresSource | null);
      if (!mapped) {
        return NextResponse.json(
          { error: 'Invalid chadPostgres (must be "Server PostgreSQL" or "offline-readonly-backup")' },
          { status: 400 }
        );
      }

      if (mapped === "offline-readonly-backup") {
        if (payload.confirmOfflineReadonly !== true) {
          return NextResponse.json(
            { error: "CONFIRM_OFFLINE_READONLY_REQUIRED", ...(await snapshot()) },
            { status: 400 }
          );
        }
        const backup = buildOfflineBackupOptionDetails();
        if (!backup.available) {
          return NextResponse.json({ error: backup.error ?? "BACKUP_UNAVAILABLE", ...(await snapshot()) }, { status: 400 });
        }
      }

      setPostgresSource(mapped);
      await closePostgresConnection();

      if (mapped === "offline-readonly-backup") {
        const readonlyCheck = await withPostgresClient(async (client) => verifyPostgresReadonlyRole(client));
        if (!readonlyCheck.ok) {
          setPostgresSource(previous);
          await closePostgresConnection();
          return NextResponse.json(
            { error: "OFFLINE_READONLY_VERIFICATION_FAILED", checks: readonlyCheck.checks, ...(await snapshot()) },
            { status: 502 }
          );
        }
      }
    }

    if (mongo !== undefined) {
      if (mongo !== "local" && mongo !== "qnap") {
        return NextResponse.json({ error: 'Invalid "mongo" (must be "local" or "qnap")' }, { status: 400 });
      }
      setMongoSource(mongo as DbSource);
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "UNKNOWN_ERROR" },
      { status: 500 }
    );
  }

  invalidateUsersCache();
  const snap = await snapshot();

  if (chadPostgresRaw !== undefined) {
    const next = getPostgresSource();
    appendDevDataSourceAudit({
      from: previous,
      to: next,
      at: new Date().toISOString(),
    });
  }

  if (chadPostgresRaw !== undefined && snap.postgresProbe && !snap.postgresProbe.ok) {
    return NextResponse.json(
      {
        error: `Postgres switch applied but connection failed: ${snap.postgresProbe.error}`,
        ...snap,
      },
      { status: 502 }
    );
  }

  return NextResponse.json(snap);
}
