import { describe, expect, it } from "vitest";
import { isDailySyncDue } from "./scheduler.js";

describe("isDailySyncDue", () => {
  it("is not due before the due hour", () => {
    // Built from local components (not an ISO string) so the local hour is
    // deterministic regardless of the machine's timezone.
    const local = new Date(2026, 7, 5, 4, 59, 0);
    expect(isDailySyncDue(local, undefined)).toBe(false);
  });

  it("is due at/after the due hour when no run is recorded yet today", () => {
    const local = new Date(2026, 7, 5, 5, 0, 0);
    expect(isDailySyncDue(local, undefined)).toBe(true);
  });

  it("is not due again the same day once a run is recorded", () => {
    const local = new Date(2026, 7, 5, 6, 30, 0);
    expect(isDailySyncDue(local, "26-08-05")).toBe(false);
  });

  it("is due again the next day even if a run happened yesterday", () => {
    const local = new Date(2026, 7, 6, 5, 5, 0);
    expect(isDailySyncDue(local, "26-08-05")).toBe(true);
  });
});
