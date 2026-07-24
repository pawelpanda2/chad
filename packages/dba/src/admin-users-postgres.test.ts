/**
 * Story 81 — Postgres-primary login path: `getUsersListBody()` reads
 * `chad_admin/users/users-list` via the data router (same path login uses).
 * Regression for the incident where QNAP TEST cut over to Postgres before
 * chad_admin was migrated — users-list returned null, login and
 * resolveCurrentUser() both failed ("not authenticated" on save).
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.POSTGRES_URI =
  process.env.POSTGRES_URI ?? "postgres://chad:chad@localhost:5433/chad_test_story80_mutate";
process.env.DBA_PRIMARY_BACKEND = "postgres";
process.env.DBA_POSTGRES_ENABLED = "true";
process.env.DBA_MONGO_ENABLED = "false";
process.env.DBA_CONTENT_PROVIDER_ENABLED = "false";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { withPostgresClient, closePostgresConnection } from "./postgres.js";
import { CHAD_ADMIN_REPO_GUID, getUsersListBody } from "./admin-users.js";
import { getPostgresProvider } from "./data-router-instance.js";
import { assertRepoAllowlisted, RepoNotAllowlistedError } from "./data-providers/repo-allowlist-guard.js";
import { runWithRepoContext } from "./repo-context.js";

const TEST3_GUID = "5a9c8b7d-6e5f-4a3b-2c1d-0e9f8a7b6c5d";
const ORIGINAL_ALLOWLIST = process.env.DBA_POSTGRES_REPO_ALLOWLIST;

async function ensureSchema(): Promise<void> {
  await withPostgresClient(async (client) => {
    const { rows } = await client.query("SELECT to_regclass('cp_items') AS reg");
    if (rows[0].reg) return;
    const sqlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "sql", "migrations", "0001_init.sql");
    const sql = await readFile(sqlPath, "utf8");
    await client.query(sql);
  });
}

async function seedChadAdminUsersList(): Promise<void> {
  const provider = getPostgresProvider();
  const rootId = CHAD_ADMIN_REPO_GUID;
  const usersFolderId = randomUUID();
  const listId = randomUUID();
  const now = new Date().toISOString();

  await provider.executeWrite({
    kind: "put-item",
    operationId: randomUUID(),
    createdAt: now,
    actor: null,
    item: {
      _id: rootId,
      config: { id: rootId, address: CHAD_ADMIN_REPO_GUID, type: "Folder", name: "chad_admin" },
      body: "",
    },
  });
  await provider.executeWrite({
    kind: "put-item",
    operationId: randomUUID(),
    createdAt: now,
    actor: null,
    item: {
      _id: usersFolderId,
      config: {
        id: usersFolderId,
        address: `${CHAD_ADMIN_REPO_GUID}/01`,
        type: "Folder",
        name: "users",
      },
      body: "",
    },
  });
  await provider.executeWrite({
    kind: "put-item",
    operationId: randomUUID(),
    createdAt: now,
    actor: null,
    item: {
      _id: listId,
      config: {
        id: listId,
        address: `${CHAD_ADMIN_REPO_GUID}/01/01`,
        type: "Text",
        name: "users-list",
      },
      body: "users:\n  - repoGuid: abcd-0000\n    username: testuser\n    email: t@example.com\n    passwordHash: x\n    createdAt: \"2026-01-01\"\n    updatedAt: \"2026-01-01\"\n",
    },
  });
}

beforeAll(async () => {
  await ensureSchema();
  process.env.DBA_POSTGRES_REPO_ALLOWLIST = `${TEST3_GUID},${CHAD_ADMIN_REPO_GUID}`;
  await seedChadAdminUsersList();
});

afterAll(async () => {
  if (ORIGINAL_ALLOWLIST === undefined) delete process.env.DBA_POSTGRES_REPO_ALLOWLIST;
  else process.env.DBA_POSTGRES_REPO_ALLOWLIST = ORIGINAL_ALLOWLIST;
  await closePostgresConnection();
});

describe("admin-users against Postgres primary (Story 81 login regression)", () => {
  it("getUsersListBody returns the users-list YAML when chad_admin is in Postgres", async () => {
    const body = await getUsersListBody();
    expect(body).toContain("users:");
    expect(body).toContain("testuser");
  });

  it("allowlist rejects writes for repos outside test3/chad_admin", () => {
    expect(() => assertRepoAllowlisted(TEST3_GUID)).not.toThrow();
    expect(() => assertRepoAllowlisted(CHAD_ADMIN_REPO_GUID)).not.toThrow();
    let thrown: unknown;
    try {
      assertRepoAllowlisted("00000000-0000-0000-0000-000000000001");
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(RepoNotAllowlistedError);
  });

  it("login read path is not blocked by allowlist — getUsersListBody works before any user session exists", async () => {
    delete process.env.DBA_POSTGRES_REPO_ALLOWLIST;
    const body = await getUsersListBody();
    expect(body).toContain("testuser");
    process.env.DBA_POSTGRES_REPO_ALLOWLIST = `${TEST3_GUID},${CHAD_ADMIN_REPO_GUID}`;
  });

  it("non-allowlisted repo write is rejected while allowlist is active", async () => {
    const rogue = randomUUID();
    const provider = getPostgresProvider();
    await expect(
      runWithRepoContext({ repoGuid: rogue, username: "rogue" }, () =>
        provider.executeWrite({
          kind: "put-item",
          operationId: randomUUID(),
          createdAt: new Date().toISOString(),
          actor: null,
          item: {
            _id: rogue,
            config: { id: rogue, address: rogue, type: "Folder", name: "rogue" },
            body: "",
          },
        })
      )
    ).rejects.toBeInstanceOf(RepoNotAllowlistedError);
  });
});
