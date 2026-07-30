import { describe, expect, it } from "vitest";
import {
  buildRecordingDisplayName,
  formatDurationClock,
  getLocalDateInputValue,
} from "./audio-recording-utils.js";

describe("audio-recording utils", () => {
  it("builds local date without UTC shift", () => {
    const dt = new Date(2026, 6, 30, 23, 59, 58);
    expect(getLocalDateInputValue(dt)).toBe("2026-07-30");
  });

  it("builds display name from date and user suffix", () => {
    expect(buildRecordingDisplayName("2026-07-30", "trening verbal game")).toBe(
      "2026-07-30_trening-verbal-game",
    );
    expect(buildRecordingDisplayName("2026-07-30", "")).toBe("2026-07-30");
  });

  it("formats duration for list/detail display", () => {
    expect(formatDurationClock(65_000)).toBe("01:05");
    expect(formatDurationClock(undefined)).toBeNull();
  });
});
