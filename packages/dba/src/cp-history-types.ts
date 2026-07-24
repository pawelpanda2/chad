/**
 * Shared read-model types for the `cp_history` read side — used by both
 * `cp-history-mongo.ts` and `cp-history-postgres.ts` (Story 80) so the
 * dispatcher (`cp-history.ts`) can return one common type regardless of
 * which backend answered the query. This is the exact same public shape
 * Story 79 already exposed to the Dashboard History UI/API routes — Story
 * 80 does not change it, only adds a second implementation behind it.
 *
 * `"unknown"` is added to the actor kind union beyond Mongo's own
 * `"user"|"system"|"migration"` (`cp-history/mutate.ts`'s
 * `CpHistoryActorKind`) because Postgres's trigger-based history can
 * genuinely produce it (a manual `psql` write with no `app.actor_kind`
 * transaction-local setting — Story 80 §6) in a way the Mongo application-
 * only path never could.
 */

export type CpHistoryActorKind = "user" | "system" | "migration" | "unknown";

export interface CpHistoryConfigOp {
  op: "add" | "remove" | "replace";
  path: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export interface CpHistoryBodyHunk {
  added: boolean;
  removed: boolean;
  value: string;
}

export interface CpHistoryActor {
  username: string;
  repoGuid: string;
  kind: CpHistoryActorKind;
}

export interface CpHistoryListItem {
  id: string;
  mutationId: string;
  sourceId: string;
  address: string;
  itemName: string;
  version: number;
  operationType: string;
  changedAt: string;
  actor: CpHistoryActor;
  changedConfigPaths: string[];
  bodyChanged: boolean;
  hasSnapshot: boolean;
}

export interface CpHistoryDetail extends CpHistoryListItem {
  requestId: string | null;
  beforeHash: string | null;
  afterHash: string | null;
  changes: {
    config: CpHistoryConfigOp[];
    body: CpHistoryBodyHunk[] | null;
  };
  afterSnapshot: { config: unknown; body: string } | null;
  metadata: Record<string, unknown>;
}

export interface ListCpHistoryInput {
  repoGuid: string;
  /** Restrict to this address or any of its descendants. Omit for "everything in this repo". */
  addressPrefix?: string;
  /** Restrict to one cp_items document's own version history, sorted by version. */
  sourceId?: string;
  operationType?: "insert" | "update" | "replace" | "delete";
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
}

export interface ListCpHistoryResult {
  items: CpHistoryListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export function fallbackItemNameFromAddress(address: string): string {
  const segments = address.split("/");
  return segments[segments.length - 1] || address;
}
