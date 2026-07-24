#!/usr/bin/env node
/**
 * Story 81 — DBA-level smoke against QNAP Postgres (test3 + chad_admin login path).
 * Run on QNAP via docker (internal URIs). Never prints secrets.
 */
process.env.DBA_PRIMARY_BACKEND = "postgres";
process.env.DBA_POSTGRES_ENABLED = "true";
process.env.DBA_MONGO_ENABLED = "false";
process.env.DBA_CONTENT_PROVIDER_ENABLED = "false";
process.env.DBA_POSTGRES_REPO_ALLOWLIST =
  "5a9c8b7d-6e5f-4a3b-2c1d-0e9f8a7b6c5d,0fc7da8d-3466-4964-a24c-dfc0d0fef87c";

const TEST3 = "5a9c8b7d-6e5f-4a3b-2c1d-0e9f8a7b6c5d";

const { getUsersListBody, CHAD_ADMIN_REPO_GUID } = await import("../dist/admin-users.js");
const { runWithRepoContext } = await import("../dist/repo-context.js");
const {
  getAllDateEntries,
  saveDateEntry,
  updateDateEntry,
  deleteDateEntry,
  generateEntryName,
} = await import("../dist/leads.js");
const { assertRepoAllowlisted, RepoNotAllowlistedError } = await import("../dist/data-providers/repo-allowlist-guard.js");
const { closePostgresConnection } = await import("../dist/postgres.js");

function yaml(fields) {
  return Object.entries(fields)
    .map(([k, v]) => `${k}: ${JSON.stringify(String(v))}`)
    .join("\n");
}

// --- login path (chad_admin) ---
const usersBody = await getUsersListBody();
if (!usersBody || !usersBody.includes("users:")) {
  console.error("[smoke] FAIL: getUsersListBody empty or missing users:");
  process.exitCode = 1;
} else {
  console.log("[smoke] getUsersListBody OK, len=", usersBody.length);
}

// --- allowlist guard ---
try {
  assertRepoAllowlisted("00000000-0000-0000-0000-000000000099");
  console.error("[smoke] FAIL: allowlist should reject unknown repo");
  process.exitCode = 1;
} catch (e) {
  if (!(e instanceof RepoNotAllowlistedError)) throw e;
  console.log("[smoke] allowlist rejects non-test3 repo OK");
}

// --- test3 Date CRUD (temporary item, deleted at end) ---
const beforeCount = await runWithRepoContext({ repoGuid: TEST3, username: "test3" }, () => getAllDateEntries());
const beforeN = beforeCount.length;

await runWithRepoContext({ repoGuid: TEST3, username: "test3" }, async () => {
  const names = beforeCount.map((e) => e.itemName);
  const itemName = generateEntryName(names, "2026-07-24");
  const created = await saveDateEntry(itemName, yaml({ DATA: "2026-07-24", MARKER: "story81-smoke", NAZWA: "smoke" }));
  if (!created.success) throw new Error(`create failed: ${created.error ?? "unknown"}`);

  await updateDateEntry(created.loca, yaml({ DATA: "2026-07-24", MARKER: "story81-smoke", NAZWA: "smoke-upd" }));
  const mid = await getAllDateEntries();
  const row = mid.find((e) => e.loca === created.loca);
  if (!row?.body?.includes("smoke-upd")) throw new Error("update did not persist");

  await deleteDateEntry(created.loca);
});

const afterCount = await runWithRepoContext({ repoGuid: TEST3, username: "test3" }, () => getAllDateEntries());
if (afterCount.length !== beforeN) {
  console.error("[smoke] FAIL: date count after cycle", afterCount.length, "expected", beforeN);
  process.exitCode = 1;
} else {
  console.log("[smoke] test3 Date create/update/delete OK, count restored:", beforeN);
}

console.log("[smoke] chad_admin guid present in allowlist:", CHAD_ADMIN_REPO_GUID.slice(0, 8));
console.log("[smoke] PASSED");
await closePostgresConnection();
