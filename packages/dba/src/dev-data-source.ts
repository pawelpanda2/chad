import { getChadDataMode, postgresSourceToMode } from "./chad-data-mode.js";
import {
  describeEffectiveBeeperMongoTarget,
  describeEffectivePostgresTarget,
  getMongoSource,
  getPostgresSource,
  type ChadPostgresSource,
  type DbSource,
} from "./dev-db-override.js";
import {
  QNAP_BEEPER_MONGO_PORT,
  QNAP_POSTGRES_PORT,
  QNAP_TAILSCALE_HOST,
} from "./dev-db-hosts.js";
import {
  formatSnapshotAge,
  readOfflineReadonlyBackupMetadata,
} from "./offline-readonly-backup/metadata.js";
import {
  OFFLINE_READONLY_BACKUP_DATABASE,
  OFFLINE_READONLY_BACKUP_READER_ROLE,
} from "./offline-readonly-backup/constants.js";
import { readBeeperMirrorMetadata, type BeeperMirrorMetadata } from "./beeper-mongo-mirror/metadata.js";

export type ChadDataSourceLabel = "Server PostgreSQL" | "Offline backup — read only";
export type BeeperMongoSourceLabel = "Server Mongo" | "Local Mongo";

export interface ChadDataSourceActiveView {
  chadDataSource: ChadDataSourceLabel;
  mode: string;
  environment: string;
  backend: string;
  host: string;
  port: string;
  database: string;
  readAccess: "enabled" | "blocked";
  writeAccess: "enabled" | "blocked";
  connectionStatus: string;
  cpItemsCount: number | null;
  lastChecked: string;
  snapshotDate?: string;
  snapshotSource?: string;
  snapshotAge?: string | null;
  verificationStatus?: string;
  lastRefresh?: string;
}

export interface BeeperLocalMirrorStatusView {
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  age: string | null;
  result: BeeperMirrorMetadata["result"] | "never run";
  lastError?: string;
}

export interface BeeperMongoActiveView {
  beeperDataSource: BeeperMongoSourceLabel;
  mode: string;
  environment: string;
  backend: string;
  host: string;
  port: string;
  database: string;
  readAccess: "enabled" | "blocked";
  writeAccess: "enabled" | "blocked";
  connectionStatus: string;
  contactsCount: number | null;
  messagesCount: number | null;
  lastChecked: string;
  /** Local mirror refresh status (Story 92) — always present so the Dev Panel can show it regardless of which source is currently active. */
  localMirror: BeeperLocalMirrorStatusView;
}

export function buildBeeperLocalMirrorStatusView(repoGuid: string | undefined): BeeperLocalMirrorStatusView {
  const meta = repoGuid ? readBeeperMirrorMetadata(repoGuid) : null;
  if (!meta) {
    return { lastCheckedAt: null, lastSuccessAt: null, age: null, result: "never run" };
  }
  return {
    lastCheckedAt: meta.lastCheckedAt,
    lastSuccessAt: meta.lastSuccessAt ?? null,
    age: formatSnapshotAge(meta.lastSuccessAt),
    result: meta.result,
    lastError: meta.result === "FAIL" ? meta.lastError : undefined,
  };
}

/**
 * Gate for switching the Dev Panel to "Local Mongo — read only" (mirrors
 * buildOfflineBackupOptionDetails() for Postgres) — refuses the switch with
 * a clear reason when no local mirror has ever completed successfully for
 * this user, instead of silently allowing a switch to an empty/never-synced
 * database.
 */
export function buildBeeperLocalMirrorOptionDetails(repoGuid: string | undefined): {
  available: boolean;
  status: BeeperLocalMirrorStatusView;
  error?: string;
} {
  const status = buildBeeperLocalMirrorStatusView(repoGuid);
  if (!repoGuid) {
    return { available: false, status, error: "No signed-in user — cannot resolve a local mirror database." };
  }
  if (status.result === "never run") {
    return {
      available: false,
      status,
      error: "No local mirror snapshot found yet. The mirror refreshes automatically every few minutes while beeper-synch is running on the Mac — wait for its first successful run, or check bash-scripts/beeper-synch/status.sh.",
    };
  }
  if (status.lastSuccessAt == null) {
    return {
      available: false,
      status,
      error: "Local mirror has never completed a successful refresh yet (last attempt failed) — check bash-scripts/beeper-synch/logs.sh.",
    };
  }
  return { available: true, status };
}

export function chadPostgresSourceToLabel(source: ChadPostgresSource): ChadDataSourceLabel {
  return source === "offline-readonly-backup" ? "Offline backup — read only" : "Server PostgreSQL";
}

export function labelToChadPostgresSource(label: string): ChadPostgresSource | null {
  if (label === "Server PostgreSQL" || label === "server") return "server";
  if (
    label === "Offline backup — read only" ||
    label === "offline-readonly-backup" ||
    label === "Offline backup - read only"
  ) {
    return "offline-readonly-backup";
  }
  return null;
}

export function beeperMongoSourceToLabel(source: DbSource): BeeperMongoSourceLabel {
  return source === "local" ? "Local Mongo" : "Server Mongo";
}

export function labelToBeeperMongoSource(label: string): DbSource | null {
  if (label === "Server Mongo" || label === "qnap") return "qnap";
  if (label === "Local Mongo" || label === "Local readonly backup" || label === "local") return "local";
  return null;
}

/** Mask credentials from a postgres/mongodb URI — host:port only. */
export function maskUriHostPort(uri: string): string {
  const normalized = uri.replace(/^mongodb(\+srv)?:\/\//, "http://").replace(/^postgres(ql)?:\/\//, "http://");
  try {
    return new URL(normalized).host;
  } catch {
    return "(unresolved)";
  }
}

export function parseHostPort(hostPort: string): { host: string; port: string } {
  const idx = hostPort.lastIndexOf(":");
  if (idx === -1) return { host: hostPort, port: "" };
  return { host: hostPort.slice(0, idx), port: hostPort.slice(idx + 1) };
}

export function buildChadDataSourceActiveView(input: {
  probeOk?: boolean | null;
  probeError?: string;
  cpItemsCount?: number;
  chadEnvironment?: string;
  connectionStatusOverride?: string;
}): ChadDataSourceActiveView {
  const source = getPostgresSource();
  const target = describeEffectivePostgresTarget();
  const { host, port } = parseHostPort(target.hostPort);
  const mode = postgresSourceToMode(source);
  const meta = readOfflineReadonlyBackupMetadata();
  const offline = source === "offline-readonly-backup";
  const probing = input.probeOk == null && !input.connectionStatusOverride;

  let connectionStatus: string;
  if (input.connectionStatusOverride) {
    connectionStatus = input.connectionStatusOverride;
  } else if (probing) {
    connectionStatus = "checking";
  } else if (offline) {
    connectionStatus = input.probeOk ? "local snapshot" : `snapshot error: ${input.probeError ?? "unknown"}`;
  } else {
    connectionStatus = input.probeOk ? "connected" : `disconnected: ${input.probeError ?? "unknown"}`;
  }

  return {
    chadDataSource: chadPostgresSourceToLabel(source),
    mode: mode === "offline-readonly-backup" ? "emergency read-only" : "remote-primary",
    environment: input.chadEnvironment ?? process.env.CHAD_ENVIRONMENT ?? "(unset)",
    backend: "PostgreSQL",
    host: host || (offline ? "127.0.0.1" : QNAP_TAILSCALE_HOST),
    port:
      port ||
      (offline
        ? process.env.OFFLINE_READONLY_BACKUP_POSTGRES_PORT || "55432"
        : QNAP_POSTGRES_PORT),
    database: offline ? OFFLINE_READONLY_BACKUP_DATABASE : process.env.POSTGRES_DB || "chad",
    readAccess: "enabled",
    writeAccess: offline ? "blocked" : "enabled",
    connectionStatus,
    cpItemsCount: input.probeOk ? (input.cpItemsCount ?? null) : null,
    lastChecked: new Date().toISOString(),
    snapshotDate: meta?.restoreTimestamp,
    snapshotSource: meta ? `${meta.sourceHost}/${meta.sourceDatabase}` : undefined,
    snapshotAge: formatSnapshotAge(meta?.restoreTimestamp),
    verificationStatus: meta?.verificationResult,
    lastRefresh: meta?.restoreTimestamp,
  };
}

export function buildBeeperMongoActiveView(input: {
  probeOk?: boolean | null;
  probeError?: string;
  contactsCount?: number;
  messagesCount?: number;
  databaseName?: string;
  chadEnvironment?: string;
  connectionStatusOverride?: string;
  repoGuid?: string;
}): BeeperMongoActiveView {
  const source = getMongoSource();
  const target = describeEffectiveBeeperMongoTarget();
  const { host, port } = parseHostPort(target.hostPort);
  const readonly = source === "local";
  const probing = input.probeOk == null && !input.connectionStatusOverride;

  let connectionStatus: string;
  if (input.connectionStatusOverride) {
    connectionStatus = input.connectionStatusOverride;
  } else if (probing) {
    connectionStatus = "checking";
  } else if (readonly) {
    connectionStatus = input.probeOk ? "local mongo" : `local error: ${input.probeError ?? "unknown"}`;
  } else {
    connectionStatus = input.probeOk ? "connected" : `disconnected: ${input.probeError ?? "unknown"}`;
  }

  return {
    beeperDataSource: beeperMongoSourceToLabel(source),
    mode: readonly ? "local offline" : "remote-primary",
    environment: input.chadEnvironment ?? process.env.CHAD_ENVIRONMENT ?? "(unset)",
    backend: "MongoDB",
    host: readonly ? (host || "mongodb") : host || QNAP_TAILSCALE_HOST,
    port: readonly ? (port || "27017") : port || QNAP_BEEPER_MONGO_PORT,
    database: input.databaseName ?? "(beeper_<repoGuid>)",
    readAccess: "enabled",
    writeAccess: readonly ? "blocked" : "enabled",
    connectionStatus,
    contactsCount: input.probeOk ? (input.contactsCount ?? null) : null,
    messagesCount: input.probeOk ? (input.messagesCount ?? null) : null,
    lastChecked: new Date().toISOString(),
    localMirror: buildBeeperLocalMirrorStatusView(input.repoGuid),
  };
}

export function buildOfflineBackupOptionDetails(): {
  available: boolean;
  metadata: ReturnType<typeof readOfflineReadonlyBackupMetadata>;
  readerRole: string;
  error?: string;
} {
  const metadata = readOfflineReadonlyBackupMetadata();
  if (!metadata) {
    return {
      available: false,
      metadata: null,
      readerRole: OFFLINE_READONLY_BACKUP_READER_ROLE,
      error: "No offline-readonly-backup snapshot found. Run refresh-from-server.sh first.",
    };
  }
  if (metadata.verificationResult !== "PASS") {
    return {
      available: false,
      metadata,
      readerRole: OFFLINE_READONLY_BACKUP_READER_ROLE,
      error: `Read-only verification failed (${metadata.verificationResult}).`,
    };
  }
  return { available: true, metadata, readerRole: OFFLINE_READONLY_BACKUP_READER_ROLE };
}

export function getRuntimeChadDataModeLabel(): string {
  return getChadDataMode();
}
