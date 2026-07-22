/**
 * Real-Postgres integration tests for the `cp_outbox_data_sync` backend
 * (Story 80) — `FOR UPDATE SKIP LOCKED` claim semantics, retry/backoff,
 * and stale-lock recovery. Every test uses its own fresh operationId, so no
 * cleanup between tests is needed (outbox rows, unlike cp_history, are
 * ordinary mutable rows — no immutability trigger applies here).
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.POSTGRES_URI =
  process.env.POSTGRES_URI ?? "postgres://chad:chad@localhost:5433/chad_test_story80_mutate";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { withPostgresClient, closePostgresConnection } from "./postgres.js";
import { createTestClock } from "./data-clock.js";
import * as outbox from "./data-outbox-postgres.js";
import type { DataWriteCommand } from "./data-commands.js";

async function ensureSchema(): Promise<void> {
  await withPostgresClient(async (client) => {
    const { rows } = await client.query("SELECT to_regclass('cp_outbox_data_sync') AS reg");
    if (rows[0].reg) return;
    const sqlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "sql", "migrations", "0001_init.sql");
    const sql = await readFile(sqlPath, "utf8");
    await client.query(sql);
  });
}

function fakeCommand(itemId: string): DataWriteCommand {
  return {
    kind: "put-item",
    operationId: randomUUID(),
    createdAt: new Date().toISOString(),
    actor: null,
    item: { _id: itemId, config: { id: itemId, address: "repo/01", type: "Text", name: "n" }, body: "" },
  };
}

beforeAll(async () => {
  await ensureSchema();
});

afterAll(async () => {
  await withPostgresClient((client) => client.query("TRUNCATE cp_outbox_data_sync"));
  await closePostgresConnection();
});

describe("cp_outbox_data_sync — claim", () => {
  it("enqueue then claim returns the job as pending -> processing", async () => {
    const command = fakeCommand(randomUUID());
    await outbox.enqueueFollowerOperation({ command, primaryBackend: "postgres", followerBackend: "content-provider" });

    const job = await outbox.claimNextJob("worker-1");
    expect(job).not.toBeNull();
    expect(job!.status).toBe("processing");
    expect(job!.lockedBy).toBe("worker-1");
  });

  it("two concurrent claimers never get the same job (FOR UPDATE SKIP LOCKED)", async () => {
    const jobs = await Promise.all(
      Array.from({ length: 6 }, () => {
        const command = fakeCommand(randomUUID());
        return outbox.enqueueFollowerOperation({ command, primaryBackend: "postgres", followerBackend: "content-provider" });
      })
    );
    void jobs;

    const [batchA, batchB] = await Promise.all([
      Promise.all(Array.from({ length: 3 }, () => outbox.claimNextJob("worker-a"))),
      Promise.all(Array.from({ length: 3 }, () => outbox.claimNextJob("worker-b"))),
    ]);

    const claimedIds = [...batchA, ...batchB].filter((j) => j !== null).map((j) => j!._id);
    const distinct = new Set(claimedIds);
    expect(distinct.size).toBe(claimedIds.length); // no duplicates across the two "workers"
  });

  it("enqueueing the same operationId+follower twice is a no-op (idempotent enqueue)", async () => {
    const command = fakeCommand(randomUUID());
    await outbox.enqueueFollowerOperation({ command, primaryBackend: "postgres", followerBackend: "content-provider" });
    await outbox.enqueueFollowerOperation({ command, primaryBackend: "postgres", followerBackend: "content-provider" });

    await withPostgresClient(async (client) => {
      const { rows } = await client.query("SELECT count(*) FROM cp_outbox_data_sync WHERE operation_id = $1", [command.operationId]);
      expect(Number(rows[0].count)).toBe(1);
    });
  });
});

describe("cp_outbox_data_sync — retry/backoff and stale-lock recovery", () => {
  it("markRetry schedules the next attempt per RETRY_BACKOFF_MS and increments attempts", async () => {
    const command = fakeCommand(randomUUID());
    const clock = createTestClock("2026-01-01T00:00:00.000Z");
    await outbox.enqueueFollowerOperation({ command, primaryBackend: "postgres", followerBackend: "content-provider" }, clock);
    const job = await outbox.claimNextJob("worker-1", clock);

    await outbox.markRetry(job!._id, new Error("boom"), clock);

    const after = await outbox.getJob(job!._id);
    expect(after!.status).toBe("retry");
    expect(after!.attempts).toBe(1);
    expect(after!.lastError).toBe("boom");
    expect(new Date(after!.nextAttemptAt).getTime()).toBe(new Date(clock.now()).getTime() + 60_000);
  });

  it("recoverStaleLocks resets a job stuck in processing past STALE_LOCK_MS back to retry", async () => {
    const command = fakeCommand(randomUUID());
    const past = createTestClock("2026-01-01T00:00:00.000Z");
    await outbox.enqueueFollowerOperation({ command, primaryBackend: "postgres", followerBackend: "content-provider" }, past);
    const job = await outbox.claimNextJob("worker-crashed", past);

    // Simulate time passing well beyond STALE_LOCK_MS (10 min) using a
    // clock 20 minutes later for the recovery pass.
    const later = createTestClock("2026-01-01T00:20:00.000Z");
    const recovered = await outbox.recoverStaleLocks(later);
    expect(recovered).toBeGreaterThanOrEqual(1);

    const after = await outbox.getJob(job!._id);
    expect(after!.status).toBe("retry");
    expect(after!.lockedBy).toBeNull();
  });
});
