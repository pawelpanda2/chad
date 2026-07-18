/**
 * Real MongoDB-backed CpCompatibleDataProvider (Story 72 §10).
 *
 * One Mongo document == one CP Item, collection `items`, `_id ==
 * config.id`, unique index on `config.address`. Folder children are never
 * stored — always derived by querying for documents one address segment
 * past the parent, mirroring `ReadFolderWorker.ListOfIndexesQNames` on the
 * real Content Provider (see Story 72 `03_knowledge.md`).
 *
 * Standalone MongoDB (no replica set — see `02_plan.md` §1 point 8) means
 * no multi-document transactions. Concurrency safety for "create the next
 * numbered child" instead relies on a single-document atomic counter
 * (`folder_child_counters`) plus the unique address index as a second,
 * independent safety net — see `reserveNextChildAddress` below.
 */

import type { Db } from "mongodb";
import { getMongoDb } from "../mongo.js";
import {
  assertValidCpItem,
  formatCpTimestamp,
  nextChildIndexFromSiblings,
  repoAndLocaToAddress,
  splitAddress,
  type CpItem,
} from "../cp-model.js";
import type { Clock } from "../data-clock.js";
import { systemClock } from "../data-clock.js";
import type { DataWriteCommand, DataWriteResult } from "../data-commands.js";
import type {
  CpCompatibleDataProvider,
  GetByNames2Input,
  GetByNamesInput,
  GetItemInput,
} from "./types.js";

export const ITEMS_COLLECTION = "items";
export const FOLDER_CHILD_COUNTERS_COLLECTION = "folder_child_counters";

export class AddressConflictError extends Error {
  constructor(public readonly address: string, cause: unknown) {
    super(`Address conflict writing "${address}": ${String(cause)}`);
    this.name = "AddressConflictError";
  }
}

interface ItemDoc {
  _id: string;
  config: CpItem["config"];
  body: string;
}

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

  /** Idempotent — safe to call every startup (Story 72 §10). */
  async ensureIndexes(db?: Db): Promise<void> {
    const database = db ?? (await getMongoDb());
    await database
      .collection<ItemDoc>(ITEMS_COLLECTION)
      .createIndex({ "config.address": 1 }, { unique: true, name: "config_address_unique" });
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
    // Story 72 03_knowledge.md, repo-context.ts section.
    if (expectedRepoGuid) {
      const { repoGuid } = splitAddress(doc.config.address);
      if (repoGuid !== expectedRepoGuid) {
        return null;
      }
    }

    return docToItem(doc);
  }

  async getByNames(input: GetByNamesInput): Promise<CpItem | null> {
    return this.getByNames2({ repoGuid: input.repoGuid, loca: "", names: input.names });
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
      const match = children.find((c) => c.config.name === name);
      if (!match) {
        return [];
      }
      trail.push(docToItem(match));
      currentAddress = match.config.address;
    }

    return trail;
  }

  async executeWrite(command: DataWriteCommand): Promise<DataWriteResult> {
    if (command.kind === "put-item") {
      return this.putItem(command.item);
    }
    return this.createChild(command);
  }

  private async putItem(item: CpItem): Promise<DataWriteResult> {
    assertValidCpItem(item);
    const db = await this.db();
    const collection = db.collection<ItemDoc>(ITEMS_COLLECTION);

    const now = formatCpTimestamp(this.clock.now());
    const existing = await collection.findOne({ _id: item._id });

    const config: CpItem["config"] = {
      ...item.config,
      // Preserve `created` across updates; only ever set once, on insert.
      created: existing?.config.created ?? item.config.created ?? now,
      modified: now,
    };

    try {
      await collection.updateOne(
        { _id: item._id },
        { $set: { config, body: item.body } },
        { upsert: true }
      );
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AddressConflictError(item.config.address, error);
      }
      throw error;
    }

    return { item: { _id: item._id, config, body: item.body }, alreadyExisted: !!existing };
  }

  private async createChild(command: Extract<DataWriteCommand, { kind: "create-child-item" }>): Promise<DataWriteResult> {
    const db = await this.db();
    const collection = db.collection<ItemDoc>(ITEMS_COLLECTION);

    // If the command already carries a decided item (this provider is the
    // FOLLOWER replaying a primary's decision), never re-run allocation —
    // just write it via the normal put path (Story 72 §8/§23).
    if (command.item) {
      return this.putItem(command.item);
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
    const now = formatCpTimestamp(this.clock.now());
    const newItem: CpItem = {
      _id: this.clock.newId(),
      config: {
        id: "",
        address,
        type: command.type,
        name: command.name,
        created: now,
        modified: now,
      },
      body: command.body,
    };
    newItem.config.id = newItem._id;

    try {
      await collection.insertOne({ _id: newItem._id, config: newItem.config, body: newItem.body });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AddressConflictError(address, error);
      }
      throw error;
    }

    return { item: newItem, alreadyExisted: false };
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

    const result = await counters.findOneAndUpdate(
      { _id: parentAddress },
      { $max: { lastIndex: seedIndex }, $inc: { lastIndex: 1 } },
      { upsert: true, returnDocument: "after" }
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
