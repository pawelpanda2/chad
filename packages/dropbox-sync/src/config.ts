import type { DiffLimits, GroupingConfig, SnapshotDecisionConfig } from "./types.js";

/**
 * All env reads are lazy (called from inside functions, never at module
 * load) — same reason as dba's mongo.ts/client.ts: Next.js imports this
 * module while collecting page data at build time, before docker-compose
 * has injected the runtime env var.
 */

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function getSnapshotDecisionConfig(): SnapshotDecisionConfig {
  return {
    maxChanges: readNumber("DROPBOX_SYNC_SNAPSHOT_MAX_CHANGES", 25),
    maxAgeDays: readNumber("DROPBOX_SYNC_SNAPSHOT_MAX_AGE_DAYS", 7),
    changeRatio: readNumber("DROPBOX_SYNC_SNAPSHOT_CHANGE_RATIO", 0.3),
  };
}

export function getDiffLimits(): DiffLimits {
  return {
    maxLines: readNumber("DROPBOX_SYNC_DIFF_MAX_LINES", 500),
    maxBytes: readNumber("DROPBOX_SYNC_DIFF_MAX_BYTES", 100_000),
  };
}

export function getGroupingConfig(): GroupingConfig {
  return {
    windowSeconds: readNumber("DROPBOX_SYNC_GROUPING_WINDOW_SECONDS", 3),
  };
}

export function getDiffRetentionMonths(): number {
  return readNumber("DROPBOX_SYNC_DIFF_RETENTION_MONTHS", 12);
}

export interface DropboxAuthConfig {
  appKey: string;
  appSecret: string;
  refreshToken: string;
}

export function getDropboxAuthConfig(): DropboxAuthConfig {
  const appKey = process.env.DROPBOX_APP_KEY;
  const appSecret = process.env.DROPBOX_APP_SECRET;
  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;
  if (!appKey || !appSecret || !refreshToken) {
    throw new Error(
      "Dropbox credentials are not configured — set DROPBOX_APP_KEY, " +
        "DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN (see documentation/dba/features/history.md " +
        "for the one-time Dropbox App Console setup steps)."
    );
  }
  return { appKey, appSecret, refreshToken };
}

export function isDropboxSyncEnabled(): boolean {
  return process.env.DROPBOX_SYNC_ENABLED === "true";
}
