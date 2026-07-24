/**
 * Shared types/constants for the `data_sync_outbox` (Mongo) /
 * `cp_outbox_data_sync` (Postgres, Story 80) backends — kept in their own
 * module (not `data-outbox.ts`) purely to avoid a circular import between
 * the dispatcher (`data-outbox.ts`) and the two backend implementations
 * (`data-outbox-mongo.ts`/`data-outbox-postgres.ts`), which both need these
 * same constants.
 */

import type { DataBackendName } from "./data-providers/types.js";
import type { DataWriteCommand } from "./data-commands.js";

export type OutboxStatus = "pending" | "processing" | "retry" | "synced" | "failed" | "conflict";

export interface OutboxJob {
  _id: string;
  operationId: string;
  commandKind: DataWriteCommand["kind"];
  primaryBackend: DataBackendName;
  followerBackend: DataBackendName;
  command: DataWriteCommand;
  status: OutboxStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string;
  lockedAt: string | null;
  lockedBy: string | null;
  completedAt: string | null;
  lastError: string | null;
}

export interface EnqueueFollowerOperationInput {
  command: DataWriteCommand;
  primaryBackend: DataBackendName;
  followerBackend: DataBackendName;
}

/** Backoff schedule per Story 72 §14: 1m, 5m, 15m, 1h, 6h, then `failed`. */
export const RETRY_BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];

/** A job stuck in `processing` longer than this is assumed crashed. */
export const STALE_LOCK_MS = 10 * 60_000;

export function outboxJobId(operationId: string, followerBackend: DataBackendName): string {
  return `${operationId}:${followerBackend}`;
}

export function sanitizeOutboxError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
