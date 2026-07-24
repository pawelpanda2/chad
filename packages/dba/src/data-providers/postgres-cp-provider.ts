/**
 * PostgreSQL-backed CpCompatibleDataProvider (Story 80) — the replacement
 * primary for `MongoCpProvider`. Same public contract
 * (`getItem`/`getByNames`/`getByNames2`/`getChildren`/`findRecursively`/
 * `executeWrite`/`putItemConfig`), same repo-isolation/duplicate-name/
 * find-or-create semantics, so `DbaDataRouter` and every business function
 * need zero call-site changes to switch primaries (same invariant
 * `MongoCpProvider`'s own doc comment relies on).
 *
 * Every mutation goes through `executeCpMutationWithHistoryPostgres`/
 * `runCpMutation` (`../cp-history/mutate-postgres.js`) — a single Postgres
 * transaction that writes `cp_items` and lets the `cp_items_write_history`
 * trigger write its one `cp_history` row, atomically. Child address
 * allocation (`createChild`) does NOT need a separate counter
 * table/collection (unlike Mongo's `folder_child_counters`) — a
 * transaction-scoped advisory lock on `(repoGuid, parentAddress)` plus a
 * direct-children query is enough, since Postgres releases the lock
 * automatically at COMMIT/ROLLBACK (Story 80 §10).
 */

import { withPostgresClient } from "../postgres.js";
import type { PoolClient } from "pg";
import {
  nextChildIndexFromSiblings,
  splitAddress,
  type CpItem,
  type CpItemConfig,
} from "../cp-model.js";
import type { Clock } from "../data-clock.js";
import { systemClock } from "../data-clock.js";
import type { DataWriteCommand, DataWriteResult } from "../data-commands.js";
import {
  executeCpMutationWithHistoryPostgres,
  runCpMutation,
  CpItemAlreadyDeletedError,
} from "../cp-history/mutate-postgres.js";
import { tryGetCurrentActor, tryGetCurrentRequestId } from "../repo-context.js";
import { isUniqueViolation } from "../postgres.js";
import type {
  CpCompatibleDataProvider,
  GetByNames2Input,
  GetByNamesInput,
  GetItemInput,
} from "./types.js";

export class AddressConflictError extends Error {
  constructor(public readonly address: string, cause: unknown) {
    super(`Address conflict writing "${address}": ${String(cause)}`);
    this.name = "AddressConflictError";
  }
}

/** Mirrors MongoCpProvider's DuplicateChildNameError — see that class's doc comment (Story 72, 07/05 incident). */
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

interface CpItemsRow {
  id: string;
  repo_guid: string;
  address: string;
  name: string;
  type: string;
  config: CpItemConfig;
  body: string;
}

function rowToItem(row: CpItemsRow): CpItem {
  return { _id: row.id, config: row.config, body: row.body };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function childPattern(parentAddress: string): string {
  return `^${escapeRegex(parentAddress)}/[0-9]{2,3}$`;
}

export class PostgresCpProvider implements CpCompatibleDataProvider {
  readonly name = "postgres" as const;

  constructor(private readonly clock: Clock = systemClock) {}

  async getItem(input: GetItemInput, expectedRepoGuid?: string): Promise<CpItem | null> {
    return withPostgresClient(async (client) => {
      const { rows } =
        "id" in input
          ? await client.query<CpItemsRow>("SELECT * FROM cp_items WHERE id = $1", [input.id])
          : await client.query<CpItemsRow>("SELECT * FROM cp_items WHERE address = $1", [input.address]);

      const row = rows[0];
      if (!row) return null;

      // Repo isolation: exact match on the indexed repo_guid column (a
      // deliberate improvement over MongoCpProvider, which has no such
      // column and must re-derive it from address on every read).
      if (expectedRepoGuid && row.repo_guid !== expectedRepoGuid) {
        return null;
      }

      return rowToItem(row);
    });
  }

  async getByNames(input: GetByNamesInput): Promise<CpItem | null> {
    const trail = await this.getByNames2({ repoGuid: input.repoGuid, loca: "", names: input.names });
    return trail.length > 0 ? trail[trail.length - 1] : null;
  }

  async getByNames2(input: GetByNames2Input): Promise<CpItem[]> {
    return withPostgresClient(async (client) => {
      let currentAddress =
        input.loca === "" ? input.repoGuid : `${input.repoGuid}/${input.loca}`;
      const trail: CpItem[] = [];

      for (const name of input.names) {
        const children = await this.queryChildren(client, currentAddress);
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
        trail.push(matches[0]);
        currentAddress = matches[0].config.address;
      }

      return trail;
    });
  }

  private async queryChildren(client: PoolClient, parentAddress: string): Promise<CpItem[]> {
    const { rows } = await client.query<CpItemsRow>(
      "SELECT * FROM cp_items WHERE address ~ $1",
      [childPattern(parentAddress)]
    );
    return rows
      .map(rowToItem)
      .sort((a, b) => a.config.address.localeCompare(b.config.address, undefined, { numeric: true }));
  }

  /** Not part of `CpCompatibleDataProvider` — same asymmetry as MongoCpProvider's own `getChildItems`/`getChildren` pair. */
  async getChildItems(parentAddress: string): Promise<CpItem[]> {
    return withPostgresClient((client) => this.queryChildren(client, parentAddress));
  }

  async getChildren(parentAddress: string): Promise<CpItem[]> {
    return this.getChildItems(parentAddress);
  }

  async findRecursively(rootAddress: string, phrase: string): Promise<CpItem[]> {
    return withPostgresClient(async (client) => {
      const { rows } = await client.query<CpItemsRow>(
        "SELECT * FROM cp_items WHERE address ~ $1 AND position($2 in body) > 0",
        [`^${escapeRegex(rootAddress)}/`, phrase]
      );
      return rows
        .map(rowToItem)
        .sort((a, b) => a.config.address.localeCompare(b.config.address, undefined, { numeric: true }));
    });
  }

  async executeWrite(command: DataWriteCommand): Promise<DataWriteResult> {
    if (command.kind === "put-item") {
      return this.putItem(command.item, command.actor, command.operationId, { commandKind: "put-item" });
    }
    return this.createChild(command);
  }

  async putItemConfig(item: CpItem): Promise<CpItem> {
    const existing = await this.getItem({ id: item._id });
    const result = await this.putItem({ ...item, body: existing?.body ?? "" }, tryGetCurrentActor(), this.clock.newId(), {
      commandKind: "put-item-config",
    });
    return result.item;
  }

  private async putItem(
    item: CpItem,
    actor: { username: string; repoGuid: string } | null = null,
    mutationId?: string,
    extra?: { commandKind?: string; requestId?: string | null }
  ): Promise<DataWriteResult> {
    try {
      const result = await executeCpMutationWithHistoryPostgres(
        mutationId ?? this.clock.newId(),
        { kind: "put", itemId: item._id, config: item.config, body: item.body },
        { actor, requestId: extra?.requestId ?? tryGetCurrentRequestId() },
        this.clock
      );
      return { item: result.item!, alreadyExisted: result.alreadyExisted };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AddressConflictError(item.config.address, error);
      }
      throw error;
    }
  }

  async deleteItem(address: string): Promise<boolean> {
    const existing = await this.getItem({ address });
    if (!existing) return false;

    try {
      await executeCpMutationWithHistoryPostgres(
        this.clock.newId(),
        { kind: "delete", itemId: existing._id },
        { actor: tryGetCurrentActor(), requestId: tryGetCurrentRequestId() },
        this.clock
      );
    } catch (error) {
      if (error instanceof CpItemAlreadyDeletedError) return false;
      throw error;
    }
    return true;
  }

  private async createChild(command: Extract<DataWriteCommand, { kind: "create-child-item" }>): Promise<DataWriteResult> {
    // Follower replay of a primary's already-decided item — never re-run allocation (Story 72 §8/§23, unchanged for Postgres).
    if (command.item) {
      return this.putItem(command.item, command.actor, command.operationId, { commandKind: "create-child-item(replay)" });
    }

    return withPostgresClient(async (client) => {
      await client.query("BEGIN");
      try {
        const { repoGuid } = splitAddress(command.parentAddress);
        // Transaction-scoped advisory lock on (repoGuid, parentAddress) —
        // released automatically at COMMIT/ROLLBACK, no separate counter
        // table/cleanup needed (Story 80 §10).
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
          `${repoGuid}:${command.parentAddress}`,
        ]);

        const children = await this.queryChildren(client, command.parentAddress);
        const existingChild = children.find((c) => c.config.name === command.name);
        if (existingChild) {
          await client.query("COMMIT");
          return { item: existingChild, alreadyExisted: true };
        }

        const address = `${command.parentAddress}/${nextChildIndexFromSiblings(command.parentAddress, children.map((c) => c.config.address))}`;
        const newItemId = this.clock.newId();
        const newConfig: CpItemConfig = {
          id: newItemId,
          address,
          type: command.type,
          name: command.name,
        };

        let result;
        try {
          result = await runCpMutation(
            client,
            command.operationId,
            { kind: "put", itemId: newItemId, config: newConfig, body: command.body },
            { actor: command.actor, requestId: tryGetCurrentRequestId() },
            this.clock
          );
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new AddressConflictError(address, error);
          }
          throw error;
        }

        await client.query("COMMIT");
        return { item: result.item!, alreadyExisted: false };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {
          /* connection may already be broken; nothing more to do */
        });
        throw error;
      }
    });
  }
}
