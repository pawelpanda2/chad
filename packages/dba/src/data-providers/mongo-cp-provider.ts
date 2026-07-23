/**
 * Real MongoDB-backed CpCompatibleDataProvider (Story 72 §10).
 *
 * One Mongo document == one CP Item, collection `items`, `_id ==
 * config.id`, unique index on `config.address`. Folder children are never
 * stored — always derived by querying for documents one address segment
 * past the parent, mirroring `ReadFolderWorker.ListOfIndexesQNames` on the
 * real Content Provider (see Story 72 `03_knowledge.md`).
 *
 * Every cp_items mutation (`putItem`/`createChild`/`deleteItem`) goes
 * through `executeCpMutationWithHistory` (`../cp-history/mutate.ts`,
 * Story 79) — a single MongoDB multi-document transaction that writes the
 * cp_items change and its one `cp_history` event together. This requires
 * the single-node replica set (`rs0`) Story 74 already introduced for
 * Change Streams; Story 79 repurposes that same replica set for
 * transactions instead (Change Streams/`history-worker` are retired — see
 * `ai-docs/history/how-it-works.md`). Concurrency safety for "create the
 * next numbered child" still relies on the single-document atomic counter
 * (`folder_child_counters`) plus the unique address index as a second,
 * independent safety net — see `reserveNextChildAddress` below — this part
 * is unchanged by Story 79.
 */

import type { Db } from "mongodb";
import { getMongoDb } from "../mongo.js";
import {
  assertValidCpItem,
  nextChildIndexFromSiblings,
  repoAndLocaToAddress,
  splitAddress,
  type CpItem,
} from "../cp-model.js";
import type { Clock } from "../data-clock.js";
import { systemClock } from "../data-clock.js";
import type { DataWriteCommand, DataWriteResult } from "../data-commands.js";
import {
  executeCpMutationWithHistory,
  ensureCpHistoryIndexes,
  CpItemAlreadyDeletedError,
  type CpItemDoc as HistoryCpItemDoc,
} from "../cp-history/mutate.js";
import { tryGetCurrentActor, tryGetCurrentRequestId } from "../repo-context.js";
import type {
  CpCompatibleDataProvider,
  GetByNames2Input,
  GetByNamesInput,
  GetItemInput,
} from "./types.js";

export const ITEMS_COLLECTION = "cp_items";
export const FOLDER_CHILD_COUNTERS_COLLECTION = "folder_child_counters";

export class AddressConflictError extends Error {
  constructor(public readonly address: string, cause: unknown) {
    super(`Address conflict writing "${address}": ${String(cause)}`);
    this.name = "AddressConflictError";
  }
}

/**
 * Data-integrity error: more than one child under the same parent address
 * shares the same `config.name` (Story 72, `07/05` duplicate "dates"
 * incident). Mirrors CP's own `ReadAddressWorker.GetAdrTupleByName`, which
 * throws on `.Single()` for the same reason — deterministic sorting would
 * only hide the corruption by always picking the same one silently.
 */
export class DuplicateChildNameError extends Error {
  constructor(
    public readonly parentAddress: string,
    public readonly childName: string,
    public readonly matchingAddresses: string[]
  ) {
    super(
      `Data integrity error: found ${matchingAddresses.length} children named "${childName}" under "${parentAddress}" (expected at most 1): ${matchingAddresses.join(", ")}`
    );
    this.name = "DuplicateChildNameError";
  }
}

/**
 * `_historyVersion`/`_lastMutationId`/`_lastActor`/`_lastRequestId` (Story
 * 79) are top-level SIBLINGS to config/body (never inside config) — never
 * round-trip to Content Provider's config.yaml (`docToItem()` below
 * deliberately never reads them), purely Mongo-side bookkeeping for
 * `executeCpMutationWithHistory` (`../cp-history/mutate.ts`). Absent on
 * pre-Story-79 documents until the migration script runs — see
 * `CpItemNotMigratedError`.
 */
type ItemDoc = HistoryCpItemDoc;

interface FolderChildCounterDoc {
  _id: string; // parentAddress
  lastIndex: number;
}

let indexesEnsured = false;

export class MongoCpProvider implements CpCompatibleDataProvider {
  readonly name = "mongo" as const;

  constructor(private readonly clock: Clock = systemClock) {}

  private async db(): Promise<Db> {
    const db = await getMongoDb();
    if (!indexesEnsured) {
      await this.ensureIndexes(db);
      indexesEnsured = true;
    }
    return db;
  }

  /** Idempotent — safe to call every startup (Story 72 §10; Story 79 added the cp_history indexes). */
  async ensureIndexes(db?: Db): Promise<void> {
    const database = db ?? (await getMongoDb());
    const collection = database.collection<ItemDoc>(ITEMS_COLLECTION);
    await collection.createIndex({ "config.address": 1 }, { unique: true, name: "config_address_unique" });
    await ensureCpHistoryIndexes(database);
  }

  /**
   * Repair helper for the migrator (Story 72 follow-up): when a source
   * item's own `id` legitimately changes at Content Provider (e.g. the
   * duplicate-id data repair, `packages/console/src/fixDuplicateIds.ts`),
   * a PREVIOUSLY-migrated Mongo document at the same `config.address` but
   * the OLD `_id` becomes a stale orphan — the unique address index then
   * blocks inserting the corrected document under its new `_id`. Since
   * `config.address` is unique-by-design and Content Provider is the
   * source of truth, a doc at this address under a *different* id than
   * the one CP now reports is definitionally stale; this deletes it so
   * the corrected write can proceed. Returns whether a stale doc was
   * actually found and removed (false = the conflict was something else).
   */
  async resolveStaleAddressConflict(address: string, expectedId: string): Promise<boolean> {
    const db = await this.db();
    const collection = db.collection<ItemDoc>(ITEMS_COLLECTION);
    const existing = await collection.findOne({ "config.address": address });
    if (!existing || existing._id === expectedId) return false;
    if (existing._historyVersion === undefined) {
      // Pre-Story-79 orphan — fall back to the old raw delete rather than
      // blocking this migration-repair helper on the history migration
      // script (packages/dba/scripts/migrate-legacy-cp-items-to-history.mjs).
      await collection.deleteOne({ _id: existing._id });
      return true;
    }
    await executeCpMutationWithHistory(
      this.clock.newId(),
      { kind: "delete", itemId: existing._id },
      { actor: null, requestId: null, actorKind: "migration", commandKind: "resolve-stale-address-conflict" },
      this.clock
    );
    return true;
  }

  /**
   * Deletes a single item by its exact address (leaf items only — never
   * cascades to children, callers must confirm the address has none first
   * if that matters for their use case). Real removal, unlike the .NET
   * Content Provider's `Delete`, which is a permanent no-op stub there
   * (see `NetFileCpProvider` — callers on that backend must keep using the
   * existing "blank the fields in place" workaround). Returns whether a
   * document was actually found and removed.
   *
   * Story 79: routes through `executeCpMutationWithHistory` so the delete
   * and its one `cp_history` event commit atomically. `actor`/`requestId`
   * are read from the ambient request-scoped repo context
   * (`../repo-context.js`) rather than added as new parameters here, so
   * existing callers (`leads.ts`'s `deleteDailyEntry`/`deleteDateEntry`)
   * need no signature change to get real actor attribution.
   */
  async deleteItem(address: string): Promise<boolean> {
    const db = await this.db();
    const collection = db.collection<ItemDoc>(ITEMS_COLLECTION);
    const existing = await collection.findOne({ "config.address": address });
    if (!existing) return false;

    try {
      await executeCpMutationWithHistory(
        this.clock.newId(),
        { kind: "delete", itemId: existing._id },
        { actor: tryGetCurrentActor(), requestId: tryGetCurrentRequestId(), commandKind: "delete-item" },
        this.clock
      );
    } catch (error) {
      if (error instanceof CpItemAlreadyDeletedError) return false;
      throw error;
    }
    return true;
  }

  async getItem(input: GetItemInput, expectedRepoGuid?: string): Promise<CpItem | null> {
    const db = await this.db();
    const collection = db.collection<ItemDoc>(ITEMS_COLLECTION);
    const doc =
      "id" in input
        ? await collection.findOne({ _id: input.id })
        : await collection.findOne({ "config.address": input.address });

    if (!doc) return null;

    // Repo isolation: a caller-supplied bare `_id` must not leak another
    // repo's item just because the GUID happens to be guessable. See
    // Story 72 03_knowledge.md, repo-context.ts section. `config.address`'s
    // first segment is the sole source of truth for which repo an item
    // belongs to (no separate `repoGuid` field — exact match on the whole
    // first segment, via `splitAddress`, not a substring check).
    if (expectedRepoGuid) {
      const { repoGuid } = splitAddress(doc.config.address);
      if (repoGuid !== expectedRepoGuid) {
        return null;
      }
    }

    return docToItem(doc);
  }

  async getByNames(input: GetByNamesInput): Promise<CpItem | null> {
    const trail = await this.getByNames2({ repoGuid: input.repoGuid, loca: "", names: input.names });
    return trail.length > 0 ? trail[trail.length - 1] : null;
  }

  /**
   * Walks names one at a time, exactly like the real `GetByNames2`/
   * `GetItemBySeqOfNames` (Story 72 03_knowledge.md): at each step, find
   * the current parent's direct children and pick the one whose
   * `config.name` matches. Never a global name search (names aren't
   * globally unique).
   */
  async getByNames2(input: GetByNames2Input): Promise<CpItem[]> {
    const db = await this.db();
    const collection = db.collection<ItemDoc>(ITEMS_COLLECTION);

    let currentAddress = repoAndLocaToAddress(input.repoGuid, input.loca);
    const trail: CpItem[] = [];

    for (const name of input.names) {
      const children = await collection
        .find({ "config.address": { $regex: `^${escapeRegex(currentAddress)}/[0-9]{2,3}$` } })
        .toArray();
      const matches = children.filter((c) => c.config.name === name);
      if (matches.length === 0) {
        return [];
      }
      if (matches.length > 1) {
        throw new DuplicateChildNameError(
          currentAddress,
          name,
          matches.map((m) => m.config.address)
        );
      }
      const match = matches[0];
      trail.push(docToItem(match));
      currentAddress = match.config.address;
    }

    return trail;
  }

  /**
   * Lists a Folder item's direct children, sorted by their numeric index
   * segment — the Mongo-side equivalent of `getFolderChildren` in
   * `legacy-cp-provider.ts` (which parses CP's own computed `Body` map).
   * Not part of `CpCompatibleDataProvider` (mirrors that same asymmetry —
   * both are read-model conveniences for callers that need to enumerate
   * an unknown folder's contents, e.g. `leads.ts`'s Daily/Date Entry
   * listing functions).
   */
  async getChildItems(parentAddress: string): Promise<CpItem[]> {
    const db = await this.db();
    const collection = db.collection<ItemDoc>(ITEMS_COLLECTION);
    const docs = await collection
      .find({ "config.address": { $regex: `^${escapeRegex(parentAddress)}/[0-9]{2,3}$` } })
      .toArray();
    return docs
      .map(docToItem)
      .sort((a, b) => a.config.address.localeCompare(b.config.address, undefined, { numeric: true }));
  }

  /** `CpCompatibleDataProvider.getChildren` — same query as `getChildItems` above. */
  async getChildren(parentAddress: string): Promise<CpItem[]> {
    return this.getChildItems(parentAddress);
  }

  /**
   * `CpCompatibleDataProvider.findRecursively` — every descendant (any
   * depth) under `rootAddress` whose `body` contains `phrase`.
   */
  async findRecursively(rootAddress: string, phrase: string): Promise<CpItem[]> {
    const db = await this.db();
    const collection = db.collection<ItemDoc>(ITEMS_COLLECTION);
    const docs = await collection
      .find({
        "config.address": { $regex: `^${escapeRegex(rootAddress)}/` },
        body: { $regex: escapeRegex(phrase) },
      })
      .toArray();
    return docs
      .map(docToItem)
      .sort((a, b) => a.config.address.localeCompare(b.config.address, undefined, { numeric: true }));
  }

  async executeWrite(command: DataWriteCommand): Promise<DataWriteResult> {
    if (command.kind === "put-item") {
      return this.putItem(command.item, command.actor, command.operationId, { commandKind: "put-item" });
    }
    return this.createChild(command);
  }

  /**
   * Config-only write, preserving the supplied `_id`/custom fields exactly
   * (see `CpCompatibleDataProvider.putItemConfig`'s doc comment). Mongo
   * never had the "always mints a new id" problem `putItem` has to work
   * around on the CP side, so this is just `putItem` with the existing
   * document's `body` preserved unchanged (or `""` if the document is new
   * — matching `PutItemConfig`'s "config only, no body write" contract on
   * the CP side). No `DataWriteCommand` exists at this call site (not
   * wired through the router), so the mutation id is minted fresh here and
   * the actor comes from the ambient repo context, same as `deleteItem`.
   */
  async putItemConfig(item: CpItem): Promise<CpItem> {
    const db = await this.db();
    const collection = db.collection<ItemDoc>(ITEMS_COLLECTION);
    const existing = await collection.findOne({ _id: item._id });
    const result = await this.putItem({ ...item, body: existing?.body ?? "" }, tryGetCurrentActor(), this.clock.newId(), {
      commandKind: "put-item-config",
    });
    return result.item;
  }

  /**
   * Story 79: the only place this provider writes to `cp_items` for an
   * insert/update, via `executeCpMutationWithHistory` — the cp_items
   * mutation and its one `cp_history` event commit in a single transaction.
   * `mutationId` should be a caller-supplied, retry-stable id (e.g. a
   * `DataWriteCommand`'s own `operationId`) wherever one is available, so a
   * genuine retry of the same logical write is idempotent instead of
   * minting a second version — see `mutate.ts`'s doc comment.
   */
  private async putItem(
    item: CpItem,
    actor: { username: string; repoGuid: string } | null = null,
    mutationId?: string,
    extra?: { commandKind?: string; endpoint?: string; requestId?: string | null }
  ): Promise<DataWriteResult> {
    assertValidCpItem(item);
    await this.db(); // ensures indexes (cp_items' + cp_history's) on first use

    try {
      const result = await executeCpMutationWithHistory(
        mutationId ?? this.clock.newId(),
        { kind: "put", itemId: item._id, config: item.config, body: item.body },
        {
          actor,
          requestId: extra?.requestId ?? tryGetCurrentRequestId(),
          commandKind: extra?.commandKind,
          endpoint: extra?.endpoint,
        },
        this.clock
      );
      return { item: result.item!, alreadyExisted: result.alreadyExisted };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AddressConflictError(item.config.address, error);
      }
      throw error;
    }
  }

  private async createChild(command: Extract<DataWriteCommand, { kind: "create-child-item" }>): Promise<DataWriteResult> {
    const db = await this.db();
    const collection = db.collection<ItemDoc>(ITEMS_COLLECTION);

    // If the command already carries a decided item (this provider is the
    // FOLLOWER replaying a primary's decision), never re-run allocation —
    // just write it via the normal put path (Story 72 §8/§23).
    if (command.item) {
      return this.putItem(command.item, command.actor, command.operationId, { commandKind: "create-child-item(replay)" });
    }

    // find-or-create: exact name match among direct children.
    const children = await collection
      .find({ "config.address": { $regex: `^${escapeRegex(command.parentAddress)}/[0-9]{2,3}$` } })
      .toArray();
    const existing = children.find((c) => c.config.name === command.name);
    if (existing) {
      return { item: docToItem(existing), alreadyExisted: true };
    }

    const address = await this.reserveNextChildAddress(db, command.parentAddress, children.map((c) => c.config.address));
    const newItemId = this.clock.newId();
    const newConfig: CpItem["config"] = {
      id: newItemId,
      address,
      type: command.type,
      name: command.name,
      // `created`/`modified` deliberately omitted — executeCpMutationWithHistory
      // (via putItem below) fills them in from this same clock.
    };

    const result = await this.putItem(
      { _id: newItemId, config: newConfig, body: command.body },
      command.actor,
      command.operationId,
      { commandKind: "create-child-item" }
    );

    return { item: result.item, alreadyExisted: false };
  }

  /**
   * Atomically reserves the next child index for `parentAddress` via a
   * single-document `$inc` (safe on standalone Mongo, no transaction
   * needed — Story 72 §10/02_plan.md §2.4). Falls back to
   * `nextChildIndexFromSiblings` to seed the counter the first time a
   * parent is used, so a counter document doesn't need to be
   * pre-provisioned.
   */
  private async reserveNextChildAddress(
    db: Db,
    parentAddress: string,
    siblingAddresses: string[]
  ): Promise<string> {
    const counters = db.collection<FolderChildCounterDoc>(FOLDER_CHILD_COUNTERS_COLLECTION);
    const seedIndexString = nextChildIndexFromSiblings(parentAddress, siblingAddresses);
    const seedIndex = parseInt(seedIndexString, 10) - 1; // last used index, 0 if none

    // Two atomic single-document steps (Mongo rejects $max and $inc on the
    // same field in one update) — each step alone is race-safe; see class
    // doc comment for why this doesn't need a multi-document transaction.
    // Step 1: seed the counter on first use of this parent (no-op if it
    // already exists — $setOnInsert only applies on insert).
    await counters.updateOne(
      { _id: parentAddress },
      { $setOnInsert: { lastIndex: seedIndex } },
      { upsert: true }
    );
    // Step 2: atomically reserve the next index.
    const result = await counters.findOneAndUpdate(
      { _id: parentAddress },
      { $inc: { lastIndex: 1 } },
      { returnDocument: "after" }
    );

    const lastIndex = result?.lastIndex ?? seedIndex + 1;
    const indexString = lastIndex < 10 ? `0${lastIndex}` : String(lastIndex);
    return `${parentAddress}/${indexString}`;
  }
}

function docToItem(doc: ItemDoc): CpItem {
  return { _id: doc._id, config: doc.config, body: doc.body };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}
