/**
 * Real-Postgres integration test for Story 99's CP write paths
 * (msg-workout-linking.ts / msg-workout-proposals.ts) — throwaway
 * repoGuids against the same local test Postgres every other
 * `*-postgres.test.ts` file in this package already uses (never the real
 * shared QNAP Postgres, never a real user's repoGuid).
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.POSTGRES_URI = process.env.POSTGRES_URI ?? "postgres://chad:chad@localhost:5433/chad_test_story80_mutate";
process.env.DBA_PRIMARY_BACKEND = "postgres";
process.env.DBA_POSTGRES_ENABLED = "true";
process.env.DBA_MONGO_ENABLED = "false";
process.env.DBA_CONTENT_PROVIDER_ENABLED = "false";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { withPostgresClient, closePostgresConnection } from "./postgres.js";
import { runWithRepoContext } from "./repo-context.js";
import { findOrCreateFolderChain, createOrGetChild, getItemByAddress } from "./item-ops.js";
import { getMsgWorkoutBeeperLink, getMsgWorkoutLinkEligibility, writeMsgWorkoutBeeperLink } from "./msg-workout-linking.js";
import {
  getExistingProposal,
  hasExistingProposal,
  listProposalsForLead,
  parseProposalBody,
  writeProposal,
  type MsgWorkoutProposal,
} from "./msg-workout-proposals.js";

async function ensureSchema(): Promise<void> {
  await withPostgresClient(async (client) => {
    const { rows } = await client.query("SELECT to_regclass('cp_items') AS reg");
    if (rows[0].reg) return;
    const sqlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "sql", "migrations", "0001_init.sql");
    const sql = await readFile(sqlPath, "utf8");
    await client.query(sql);
  });
}

beforeAll(async () => {
  await ensureSchema();
});

afterAll(async () => {
  await closePostgresConnection();
});

function samplePlan(): MsgWorkoutProposal {
  return {
    lead: "story99-test-lead",
    msgWorkoutItemId: "placeholder",
    msgWorkoutItemName: "26-08-01b",
    status: "proposed",
    analyzedAt: "2026-08-01T14:20:00.000Z",
    reason: { type: "fuzzy-only", summary: "No exact text+direction match." },
    candidates: [
      {
        messageId: "abc123",
        timestamp: "2026-08-01T14:16:00.000Z",
        direction: "she",
        confidence: 0.87,
        reasons: ["same-day", "text-similarity:0.9"],
        textSnippet: "hej, jak mija dzień?",
      },
    ],
  };
}

describe("msg-workout-linking.ts — config.links.beeper against real Postgres (Story 99)", () => {
  it("write -> read -> idempotent second write preserves other config keys and never overwrites", async () => {
    const repoGuid = randomUUID();
    await runWithRepoContext({ repoGuid, username: "story99-test" }, async () => {
      const leadFolder = await findOrCreateFolderChain(["leads", "all items", "story99-test-lead", "msg workout"]);
      const workout = await createOrGetChild(leadFolder, "26-08-01b", "Text", "p1_she; hej, jak mija dzień?");

      expect(getMsgWorkoutBeeperLink(workout)).toBeNull();
      expect(getMsgWorkoutLinkEligibility(workout, false)).toBe("eligible");

      const linked = await writeMsgWorkoutBeeperLink(workout, { messageId: "msg-abc-123", timestamp: "2026-08-01T14:16:00.000Z" });
      const link = getMsgWorkoutBeeperLink(linked);
      expect(link?.messageId).toBe("msg-abc-123");
      expect(link?.timestamp).toBe("2026-08-01T14:16:00.000Z");
      expect(link?.method).toBe("automatic");
      expect(typeof link?.linkedAt).toBe("string");

      // Re-fetch from Postgres directly (not the in-memory `linked` object) — proves the write actually persisted, not just returned.
      const refetched = await getItemByAddress(workout.config.address);
      expect(getMsgWorkoutBeeperLink(refetched!)?.messageId).toBe("msg-abc-123");
      expect(getMsgWorkoutLinkEligibility(refetched!, false)).toBe("already-linked");
      // Body untouched by the config-only write.
      expect(refetched!.body).toBe("p1_she; hej, jak mija dzień?");

      // Idempotent rerun: a different messageId must NOT overwrite the existing link.
      const secondAttempt = await writeMsgWorkoutBeeperLink(refetched!, { messageId: "msg-DIFFERENT", timestamp: "2026-08-01T15:00:00.000Z" });
      expect(getMsgWorkoutBeeperLink(secondAttempt)?.messageId).toBe("msg-abc-123");
    });
  });

  it("writing links.beeper preserves unrelated existing config.links.* entries", async () => {
    const repoGuid = randomUUID();
    await runWithRepoContext({ repoGuid, username: "story99-test" }, async () => {
      const leadFolder = await findOrCreateFolderChain(["leads", "all items", "other-lead", "msg workout"]);
      const workout = await createOrGetChild(leadFolder, "26-08-02", "Text", "some text");
      const withOtherLink = { ...workout, config: { ...workout.config, links: { somethingElse: { foo: "bar" } } } };

      const linked = await writeMsgWorkoutBeeperLink(withOtherLink, { messageId: "msg-1", timestamp: "2026-08-02T10:00:00.000Z" });
      const links = linked.config.links as Record<string, unknown>;
      expect(links.somethingElse).toEqual({ foo: "bar" });
      expect((links.beeper as { messageId: string }).messageId).toBe("msg-1");
    });
  });
});

describe("msg-workout-proposals.ts — links/msg workout/<lead> proposal tree against real Postgres (Story 99)", () => {
  it("write -> read -> rerun never duplicates the same workout's proposal item", async () => {
    const repoGuid = randomUUID();
    await runWithRepoContext({ repoGuid, username: "story99-test" }, async () => {
      expect(await hasExistingProposal("story99-test-lead", "26-08-01b")).toBe(false);
      expect(await getExistingProposal("story99-test-lead", "26-08-01b")).toBeNull();

      const proposal = samplePlan();
      const created = await writeProposal("story99-test-lead", "26-08-01b", proposal);
      expect(created.config.name).toBe("26-08-01b");

      const roundTripped = parseProposalBody(created.body);
      expect(roundTripped?.status).toBe("proposed");
      expect(roundTripped?.reason.type).toBe("fuzzy-only");
      expect(roundTripped?.candidates).toHaveLength(1);
      expect(roundTripped?.candidates[0].messageId).toBe("abc123");

      expect(await hasExistingProposal("story99-test-lead", "26-08-01b")).toBe(true);

      // Rerun with a different proposal payload must NOT overwrite the existing one (spec 1.6/1.7).
      const differentAttempt: MsgWorkoutProposal = { ...proposal, status: "accepted", candidates: [] };
      const secondWrite = await writeProposal("story99-test-lead", "26-08-01b", differentAttempt);
      const stillOriginal = parseProposalBody(secondWrite.body);
      expect(stillOriginal?.status).toBe("proposed");
      expect(stillOriginal?.candidates).toHaveLength(1);

      const list = await listProposalsForLead("story99-test-lead");
      expect(list.filter((p) => p.name === "26-08-01b")).toHaveLength(1);
    });
  });

  it("a lead with no proposals yet never gets an empty links/msg workout/<lead> folder created by a read", async () => {
    const repoGuid = randomUUID();
    await runWithRepoContext({ repoGuid, username: "story99-test" }, async () => {
      expect(await getExistingProposal("never-analyzed-lead", "26-08-01")).toBeNull();
      expect(await listProposalsForLead("never-analyzed-lead")).toEqual([]);
    });
  });
});

describe("cross-user isolation (Story 99, spec 2.7) — two throwaway repoGuids never see each other's proposals/links", () => {
  it("the same lead+workout name in two different repos are completely separate items", async () => {
    const repoGuidA = randomUUID();
    const repoGuidB = randomUUID();

    await runWithRepoContext({ repoGuid: repoGuidA, username: "story99-test-a" }, async () => {
      await writeProposal("shared-lead-name", "26-08-01", samplePlan());
    });

    await runWithRepoContext({ repoGuid: repoGuidB, username: "story99-test-b" }, async () => {
      expect(await hasExistingProposal("shared-lead-name", "26-08-01")).toBe(false);
      expect(await listProposalsForLead("shared-lead-name")).toEqual([]);
    });

    await runWithRepoContext({ repoGuid: repoGuidA, username: "story99-test-a" }, async () => {
      expect(await hasExistingProposal("shared-lead-name", "26-08-01")).toBe(true);
    });
  });
});
