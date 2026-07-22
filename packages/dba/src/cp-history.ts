/**
 * Read-side API for the `cp_history` collection (Story 74) — history of
 * changes to `chad.cp_items`, populated by the independent `history-worker`
 * process (packages/history-worker), never written here.
 *
 * Isolation: every function takes `repoGuid` as an explicit parameter,
 * always sourced by the caller from the current session/repo-context
 * (`getCurrentRepoGuid()`), never trusted from request query/body — see
 * ai-docs/begin_here/05_endpoint-rules.md and
 * documentation/dashboard/common/features/chad-user-data-isolation.md.
 * Filtering is a regex match on `address`'s first path segment (the same
 * source of truth `splitAddress()` uses elsewhere in this package), not a
 * separately stored `repoGuid` field on each history record — Story 74's
 * input explicitly rules out a redundant repoGuid field when it already
 * follows from `address`.
 */

import { getMongoDb } from "./mongo.js";
import { getMongoProvider } from "./data-router-instance.js";

export interface CpHistoryConfigOp {
  op: "add" | "remove" | "replace";
  path: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface CpHistoryBodyHunk {
  added: boolean;
  removed: boolean;
  value: string;
}

export interface CpHistoryActor {
  username: string;
  repoGuid: string;
}

export interface CpHistoryListItem {
  id: string;
  address: string | null;
  operationType: string;
  changedAt: string;
  actor: CpHistoryActor | null;
  beforeUnknown: boolean;
  changedConfigPaths: string[];
  bodyChanged: boolean;
}

export interface CpHistoryDetail extends CpHistoryListItem {
  changes: {
    config: CpHistoryConfigOp[];
    body: CpHistoryBodyHunk[] | null;
  };
}

export interface ListCpHistoryInput {
  repoGuid: string;
  /** Restrict to this address or any of its descendants (e.g. a view's folder address). Omit for "everything in this repo". */
  addressPrefix?: string;
  operationType?: "insert" | "update" | "delete";
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function repoAddressFilter(repoGuid: string) {
  return { $regex: `^${escapeRegex(repoGuid)}(/|$)` };
}

interface CpHistoryDoc {
  _id: string;
  sourceCollection: string;
  sourceId: string;
  address: string | null;
  operationType: string;
  changedAt: Date;
  actor: CpHistoryActor | null;
  beforeUnknown: boolean;
  changes: {
    config: CpHistoryConfigOp[];
    body: CpHistoryBodyHunk[] | null;
  };
}

function toListItem(doc: CpHistoryDoc): CpHistoryListItem {
  return {
    id: doc._id,
    address: doc.address,
    operationType: doc.operationType,
    changedAt: doc.changedAt.toISOString(),
    actor: doc.actor,
    beforeUnknown: doc.beforeUnknown,
    changedConfigPaths: doc.changes.config.map((op) => op.path),
    bodyChanged: doc.changes.body !== null,
  };
}

export async function listCpHistory(input: ListCpHistoryInput): Promise<ListCpHistoryResult> {
  const db = await getMongoDb();
  const collection = db.collection<CpHistoryDoc>("cp_history");

  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, input.pageSize ?? 50));

  // When filtering by a specific view's addressPrefix, still enforce repo
  // isolation as a second, independent check — never rely on addressPrefix
  // alone in case a future caller passes one from outside this repo.
  if (input.addressPrefix && !input.addressPrefix.startsWith(input.repoGuid)) {
    return { items: [], total: 0, page, pageSize };
  }

  const filter: Record<string, unknown> = {
    address: input.addressPrefix
      ? { $regex: `^${escapeRegex(input.addressPrefix)}(/|$)` }
      : repoAddressFilter(input.repoGuid),
  };
  if (input.operationType) filter.operationType = input.operationType;
  if (input.dateFrom || input.dateTo) {
    const changedAt: Record<string, Date> = {};
    if (input.dateFrom) changedAt.$gte = input.dateFrom;
    if (input.dateTo) changedAt.$lte = input.dateTo;
    filter.changedAt = changedAt;
  }

  const [docs, total] = await Promise.all([
    collection
      .find(filter)
      .sort({ changedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    collection.countDocuments(filter),
  ]);

  return { items: docs.map(toListItem), total, page, pageSize };
}

export async function getCpHistoryEntry(id: string, repoGuid: string): Promise<CpHistoryDetail | null> {
  const db = await getMongoDb();
  const collection = db.collection<CpHistoryDoc>("cp_history");
  const doc = await collection.findOne({ _id: id });
  if (!doc) return null;

  // Isolation: a caller-supplied bare history id must not leak another
  // repo's entry just because the id string is guessable (same principle
  // as MongoCpProvider.getItem's expectedRepoGuid check).
  if (!doc.address || !new RegExp(`^${escapeRegex(repoGuid)}(/|$)`).test(doc.address)) {
    return null;
  }

  return { ...toListItem(doc), changes: doc.changes };
}

/**
 * Resolves the Daily Tracker's real cp_items address for the given repo, by
 * reusing the exact same logical-path lookup the app's own save/read path
 * already uses (`leads.ts`'s `["views", "daily"]` — see
 * `saveDailyEntryMongo`/`getAllDailyEntries`) rather than guessing or
 * hardcoding an address. Returns `null` if this repo has no Daily Tracker
 * folder yet (never created one) — callers should treat that as "no
 * history yet", not an error.
 */
export async function resolveDailyTrackerAddressPrefix(repoGuid: string): Promise<string | null> {
  const mongo = getMongoProvider();
  const folder = await mongo.getByNames({ repoGuid, names: ["views", "daily"] });
  return folder?.config.address ?? null;
}

export async function listDailyTrackerHistory(
  input: Omit<ListCpHistoryInput, "addressPrefix">
): Promise<ListCpHistoryResult> {
  const addressPrefix = await resolveDailyTrackerAddressPrefix(input.repoGuid);
  if (!addressPrefix) {
    return { items: [], total: 0, page: input.page ?? 1, pageSize: input.pageSize ?? 50 };
  }
  return listCpHistory({ ...input, addressPrefix });
}

/**
 * Same as `resolveDailyTrackerAddressPrefix`, for the Dates ("Date Entry")
 * folder (`["views", "dates"]` — the exact same logical path `leads.ts`'s
 * `saveDateEntryMongo`/`getAllDateEntries` already use).
 */
export async function resolveDateEntriesAddressPrefix(repoGuid: string): Promise<string | null> {
  const mongo = getMongoProvider();
  const folder = await mongo.getByNames({ repoGuid, names: ["views", "dates"] });
  return folder?.config.address ?? null;
}

export async function listDateEntriesHistory(
  input: Omit<ListCpHistoryInput, "addressPrefix">
): Promise<ListCpHistoryResult> {
  const addressPrefix = await resolveDateEntriesAddressPrefix(input.repoGuid);
  if (!addressPrefix) {
    return { items: [], total: 0, page: input.page ?? 1, pageSize: input.pageSize ?? 50 };
  }
  return listCpHistory({ ...input, addressPrefix });
}
