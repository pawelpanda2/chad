// Pure event -> history-document mapping (Story 78 — extracted from
// index.mjs's recordHistoryEvent so this exact logic is unit-testable
// without a real MongoDB connection, and so index.mjs/tests both import the
// same code rather than tests re-implementing it).
import { diffConfig } from "./config-diff.mjs";
import { diffBody } from "./body-diff.mjs";

/**
 * BSON Timestamp -> Date, via its high-order seconds component only (display
 * value — the actual ordering key is orderSeconds/orderIncrement below, see
 * Story 78: a seconds-only value can't distinguish several operations inside
 * the same wall-clock second).
 */
export function toDate(clusterTime) {
  if (!clusterTime) return new Date();
  const seconds = typeof clusterTime.getHighBits === "function" ? clusterTime.getHighBits() : null;
  return seconds ? new Date(seconds * 1000) : new Date();
}

/**
 * @param {object} change A MongoDB change-stream event.
 * @param {{config: object, body: string, actor: object | null} | null | undefined} cached
 *   The worker's last-known state for this item (from the in-memory cache /
 *   persistent shadow state), or null/undefined if none is known yet.
 * @returns {{ historyDoc: object, nextState: object | null } | null}
 *   `null` if the event carries no document key (should never happen for a
 *   real cp_items change, guarded defensively). `nextState` is the value the
 *   caller should persist into the shadow-state store for this sourceId
 *   (null means "delete the shadow-state entry").
 */
export function buildHistoryDocument(change, cached) {
  const sourceId = change.documentKey?._id;
  if (sourceId === undefined) return null;

  const operationType = change.operationType;
  const hasCached = cached !== null && cached !== undefined;
  const beforeUnknown = !hasCached;

  let after = null;
  if (operationType === "insert" || operationType === "update" || operationType === "replace") {
    after = change.fullDocument ?? null;
  }

  const beforeConfig = cached?.config ?? null;
  const afterConfig = after?.config ?? null;
  const beforeBody = cached?.body ?? "";
  const afterBody = after?.body ?? "";

  const address = afterConfig?.address ?? beforeConfig?.address ?? null;
  // A delete event's change-stream document carries no fullDocument (no
  // `after`), so its own write never had a chance to record an actor —
  // fall back to the last actor this worker cached for the item from its
  // most recent insert/update, same principle as the address/body fallback
  // above.
  const actor = after?._lastActor ?? cached?.actor ?? null;

  const clusterTime = change.clusterTime;
  // Stable total order across events within the same wall-clock second
  // (Story 78, Input 1 §3.5) — a BSON Timestamp is (seconds, increment),
  // and the oplog/change-stream guarantees increment is monotonic within a
  // second on a single-node replica set. Falls back to Date.now()/0 only
  // for the pathological case of a missing clusterTime (never expected from
  // a real change-stream event).
  const orderSeconds = typeof clusterTime?.getHighBits === "function" ? clusterTime.getHighBits() : Math.floor(Date.now() / 1000);
  const orderIncrement = typeof clusterTime?.getLowBits === "function" ? clusterTime.getLowBits() : 0;

  const historyDoc = {
    _id: change._id?._data ?? `${sourceId}-${Date.now()}`,
    sourceCollection: "cp_items",
    sourceId,
    address,
    operationType,
    changedAt: toDate(clusterTime),
    orderSeconds,
    orderIncrement,
    actor: actor ? { username: actor.username, repoGuid: actor.repoGuid } : null,
    beforeUnknown,
    changes: {
      config: diffConfig(beforeConfig, afterConfig),
      body: diffBody(beforeBody, afterBody),
    },
  };

  const nextState =
    operationType === "delete"
      ? null
      : after
        ? { config: after.config, body: after.body, actor: after._lastActor ?? null }
        : null;

  return { historyDoc, nextState };
}
