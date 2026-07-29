import { getMongoSource, getPostgresSource, type ChadPostgresSource } from "./dev-db-override.js";
import {
  CHAD_DATA_MODE_OFFLINE_READONLY_BACKUP,
  CHAD_DATA_MODE_REMOTE_PRIMARY,
} from "./offline-readonly-backup/constants.js";

export const OFFLINE_READONLY_BACKUP_WRITE_FORBIDDEN = "OFFLINE_READONLY_BACKUP_WRITE_FORBIDDEN" as const;
export const BEEPER_MONGO_READONLY_WRITE_FORBIDDEN = "BEEPER_MONGO_READONLY_WRITE_FORBIDDEN" as const;

export type ChadDataMode =
  | typeof CHAD_DATA_MODE_REMOTE_PRIMARY
  | typeof CHAD_DATA_MODE_OFFLINE_READONLY_BACKUP;

export class OfflineReadonlyBackupWriteForbiddenError extends Error {
  readonly code = OFFLINE_READONLY_BACKUP_WRITE_FORBIDDEN;

  constructor(message = "Writes are forbidden in offline-readonly-backup mode.") {
    super(message);
    this.name = "OfflineReadonlyBackupWriteForbiddenError";
  }
}

export class BeeperMongoReadonlyWriteForbiddenError extends Error {
  readonly code = BEEPER_MONGO_READONLY_WRITE_FORBIDDEN;

  constructor(message = "Writes are forbidden against Local readonly backup Mongo.") {
    super(message);
    this.name = "BeeperMongoReadonlyWriteForbiddenError";
  }
}

/** Runtime mode — derived from postgres source unless CHAD_DATA_MODE is set explicitly. */
export function getChadDataMode(): ChadDataMode {
  const explicit = process.env.CHAD_DATA_MODE;
  if (explicit === CHAD_DATA_MODE_OFFLINE_READONLY_BACKUP) {
    return CHAD_DATA_MODE_OFFLINE_READONLY_BACKUP;
  }
  if (explicit === CHAD_DATA_MODE_REMOTE_PRIMARY) {
    return CHAD_DATA_MODE_REMOTE_PRIMARY;
  }
  return getPostgresSource() === "offline-readonly-backup"
    ? CHAD_DATA_MODE_OFFLINE_READONLY_BACKUP
    : CHAD_DATA_MODE_REMOTE_PRIMARY;
}

export function isOfflineReadonlyBackupMode(): boolean {
  return getChadDataMode() === CHAD_DATA_MODE_OFFLINE_READONLY_BACKUP;
}

export function assertChadWriteAllowed(): void {
  if (isOfflineReadonlyBackupMode()) {
    throw new OfflineReadonlyBackupWriteForbiddenError();
  }
}

/** Local Beeper Mongo is an offline readonly backup — Server Mongo (qnap) is read/write. */
export function isBeeperMongoReadonlyMode(): boolean {
  return getMongoSource() === "local";
}

export function assertBeeperWriteAllowed(): void {
  if (isBeeperMongoReadonlyMode()) {
    throw new BeeperMongoReadonlyWriteForbiddenError();
  }
}

export function postgresSourceToMode(source: ChadPostgresSource): ChadDataMode {
  return source === "offline-readonly-backup"
    ? CHAD_DATA_MODE_OFFLINE_READONLY_BACKUP
    : CHAD_DATA_MODE_REMOTE_PRIMARY;
}
