/**
 * Shared types for the dropbox-sync history engine. Mirrors the
 * history_events / history_snapshots / history_sync_state Mongo collections
 * documented in Story 67.
 */

export type HistoryOperation = "added" | "modified" | "deleted" | "moved";

export type HistoryScope = "daily-tracker";

/** Text files this Story tracks — matches the actual Content Provider file model. */
export const TRACKED_FILE_NAMES = new Set([
  "config.yaml",
  "body.txt",
  "body",
  "body.yaml",
  "body.json",
]);

export interface HistoryEvent {
  _id?: string;
  scope: HistoryScope;
  repoId: string;
  loca: string;
  element: string;
  fileName: string | null;
  operation: HistoryOperation;
  timestamp: Date;
  dropboxFileId: string | null;
  previousRevision: string | null;
  currentRevision: string | null;
  previousEventId: string | null;
  storageType: "diff" | "snapshot-ref" | "metadata-only";
  linesAdded: number | null;
  linesRemoved: number | null;
  diff: string | null;
  diffStored: boolean;
  diffOmittedReason: "diff-too-large" | "binary" | "retention-expired" | null;
  previousSize: number | null;
  currentSize: number | null;
  contentHash: string | null;
  groupId: string;
  syncRunId: string;
  source: "backfill" | "incremental";
  createdAt: Date;
}

export type SnapshotReason =
  | "periodic"
  | "change-count"
  | "age"
  | "deleted"
  | "size-threshold"
  | "initial";

export interface HistorySnapshot {
  _id?: string;
  scope: HistoryScope;
  repoId: string;
  loca: string;
  element: string;
  fileName: string;
  versionNumber: number;
  dropboxRevision: string;
  timestamp: Date;
  content: string;
  contentHash: string;
  size: number;
  reason: SnapshotReason;
  createdAt: Date;
}

export type SyncStatus = "idle" | "running" | "error";
export type BackfillStatus = "not-started" | "in-progress" | "completed" | "partial";

export interface HistorySyncState {
  _id?: string;
  scope: HistoryScope;
  repoId: string;
  loca: string;
  dropboxCursor: string | null;
  lastSuccessfulSyncAt: Date | null;
  lastAttemptedSyncAt: Date | null;
  status: SyncStatus;
  lastError: { message: string; at: Date } | null;
  backfillStatus: BackfillStatus;
  backfillCompletedAt: Date | null;
  monitoredSinceAt: Date;
  updatedAt: Date;
}

/** A Dropbox `list_folder`/`list_folder/continue` entry, narrowed to what we use. */
export interface DropboxRawEntry {
  ".tag": "file" | "folder" | "deleted";
  name: string;
  path_lower?: string;
  path_display?: string;
  id?: string;
  rev?: string;
  size?: number;
  server_modified?: string;
  content_hash?: string;
}

/** A raw Dropbox entry normalized to CHAD's element/fileName/operation model. */
export interface NormalizedChange {
  element: string;
  fileName: string | null;
  operation: HistoryOperation;
  timestamp: Date;
  dropboxFileId: string | null;
  currentRevision: string | null;
  size: number | null;
  pathDisplay: string;
  isTrackedFile: boolean;
}

export interface SnapshotDecisionInput {
  lastSnapshot: { versionNumber: number; timestamp: Date } | null;
  changesSinceLastSnapshot: number;
  changeRatio: number | null;
  isDeleteEvent: boolean;
}

export interface SnapshotDecisionConfig {
  maxChanges: number;
  maxAgeDays: number;
  changeRatio: number;
}

export interface DiffResult {
  diff: string | null;
  diffStored: boolean;
  diffOmittedReason: "diff-too-large" | "binary" | null;
  linesAdded: number;
  linesRemoved: number;
}

export interface DiffLimits {
  maxLines: number;
  maxBytes: number;
}

export interface GroupingConfig {
  windowSeconds: number;
}
