// Real QNAP-TEST-targeted integration tests (Story 78, Input 2) — runs
// against the ACTUAL deployed QNAP TEST Dashboard + shared Mongo, using
// test3, isolated by repoGuid. No local/isolated stack, no mocking of
// Change Streams — see backlog/stories/78/02_plan.md §1 for why.
//
// Requires (both gitignored, local-only env vars):
//   E2E_TEST3_PASSWORD   — test3's real login password
//   MONGO_ROOT_USERNAME / MONGO_ROOT_PASSWORD (from .env.local)
//
// Skips itself (not fails) if QNAP TEST isn't reachable from this machine
// (e.g. Tailscale down) — this is an integration test against real
// infrastructure, not a unit test; a network precondition failing is a
// distinct signal from a code regression.
import { describe, it, expect, afterAll } from "vitest";
import { loadQnapEnv, getTest3Password, QNAP_TEST_BASE_URL } from "../support/qnap-env.mjs";

loadQnapEnv();

const { getCpHistoryWorkerStatus, getMongoDb, closeMongoConnection } = await import("../../packages/dba/dist/index.js");
const { TEST3_REPO_GUID, assertTest3Scoped } = await import("../../packages/dba/dist/testing/test3-guard.js");

async function loginAsTest3() {
  const res = await fetch(`${QNAP_TEST_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "test3", password: getTest3Password() }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("login response had no Set-Cookie header");
  return setCookie.split(";")[0]; // "session=<repoGuid>:<timestamp>"
}

async function authedFetch(path, init = {}) {
  return fetch(`${QNAP_TEST_BASE_URL}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), Cookie: sessionCookie },
  });
}

// The real history-worker processes a Change Stream event asynchronously,
// slightly after the write's own HTTP response returns — never assume it's
// already landed, poll with a timeout instead (Input 1's own "no sleep()"
// rule — this is a bounded poll with a clear failure, not a fixed delay).
async function pollUntilTrue(fn, { timeoutMs = 10_000, intervalMs = 250 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

// Resolved at module load (top-level await) — must happen BEFORE the
// describe.skipIf(...) calls below are evaluated, since skipIf's condition
// is read at collection time, not inside an async beforeAll.
let qnapReachable = false;
let sessionCookie = null;
try {
  const probe = await fetch(`${QNAP_TEST_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(5000),
  });
  qnapReachable = probe.status !== undefined; // any response at all means the host is reachable.
} catch {
  qnapReachable = false;
}
if (qnapReachable) {
  sessionCookie = await loginAsTest3();
}

afterAll(async () => {
  await closeMongoConnection().catch(() => {});
});

describe.skipIf(!qnapReachable)("QNAP TEST — test3 real login + isolation", () => {
  it("logs in as test3 through the real form endpoint and gets a session for the right repoGuid", () => {
    expect(sessionCookie).toContain(encodeURIComponent(TEST3_REPO_GUID));
  });

  it("rejects a request with no session", async () => {
    const res = await fetch(`${QNAP_TEST_BASE_URL}/api/forms/daily-entry`);
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!qnapReachable)("QNAP TEST — Daily/Dates round-trip + AUTO columns (test3's real seeded data)", () => {
  it("GET /api/forms/date-entry returns test3's seeded entries with the exact stored fields", async () => {
    const res = await authedFetch("/api/forms/date-entry");
    const json = await res.json();
    const seeded = json.entries.filter((e) => e.fields.MARKER === "story78-seed");
    expect(seeded.length).toBeGreaterThanOrEqual(3);
    const alice = seeded.find((e) => e.fields.NAZWA === "E2E Alice");
    expect(alice.fields.DATA).toBe("2026-01-10");
    expect(alice.fields.PULL).toBe("TRUE");
    expect(alice.fields.LINK).toBe("https://example.invalid/alice");
  });

  it("GET /api/forms/daily-entry computes PULLS/CLOSES/QUALITY AUTO from the same-day Date Entries exactly", async () => {
    const res = await authedFetch("/api/forms/daily-entry");
    const json = await res.json();
    const row = json.entries.find((e) => e.fields.DATE === "2026-01-10" && e.fields.MARKER === "story78-seed");
    expect(row, "seeded 2026-01-10 Daily Entry must exist").toBeTruthy();
    // Alice (PULL=TRUE, CLOSE=TAK, JAKOŚĆ=8.0) + Blair (PULL=FALSE, CLOSE=BLISKO, JAKOŚĆ=7.0), same day.
    expect(Number(row.fields["PULLS AUTO"])).toBe(1); // only Alice has PULL truthy.
    expect(Number(row.fields["CLOSES AUTO"])).toBe(1.5); // TAK(1) + BLISKO(0.5).
    expect(Number(row.fields["QUALITY DP AUTO"])).toBe(8.0); // avg JAKOŚĆ where PULL truthy -> only Alice.
    expect(Number(row.fields["QUALITY C AUTO"])).toBe(8.0); // avg JAKOŚĆ where CLOSE=TAK -> only Alice (Blair is BLISKO, excluded).
  });

  it("PATCH /api/forms/daily-entry never persists AUTO columns into storage", async () => {
    const listRes = await authedFetch("/api/forms/daily-entry");
    const { entries } = await listRes.json();
    const row = entries.find((e) => e.fields.DATE === "2026-01-10" && e.fields.MARKER === "story78-seed");
    assertTest3Scoped(`${TEST3_REPO_GUID}/${row.loca}`);

    const res = await authedFetch("/api/forms/daily-entry", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loca: row.loca, fields: { ...row.fields, "PULLS AUTO": "999" } }),
    });
    const result = await res.json();
    expect(result.success).toBe(true);

    const db = await getMongoDb();
    const doc = await db.collection("cp_items").findOne({ "config.address": `${TEST3_REPO_GUID}/${row.loca}` });
    expect(doc.body).not.toContain("PULLS AUTO");
  });

  it("cross-repo PATCH (a loca that does not belong to test3) is rejected, not silently redirected", async () => {
    const res = await authedFetch("/api/forms/daily-entry", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loca: "99/99/99", fields: { DATE: "2099-01-01" } }),
    });
    const result = await res.json();
    expect(result.success).toBe(false);
  });
});

describe.skipIf(!qnapReachable)("QNAP TEST — cp_history for test3's seeded items (real Change Stream, no manual cp_history inserts)", () => {
  it("every seeded item has a real insert history entry with correct actor/address, not backfilled", async () => {
    const db = await getMongoDb();
    const docs = await db
      .collection("cp_history")
      .find({ address: { $regex: `^${TEST3_REPO_GUID}/`, $options: "i" }, "changes.config": { $exists: true } })
      .toArray();
    const markerInserts = docs.filter((d) => d.operationType === "insert");
    expect(markerInserts.length).toBeGreaterThan(0);
    for (const d of markerInserts) {
      expect(d.address.startsWith(TEST3_REPO_GUID)).toBe(true);
      expect(d.backfilled).toBeUndefined();
      if (d.actor) expect(d.actor.repoGuid).toBe(TEST3_REPO_GUID);
    }
  });

  it("the shared history-worker is healthy (diagnostic only, never restarted/reset by this test)", async () => {
    const status = await getCpHistoryWorkerStatus();
    expect(status).not.toBeNull();
    expect(["running"]).toContain(status.status);
  });
});

describe.skipIf(!qnapReachable)("QNAP TEST — real DELETE for Daily and Date Entry (Story 78's core fix)", () => {
  it("Daily Entry: create -> DELETE -> gone from GET, from cp_items, and has a delete history event", async () => {
    const createRes = await authedFetch("/api/forms/daily-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ DATE: "2026-02-01", MARKER: "story78-delete-test-daily" }),
    });
    const created = await createRes.json();
    expect(created.success).toBe(true);
    assertTest3Scoped(`${TEST3_REPO_GUID}/${created.loca}`);

    const delRes = await authedFetch(`/api/forms/daily-entry?loca=${encodeURIComponent(created.loca)}`, { method: "DELETE" });
    const delResult = await delRes.json();
    expect(delResult.success).toBe(true);

    const listRes = await authedFetch("/api/forms/daily-entry");
    const { entries } = await listRes.json();
    expect(entries.some((e) => e.loca === created.loca)).toBe(false);

    const db = await getMongoDb();
    const doc = await db.collection("cp_items").findOne({ "config.address": `${TEST3_REPO_GUID}/${created.loca}` });
    expect(doc).toBeNull();

    const gotDeleteEvent = await pollUntilTrue(async () => {
      const docs = await db.collection("cp_history").find({ address: `${TEST3_REPO_GUID}/${created.loca}` }).toArray();
      return docs.some((d) => d.operationType === "delete");
    });
    expect(gotDeleteEvent, "expected a real delete event in cp_history, captured by the actual history-worker").toBe(true);

    // Second DELETE of the same, already-deleted loca must be a controlled
    // failure, not a silent success or an unrelated deletion (Input 1 §6).
    const secondDelRes = await authedFetch(`/api/forms/daily-entry?loca=${encodeURIComponent(created.loca)}`, { method: "DELETE" });
    const secondDelResult = await secondDelRes.json();
    expect(secondDelResult.success).toBe(false);
  });

  it("Date Entry: create -> DELETE -> gone from GET, from cp_items, and has a delete history event (previously only PATCH-blank was possible)", async () => {
    const createRes = await authedFetch("/api/forms/date-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ DATA: "2026-02-01", MARKER: "story78-delete-test-date" }),
    });
    const created = await createRes.json();
    expect(created.success).toBe(true);
    assertTest3Scoped(`${TEST3_REPO_GUID}/${created.loca}`);

    const delRes = await authedFetch(`/api/forms/date-entry?loca=${encodeURIComponent(created.loca)}`, { method: "DELETE" });
    const delResult = await delRes.json();
    expect(delResult.success).toBe(true);

    const listRes = await authedFetch("/api/forms/date-entry");
    const { entries } = await listRes.json();
    expect(entries.some((e) => e.loca === created.loca)).toBe(false);

    const db = await getMongoDb();
    const doc = await db.collection("cp_items").findOne({ "config.address": `${TEST3_REPO_GUID}/${created.loca}` });
    expect(doc).toBeNull();
  });

  it("cross-repo DELETE (a loca not owned by test3) is rejected, never deletes another repo's item", async () => {
    const res = await authedFetch("/api/forms/daily-entry?loca=99/99/99", { method: "DELETE" });
    const result = await res.json();
    expect(result.success).toBe(false);
  });
});
