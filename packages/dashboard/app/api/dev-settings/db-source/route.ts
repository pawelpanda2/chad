import { NextResponse } from "next/server";
import {
  buildBeeperLocalMirrorOptionDetails,
  buildBeeperMongoActiveView,
  buildChadDataSourceActiveView,
  buildOfflineBackupOptionDetails,
  beeperMongoSourceToLabel,
  chadPostgresSourceToLabel,
  closeMongoConnection,
  closePostgresConnection,
  DEV_DB_PROBE_TIMEOUT_MS,
  formatSnapshotAge,
  getMongoSource,
  getPostgresSource,
  labelToBeeperMongoSource,
  labelToChadPostgresSource,
  probeBeeperMongoSource,
  probePostgresSource,
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
  // Local Docker runs NODE_ENV=production — still allowed when CHAD_ENVIRONMENT=local.
  const allowed =
    chadEnv === "local" || (chadEnv !== "test" && chadEnv !== "prod" && process.env.NODE_ENV !== "production");
  if (!allowed) {
    return NextResponse.json({ error: "DISABLED_OUTSIDE_LOCAL" }, { status: 403 });
  }
  return null;
}

type ProbeResult = { ok: boolean; itemCount?: number; error?: string };
type BeeperProbeResult = {
  ok: boolean;
  contactsCount?: number;
  messagesCount?: number;
  databaseName?: string;
  error?: string;
};

async function buildSnapshot(opts?: {
  postgresProbe?: ProbeResult | null;
  beeperProbe?: BeeperProbeResult | null;
  skipProbes?: boolean;
}) {
  const user = await getCurrentUserFromCookies();
  const backupOption = buildOfflineBackupOptionDetails();
  const age = formatSnapshotAge(backupOption.metadata?.restoreTimestamp ?? undefined);

  let postgresProbe = opts?.postgresProbe;
  let beeperProbe = opts?.beeperProbe;

  if (!opts?.skipProbes) {
    if (postgresProbe === undefined) {
      postgresProbe = await probePostgresSource(getPostgresSource(), DEV_DB_PROBE_TIMEOUT_MS);
    }
    if (beeperProbe === undefined) {
      beeperProbe = await probeBeeperMongoSource(getMongoSource(), {
        repoGuid: user?.repoGuid,
        timeoutMs: DEV_DB_PROBE_TIMEOUT_MS,
      });
    }
  }

  const active = buildChadDataSourceActiveView({
    probeOk: postgresProbe == null ? null : postgresProbe.ok,
    probeError: postgresProbe?.error,
    cpItemsCount: postgresProbe?.itemCount,
    chadEnvironment: process.env.CHAD_ENVIRONMENT,
    connectionStatusOverride: postgresProbe == null ? "checking" : undefined,
  });
  const beeperActive = buildBeeperMongoActiveView({
    probeOk: beeperProbe == null ? null : beeperProbe.ok,
    probeError: beeperProbe?.error,
    contactsCount: beeperProbe?.contactsCount,
    messagesCount: beeperProbe?.messagesCount,
    databaseName: beeperProbe?.databaseName,
    chadEnvironment: process.env.CHAD_ENVIRONMENT,
    connectionStatusOverride: beeperProbe == null ? "checking" : undefined,
    repoGuid: user?.repoGuid,
  });
  const localMirrorOption = buildBeeperLocalMirrorOptionDetails(user?.repoGuid);

  return {
    active,
    changeOptions: {
      current: chadPostgresSourceToLabel(getPostgresSource()),
      currentValue: getPostgresSource(),
      options: ["Server PostgreSQL", "Offline backup — read only"] as const,
      offlineReadonlyBackup: {
        ...backupOption,
        age,
      },
    },
    beeper: {
      active: beeperActive,
      changeOptions: {
        current: beeperMongoSourceToLabel(getMongoSource()),
        currentValue: getMongoSource(),
        options: ["Server Mongo", "Local Mongo"] as const,
        localMirror: localMirrorOption,
      },
      label: "MongoDB (Beeper CRM)",
      backend: beeperActive.backend,
      source: beeperActive.beeperDataSource,
      status: beeperActive.connectionStatus,
      hostPort: `${beeperActive.host}:${beeperActive.port}`,
      current: getMongoSource(),
    },
    postgresProbe: postgresProbe ?? null,
    beeperProbe: beeperProbe ?? null,
  };
}

/** Fast config for Dev Panel — never blocks on a dead remote forever. */
export async function GET() {
  const blocked = assertDevOnly();
  if (blocked) return blocked;

  const [postgresProbe, beeperProbe] = await Promise.all([
    probePostgresSource(getPostgresSource(), DEV_DB_PROBE_TIMEOUT_MS),
    (async () => {
      const user = await getCurrentUserFromCookies();
      return probeBeeperMongoSource(getMongoSource(), {
        repoGuid: user?.repoGuid,
        timeoutMs: DEV_DB_PROBE_TIMEOUT_MS,
      });
    })(),
  ]);

  return NextResponse.json(
    await buildSnapshot({
      skipProbes: true,
      postgresProbe,
      beeperProbe,
    })
  );
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
          'Provide "chadPostgres" ("Server PostgreSQL" | "Offline backup — read only") and/or "beeperMongo" ("Server Mongo" | "Local Mongo")',
      },
      { status: 400 }
    );
  }

  // Only one family per request preferred — still allow either.
  if (chadPostgresRaw !== undefined && mongoRaw !== undefined) {
    return NextResponse.json(
      { error: "Send PostgreSQL or Mongo in separate requests (Apply PostgreSQL / Apply Mongo)." },
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
          { error: 'Invalid chadPostgres (must be "Server PostgreSQL" or "Offline backup — read only")' },
          { status: 400 }
        );
      }

      if (mapped === "offline-readonly-backup") {
        if (payload.confirmOfflineReadonly !== true) {
          return NextResponse.json(
            { error: "CONFIRM_OFFLINE_READONLY_REQUIRED", ...(await buildSnapshot({ skipProbes: true })) },
            { status: 400 }
          );
        }
        const backup = buildOfflineBackupOptionDetails();
        if (!backup.available) {
          return NextResponse.json(
            { error: backup.error ?? "BACKUP_UNAVAILABLE", ...(await buildSnapshot({ skipProbes: true })) },
            { status: 400 }
          );
        }

        // Switch to local snapshot WITHOUT probing the (possibly dead) server.
        setPostgresSource(mapped);
        await closePostgresConnection();
        try {
          const readonlyCheck = await withPostgresClient(async (client) => verifyPostgresReadonlyRole(client));
          if (!readonlyCheck.ok) {
            setPostgresSource(previousPostgres);
            await closePostgresConnection();
            return NextResponse.json(
              {
                error: "OFFLINE_READONLY_VERIFICATION_FAILED",
                checks: readonlyCheck.checks,
                ...(await buildSnapshot({ skipProbes: true })),
              },
              { status: 502 }
            );
          }
          const localProbe = await probePostgresSource("offline-readonly-backup", DEV_DB_PROBE_TIMEOUT_MS);
          if (!localProbe.ok) {
            setPostgresSource(previousPostgres);
            await closePostgresConnection();
            return NextResponse.json(
              {
                error: `Offline backup connect failed: ${localProbe.error}`,
                ...(await buildSnapshot({ skipProbes: true })),
              },
              { status: 502 }
            );
          }
          invalidateUsersCache();
          appendDevDataSourceAudit({ from: previousPostgres, to: mapped, at: new Date().toISOString() });
          return NextResponse.json(
            await buildSnapshot({ skipProbes: true, postgresProbe: localProbe, beeperProbe: null })
          );
        } catch (err) {
          setPostgresSource(previousPostgres);
          await closePostgresConnection();
          throw err;
        }
      }

      // → Server PostgreSQL: probe FIRST, commit only on success.
      const serverProbe = await probePostgresSource("server", DEV_DB_PROBE_TIMEOUT_MS);
      if (!serverProbe.ok) {
        return NextResponse.json(
          {
            error: `Server PostgreSQL unreachable: ${serverProbe.error}`,
            ...(await buildSnapshot({
              skipProbes: true,
              postgresProbe: await probePostgresSource(previousPostgres, DEV_DB_PROBE_TIMEOUT_MS),
            })),
          },
          { status: 502 }
        );
      }
      setPostgresSource(mapped);
      await closePostgresConnection();
      invalidateUsersCache();
      appendDevDataSourceAudit({ from: previousPostgres, to: mapped, at: new Date().toISOString() });
      return NextResponse.json(
        await buildSnapshot({ skipProbes: true, postgresProbe: serverProbe, beeperProbe: null })
      );
    }

    if (mongoRaw !== undefined) {
      const mapped =
        typeof mongoRaw === "string"
          ? labelToBeeperMongoSource(mongoRaw)
          : (mongoRaw as DbSource | null);
      if (!mapped) {
        return NextResponse.json(
          { error: 'Invalid beeperMongo (must be "Server Mongo" or "Local Mongo")' },
          { status: 400 }
        );
      }

      const user = await getCurrentUserFromCookies();

      if (mapped === "local") {
        const mirrorOption = buildBeeperLocalMirrorOptionDetails(user?.repoGuid);
        if (!mirrorOption.available) {
          return NextResponse.json(
            {
              error: mirrorOption.error ?? "LOCAL_MIRROR_UNAVAILABLE",
              ...(await buildSnapshot({ skipProbes: true })),
            },
            { status: 400 }
          );
        }
        setMongoSource(mapped);
        await closeMongoConnection();
        const localProbe = await probeBeeperMongoSource("local", {
          repoGuid: user?.repoGuid,
          timeoutMs: DEV_DB_PROBE_TIMEOUT_MS,
        });
        if (!localProbe.ok) {
          setMongoSource(previousMongo);
          await closeMongoConnection();
          return NextResponse.json(
            {
              error: `Local Mongo unreachable: ${localProbe.error}`,
              ...(await buildSnapshot({ skipProbes: true })),
            },
            { status: 502 }
          );
        }
        appendDevDataSourceAudit({
          from: `mongo:${previousMongo}`,
          to: `mongo:${mapped}`,
          at: new Date().toISOString(),
        });
        return NextResponse.json(
          await buildSnapshot({ skipProbes: true, beeperProbe: localProbe, postgresProbe: null })
        );
      }

      // → Server Mongo: probe first.
      const serverProbe = await probeBeeperMongoSource("qnap", {
        repoGuid: user?.repoGuid,
        timeoutMs: DEV_DB_PROBE_TIMEOUT_MS,
      });
      if (!serverProbe.ok) {
        return NextResponse.json(
          {
            error: `Server Mongo unreachable: ${serverProbe.error}`,
            ...(await buildSnapshot({
              skipProbes: true,
              beeperProbe: await probeBeeperMongoSource(previousMongo, {
                repoGuid: user?.repoGuid,
                timeoutMs: DEV_DB_PROBE_TIMEOUT_MS,
              }),
            })),
          },
          { status: 502 }
        );
      }
      setMongoSource(mapped);
      await closeMongoConnection();
      appendDevDataSourceAudit({
        from: `mongo:${previousMongo}`,
        to: `mongo:${mapped}`,
        at: new Date().toISOString(),
      });
      return NextResponse.json(
        await buildSnapshot({ skipProbes: true, beeperProbe: serverProbe, postgresProbe: null })
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "UNKNOWN_ERROR", ...(await buildSnapshot({ skipProbes: true })) },
      { status: 500 }
    );
  }

  return NextResponse.json({ error: "UNREACHABLE" }, { status: 500 });
}
