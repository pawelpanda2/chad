// Unit tests for the pure reconciliation/outbox-classification logic —
// covers the 2026-07-28 audit's controlled-state requirements (missing row
// detection, lost outbox detection, failed job visibility) without needing
// a live worker/race against real infrastructure. The pawel_f Daily bug
// (records with real cp_history but zero outbox job, surfaced as a
// misleading "no sync yet") is exactly what classifyOutboxState's
// "lost_outbox" branch exists to catch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffRecordKeys, classifyOutboxState } from "../../support/google-sheets/reconciliation.mjs";

test("diffRecordKeys: exact match -> no missing/extra/duplicates", () => {
  const result = diffRecordKeys(["r:01", "r:02"], ["r:01", "r:02"]);
  assert.deepEqual(result, { missing: [], extra: [], duplicates: [] });
});

test("diffRecordKeys: missing_in_sheet is detected (controlled state — a record exists in PostgreSQL but not in the Sheet)", () => {
  const result = diffRecordKeys(["r:01", "r:02", "r:03"], ["r:01"]);
  assert.deepEqual(result.missing, ["r:02", "r:03"]);
});

test("diffRecordKeys: extra_in_sheet is detected", () => {
  const result = diffRecordKeys(["r:01"], ["r:01", "r:99"]);
  assert.deepEqual(result.extra, ["r:99"]);
});

test("diffRecordKeys: duplicate recordKey in the Sheet is detected", () => {
  const result = diffRecordKeys(["r:01"], ["r:01", "r:01", "r:01"]);
  assert.deepEqual(result.duplicates, [{ recordKey: "r:01", count: 3 }]);
});

test("classifyOutboxState: record with history and a synced job -> ok_synced", () => {
  assert.equal(classifyOutboxState({ hasHistory: true, job: { status: "synced", lastError: null } }), "ok_synced");
});

test("classifyOutboxState: record with history and a pending/processing job -> ok_pending", () => {
  assert.equal(classifyOutboxState({ hasHistory: true, job: { status: "pending", lastError: null } }), "ok_pending");
  assert.equal(classifyOutboxState({ hasHistory: true, job: { status: "processing", lastError: null } }), "ok_pending");
});

test("classifyOutboxState: failed job stays visible as failed, never masked as no-sync-yet", () => {
  const result = classifyOutboxState({ hasHistory: true, job: { status: "failed", lastError: "429 RESOURCE_EXHAUSTED" } });
  assert.equal(result, "failed_visible");
});

test("classifyOutboxState: real mutation history but zero outbox job ever -> lost_outbox (integrity bug, never a legitimate no-sync-yet)", () => {
  // This is exactly the pawel_f Daily bug shape: cp_history has a real
  // insert entry, but cp_outbox_google_sheets_sync has no matching row at
  // all (0 jobs ever created for the user).
  const result = classifyOutboxState({ hasHistory: true, job: null });
  assert.equal(result, "lost_outbox");
});

test("classifyOutboxState: no history at all -> legacy_no_history (the only case where 'no sync yet' is a legitimate label)", () => {
  const result = classifyOutboxState({ hasHistory: false, job: null });
  assert.equal(result, "legacy_no_history");
});
