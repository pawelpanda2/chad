/**
 * Atomic multi-row commit of a validated `CpImportPlan` into `cp_items`
 * (Story 109 — see ai-docs/content-provider/zip-import.md). One Postgres
 * transaction for the whole subtree: BEGIN -> advisory lock on
 * (repoGuid, parentAddress) -> re-verify parent -> root-name conflict
 * check -> insert every node -> COMMIT, or ROLLBACK on any failure.
 * Nothing partial ever lands in cp_items.
 *
 * This is a standalone operation, not part of the 6-method
 * ContentProviderStorage contract (import is a CHAD-specific bulk
 * operation, not part of the real external CP protocol those 6 methods
 * mirror) — mirrors packages/dba/src/data-providers/postgres-cp-provider.ts's
 * `createChild` transaction shape (same advisory-lock scheme, so a
 * concurrent normal Folders-tab write under the same parent serializes
 * correctly against this), but is intentionally self-contained here rather
 * than importing from `dba` (wrong dependency direction — content-provider
 * must never depend on dba). The `cp_items_write_history` trigger (Story
 * 80 SQL migration) fires automatically on every INSERT here exactly like
 * it does for dba's own writes, as long as the same `app.*` mutation
 * context is set per row — replicated locally below.
 */

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { CpImportCommitError, CpImportCommitResult, CpImportNode, CpImportPlan } from "cp-core";
import { withPostgreClient } from "../client.js";

const PG_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === PG_UNIQUE_VIOLATION;
}

/** Mirrors dba's postgres.ts `setMutationContext` — duplicated intentionally, see file doc comment. */
async function setMutationContext(
  client: PoolClient,
  context: { mutationId: string; actorUsername: string | null; actorRepoGuid: string | null }
): Promise<void> {
  await client.query(
    `SELECT
       set_config('app.mutation_id', $1, true),
       set_config('app.request_id', $2, true),
       set_config('app.actor_username', $3, true),
       set_config('app.actor_repo_guid', $4, true),
       set_config('app.actor_kind', $5, true)`,
    [context.mutationId, "", context.actorUsername ?? "", context.actorRepoGuid ?? "", context.actorUsername ? "user" : "system"]
  );
}

/** Zero-padded 2-digit for 1-9, plain digits 10-999 — matches cp-files' paths.ts formatIndex / dba's cp-model.ts formatChildIndex. */
function formatCpIndex(index: number): string {
  if (!Number.isInteger(index) || index < 1 || index > 999) {
    throw new Error(`formatCpIndex: index out of range (1-999): ${index}`);
  }
  return index < 10 ? `0${index}` : String(index);
}

function nextIndex(siblingAddresses: string[], parentAddress: string): string {
  const prefix = `${parentAddress}/`;
  let last = 0;
  for (const address of siblingAddresses) {
    if (!address.startsWith(prefix)) continue;
    const rest = address.slice(prefix.length);
    if (rest.includes("/")) continue;
    const n = Number(rest);
    if (Number.isInteger(n) && n > last) last = n;
  }
  return formatCpIndex(last + 1);
}

interface CpItemsRow {
  address: string;
  name: string;
  type: string;
}

async function queryDirectChildren(client: PoolClient, parentAddress: string): Promise<CpItemsRow[]> {
  const escaped = parentAddress.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const { rows } = await client.query<CpItemsRow>(`SELECT address, name, type FROM cp_items WHERE address ~ $1`, [
    `^${escaped}/[0-9]{2,3}$`,
  ]);
  return rows;
}

async function insertNode(
  client: PoolClient,
  node: CpImportNode,
  address: string,
  now: Date,
  actor: { username: string; repoGuid: string } | null
): Promise<void> {
  const id = randomUUID();
  const mutationId = randomUUID();
  const config = {
    id,
    address,
    type: node.type,
    name: node.name,
    created: now.toISOString(),
    modified: now.toISOString(),
    ...node.extraConfig,
  };
  const repoGuid = address.split("/")[0];

  await setMutationContext(client, {
    mutationId,
    actorUsername: actor?.username ?? null,
    actorRepoGuid: actor?.repoGuid ?? null,
  });

  await client.query(
    `INSERT INTO cp_items (id, repo_guid, address, name, type, config, body, created_at, modified_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $8)`,
    [id, repoGuid, address, node.name, node.type, JSON.stringify(config), node.body, now]
  );
}

/**
 * Inserts `node` and its whole subtree under `parentAddress`, allocating
 * fresh sibling indices within THIS transaction (so nested batches never
 * collide with each other even though nothing has committed yet).
 */
async function insertSubtree(
  client: PoolClient,
  node: CpImportNode,
  parentAddress: string,
  existingSiblingAddresses: string[],
  now: Date,
  actor: { username: string; repoGuid: string } | null,
  createdAddresses: string[]
): Promise<void> {
  const address = `${parentAddress}/${nextIndex(existingSiblingAddresses, parentAddress)}`;
  await insertNode(client, node, address, now, actor);
  createdAddresses.push(address);
  existingSiblingAddresses.push(address);

  const childSiblingAddresses: string[] = [];
  for (const child of node.children) {
    await insertSubtree(client, child, address, childSiblingAddresses, now, actor, createdAddresses);
  }
}

export interface CommitFolderImportPostgreInput {
  repoGuid: string;
  parentAddress: string;
  plan: CpImportPlan;
  actor: { username: string; repoGuid: string } | null;
}

export type CommitFolderImportPostgreResult = { ok: true; result: CpImportCommitResult } | { ok: false; error: CpImportCommitError };

export async function commitFolderImportPostgre(input: CommitFolderImportPostgreInput): Promise<CommitFolderImportPostgreResult> {
  return withPostgreClient(async (client) => {
    await client.query("BEGIN");
    try {
      // Transaction-scoped advisory lock on (repoGuid, parentAddress) — same scheme as
      // dba's postgres-cp-provider.ts createChild, so a concurrent normal Folders-tab
      // write under the same parent serializes correctly against this whole import.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `${input.repoGuid}:${input.parentAddress}`,
      ]);

      const { rows: parentRows } = await client.query<{ address: string; type: string; repo_guid: string }>(
        `SELECT address, type, repo_guid FROM cp_items WHERE address = $1 FOR UPDATE`,
        [input.parentAddress]
      );
      const parent = parentRows[0];
      if (!parent || parent.repo_guid !== input.repoGuid) {
        await client.query("ROLLBACK");
        return { ok: false, error: { code: "PARENT_NOT_FOUND", message: `Parent not found at address "${input.parentAddress}"` } };
      }
      if (parent.type !== "Folder") {
        await client.query("ROLLBACK");
        return { ok: false, error: { code: "PARENT_NOT_FOLDER", message: `Parent at "${input.parentAddress}" is not a Folder` } };
      }

      const siblings = await queryDirectChildren(client, input.parentAddress);
      const conflict = siblings.find((s) => s.name === input.plan.root.name);
      if (conflict) {
        await client.query("ROLLBACK");
        return {
          ok: false,
          error: { code: "ROOT_NAME_CONFLICT", message: `Parent already has a child named "${input.plan.root.name}" (at "${conflict.address}")` },
        };
      }

      const now = new Date();
      const createdAddresses: string[] = [];
      const siblingAddresses = siblings.map((s) => s.address);
      await insertSubtree(client, input.plan.root, input.parentAddress, siblingAddresses, now, input.actor, createdAddresses);

      await client.query("COMMIT");
      return {
        ok: true,
        result: { createdRootAddress: createdAddresses[0], createdItemCount: createdAddresses.length },
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {
        /* connection may already be broken; nothing more to do */
      });
      if (isUniqueViolation(error)) {
        return { ok: false, error: { code: "COMMIT_FAILED", message: `Address conflict during import commit: ${String(error)}` } };
      }
      return { ok: false, error: { code: "COMMIT_FAILED", message: error instanceof Error ? error.message : String(error) } };
    }
  });
}
