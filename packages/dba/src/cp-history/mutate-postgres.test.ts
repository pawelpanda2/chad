/**
 * Real-Postgres integration tests for `executeCpMutationWithHistoryPostgres`
 * (Story 80) — mirrors `mutate.test.ts`'s Mongo test shape/coverage against
 * a real local PostgreSQL, using a dedicated scratch database. Schema is
 * bootstrapped idempotently in `beforeAll` by applying
 * `sql/migrations/0001_init.sql` directly if `cp_items` doesn't exist yet.
 *
 * Unlike Mongo, `cp_history` here is enforced append-only at the DATABASE
 * level (Story 80's immutability trigger rejects UPDATE/DELETE outright —
 * see the last `describe` block below) — so, unlike `mutate.test.ts`'s
 * shared `REPO` constant reset via `deleteMany` in `beforeEach`, every test
 * here uses its OWN fresh, random repoGuid (`freshRepo()`), needing no
 * cleanup between tests at all. `afterAll` resets the whole scratch
 * database via `TRUNCATE` (a statement-level operation, unaffected by the
 * row-level immutability trigger) rather than any per-repo `DELETE`.
 *
 * Run: `POSTGRES_URI` must point at a real PostgreSQL (defaults below to
 * the local dev stack from docker-compose.local.yml, port 5433).
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.POSTGRES_URI =
  process.env.POSTGRES_URI ?? "postgres://chad:chad@localhost:5433/chad_test_story80_mutate";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { withPostgresClient, closePostgresConnection } from "../postgres.js";
import {
  executeCpMutationWithHistoryPostgres,
  CpHistoryVersionConflictError,
  CpItemAlreadyDeletedError,
  CpMutationIdReusedError,
} from "./mutate-postgres.js";

function freshRepo(): string {
  return randomUUID();
}

async function ensureSchema(): Promise<void> {
  await withPostgresClient(async (client) => {
    const { rows } = await client.query("SELECT to_regclass('cp_items') AS reg");
    if (rows[0].reg) return;
    const sqlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "sql", "migrations", "0001_init.sql");
    const sql = await readFile(sqlPath, "utf8");
    await client.query(sql);
  });
}

function ctx(repoGuid: string, overrides: Partial<Parameters<typeof executeCpMutationWithHistoryPostgres>[2]> = {}) {
  return {
    actor: { username: "alice", repoGuid },
    requestId: null,
    ...overrides,
  };
}

beforeAll(async () => {
  await ensureSchema();
});

afterAll(async () => {
  await withPostgresClient((client) => client.query("TRUNCATE cp_history, cp_items"));
  await closePostgresConnection();
});

describe("executeCpMutationWithHistoryPostgres — insert", () => {
  it("creates cp_items and exactly one cp_history row, version 1, correct hashes, in one transaction", async () => {
    const repo = freshRepo();
    const itemId = randomUUID();
    const address = `${repo}/01`;
    const mutationId = randomUUID();

    const result = await executeCpMutationWithHistoryPostgres(
      mutationId,
      { kind: "put", itemId, config: { id: itemId, address, type: "Text", name: "n1" }, body: "hello" },
      ctx(repo)
    );

    expect(result.historyRow.version).toBe(1);
    expect(result.historyRow.operationType).toBe("insert");
    expect(result.historyRow.beforeHash).toBeNull();
    expect(result.historyRow.afterHash).not.toBeNull();
    expect(result.historyRow.afterSnapshot).not.toBeNull();
    expect(result.historyRow.actor).toEqual({ username: "alice", repoGuid: repo, kind: "user" });

    await withPostgresClient(async (client) => {
      const { rows } = await client.query("SELECT * FROM cp_items WHERE id = $1", [itemId]);
      expect(rows[0].history_version).toBe(1);
      expect(rows[0].last_mutation_id).toBe(mutationId);

      const { rows: historyRows } = await client.query("SELECT count(*) FROM cp_history WHERE source_id = $1", [itemId]);
      expect(Number(historyRows[0].count)).toBe(1);
    });
  });

  it("system actor when no actor is provided", async () => {
    const repo = freshRepo();
    const itemId = randomUUID();
    const result = await executeCpMutationWithHistoryPostgres(
      randomUUID(),
      { kind: "put", itemId, config: { id: itemId, address: `${repo}/02`, type: "Text", name: "n2" }, body: "" },
      { actor: null, requestId: null }
    );
    expect(result.historyRow.actor.kind).toBe("system");
    expect(result.historyRow.actor.username).toBe("system");
  });

  it("a manual SQL insert (no app.* context set) still produces history, with actor_kind unknown", async () => {
    const repo = freshRepo();
    const itemId = randomUUID();
    const address = `${repo}/manual`;
    await withPostgresClient(async (client) => {
      await client.query(
        `INSERT INTO cp_items (id, repo_guid, address, name, type, config, body, created_at, modified_at)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,now(),now())`,
        [itemId, repo, address, "manual-item", "Text", JSON.stringify({ id: itemId, address, type: "Text", name: "manual-item" }), ""]
      );
      const { rows } = await client.query("SELECT actor_kind, operation_type, version FROM cp_history WHERE source_id = $1", [itemId]);
      expect(rows).toHaveLength(1);
      expect(rows[0].actor_kind).toBe("unknown");
      expect(rows[0].operation_type).toBe("insert");
      expect(rows[0].version).toBe(1);
    });
  });
});

describe("executeCpMutationWithHistoryPostgres — update", () => {
  it("creates exactly one new row, increments version by 1, and preserves the hash chain", async () => {
    const repo = freshRepo();
    const itemId = randomUUID();
    const address = `${repo}/03`;
    const insertResult = await executeCpMutationWithHistoryPostgres(
      randomUUID(),
      { kind: "put", itemId, config: { id: itemId, address, type: "Text", name: "n3" }, body: "v1" },
      ctx(repo)
    );
    const updateResult = await executeCpMutationWithHistoryPostgres(
      randomUUID(),
      { kind: "put", itemId, config: { id: itemId, address, type: "Text", name: "n3" }, body: "v2" },
      ctx(repo)
    );

    expect(updateResult.historyRow.version).toBe(2);
    expect(updateResult.historyRow.operationType).toBe("update");
    expect(updateResult.historyRow.beforeHash).toBe(insertResult.historyRow.afterHash);
    // Postgres always stores a full snapshot (unlike Mongo's every-20th cadence).
    expect(updateResult.historyRow.beforeSnapshot).not.toBeNull();
    expect(updateResult.historyRow.afterSnapshot).not.toBeNull();
  });

  it("rejects with a version conflict when expectedVersion doesn't match, without mutating anything", async () => {
    const repo = freshRepo();
    const itemId = randomUUID();
    const address = `${repo}/06`;
    await executeCpMutationWithHistoryPostgres(
      randomUUID(),
      { kind: "put", itemId, config: { id: itemId, address, type: "Text", name: "n6" }, body: "v1" },
      ctx(repo)
    );

    await expect(
      executeCpMutationWithHistoryPostgres(
        randomUUID(),
        { kind: "put", itemId, config: { id: itemId, address, type: "Text", name: "n6" }, body: "v2", expectedVersion: 5 },
        ctx(repo)
      )
    ).rejects.toBeInstanceOf(CpHistoryVersionConflictError);

    await withPostgresClient(async (client) => {
      const { rows } = await client.query("SELECT count(*) FROM cp_history WHERE source_id = $1", [itemId]);
      expect(Number(rows[0].count)).toBe(1);
    });
  });
});

describe("executeCpMutationWithHistoryPostgres — delete", () => {
  it("removes cp_items, creates one event with a full pre-delete snapshot and afterHash null", async () => {
    const repo = freshRepo();
    const itemId = randomUUID();
    const address = `${repo}/07`;
    const insertResult = await executeCpMutationWithHistoryPostgres(
      randomUUID(),
      { kind: "put", itemId, config: { id: itemId, address, type: "Text", name: "n7" }, body: "content" },
      ctx(repo)
    );

    const deleteResult = await executeCpMutationWithHistoryPostgres(randomUUID(), { kind: "delete", itemId }, ctx(repo));

    expect(deleteResult.item).toBeNull();
    expect(deleteResult.historyRow.operationType).toBe("delete");
    expect(deleteResult.historyRow.version).toBe(2);
    expect(deleteResult.historyRow.afterHash).toBeNull();
    expect(deleteResult.historyRow.beforeHash).toBe(insertResult.historyRow.afterHash);
    expect(deleteResult.historyRow.beforeSnapshot).toEqual({
      config: insertResult.item!.config,
      body: insertResult.item!.body,
    });

    await withPostgresClient(async (client) => {
      const { rows } = await client.query("SELECT * FROM cp_items WHERE id = $1", [itemId]);
      expect(rows).toHaveLength(0);
    });
  });

  it("a second delete of the same item does not fabricate a duplicate event", async () => {
    const repo = freshRepo();
    const itemId = randomUUID();
    const address = `${repo}/08`;
    await executeCpMutationWithHistoryPostgres(
      randomUUID(),
      { kind: "put", itemId, config: { id: itemId, address, type: "Text", name: "n8" }, body: "x" },
      ctx(repo)
    );
    await executeCpMutationWithHistoryPostgres(randomUUID(), { kind: "delete", itemId }, ctx(repo));

    await expect(
      executeCpMutationWithHistoryPostgres(randomUUID(), { kind: "delete", itemId }, ctx(repo))
    ).rejects.toBeInstanceOf(CpItemAlreadyDeletedError);

    await withPostgresClient(async (client) => {
      const { rows } = await client.query("SELECT count(*) FROM cp_history WHERE source_id = $1", [itemId]);
      expect(Number(rows[0].count)).toBe(2);
    });
  });
});

describe("executeCpMutationWithHistoryPostgres — atomicity", () => {
  it("reusing a mutationId for a different item is rejected, never silently treated as an idempotent replay of the wrong item", async () => {
    const repo = freshRepo();
    const firstId = randomUUID();
    const mutationId = randomUUID();
    await executeCpMutationWithHistoryPostgres(
      mutationId,
      { kind: "put", itemId: firstId, config: { id: firstId, address: `${repo}/09b`, type: "Text", name: "first" }, body: "x" },
      ctx(repo)
    );

    const secondId = randomUUID();
    await expect(
      executeCpMutationWithHistoryPostgres(
        mutationId,
        { kind: "put", itemId: secondId, config: { id: secondId, address: `${repo}/09c`, type: "Text", name: "second" }, body: "y" },
        ctx(repo)
      )
    ).rejects.toBeInstanceOf(CpMutationIdReusedError);

    await withPostgresClient(async (client) => {
      const { rows } = await client.query("SELECT * FROM cp_items WHERE id = $1", [secondId]);
      expect(rows).toHaveLength(0);
    });
  });

  it("a forced cp_items write failure (address conflict) creates no history row for the failed mutationId", async () => {
    const repo = freshRepo();
    const address = `${repo}/10`;
    const firstId = randomUUID();
    await executeCpMutationWithHistoryPostgres(
      randomUUID(),
      { kind: "put", itemId: firstId, config: { id: firstId, address, type: "Text", name: "n10" }, body: "first" },
      ctx(repo)
    );

    const secondId = randomUUID();
    const mutationId = randomUUID();
    await expect(
      executeCpMutationWithHistoryPostgres(
        mutationId,
        { kind: "put", itemId: secondId, config: { id: secondId, address, type: "Text", name: "n10-conflict" }, body: "second" },
        ctx(repo)
      )
    ).rejects.toThrow();

    await withPostgresClient(async (client) => {
      const { rows } = await client.query("SELECT * FROM cp_history WHERE mutation_id = $1", [mutationId]);
      expect(rows).toHaveLength(0);
      const { rows: forSecond } = await client.query("SELECT * FROM cp_history WHERE source_id = $1", [secondId]);
      expect(forSecond).toHaveLength(0);
    });
  });
});

describe("executeCpMutationWithHistoryPostgres — idempotency and concurrency", () => {
  it("retrying the same mutationId twice produces exactly one row and one version", async () => {
    const repo = freshRepo();
    const itemId = randomUUID();
    const address = `${repo}/11`;
    const mutationId = randomUUID();
    const input = { kind: "put" as const, itemId, config: { id: itemId, address, type: "Text", name: "n11" }, body: "x" };

    const first = await executeCpMutationWithHistoryPostgres(mutationId, input, ctx(repo));
    const retry = await executeCpMutationWithHistoryPostgres(mutationId, input, ctx(repo));

    expect(retry.idempotentReplay).toBe(true);
    expect(retry.historyRow.mutationId).toBe(first.historyRow.mutationId);
    expect(retry.historyRow.version).toBe(first.historyRow.version);

    await withPostgresClient(async (client) => {
      const { rows } = await client.query("SELECT count(*) FROM cp_history WHERE source_id = $1", [itemId]);
      expect(Number(rows[0].count)).toBe(1);
    });
  });

  it("two concurrent updates to the same item never produce the same version (row lock serializes them)", async () => {
    const repo = freshRepo();
    const itemId = randomUUID();
    const address = `${repo}/12`;
    await executeCpMutationWithHistoryPostgres(
      randomUUID(),
      { kind: "put", itemId, config: { id: itemId, address, type: "Text", name: "n12" }, body: "base" },
      ctx(repo)
    );

    const [a, b] = await Promise.all([
      executeCpMutationWithHistoryPostgres(
        randomUUID(),
        { kind: "put", itemId, config: { id: itemId, address, type: "Text", name: "n12" }, body: "from-a" },
        ctx(repo, { actor: { username: "alice", repoGuid: repo } })
      ),
      executeCpMutationWithHistoryPostgres(
        randomUUID(),
        { kind: "put", itemId, config: { id: itemId, address, type: "Text", name: "n12" }, body: "from-b" },
        ctx(repo, { actor: { username: "bob", repoGuid: repo } })
      ),
    ]);

    expect(a.historyRow.version).not.toBe(b.historyRow.version);
    expect([a.historyRow.version, b.historyRow.version].sort()).toEqual([2, 3]);

    await withPostgresClient(async (client) => {
      const { rows } = await client.query("SELECT count(*) FROM cp_history WHERE source_id = $1", [itemId]);
      expect(Number(rows[0].count)).toBe(3);
    });
  });
});

describe("cp_history immutability", () => {
  it("rejects UPDATE and DELETE against cp_history at the database level", async () => {
    const repo = freshRepo();
    const itemId = randomUUID();
    const address = `${repo}/13`;
    const result = await executeCpMutationWithHistoryPostgres(
      randomUUID(),
      { kind: "put", itemId, config: { id: itemId, address, type: "Text", name: "n13" }, body: "x" },
      ctx(repo)
    );

    await withPostgresClient(async (client) => {
      await expect(client.query("UPDATE cp_history SET version = 999 WHERE mutation_id = $1", [result.historyRow.mutationId])).rejects.toThrow();
      await expect(client.query("DELETE FROM cp_history WHERE mutation_id = $1", [result.historyRow.mutationId])).rejects.toThrow();
    });
  });
});
