import { describe, it, expect } from "vitest";
import { buildHistoryDocument, toDate } from "./history-event-mapper.mjs";

function ts(seconds, increment) {
  // Minimal BSON-Timestamp-shaped stand-in — buildHistoryDocument only ever
  // calls getHighBits()/getLowBits() on it, same shape the real mongodb
  // driver's Timestamp exposes.
  return { getHighBits: () => seconds, getLowBits: () => increment };
}

describe("buildHistoryDocument", () => {
  it("returns null when the change carries no documentKey._id (defensive guard)", () => {
    expect(buildHistoryDocument({ operationType: "insert" }, null)).toBeNull();
  });

  it("diffs an insert against an empty state — beforeUnknown reflects 'no cached state', unchanged pre-existing semantics", () => {
    const change = {
      _id: { _data: "resume-1" },
      documentKey: { _id: "item-1" },
      operationType: "insert",
      clusterTime: ts(1000, 1),
      fullDocument: {
        config: { id: "item-1", address: "repo/01", name: "01" },
        body: "DATE: 2026-01-01",
        _lastActor: { username: "test3", repoGuid: "guid-1" },
      },
    };
    const { historyDoc, nextState } = buildHistoryDocument(change, null);
    expect(historyDoc.operationType).toBe("insert");
    expect(historyDoc.beforeUnknown).toBe(true);
    expect(historyDoc.address).toBe("repo/01");
    expect(historyDoc.actor).toEqual({ username: "test3", repoGuid: "guid-1" });
    expect(historyDoc.orderSeconds).toBe(1000);
    expect(historyDoc.orderIncrement).toBe(1);
    // config diff against {} reports every field as "add".
    expect(historyDoc.changes.config).toEqual(
      expect.arrayContaining([expect.objectContaining({ op: "add", path: "/id" })])
    );
    expect(nextState).toEqual({
      config: change.fullDocument.config,
      body: "DATE: 2026-01-01",
      actor: { username: "test3", repoGuid: "guid-1" },
    });
  });

  it("first event ever seen for an item with no cached state is beforeUnknown: true", () => {
    const change = {
      _id: { _data: "resume-2" },
      documentKey: { _id: "item-2" },
      operationType: "update",
      clusterTime: ts(1001, 0),
      fullDocument: {
        config: { id: "item-2", address: "repo/02" },
        body: "x",
        _lastActor: null,
      },
    };
    const { historyDoc } = buildHistoryDocument(change, null);
    expect(historyDoc.beforeUnknown).toBe(true);
  });

  it("update carries correct before/after config+body diff when cached state exists", () => {
    const cached = {
      config: { id: "item-3", address: "repo/03", name: "01" },
      body: "OLD",
      actor: { username: "test3", repoGuid: "guid-1" },
    };
    const change = {
      _id: { _data: "resume-3" },
      documentKey: { _id: "item-3" },
      operationType: "update",
      clusterTime: ts(1002, 0),
      fullDocument: {
        config: { id: "item-3", address: "repo/03", name: "01" },
        body: "NEW",
        _lastActor: { username: "test3", repoGuid: "guid-1" },
      },
    };
    const { historyDoc, nextState } = buildHistoryDocument(change, cached);
    expect(historyDoc.beforeUnknown).toBe(false);
    expect(historyDoc.changes.body).toEqual([
      { added: false, removed: true, value: "OLD" },
      { added: true, removed: false, value: "NEW" },
    ]);
    expect(nextState.body).toBe("NEW");
  });

  it("delete has no fullDocument — falls back to the cached address/actor/before, nextState is null", () => {
    const cached = {
      config: { id: "item-4", address: "repo/04", name: "01" },
      body: "BODY",
      actor: { username: "test3", repoGuid: "guid-1" },
    };
    const change = {
      _id: { _data: "resume-4" },
      documentKey: { _id: "item-4" },
      operationType: "delete",
      clusterTime: ts(1003, 0),
      // no fullDocument — real change-stream delete events never carry one.
    };
    const { historyDoc, nextState } = buildHistoryDocument(change, cached);
    expect(historyDoc.address).toBe("repo/04");
    expect(historyDoc.actor).toEqual({ username: "test3", repoGuid: "guid-1" });
    expect(historyDoc.changes.body).toEqual([{ added: false, removed: true, value: "BODY" }]);
    expect(nextState).toBeNull();
  });

  it("orderSeconds/orderIncrement give a stable total order for several ops inside the same second", () => {
    const events = [
      { op: "insert", inc: 1 },
      { op: "update", inc: 2 },
      { op: "update", inc: 3 },
      { op: "delete", inc: 4 },
    ].map(({ op, inc }, i) =>
      buildHistoryDocument(
        {
          _id: { _data: `r-${i}` },
          documentKey: { _id: "item-5" },
          operationType: op,
          clusterTime: ts(2000, inc),
          fullDocument: op === "delete" ? undefined : { config: { id: "item-5", address: "repo/05" }, body: `v${i}`, _lastActor: null },
        },
        i === 0 ? null : { config: { id: "item-5", address: "repo/05" }, body: `v${i - 1}`, actor: null }
      ).historyDoc
    );
    const sorted = [...events].sort((a, b) => a.orderSeconds - b.orderSeconds || a.orderIncrement - b.orderIncrement);
    expect(sorted.map((e) => e.operationType)).toEqual(["insert", "update", "update", "delete"]);
  });
});

describe("toDate", () => {
  it("falls back to now() when clusterTime is missing", () => {
    const before = Date.now();
    const d = toDate(undefined);
    expect(d.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("uses the Timestamp's seconds component", () => {
    const d = toDate(ts(1700000000, 5));
    expect(d.getTime()).toBe(1700000000 * 1000);
  });
});
