/**
 * MongoDB implementation of the `cp_history` read side (Story 74, rewritten
 * in Story 79). Dispatched to by `cp-history.ts` whenever the configured
 * primary backend isn't `postgres` (Story 80 adds `cp-history-postgres.ts`)
 * — see that file. Unchanged in behavior from before Story 80; only
 * relocated (was `cp-history.ts` itself) and now importing its shared
 * read-model types from `cp-history-types.ts` instead of defining them
 * locally.
 *
 * Isolation: every function takes `repoGuid` as an explicit parameter,
 * always sourced by the caller from the current session/repo-context, never
 * trusted from request query/body.
 */

import { getMongoDb } from "./mongo.js";
import { getMongoProvider } from "./data-router-instance.js";
import {
  fallbackItemNameFromAddress,
  type CpHistoryActor,
  type CpHistoryConfigOp,
  type CpHistoryBodyHunk,
  type CpHistoryDetail,
  type CpHistoryListItem,
  type ListCpHistoryInput,
  type ListCpHistoryResult,
} from "./cp-history-types.js";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface CpHistoryDoc {
  _id: string;
  mutationId: string;
  requestId: string | null;
  sourceCollection: string;
  sourceId: string;
  repoGuid: string;
  address: string;
  itemName?: string | null;
  version: number;
  operationType: string;
  actor: CpHistoryActor;
  changedAt: Date;
  beforeHash: string | null;
  afterHash: string | null;
  changes: {
    config: CpHistoryConfigOp[];
    body: CpHistoryBodyHunk[] | null;
  };
  afterSnapshot?: { config: unknown; body: string } | null;
  metadata: Record<string, unknown>;
}

function toListItem(doc: CpHistoryDoc): CpHistoryListItem {
  return {
    id: doc._id,
    mutationId: doc.mutationId,
    sourceId: doc.sourceId,
    address: doc.address,
    itemName: doc.itemName ?? fallbackItemNameFromAddress(doc.address),
    version: doc.version,
    operationType: doc.operationType,
    changedAt: doc.changedAt.toISOString(),
    actor: doc.actor,
    changedConfigPaths: doc.changes.config.map((op) => op.path),
    bodyChanged: doc.changes.body !== null,
    hasSnapshot: !!doc.afterSnapshot,
  };
}

export async function listCpHistory(input: ListCpHistoryInput): Promise<ListCpHistoryResult> {
  const db = await getMongoDb();
  const collection = db.collection<CpHistoryDoc>("cp_history");

  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, input.pageSize ?? 50));

  if (input.addressPrefix && !input.addressPrefix.startsWith(input.repoGuid)) {
    return { items: [], total: 0, page, pageSize };
  }

  const filter: Record<string, unknown> = { repoGuid: input.repoGuid };
  if (input.sourceId) filter.sourceId = input.sourceId;
  if (input.addressPrefix) {
    filter.address = { $regex: `^${escapeRegex(input.addressPrefix)}(/|$)` };
  }
  if (input.operationType) filter.operationType = input.operationType;
  if (input.dateFrom || input.dateTo) {
    const changedAt: Record<string, Date> = {};
    if (input.dateFrom) changedAt.$gte = input.dateFrom;
    if (input.dateTo) changedAt.$lte = input.dateTo;
    filter.changedAt = changedAt;
  }

  const sort: Record<string, 1 | -1> = input.sourceId ? { version: -1 } : { changedAt: -1, _id: -1 };

  const [docs, total] = await Promise.all([
    collection.find(filter).sort(sort).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);

  return { items: docs.map(toListItem), total, page, pageSize };
}

export async function getCpHistoryEntry(id: string, repoGuid: string): Promise<CpHistoryDetail | null> {
  const db = await getMongoDb();
  const collection = db.collection<CpHistoryDoc>("cp_history");
  const doc = await collection.findOne({ _id: id });
  if (!doc) return null;

  if (doc.repoGuid !== repoGuid) {
    return null;
  }

  return {
    ...toListItem(doc),
    requestId: doc.requestId,
    beforeHash: doc.beforeHash,
    afterHash: doc.afterHash,
    changes: doc.changes,
    afterSnapshot: doc.afterSnapshot ?? null,
    metadata: doc.metadata ?? {},
  };
}

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

export async function getCpHistoryForItem(sourceId: string, repoGuid: string): Promise<CpHistoryDetail[]> {
  const db = await getMongoDb();
  const collection = db.collection<CpHistoryDoc>("cp_history");
  const docs = await collection.find({ sourceId, repoGuid }).sort({ version: 1 }).toArray();
  return docs.map((doc) => ({
    ...toListItem(doc),
    requestId: doc.requestId,
    beforeHash: doc.beforeHash,
    afterHash: doc.afterHash,
    changes: doc.changes,
    afterSnapshot: doc.afterSnapshot ?? null,
    metadata: doc.metadata ?? {},
  }));
}
