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

export type ChadDataSourceLabel = "Server PostgreSQL" | "offline-readonly-backup";
export type BeeperMongoSourceLabel = "Server Mongo" | "Local readonly backup";

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
}

export function chadPostgresSourceToLabel(source: ChadPostgresSource): ChadDataSourceLabel {
  return source === "offline-readonly-backup" ? "offline-readonly-backup" : "Server PostgreSQL";
}

export function labelToChadPostgresSource(label: string): ChadPostgresSource | null {
  if (label === "Server PostgreSQL" || label === "server") return "server";
  if (label === "offline-readonly-backup") return "offline-readonly-backup";
  return null;
}

export function beeperMongoSourceToLabel(source: DbSource): BeeperMongoSourceLabel {
  return source === "local" ? "Local readonly backup" : "Server Mongo";
}

export function labelToBeeperMongoSource(label: string): DbSource | null {
  if (label === "Server Mongo" || label === "qnap") return "qnap";
  if (label === "Local readonly backup" || label === "local") return "local";
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
  probeOk: boolean;
  probeError?: string;
  cpItemsCount?: number;
  chadEnvironment?: string;
}): ChadDataSourceActiveView {
  const source = getPostgresSource();
  const target = describeEffectivePostgresTarget();
  const { host, port } = parseHostPort(target.hostPort);
  const mode = postgresSourceToMode(source);
  const meta = readOfflineReadonlyBackupMetadata();
  const offline = source === "offline-readonly-backup";

  return {
    chadDataSource: chadPostgresSourceToLabel(source),
    mode: mode === "offline-readonly-backup" ? "emergency read-only" : "remote-primary",
    environment: input.chadEnvironment ?? process.env.CHAD_ENVIRONMENT ?? "(unset)",
    backend: "PostgreSQL",
    host: offline ? "127.0.0.1" : host || QNAP_TAILSCALE_HOST,
    port: offline ? process.env.OFFLINE_READONLY_BACKUP_POSTGRES_PORT || "55432" : port || QNAP_POSTGRES_PORT,
    database: offline ? OFFLINE_READONLY_BACKUP_DATABASE : process.env.POSTGRES_DB || "chad",
    readAccess: "enabled",
    writeAccess: offline ? "blocked" : "enabled",
    connectionStatus: offline
      ? input.probeOk
        ? "local snapshot"
        : `snapshot error: ${input.probeError ?? "unknown"}`
      : input.probeOk
        ? "connected"
        : `disconnected: ${input.probeError ?? "unknown"}`,
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
  probeOk: boolean;
  probeError?: string;
  contactsCount?: number;
  messagesCount?: number;
  databaseName?: string;
  chadEnvironment?: string;
}): BeeperMongoActiveView {
  const source = getMongoSource();
  const target = describeEffectiveBeeperMongoTarget();
  const { host, port } = parseHostPort(target.hostPort);
  const readonly = source === "local";

  return {
    beeperDataSource: beeperMongoSourceToLabel(source),
    mode: readonly ? "offline read-only backup" : "remote-primary",
    environment: input.chadEnvironment ?? process.env.CHAD_ENVIRONMENT ?? "(unset)",
    backend: "MongoDB",
    host: readonly ? (host || "mongodb") : host || QNAP_TAILSCALE_HOST,
    port: readonly ? (port || "27017") : port || QNAP_BEEPER_MONGO_PORT,
    database: input.databaseName ?? "(beeper_<repoGuid>)",
    readAccess: "enabled",
    writeAccess: readonly ? "blocked" : "enabled",
    connectionStatus: readonly
      ? input.probeOk
        ? "local readonly backup"
        : `backup error: ${input.probeError ?? "unknown"}`
      : input.probeOk
        ? "connected"
        : `disconnected: ${input.probeError ?? "unknown"}`,
    contactsCount: input.probeOk ? (input.contactsCount ?? null) : null,
    messagesCount: input.probeOk ? (input.messagesCount ?? null) : null,
    lastChecked: new Date().toISOString(),
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
