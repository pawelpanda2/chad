/**
 * Story 79 — the single transactional choke point for every cp_items
 * write in this monorepo. Replaces Story 74/78's Change-Stream-derived
 * history (`packages/history-worker`) with a MongoDB multi-document
 * transaction that writes the cp_items mutation and its one cp_history
 * event together: either both commit, or neither does (proven by the
 * forced-failure integration tests in `mutate.test.ts`, not just asserted
 * here).
 *
 * `MongoCpProvider.putItem`/`createChild`/`deleteItem`
 * (`../data-providers/mongo-cp-provider.ts`) are this function's only
 * callers — see that file's doc comments for why no other code path may
 * touch `cp_items` directly.
 */

import type { ClientSession, Db } from "mongodb";
import { getMongoClient, getMongoDb } from "../mongo.js";
import { formatCpTimestamp, splitAddress, type CpItem, type CpItemConfig } from "../cp-model.js";
import type { Clock } from "../data-clock.js";
import { systemClock } from "../data-clock.js";
import { hashCpState } from "./hash.js";
import { diffConfig, diffBody, type CpHistoryConfigOp, type CpHistoryBodyHunk } from "./diff.js";

export const CP_ITEMS_COLLECTION = "cp_items";
export const CP_HISTORY_COLLECTION = "cp_history";

/**
 * Every Nth version of a given item also gets a full `afterSnapshot` on top
 * of its diff, so reconstructing full state never needs to replay more than
 * `HISTORY_SNAPSHOT_INTERVAL - 1` diffs on top of the nearest snapshot. A
 * named constant per the Story 79 input's explicit "N ma być stałą
 * konfiguracyjną i mieć testy" — see `mutate.test.ts`'s snapshot-cadence
 * test, which asserts against this exported value rather than a hardcoded
 * 20 so the test stays correct if this is ever retuned.
 */
export const HISTORY_SNAPSHOT_INTERVAL = 20;

export type CpHistoryActorKind = "user" | "system" | "migration";

export interface CpHistoryActor {
  username: string;
  repoGuid: string;
  kind: CpHistoryActorKind;
}

export type CpHistoryOperationType = "insert" | "update" | "replace" | "delete";

export interface CpHistoryMetadata {
  endpoint?: string;
  commandKind?: string;
  environment?: string;
  seedRunId?: string;
}

export interface CpHistoryDoc {
  _id: string;
  mutationId: string;
  requestId: string | null;
  sourceCollection: "cp_items";
  sourceId: string;
  repoGuid: string;
  address: string;
  /**
   * The item's `config.name` at the time of this event (its natural
   * display name in the Dashboard History table's "Item" column) — stored
   * directly on every event rather than derived at read time, since a full
   * snapshot (the only other place `config.name` would be available) isn't
   * present on every event (see `afterSnapshot` below). `null` only for
   * events written before this field existed; readers fall back to the
   * address's last segment (see `../cp-history.ts`'s `toListItem`), never
   * silently guessing a name.
   */
  itemName: string | null;
  version: number;
  operationType: CpHistoryOperationType;
  actor: CpHistoryActor;
  changedAt: Date;
  beforeHash: string | null;
  afterHash: string | null;
  changes: {
    config: CpHistoryConfigOp[];
    body: CpHistoryBodyHunk[] | null;
  };
  /**
   * Full point-in-time snapshot. Always present for `insert` (the item's
   * starting state) and `delete` (the state that just stopped existing —
   * named `afterSnapshot` for schema uniformity with insert/update rather
   * than a separate `beforeSnapshot` field, but for a delete event it holds
   * the pre-delete document, since there is by definition no "after" state
   * to snapshot). For `update`, only present every `HISTORY_SNAPSHOT_INTERVAL`th
   * version — otherwise `null`, relying on `changes` (the diff) plus the
   * nearest earlier snapshot for full reconstruction (see `replayCpHistory`
   * in `../cp-history.ts`).
   */
  afterSnapshot?: { config: CpItemConfig; body: string } | null;
  metadata: CpHistoryMetadata;
}

/** Bookkeeping fields Story 79 adds to every `cp_items` document — top-level siblings of `config`/`body` (never inside `config`), exactly like the pre-existing `_lastActor` field they extend. Kept out of `config` specifically so `hashCpState` (which only ever hashes `{config, body}`) can never see them — see `hash.ts`'s doc comment. */
export interface CpItemHistoryFields {
  _historyVersion: number;
  _lastMutationId: string;
  _lastActor: { username: string; repoGuid: string } | null;
  _lastRequestId: string | null;
}

export interface CpItemDoc extends Partial<CpItemHistoryFields> {
  _id: string;
  config: CpItemConfig;
  body: string;
}

export class CpHistoryVersionConflictError extends Error {
  constructor(
    public readonly itemId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number | null
  ) {
    super(`cp_items ${itemId}: expected version ${expectedVersion}, found ${actualVersion ?? "(no document)"}`);
    this.name = "CpHistoryVersionConflictError";
  }
}

/**
 * Thrown by a put/delete against a pre-Story-79 document that has never
 * been through the migration script
 * (`packages/dba/scripts/migrate-legacy-cp-items-to-history.mjs`) — Story 79
 * explicitly forbids silently guessing a starting version for old data
 * ("stare dane bez tych pól obsłuż wyłącznie kontrolowaną
 * migracją/seedem, bez cichego zgadywania").
 */
export class CpItemNotMigratedError extends Error {
  constructor(
    public readonly itemId: string,
    public readonly address: string
  ) {
    super(
      `cp_items ${itemId} (${address}) has no _historyVersion — it predates the Story 79 history mechanism and must be migrated first (packages/dba/scripts/migrate-legacy-cp-items-to-history.mjs). Refusing to silently assume a starting version.`
    );
    this.name = "CpItemNotMigratedError";
  }
}

/** A second delete of the same id — a controlled, explicit failure, never a fabricated second delete event (Story 79 input, "Delete" section: "drugi delete nie tworzy fałszywego eventu"). */
export class CpItemAlreadyDeletedError extends Error {
  constructor(public readonly itemId: string) {
    super(`cp_items ${itemId} does not exist (already deleted, or never existed).`);
    this.name = "CpItemAlreadyDeletedError";
  }
}

/**
 * `mutationId`s are caller-supplied and must be unique per logical
 * operation (see `executeCpMutationWithHistory`'s doc comment) — reusing
 * one across two operations against DIFFERENT items is a caller bug, not
 * a legitimate retry. Without this check, the idempotency fast-path would
 * silently treat the second, unrelated call as "already applied" and
 * return the first operation's result for the wrong item.
 */
export class CpMutationIdReusedError extends Error {
  constructor(
    public readonly mutationId: string,
    public readonly existingSourceId: string,
    public readonly requestedItemId: string
  ) {
    super(
      `mutationId ${mutationId} was already used for cp_items ${existingSourceId} — refusing to reuse it for a different item (${requestedItemId}). mutationId must be unique per logical operation.`
    );
    this.name = "CpMutationIdReusedError";
  }
}

export interface CpMutationContext {
  actor: { username: string; repoGuid: string } | null;
  requestId: string | null;
  actorKind?: CpHistoryActorKind;
  commandKind?: string;
  endpoint?: string;
  seedRunId?: string;
  environment?: string;
}

export type CpMutationInput =
  | { kind: "put"; itemId: string; config: CpItemConfig; body: string; expectedVersion?: number }
  | { kind: "delete"; itemId: string; expectedVersion?: number };

export interface CpMutationResult {
  /** `null` after a delete. */
  item: CpItem | null;
  alreadyExisted: boolean;
  historyDoc: CpHistoryDoc;
  /** `true` when this call short-circuited on an already-committed `mutationId` instead of running a new transaction (Story 79 idempotent-retry requirement). */
  idempotentReplay: boolean;
}

function docToItem(doc: CpItemDoc): CpItem {
  return { _id: doc._id, config: doc.config, body: doc.body };
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}

async function loadCurrentItem(db: Db, sourceId: string): Promise<CpItem | null> {
  const doc = await db.collection<CpItemDoc>(CP_ITEMS_COLLECTION).findOne({ _id: sourceId });
  return doc ? docToItem(doc) : null;
}

function buildMetadata(context: CpMutationContext): CpHistoryMetadata {
  const metadata: CpHistoryMetadata = {};
  if (context.endpoint) metadata.endpoint = context.endpoint;
  if (context.commandKind) metadata.commandKind = context.commandKind;
  if (context.environment) metadata.environment = context.environment;
  if (context.seedRunId) metadata.seedRunId = context.seedRunId;
  return metadata;
}

function resolveActor(context: CpMutationContext, repoGuid: string): CpHistoryActor {
  const kind: CpHistoryActorKind = context.actorKind ?? (context.actor ? "user" : "system");
  return {
    username: context.actor?.username ?? kind,
    repoGuid: context.actor?.repoGuid ?? repoGuid,
    kind,
  };
}

/**
 * The single choke point for every cp_items write. See file-level doc
 * comment. `mutationId` is caller-supplied (not generated in here) so a
 * caller that wants true idempotent-retry semantics can reuse the same id
 * across retries of the same logical operation (e.g. `DataWriteCommand`'s
 * own `operationId`, already generated once at command-build time in
 * `../data-commands.ts`) — a fresh id every call would defeat the point.
 */
export async function executeCpMutationWithHistory(
  mutationId: string,
  input: CpMutationInput,
  context: CpMutationContext,
  clock: Clock = systemClock
): Promise<CpMutationResult> {
  const db = await getMongoDb();
  const historyCol = db.collection<CpHistoryDoc>(CP_HISTORY_COLLECTION);

  // Idempotent retry, fast path: this exact mutationId already produced a
  // committed cp_history event (e.g. caller retrying after an ambiguous
  // network/transaction result) — never repeat the write or mint a second
  // version. `_id` IS `mutationId`, so this is one indexed point lookup.
  // Guarded by a sourceId match: a mutationId reused across two DIFFERENT
  // items is a caller bug, not a legitimate retry, and must fail loudly
  // rather than silently returning the wrong item's result.
  const existingEvent = await historyCol.findOne({ _id: mutationId });
  if (existingEvent) {
    if (existingEvent.sourceId !== input.itemId) {
      throw new CpMutationIdReusedError(mutationId, existingEvent.sourceId, input.itemId);
    }
    const item = await loadCurrentItem(db, existingEvent.sourceId);
    return { item, alreadyExisted: true, historyDoc: existingEvent, idempotentReplay: true };
  }

  const client = await getMongoClient();
  const session: ClientSession = client.startSession();
  try {
    let result: CpMutationResult | undefined;
    await session.withTransaction(async () => {
      result = await runMutation(db, session, mutationId, input, context, clock);
    });
    return result!;
  } catch (error) {
    // A truly-concurrent retry of the same mutationId can lose the
    // pre-check race above and hit cp_history's unique _id index instead —
    // the same idempotency guarantee, just discovered a few ms later via
    // the transaction's own duplicate-key failure. Treat it identically.
    if (isDuplicateKeyError(error)) {
      const replay = await historyCol.findOne({ _id: mutationId });
      if (replay && replay.sourceId === input.itemId) {
        const item = await loadCurrentItem(db, replay.sourceId);
        return { item, alreadyExisted: true, historyDoc: replay, idempotentReplay: true };
      }
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

async function runMutation(
  db: Db,
  session: ClientSession,
  mutationId: string,
  input: CpMutationInput,
  context: CpMutationContext,
  clock: Clock
): Promise<CpMutationResult> {
  const itemsCol = db.collection<CpItemDoc>(CP_ITEMS_COLLECTION);
  const historyCol = db.collection<CpHistoryDoc>(CP_HISTORY_COLLECTION);

  const existing = await itemsCol.findOne({ _id: input.itemId }, { session });

  if (existing && existing._historyVersion === undefined) {
    throw new CpItemNotMigratedError(input.itemId, existing.config?.address ?? "(unknown address)");
  }

  const existingVersion = existing?._historyVersion ?? null;
  if (input.expectedVersion !== undefined && existingVersion !== input.expectedVersion) {
    throw new CpHistoryVersionConflictError(input.itemId, input.expectedVersion, existingVersion);
  }

  const now = clock.now();

  if (input.kind === "delete") {
    if (!existing) {
      throw new CpItemAlreadyDeletedError(input.itemId);
    }
    const address = existing.config.address;
    const repoGuid = splitAddress(address).repoGuid;
    const actor = resolveActor(context, repoGuid);
    const version = existing._historyVersion! + 1;
    const beforeHash = hashCpState(existing.config, existing.body);

    await itemsCol.deleteOne({ _id: input.itemId }, { session });

    const historyDoc: CpHistoryDoc = {
      _id: mutationId,
      mutationId,
      requestId: context.requestId,
      sourceCollection: "cp_items",
      sourceId: input.itemId,
      repoGuid,
      address,
      itemName: existing.config.name ?? null,
      version,
      operationType: "delete",
      actor,
      changedAt: now,
      beforeHash,
      afterHash: null,
      changes: {
        config: diffConfig(existing.config, null),
        body: diffBody(existing.body, null),
      },
      afterSnapshot: { config: existing.config, body: existing.body },
      metadata: buildMetadata(context),
    };
    await historyCol.insertOne(historyDoc, { session });

    return { item: null, alreadyExisted: true, historyDoc, idempotentReplay: false };
  }

  // input.kind === "put"
  const address = input.config.address;
  const repoGuid = splitAddress(address).repoGuid;
  const actor = resolveActor(context, repoGuid);
  const beforeHash = existing ? hashCpState(existing.config, existing.body) : null;
  const version = existing ? existing._historyVersion! + 1 : 1;
  const createdAt = existing?.config.created ?? input.config.created ?? formatCpTimestamp(now);
  const finalConfig: CpItemConfig = {
    ...input.config,
    created: createdAt,
    modified: formatCpTimestamp(now),
  };
  const afterHash = hashCpState(finalConfig, input.body);

  const historyFields: CpItemHistoryFields = {
    _historyVersion: version,
    _lastMutationId: mutationId,
    _lastActor: context.actor ?? null,
    _lastRequestId: context.requestId,
  };

  await itemsCol.updateOne(
    { _id: input.itemId },
    { $set: { config: finalConfig, body: input.body, ...historyFields } },
    { session, upsert: true }
  );

  const operationType: CpHistoryOperationType = existing ? "update" : "insert";
  const includeSnapshot = operationType === "insert" || version % HISTORY_SNAPSHOT_INTERVAL === 0;

  const historyDoc: CpHistoryDoc = {
    _id: mutationId,
    mutationId,
    requestId: context.requestId,
    sourceCollection: "cp_items",
    sourceId: input.itemId,
    repoGuid,
    address,
    itemName: finalConfig.name ?? null,
    version,
    operationType,
    actor,
    changedAt: now,
    beforeHash,
    afterHash,
    changes: {
      config: diffConfig(existing?.config ?? null, finalConfig),
      body: diffBody(existing?.body ?? null, input.body),
    },
    afterSnapshot: includeSnapshot ? { config: finalConfig, body: input.body } : null,
    metadata: buildMetadata(context),
  };
  await historyCol.insertOne(historyDoc, { session });

  return {
    item: { _id: input.itemId, config: finalConfig, body: input.body },
    alreadyExisted: !!existing,
    historyDoc,
    idempotentReplay: false,
  };
}

/**
 * One-time, explicit baseline for a pre-Story-79 `cp_items` document that
 * has never been through the history mechanism — establishes
 * `_historyVersion: 1` and a matching `insert`-shaped `cp_history` event
 * from the document's OWN current state (never a guess), so subsequent
 * real mutations can proceed normally instead of hitting
 * `CpItemNotMigratedError`. Only ever called by
 * `packages/dba/scripts/migrate-legacy-cp-items-to-history.mjs` — never
 * from a live request path. Idempotent: a document that already has
 * `_historyVersion` is left untouched and this returns `{ migrated: false
 * }`, so the migration script is safely re-runnable.
 */
export async function migrateLegacyCpItem(
  itemId: string,
  context: Pick<CpMutationContext, "seedRunId" | "environment">,
  clock: Clock = systemClock
): Promise<{ migrated: boolean; historyDoc?: CpHistoryDoc }> {
  const db = await getMongoDb();
  const client = await getMongoClient();
  const itemsCol = db.collection<CpItemDoc>(CP_ITEMS_COLLECTION);
  const historyCol = db.collection<CpHistoryDoc>(CP_HISTORY_COLLECTION);

  const session: ClientSession = client.startSession();
  try {
    let outcome: { migrated: boolean; historyDoc?: CpHistoryDoc } = { migrated: false };
    await session.withTransaction(async () => {
      const existing = await itemsCol.findOne({ _id: itemId }, { session });
      if (!existing || existing._historyVersion !== undefined) {
        outcome = { migrated: false };
        return;
      }

      const mutationId = clock.newId();
      const address = existing.config.address;
      const repoGuid = splitAddress(address).repoGuid;
      const afterHash = hashCpState(existing.config, existing.body);

      await itemsCol.updateOne(
        { _id: itemId },
        {
          $set: {
            _historyVersion: 1,
            _lastMutationId: mutationId,
            _lastActor: null,
            _lastRequestId: null,
          },
        },
        { session }
      );

      const historyDoc: CpHistoryDoc = {
        _id: mutationId,
        mutationId,
        requestId: null,
        sourceCollection: "cp_items",
        sourceId: itemId,
        repoGuid,
        address,
        itemName: existing.config.name ?? null,
        version: 1,
        operationType: "insert",
        actor: { username: "migration", repoGuid, kind: "migration" },
        changedAt: clock.now(),
        beforeHash: null,
        afterHash,
        changes: {
          config: diffConfig(null, existing.config),
          body: diffBody(null, existing.body),
        },
        afterSnapshot: { config: existing.config, body: existing.body },
        metadata: buildMetadata({
          actor: null,
          requestId: null,
          actorKind: "migration",
          commandKind: "migrate-legacy-cp-item",
          seedRunId: context.seedRunId,
          environment: context.environment,
        }),
      };
      await historyCol.insertOne(historyDoc, { session });
      outcome = { migrated: true, historyDoc };
    });
    return outcome;
  } finally {
    await session.endSession();
  }
}

/** Idempotent — safe to call on every process startup. */
export async function ensureCpHistoryIndexes(db?: Db): Promise<void> {
  const database = db ?? (await getMongoDb());
  const historyCol = database.collection(CP_HISTORY_COLLECTION);
  await historyCol.createIndex({ sourceId: 1, version: 1 }, { unique: true, name: "sourceId_version_unique" });
  await historyCol.createIndex({ repoGuid: 1, changedAt: -1 }, { name: "repoGuid_changedAt" });
  await historyCol.createIndex({ address: 1, changedAt: -1 }, { name: "address_changedAt" });
  // mutationId IS _id (see CpHistoryDoc), so no separate unique index is
  // needed for it — Mongo's own _id index already enforces that.
}
