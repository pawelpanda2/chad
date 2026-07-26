import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_OFFLINE_READONLY_BACKUP_ROOT } from "./constants.js";

export interface OfflineReadonlyBackupMetadata {
  sourceHost: string;
  sourceDatabase: string;
  dumpTimestamp: string;
  restoreTimestamp: string;
  cpItemsCount: number;
  cpHistoryCount: number;
  verificationResult: string;
}

export function offlineReadonlyBackupRoot(): string {
  return process.env.CHAD_OFFLINE_READONLY_BACKUP_ROOT || DEFAULT_OFFLINE_READONLY_BACKUP_ROOT;
}

export function offlineReadonlyBackupMetadataPath(): string {
  return join(offlineReadonlyBackupRoot(), "metadata", "latest.json");
}

export function readOfflineReadonlyBackupMetadata(): OfflineReadonlyBackupMetadata | null {
  const path = offlineReadonlyBackupMetadataPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as OfflineReadonlyBackupMetadata;
  } catch {
    return null;
  }
}

export function formatSnapshotAge(isoTimestamp: string | undefined): string | null {
  if (!isoTimestamp) return null;
  const then = Date.parse(isoTimestamp);
  if (Number.isNaN(then)) return null;
  const diffMs = Date.now() - then;
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  const minutes = Math.floor(diffMs / 60_000);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}
