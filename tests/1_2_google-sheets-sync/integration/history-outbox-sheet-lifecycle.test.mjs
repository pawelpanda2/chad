// 2026-07-28 audit, section 6.2 — for a single test3-owned record (created
// by this test, never pawel_f/kamil_s/manually-created data): verifies
// create -> history -> outbox -> synced, update -> history -> outbox ->
// synced, delete -> history -> outbox -> synced, at every step confirming
// one history entry, a real (non-lost) outbox job, and never a
// "lost_outbox"/no-sync-yet gap for a record that should sync.
//
// Runs against the real, already-running QNAP TEST deployment, as test3 —
// only ever touches the one record this test itself creates, then deletes
// it at the end (test3's own "only data created by this test" scope).
import { describe, it, expect, afterAll } from "vitest";
import { loadQnapEnv, getTest3Password, QNAP_TEST_BASE_URL } from "../../support/database/qnap-env.mjs";
import { classifyOutboxState } from "../../support/google-sheets/reconciliation.mjs";

loadQnapEnv();

const { listCpHistory, getItemByAddress, getLatestGoogleSheetsJobForRecordKey, closePostgresConnection } = await import(
  "../../../packages/dba/dist/index.js"
);
const { TEST3_REPO_GUID, assertTest3Scoped } = await import("../../../packages/dba/dist/testing/test3-guard.js");

async function loginAsTest3() {
  const res = await fetch(`${QNAP_TEST_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "test3", password: getTest3Password() }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  return setCookie.split(";")[0];
}

async function pollUntil(fn, { timeoutMs = 20_000, intervalMs = 500 } = {}) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return last;
}

let qnapReachable = false;
let sessionCookie = null;
try {
  const probe = await fetch(`${QNAP_TEST_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(5000),
  });
  qnapReachable = probe.status !== undefined;
} catch {
  qnapReachable = false;
}
if (qnapReachable) sessionCookie = await loginAsTest3();

async function authedFetch(path, init = {}) {
  return fetch(`${QNAP_TEST_BASE_URL}${path}`, { ...init, headers: { ...(init.headers || {}), Cookie: sessionCookie } });
}

afterAll(async () => {
  await closePostgresConnection().catch(() => {});
});

describe.skipIf(!qnapReachable)("History <-> outbox <-> Sheet lifecycle (test3, own data only)", () => {
  it("create -> update -> delete: each step gets exactly one history entry and a real (non-lost) outbox job", async () => {
    const marker = `story-audit-lifecycle-${Date.now()}`;

    // --- CREATE ---
    const createRes = await authedFetch("/api/forms/date-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ DATA: "2026-06-01", MARKER: marker }),
    });
    const created = await createRes.json();
    expect(created.success).toBe(true);
    assertTest3Scoped(`${TEST3_REPO_GUID}/${created.loca}`);
    const address = `${TEST3_REPO_GUID}/${created.loca}`;
    const recordKey = `${TEST3_REPO_GUID}:${created.loca}`;

    // sourceId (the cp_items row's own id) is fresh per item even if its
    // loca slot was previously used-then-deleted by an earlier test run —
    // filtering cp_history by sourceId (not just address) is what makes
    // this assertion correct even in a repeatedly-run/shared test3 repo.
    const item = await getItemByAddress(address);
    const sourceId = item.config.id;

    const afterCreateHistory = await listCpHistory({ repoGuid: TEST3_REPO_GUID, sourceId });
    const insertEntries = afterCreateHistory.items.filter((h) => h.operationType === "insert");
    expect(insertEntries.length, "exactly one insert history entry after create").toBe(1);

    const createJob = await pollUntil(() => getLatestGoogleSheetsJobForRecordKey(recordKey));
    expect(createJob, "create must produce a real outbox job, not a lost one").not.toBeNull();
    expect(classifyOutboxState({ hasHistory: true, job: createJob })).not.toBe("lost_outbox");
    const createSynced = await pollUntil(async () => {
      const job = await getLatestGoogleSheetsJobForRecordKey(recordKey);
      return job?.status === "synced" ? job : null;
    });
    expect(createSynced, "create job must reach synced status").not.toBeNull();

    // --- UPDATE ---
    const updateRes = await authedFetch("/api/forms/date-entry", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loca: created.loca, fields: { DATA: "2026-06-01", MARKER: marker, "ŹRÓDŁO": "audit" } }),
    });
    const updated = await updateRes.json();
    expect(updated.success).toBe(true);

    const afterUpdateHistory = await listCpHistory({ repoGuid: TEST3_REPO_GUID, sourceId });
    const updateEntries = afterUpdateHistory.items.filter((h) => h.operationType === "update");
    expect(updateEntries.length, "exactly one update history entry after PATCH").toBe(1);

    const updateSynced = await pollUntil(async () => {
      const job = await getLatestGoogleSheetsJobForRecordKey(recordKey);
      return job?.status === "synced" && job.updatedAt !== createSynced.updatedAt ? job : null;
    });
    expect(updateSynced, "update job must reach synced status").not.toBeNull();

    // --- DELETE ---
    const delRes = await authedFetch(`/api/forms/date-entry?loca=${encodeURIComponent(created.loca)}`, { method: "DELETE" });
    const delResult = await delRes.json();
    expect(delResult.success).toBe(true);

    const afterDeleteHistory = await listCpHistory({ repoGuid: TEST3_REPO_GUID, sourceId });
    const deleteEntries = afterDeleteHistory.items.filter((h) => h.operationType === "delete");
    expect(deleteEntries.length, "exactly one delete history entry after DELETE").toBe(1);

    const deleteSynced = await pollUntil(async () => {
      const job = await getLatestGoogleSheetsJobForRecordKey(recordKey);
      return job?.status === "synced" && job.kind === "delete" ? job : null;
    });
    expect(deleteSynced, "delete job must reach synced status (tombstone written)").not.toBeNull();
  }, 60_000);
});
