/**
 * Pure unit tests for the msg workout ↔ Beeper matching engine (Story 99).
 * No I/O — see msg-workout-cp.test.ts for the CP-backed write-path tests.
 */
import { describe, expect, it } from "vitest";
import {
  dayTimeToUtcDate,
  localDayKey,
  matchMsgWorkout,
  normalizeForExactMatch,
  parseWorkoutDirectionAndText,
  parseWorkoutName,
  textSimilarity,
  type BeeperCandidateMessage,
} from "./msg-workout-matching.js";

function msg(partial: Partial<BeeperCandidateMessage> & { messageId: string; timestamp: string }): BeeperCandidateMessage {
  return { isSelf: false, text: "", ...partial };
}

describe("parseWorkoutName", () => {
  it("parses day+time (Z = UTC)", () => {
    expect(parseWorkoutName("26-08-01__14-16Z")).toEqual({ kind: "day-time", year: 26, month: 8, day: 1, hour: 14, minute: 16 });
  });
  it("parses day-only, with and without a letter suffix", () => {
    expect(parseWorkoutName("26-08-01")).toEqual({ kind: "day", year: 26, month: 8, day: 1 });
    expect(parseWorkoutName("26-08-01b")).toEqual({ kind: "day", year: 26, month: 8, day: 1 });
  });
  it("returns none for anything else (undated), including the Message Creator's own '; ai bot' naming", () => {
    expect(parseWorkoutName("26-08-01; ai bot")).toEqual({ kind: "none" });
    expect(parseWorkoutName("first workout")).toEqual({ kind: "none" });
    expect(parseWorkoutName("")).toEqual({ kind: "none" });
  });
});

describe("dayTimeToUtcDate / localDayKey", () => {
  it("day-time is interpreted as UTC", () => {
    const d = dayTimeToUtcDate({ kind: "day-time", year: 26, month: 8, day: 1, hour: 14, minute: 16 });
    expect(d.toISOString()).toBe("2026-08-01T14:16:00.000Z");
  });
});

describe("normalizeForExactMatch", () => {
  it("trims, normalizes line endings, and collapses internal whitespace runs without changing meaning", () => {
    expect(normalizeForExactMatch("  hej   jak   leci?  \r\n\r\n ")).toBe("hej jak leci?");
    expect(normalizeForExactMatch("line one\r\nline   two")).toBe("line one\nline two");
  });
});

describe("parseWorkoutDirectionAndText", () => {
  it("extracts p1_you / p1_she prefixes case-insensitively", () => {
    expect(parseWorkoutDirectionAndText("p1_you; hello there")).toEqual({ direction: "you", text: "hello there" });
    expect(parseWorkoutDirectionAndText("P1_SHE;   hej   jak leci?")).toEqual({ direction: "she", text: "hej jak leci?" });
  });
  it("returns null direction with the full normalized body when no prefix is present", () => {
    expect(parseWorkoutDirectionAndText("just some text")).toEqual({ direction: null, text: "just some text" });
  });
});

describe("textSimilarity", () => {
  it("1 for identical strings, 0 for maximally different strings", () => {
    expect(textSimilarity("hello", "hello")).toBe(1);
    expect(textSimilarity("", "")).toBe(1);
    expect(textSimilarity("abc", "xyz")).toBe(0);
  });
  it("partial similarity for near-identical strings", () => {
    const s = textSimilarity("hej jak leci", "hej jak leci?");
    expect(s).toBeGreaterThan(0.85);
    expect(s).toBeLessThan(1);
  });
});

describe("matchMsgWorkout — Stage 1 (day+time, ±30 min)", () => {
  const workoutName = "26-08-01__14-16Z";

  it("single candidate within ±30 min -> linked", () => {
    const result = matchMsgWorkout({
      workoutName,
      workoutBody: "p1_she; hej",
      candidates: [msg({ messageId: "m1", timestamp: "2026-08-01T14:20:00.000Z", isSelf: false, text: "hej" })],
    });
    expect(result).toEqual({
      type: "linked",
      messageId: "m1",
      timestamp: "2026-08-01T14:20:00.000Z",
      reason: { type: "exact-time", summary: expect.any(String) },
    });
  });

  it("outside ±30 min -> no-candidates, not linked", () => {
    const result = matchMsgWorkout({
      workoutName,
      workoutBody: "p1_she; hej",
      candidates: [msg({ messageId: "m1", timestamp: "2026-08-01T15:00:00.000Z", isSelf: false, text: "hej" })],
    });
    expect(result.type).toBe("no-candidates");
  });

  it("multiple candidates within ±30 min -> proposal, never picks one arbitrarily", () => {
    const result = matchMsgWorkout({
      workoutName,
      workoutBody: "p1_she; hej",
      candidates: [
        msg({ messageId: "m1", timestamp: "2026-08-01T14:10:00.000Z" }),
        msg({ messageId: "m2", timestamp: "2026-08-01T14:30:00.000Z" }),
      ],
    });
    expect(result.type).toBe("proposal");
    if (result.type === "proposal") {
      expect(result.reason.type).toBe("ambiguous-time");
      expect(result.candidates).toHaveLength(2);
      expect(result.candidates[0].reasons).toContain("closest-timestamp");
    }
  });

  it("no candidates outside a lead's linked conversation are ever considered (candidates list is already scoped by the caller)", () => {
    const result = matchMsgWorkout({ workoutName, workoutBody: "p1_she; hej", candidates: [] });
    expect(result.type).toBe("no-candidates");
  });
});

describe("matchMsgWorkout — Stage 2 (day only)", () => {
  it("exactly one message that day -> linked", () => {
    const result = matchMsgWorkout({
      workoutName: "26-08-01",
      workoutBody: "anything",
      candidates: [msg({ messageId: "m1", timestamp: new Date(2026, 7, 1, 9, 0).toISOString() })],
    });
    expect(result.type).toBe("linked");
    if (result.type === "linked") expect(result.reason.type).toBe("single-day");
  });

  it("zero messages that day -> no-candidates", () => {
    const result = matchMsgWorkout({
      workoutName: "26-08-01",
      workoutBody: "anything",
      candidates: [msg({ messageId: "m1", timestamp: new Date(2026, 7, 2, 9, 0).toISOString() })],
    });
    expect(result.type).toBe("no-candidates");
  });
});

describe("matchMsgWorkout — Stage 3 (exact normalized p1_you / p1_she)", () => {
  const day = (h: number, m: number) => new Date(2026, 7, 1, h, m).toISOString();

  it("unique exact text+direction match among same-day candidates -> linked", () => {
    const result = matchMsgWorkout({
      workoutName: "26-08-01b",
      workoutBody: "p1_she;   hej   jak leci?  ",
      candidates: [
        msg({ messageId: "m1", timestamp: day(9, 0), isSelf: false, text: "hej jak leci?" }),
        msg({ messageId: "m2", timestamp: day(10, 0), isSelf: false, text: "something else entirely" }),
      ],
    });
    expect(result.type).toBe("linked");
    if (result.type === "linked") {
      expect(result.messageId).toBe("m1");
      expect(result.reason.type).toBe("exact-text");
    }
  });

  it("direction mismatch excludes an otherwise-exact-text candidate", () => {
    const result = matchMsgWorkout({
      workoutName: "26-08-01b",
      workoutBody: "p1_you; hej jak leci?",
      candidates: [
        msg({ messageId: "m1", timestamp: day(9, 0), isSelf: false, text: "hej jak leci?" }), // she, not you -> excluded
        msg({ messageId: "m2", timestamp: day(10, 0), isSelf: true, text: "hej jak leci?" }), // you, exact -> matches
      ],
    });
    expect(result.type).toBe("linked");
    if (result.type === "linked") expect(result.messageId).toBe("m2");
  });

  it("multiple exact matches on the same day -> proposal (ambiguous-exact), never arbitrary", () => {
    const result = matchMsgWorkout({
      workoutName: "26-08-01b",
      workoutBody: "p1_she; hej",
      candidates: [
        msg({ messageId: "m1", timestamp: day(9, 0), isSelf: false, text: "hej" }),
        msg({ messageId: "m2", timestamp: day(10, 0), isSelf: false, text: "hej" }),
      ],
    });
    expect(result.type).toBe("proposal");
    if (result.type === "proposal") expect(result.reason.type).toBe("ambiguous-exact");
  });
});

describe("matchMsgWorkout — Stage 4 (fuzzy, never auto-links)", () => {
  const day = (h: number, m: number) => new Date(2026, 7, 1, h, m).toISOString();

  it("no exact match -> fuzzy proposal with explicit, named confidence components", () => {
    const result = matchMsgWorkout({
      workoutName: "26-08-01b",
      workoutBody: "p1_she; hej jak leci dzisiaj",
      candidates: [
        msg({ messageId: "m1", timestamp: day(9, 0), isSelf: false, text: "hej jak tam dzisiaj" }),
        msg({ messageId: "m2", timestamp: day(10, 0), isSelf: true, text: "zupełnie coś innego" }),
      ],
    });
    expect(result.type).toBe("proposal");
    if (result.type === "proposal") {
      expect(result.reason.type).toBe("fuzzy-only");
      expect(result.candidates.length).toBeGreaterThan(0);
      // Every confidence must be justified by named reasons, not a lone magic number.
      for (const c of result.candidates) {
        expect(c.reasons.length).toBeGreaterThan(0);
        expect(c.confidence).toBeGreaterThanOrEqual(0);
        expect(c.confidence).toBeLessThanOrEqual(1);
      }
      // The direction+text-similar candidate should outrank the unrelated one.
      expect(result.candidates[0].messageId).toBe("m1");
    }
  });

  it("body with no p1_you/p1_she prefix at all still reaches fuzzy (day-only ambiguity), never auto-links", () => {
    const result = matchMsgWorkout({
      workoutName: "26-08-01",
      workoutBody: "no direction marker here",
      candidates: [msg({ messageId: "m1", timestamp: day(9, 0) }), msg({ messageId: "m2", timestamp: day(10, 0) })],
    });
    expect(result.type).toBe("proposal");
    if (result.type === "proposal") expect(result.reason.type).toBe("fuzzy-only");
  });
});

describe("matchMsgWorkout — undated", () => {
  it("a name with no parseable date is always undated, regardless of candidates", () => {
    const result = matchMsgWorkout({ workoutName: "26-08-01; ai bot", workoutBody: "x", candidates: [] });
    expect(result.type).toBe("undated");
  });
});
