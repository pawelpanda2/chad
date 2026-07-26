#!/usr/bin/env node
/**
 * FALLBACK ONLY — seed test3 login when local Postgres has no users-list.
 *
 * Story 89: do NOT invent pawel_f / kamil_s fixture trees. Real users and
 * cp_items come from `sync-local-postgres-from-qnap` (QNAP mirror).
 * Automated tests and disposable mutations use test3 only.
 *
 *   POSTGRES_URI=postgres://chad:…@127.0.0.1:5433/chad \
 *     node packages/dba/scripts/seed-local-postgres-login.mjs
 */

process.env.DBA_PRIMARY_BACKEND = "postgres";
process.env.DBA_POSTGRES_ENABLED = "true";
process.env.DBA_MONGO_ENABLED = "false";
process.env.DBA_CONTENT_PROVIDER_ENABLED = "false";
delete process.env.DBA_POSTGRES_REPO_ALLOWLIST;

const CHAD_ADMIN = "0fc7da8d-3466-4964-a24c-dfc0d0fef87c";
const TEST3 = "5a9c8b7d-6e5f-4a3b-2c1d-0e9f8a7b6c5d";

/** bcryptjs hash of "changeme" (cost 10). */
const CHANGEME_HASH = "$2b$10$gHnigSY24c/65eIL3WRl8eD8MVAgfcQTx6MleHxItW5g.4K4FsNGm";

const USERS_YAML = `users:
  - repoGuid: "${TEST3}"
    username: test3
    email: test3@localhost
    passwordHash: "${CHANGEME_HASH}"
    createdAt: "2026-07-25T00:00:00.000Z"
    updatedAt: "2026-07-25T00:00:00.000Z"
`;

async function main() {
  if (!process.env.POSTGRES_URI) {
    console.error("[seed-local-login] POSTGRES_URI is required");
    process.exitCode = 1;
    return;
  }

  const { getUsersListBody } = await import("../dist/admin-users.js");
  const { runWithRepoContext } = await import("../dist/repo-context.js");
  const { putItem, createOrGetChild, getItemByAddress, putItemBody } = await import(
    "../dist/item-ops.js"
  );
  const { closePostgresConnection } = await import("../dist/postgres.js");

  const existing = await getUsersListBody();
  if (existing && existing.includes("username:")) {
    console.log(
      "[seed-local-login] users-list already present (use QNAP sync for real users) — OK"
    );
    await closePostgresConnection();
    return;
  }

  console.log("[seed-local-login] empty users-list — seeding FALLBACK test3 only");

  await runWithRepoContext({ repoGuid: CHAD_ADMIN, username: "chad_admin" }, async () => {
    let root = await getItemByAddress(CHAD_ADMIN);
    if (!root) {
      root = await putItem({
        _id: CHAD_ADMIN,
        config: {
          id: CHAD_ADMIN,
          address: CHAD_ADMIN,
          type: "Folder",
          name: "chad_admin",
        },
        body: "",
      });
    }
    const usersFolder = await createOrGetChild(root, "users", "Folder");
    const listItem = await createOrGetChild(usersFolder, "users-list", "Text", "");
    await putItemBody(listItem.config.address, USERS_YAML);
  });

  await runWithRepoContext({ repoGuid: TEST3, username: "test3" }, async () => {
    const root = await getItemByAddress(TEST3);
    if (!root) {
      await putItem({
        _id: TEST3,
        config: { id: TEST3, address: TEST3, type: "Folder", name: "chad_test3" },
        body: "",
      });
    }
  });

  const body = await getUsersListBody();
  if (!body?.includes("test3")) {
    throw new Error("seed verification failed — test3 missing");
  }
  console.log("[seed-local-login] DONE — fallback user: test3 / changeme (prefer QNAP sync)");
  await closePostgresConnection();
}

main().catch(async (err) => {
  console.error("[seed-local-login] FATAL:", err instanceof Error ? err.message : err);
  try {
    const { closePostgresConnection } = await import("../dist/postgres.js");
    await closePostgresConnection();
  } catch {
    /* ignore */
  }
  process.exitCode = 1;
});
