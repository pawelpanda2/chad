/**
 * Injectable clock + id generator for the data-provider layer.
 *
 * Every write path (command builders, MongoCpProvider, the outbox) takes
 * a `Clock` instead of calling `new Date()`/`crypto.randomUUID()` directly,
 * so tests can supply a fixed clock/sequence instead of asserting against
 * real wall-clock time or random UUIDs (see Story 72 §28, "testowalny
 * clock i generator GUID").
 */

import { randomUUID } from "node:crypto";

export interface Clock {
  now(): Date;
  newId(): string;
}

export const systemClock: Clock = {
  now: () => new Date(),
  newId: () => randomUUID(),
};

/**
 * Deterministic clock for tests: fixed/advancing time, sequential ids.
 */
export function createTestClock(startIso = "2026-01-01T00:00:00.000Z"): Clock {
  let current = new Date(startIso).getTime();
  let seq = 0;
  return {
    now: () => new Date(current),
    newId: () => `test-id-${++seq}`,
  };
}
