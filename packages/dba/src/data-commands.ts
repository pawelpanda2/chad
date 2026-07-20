/**
 * Data write commands — the single artifact a `dba` business function
 * builds once and hands to `DbaDataRouter`. Both the primary and the
 * follower execute the exact same command; neither backend invents its
 * own id/address/timestamps (Story 72 §8/§22/§23).
 */

import type { Clock } from "./data-clock.js";
import { formatCpTimestamp, type CpItem } from "./cp-model.js";
import { tryGetCurrentActor } from "./repo-context.js";

export interface DataCommandBase {
  operationId: string;
  createdAt: string;
  /**
   * Best-effort acting user, auto-stamped from the request-scoped repo
   * context at command-build time (Story 74, history feature) — `null` when
   * built outside any context (migration scripts, tests). Never required:
   * a missing actor must never block the write itself.
   */
  actor: { username: string; repoGuid: string } | null;
}

/** Write (create-or-update) an item at an already-known address. */
export interface PutItemCommand extends DataCommandBase {
  kind: "put-item";
  item: CpItem;
}

/**
 * Find-or-create a child under `parentAddress`. `item` already carries the
 * final decided `_id`/`config.address` — this is filled in by the PRIMARY
 * provider's `executeWrite` (the only place allowed to allocate a new
 * child index/GUID), not by the command builder itself; see
 * `DbaDataRouter`/`MongoCpProvider.executeWrite`.
 */
export interface CreateChildItemCommand extends DataCommandBase {
  kind: "create-child-item";
  parentItemId: string;
  parentAddress: string;
  /** Logical name used for find-or-create matching against siblings. */
  name: string;
  type: string;
  body: string;
  /**
   * Present once a primary provider has decided the final address/id for
   * this child (either because it already existed, or because this
   * provider just allocated it). Followers MUST use this decided item
   * as-is and must never re-run their own next-index allocation
   * (Story 72 §8/§23) — see `NetFileCpProvider.executeWrite`.
   */
  item: CpItem | null;
}

export type DataWriteCommand = PutItemCommand | CreateChildItemCommand;

export interface DataWriteResult {
  item: CpItem;
  /** True if a create-child command found an existing child instead of creating one. */
  alreadyExisted: boolean;
}

export function buildPutItemCommand(item: CpItem, clock: Clock): PutItemCommand {
  return {
    kind: "put-item",
    operationId: clock.newId(),
    createdAt: clock.now().toISOString(),
    actor: tryGetCurrentActor(),
    item,
  };
}

export function buildCreateChildItemCommand(
  input: {
    parentItemId: string;
    parentAddress: string;
    name: string;
    type: string;
    body?: string;
  },
  clock: Clock
): CreateChildItemCommand {
  return {
    kind: "create-child-item",
    operationId: clock.newId(),
    createdAt: clock.now().toISOString(),
    actor: tryGetCurrentActor(),
    parentItemId: input.parentItemId,
    parentAddress: input.parentAddress,
    name: input.name,
    type: input.type,
    body: input.body ?? "",
    item: null,
  };
}

/** CHAD's `YYMMDD_HHMMSS` convention, from one shared clock (Story 72 §22). */
export function newCpTimestamp(clock: Clock): string {
  return formatCpTimestamp(clock.now());
}
