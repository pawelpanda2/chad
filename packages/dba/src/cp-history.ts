/**
 * Read-side API for the `cp_history` collection (Story 74, rewritten in
 * Story 79) — history of changes to `chad.cp_items`, now written
 * atomically alongside every mutation by
 * `executeCpMutationWithHistory` (`./cp-history/mutate.ts`), never by a
 * separate process. `packages/history-worker` (Story 74/78's Change-Stream
 * consumer) is retired — see `ai-docs/history/how-it-works.md`.
 *
 * Isolation: every function takes `repoGuid` as an explicit parameter,
 * always sourced by the caller from the current session/repo-context
 * (`getCurrentRepoGuid()`), never trusted from request query/body — see
 * `ai-docs/begin_here/05_endpoint-rules.md` and
 * `human-docs/dashboard/common/features/chad-user-data-isolation.md`.
 * Story 79 filters on the `repoGuid` field stored directly on every
 * `cp_history` document (set once, at write time, from the mutated item's
 * own address — see `mutate.ts`) rather than a regex on `address`, which is
 * both simpler and stricter than Story 74's original "regex anchored on
 * address" approach.
 */

import { getMongoDb } from "./mongo.js";
import { getMongoProvider } from "./data-router-instance.js";
import type { CpHistoryActorKind } from "./cp-history/mutate.js";

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
  /**
   * The item's natural display name (`config.name` at the time of this
   * event). Never a guess: events written since Story 79 always carry this
   * directly (see `cp-history/mutate.ts`'s `itemName` field). Events from
   * before that field existed fall back to the address's last segment — a
   * controlled, documented fallback, not a silent invention of a name that
   * was never recorded.
   */
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
  /** Restrict to this address or any of its descendants (e.g. a view's folder address). Omit for "everything in this repo". */
  addressPrefix?: string;
  /** Restrict to one cp_items document's own version history, sorted by version (Story 79). */
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

/** Controlled fallback for events written before `itemName` existed — the address's last `/`-separated segment, never a fabricated name. */
function fallbackItemNameFromAddress(address: string): string {
  const segments = address.split("/");
  return segments[segments.length - 1] || address;
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

  // When filtering by a specific view's addressPrefix, still enforce repo
  // isolation as a second, independent check — never rely on addressPrefix
  // alone in case a future caller passes one from outside this repo.
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

  // Story 79: a single item's own history sorts by its own monotonic
  // `version` (unambiguous, no tie-breaker needed — the unique
  // `{sourceId,version}` index guarantees exactly one document per version).
  // A cross-item feed (the common "everything in this repo/view" case) has
  // no single meaningful version to sort by, so it sorts by `changedAt`
  // (now millisecond-precision Date.now(), not the old seconds-only
  // BSON-clusterTime-derived value) with `_id` (== mutationId, a random but
  // stable string) as a deterministic tie-breaker for same-millisecond
  // writes — "stable" here means reproducible across repeated queries, not
  // chronologically meaningful.
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

  // Isolation: a caller-supplied bare history id must not leak another
  // repo's entry just because the id string is guessable. Story 79: exact
  // equality on the stored `repoGuid` field, not a regex — stricter and
  // simpler than Story 74's address-prefix regex.
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

/**
 * Full version-by-version history for one cp_items document, oldest first
 * — the input for `replayCpHistory` below. Not paginated (an item's own
 * version count is bounded by how many times it's been edited, not by
 * total repo activity).
 */
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
