import { describe, expect, it } from "vitest";
import {
  DEFAULT_KNOWLEDGE_LAYOUT_PARAMS,
  charTargetForTexts,
  chooseColumnsAndWidths,
  computeRowCaps,
  hasUnbreakableToken,
  textsForColumn,
  widthForChars,
} from "./knowledge-layout.js";

/** ~8px per char, deterministic — close enough to a real 9-13px sans font to exercise min/max clamping, without needing a real font/DOM. */
const FAKE_MEASURE = (probe: string) => probe.length * 8;

describe("charTargetForTexts (Story 114)", () => {
  it("adds ~30% slack to the average length, clamped to [12, 46]", () => {
    // avg 10 -> *1.3 = 13
    const { avg, targetChars } = charTargetForTexts(["aaaaaaaaaa", "aaaaaaaaaa"]);
    expect(avg).toBe(10);
    expect(targetChars).toBe(13);
  });

  it("clamps very short text sets up to the minimum", () => {
    const { targetChars } = charTargetForTexts(["a", "bb"]);
    expect(targetChars).toBe(DEFAULT_KNOWLEDGE_LAYOUT_PARAMS.minTargetChars);
  });

  it("clamps a huge outlier down to the maximum instead of stretching the column", () => {
    const { targetChars } = charTargetForTexts(["short", "a".repeat(300)]);
    expect(targetChars).toBe(DEFAULT_KNOWLEDGE_LAYOUT_PARAMS.maxTargetChars);
  });

  it("empty input does not divide by zero", () => {
    expect(charTargetForTexts([])).toEqual({ avg: 0, targetChars: DEFAULT_KNOWLEDGE_LAYOUT_PARAMS.minTargetChars });
  });
});

describe("widthForChars (Story 114)", () => {
  it("adds the icon/padding allowance on top of the measured text width", () => {
    // 20 chars * 8px + 42px allowance = 202px
    expect(widthForChars(20, FAKE_MEASURE)).toBe(202);
  });

  it("never exceeds maxColumnWidthPx (~400px), even for a huge target", () => {
    expect(widthForChars(1000, FAKE_MEASURE)).toBe(DEFAULT_KNOWLEDGE_LAYOUT_PARAMS.maxColumnWidthPx);
  });

  it("never goes below minColumnWidthPx, even for a tiny target", () => {
    expect(widthForChars(0, FAKE_MEASURE)).toBe(DEFAULT_KNOWLEDGE_LAYOUT_PARAMS.minColumnWidthPx);
  });
});

describe("textsForColumn (Story 114)", () => {
  it("assigns cards to columns round-robin in source order, matching CSS grid auto-flow", () => {
    const cardTexts = [["c0"], ["c1"], ["c2"], ["c3"], ["c4"]];
    expect(textsForColumn(cardTexts, 0, 3)).toEqual(["c0", "c3"]);
    expect(textsForColumn(cardTexts, 1, 3)).toEqual(["c1", "c4"]);
    expect(textsForColumn(cardTexts, 2, 3)).toEqual(["c2"]);
  });
});

describe("chooseColumnsAndWidths (Story 114)", () => {
  it("picks 3 columns as soon as 3 narrow columns actually fit", () => {
    const cardTexts = [["short"], ["short"], ["short"], ["short"], ["short"], ["short"]];
    // 3 cols of "short" (5 chars -> target 12 min -> width 12+42=54) + 2*8 gap = 178
    const result = chooseColumnsAndWidths(500, cardTexts, FAKE_MEASURE);
    expect(result.cols).toBe(3);
    expect(result.widths).toHaveLength(3);
  });

  it("falls back to 2 columns when 3 columns would overflow the available width", () => {
    const wide = "a".repeat(60); // long enough to push widths near maxColumnWidthPx (400) per column
    const cardTexts = [[wide], [wide], [wide], [wide], [wide], [wide]];
    // 3 * 400 + 2*8 = 1216 > 900 -> 2 * 400 + 8 = 808 <= 900
    const result = chooseColumnsAndWidths(900, cardTexts, FAKE_MEASURE);
    expect(result.cols).toBe(2);
  });

  it("falls back to 1 column when even 2 would overflow", () => {
    const wide = "a".repeat(60);
    const cardTexts = [[wide], [wide]];
    const result = chooseColumnsAndWidths(300, cardTexts, FAKE_MEASURE);
    expect(result.cols).toBe(1);
    expect(result.widths[0]).toBeLessThanOrEqual(300);
  });

  it("never returns more than maxColumns even with many short cards", () => {
    const cardTexts = Array.from({ length: 12 }, () => ["x"]);
    const result = chooseColumnsAndWidths(10000, cardTexts, FAKE_MEASURE);
    expect(result.cols).toBeLessThanOrEqual(DEFAULT_KNOWLEDGE_LAYOUT_PARAMS.maxColumns);
  });

  it("gives narrower columns for columns whose own texts are short (per-column width, not one shared average)", () => {
    const short = "hi";
    const long = "a much longer typical section title here";
    // col0 gets card0+card2 (short), col1 gets card1+card3 (long) when cols=2
    const cardTexts = [[short], [long], [short], [long]];
    const result = chooseColumnsAndWidths(2000, cardTexts, FAKE_MEASURE);
    expect(result.cols).toBe(3); // 4 short/long single-word cards fit comfortably at 3 cols with huge available width
    // Directly verify the per-column sizing logic instead (2-column case):
    const col0Target = charTargetForTexts(textsForColumn(cardTexts, 0, 2));
    const col1Target = charTargetForTexts(textsForColumn(cardTexts, 1, 2));
    expect(col0Target.targetChars).toBeLessThan(col1Target.targetChars);
  });
});

describe("computeRowCaps (Story 114)", () => {
  it("shows every item, uncapped, up to and including the threshold (10)", () => {
    expect(computeRowCaps([1, 10])).toEqual([null, null]);
  });

  it("caps only a card that goes strictly above the threshold, to that threshold", () => {
    expect(computeRowCaps([11])).toEqual([10]);
    expect(computeRowCaps([25])).toEqual([10]);
  });

  it("judges each card purely on its own count — a short card next to a huge one stays uncapped", () => {
    expect(computeRowCaps([1, 1, 5, 25])).toEqual([null, null, null, 10]);
    expect(computeRowCaps([2, 30])).toEqual([null, 10]);
  });
});

describe("hasUnbreakableToken (Story 114)", () => {
  it("is false for a normal long name with spaces (wraps instead)", () => {
    expect(
      hasUnbreakableToken(
        "to jest specjalnie bardzo bardzo bardzo bardzo bardzo bardzo bardzo bardzo długi pojedynczy napis"
      )
    ).toBe(false);
  });

  it("is true for a single token with no spaces longer than the threshold", () => {
    expect(hasUnbreakableToken("a".repeat(50))).toBe(true);
  });

  it("is false for short single words", () => {
    expect(hasUnbreakableToken("normalny")).toBe(false);
  });

  it("is false for empty text", () => {
    expect(hasUnbreakableToken("")).toBe(false);
  });
});
