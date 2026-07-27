/** Shared identifiers for the offline-readonly-backup emergency snapshot. */

export const OFFLINE_READONLY_BACKUP_CONTAINER = "chad-postgres-offline-readonly-backup";
export const OFFLINE_READONLY_BACKUP_DATABASE = "chad_offline_readonly_backup";
export const OFFLINE_READONLY_BACKUP_READER_ROLE = "chad_offline_readonly_backup_reader";
export const OFFLINE_READONLY_BACKUP_COMPOSE_PROFILE = "offline-readonly-backup";
export const CHAD_DATA_MODE_OFFLINE_READONLY_BACKUP = "offline-readonly-backup" as const;
export const CHAD_DATA_MODE_REMOTE_PRIMARY = "remote-primary" as const;

export const DEFAULT_OFFLINE_READONLY_BACKUP_ROOT =
  process.env.HOME
    ? `${process.env.HOME}/04_chad_offline_readonly_backup`
    : "/tmp/chad_offline_readonly_backup";

export const DEFAULT_OFFLINE_READONLY_BACKUP_PORT = "55432";
