import { NextResponse } from "next/server";
import {
  buildBeeperMongoActiveView,
  buildChadDataSourceActiveView,
  buildOfflineBackupOptionDetails,
  beeperMongoSourceToLabel,
  chadPostgresSourceToLabel,
  closeMongoConnection,
  closePostgresConnection,
  describeEffectiveBeeperMongoTarget,
  getBeeperMongoDb,
  getMongoSource,
  getPostgresSource,
  labelToBeeperMongoSource,
  labelToChadPostgresSource,
  runWithRepoContext,
  setMongoSource,
  setPostgresSource,
  verifyPostgresReadonlyRole,
  withPostgresClient,
  type ChadPostgresSource,
  type DbSource,
} from "dba";
import { invalidateUsersCache } from "@/lib/user-service";
import { appendDevDataSourceAudit } from "@/lib/dev-panel/data-source-audit";
import { getCurrentUserFromCookies } from "@/lib/session";

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

async function probeBeeper(repoGuid?: string): Promise<{
  ok: boolean;
  contactsCount?: number;
  messagesCount?: number;
  databaseName?: string;
  error?: string;
}> {
  try {
    await closeMongoConnection();
    if (!repoGuid) {
      // Connection target must still resolve — describeEffectiveBeeperMongoTarget catches URI errors.
      const target = describeEffectiveBeeperMongoTarget();
      if (target.error) return { ok: false, error: target.error };
      return { ok: true, databaseName: "(sign in for beeper_<repoGuid> counts)" };
    }
    const db = await getBeeperMongoDb(repoGuid);
    const [contactsCount, messagesCount] = await Promise.all([
      db.collection("contacts").countDocuments({}),
      db.collection("messages").countDocuments({}),
    ]);
    return {
      ok: true,
      contactsCount,
      messagesCount,
      databaseName: `beeper_${repoGuid}`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function snapshot() {
  const user = await getCurrentUserFromCookies();
  const postgresProbe = await probePostgres();
  const beeperProbe = user
    ? await runWithRepoContext(user, () => probeBeeper(user.repoGuid))
    : await probeBeeper();

  const active = buildChadDataSourceActiveView({
    probeOk: postgresProbe.ok,
    probeError: postgresProbe.error,
    cpItemsCount: postgresProbe.itemCount,
    chadEnvironment: process.env.CHAD_ENVIRONMENT,
  });
  const beeperActive = buildBeeperMongoActiveView({
    probeOk: beeperProbe.ok,
    probeError: beeperProbe.error,
    contactsCount: beeperProbe.contactsCount,
    messagesCount: beeperProbe.messagesCount,
    databaseName: beeperProbe.databaseName,
    chadEnvironment: process.env.CHAD_ENVIRONMENT,
  });
  const backupOption = buildOfflineBackupOptionDetails();

  return {
    active,
    changeOptions: {
      current: chadPostgresSourceToLabel(getPostgresSource()),
      options: ["Server PostgreSQL", "offline-readonly-backup"] as const,
      offlineReadonlyBackup: backupOption,
    },
    beeper: {
      active: beeperActive,
      changeOptions: {
        current: beeperMongoSourceToLabel(getMongoSource()),
        options: ["Server Mongo", "Local readonly backup"] as const,
      },
      // Legacy flat fields — kept so older clients don't break mid-deploy.
      label: "MongoDB (Beeper CRM)",
      backend: beeperActive.backend,
      source: beeperActive.beeperDataSource,
      status: beeperActive.connectionStatus,
      hostPort: `${beeperActive.host}:${beeperActive.port}`,
      current: getMongoSource(),
    },
    postgresProbe,
    beeperProbe,
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
    beeperMongo?: unknown;
    confirmOfflineReadonly?: unknown;
  };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const chadPostgresRaw = payload.chadPostgres ?? payload.postgres;
  const mongoRaw = payload.beeperMongo ?? payload.mongo;

  if (chadPostgresRaw === undefined && mongoRaw === undefined) {
    return NextResponse.json(
      {
        error:
          'Provide "chadPostgres" ("Server PostgreSQL" | "offline-readonly-backup") and/or "beeperMongo" ("Server Mongo" | "Local readonly backup")',
      },
      { status: 400 }
    );
  }

  const previousPostgres = getPostgresSource();
  const previousMongo = getMongoSource();

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
          setPostgresSource(previousPostgres);
          await closePostgresConnection();
          return NextResponse.json(
            { error: "OFFLINE_READONLY_VERIFICATION_FAILED", checks: readonlyCheck.checks, ...(await snapshot()) },
            { status: 502 }
          );
        }
      }
    }

    if (mongoRaw !== undefined) {
      const mapped =
        typeof mongoRaw === "string"
          ? labelToBeeperMongoSource(mongoRaw)
          : (mongoRaw as DbSource | null);
      if (!mapped) {
        return NextResponse.json(
          { error: 'Invalid beeperMongo (must be "Server Mongo" or "Local readonly backup")' },
          { status: 400 }
        );
      }
      setMongoSource(mapped);
      await closeMongoConnection();
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
      from: previousPostgres,
      to: next,
      at: new Date().toISOString(),
    });
  }

  if (mongoRaw !== undefined) {
    appendDevDataSourceAudit({
      from: `mongo:${previousMongo}`,
      to: `mongo:${getMongoSource()}`,
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

  if (mongoRaw !== undefined && snap.beeperProbe && !snap.beeperProbe.ok) {
    return NextResponse.json(
      {
        error: `Mongo switch applied but connection failed: ${snap.beeperProbe.error}`,
        ...snap,
      },
      { status: 502 }
    );
  }

  return NextResponse.json(snap);
}
