/**
 * Pure, DOM-free math behind the Knowledge v2 "intelligent" grid layout
 * (Story 114). Ported from the accepted reference mockup
 * (`examples/knowledge_v2_clean_no_debug_mockup.html`) — same decisions,
 * named parameters instead of inline magic numbers:
 *
 * - up to `maxColumns` columns, chosen by whichever count's computed widths
 *   actually fit `availableWidth` (no fixed breakpoints);
 * - each column gets its own width from the average length of the texts
 *   routed into it (+`widthReserveRatio` slack), clamped to
 *   [`minColumnWidthPx`, `maxColumnWidthPx`];
 * - each visual row's height cap is the ceil-average item count across the
 *   cards in that row, itself capped at `normalRowCap` (or `allLargeRowCap`
 *   when every card in the row exceeds `largeRowThreshold` items).
 *
 * DOM concerns (measuring actual pixel widths, ResizeObserver, per-row
 * unbreakable-token overflow) live in `use-knowledge-grid-layout.ts` and the
 * row label component, which call into these functions — kept separate so
 * the algorithm itself is testable without jsdom.
 */

export interface KnowledgeLayoutParams {
  /** Hard cap on columns — never a 4th, regardless of available width. */
  maxColumns: number;
  /** Upper bound on any single column/card width, in px. */
  maxColumnWidthPx: number;
  /** Lower bound on any single column/card width, in px. */
  minColumnWidthPx: number;
  /** Slack multiplier applied to the average text length target (e.g. 1.30 = +30%). */
  widthReserveRatio: number;
  /** Lower bound on the "target chars per line" used to size a column. */
  minTargetChars: number;
  /** Upper bound on the "target chars per line" used to size a column. */
  maxTargetChars: number;
  /** Visible-row cap for a card whose row-mates are not all "large". */
  normalRowCap: number;
  /** Visible-row cap for a card whose row-mates are ALL "large" (see `largeRowThreshold`). */
  allLargeRowCap: number;
  /** An item count above this makes a card "large" for the all-large-row-cap check. */
  largeRowThreshold: number;
  /**
   * Grid gap between columns, in px — subtracted from available width when
   * fitting columns. Must match the actual rendered CSS gap (this project's
   * `FRAME_SECTION_GAP_CLASS`/`gap-[10px]` token), not an arbitrary value —
   * otherwise the fit math would disagree with what the browser renders.
   */
  gapPx: number;
  /** A single word longer than this many characters counts as an "unbreakable token". */
  unbreakableWordCharThreshold: number;
}

export const DEFAULT_KNOWLEDGE_LAYOUT_PARAMS: KnowledgeLayoutParams = {
  maxColumns: 3,
  maxColumnWidthPx: 400,
  minColumnWidthPx: 115,
  widthReserveRatio: 1.3,
  minTargetChars: 12,
  maxTargetChars: 46,
  normalRowCap: 5,
  allLargeRowCap: 8,
  largeRowThreshold: 5,
  gapPx: 10,
  unbreakableWordCharThreshold: 42,
};

/** Average length + 30%-slack "target chars per line" for one column's worth of texts. */
export function charTargetForTexts(
  texts: string[],
  params: KnowledgeLayoutParams = DEFAULT_KNOWLEDGE_LAYOUT_PARAMS
): { avg: number; targetChars: number } {
  const lengths = texts.map((t) => t.length);
  const avg = lengths.length > 0 ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  const targetChars = Math.max(
    params.minTargetChars,
    Math.min(params.maxTargetChars, Math.ceil(avg * params.widthReserveRatio))
  );
  return { avg, targetChars };
}

/**
 * Converts a "target chars" figure into a pixel column width, using an
 * injected `measureText` (real font-aware measurement lives in the DOM
 * hook; tests inject a fake). Adds a fixed allowance for the row icon, its
 * gap, and card padding — mirrors the mockup's `+42` allowance — then
 * clamps to [`minColumnWidthPx`, `maxColumnWidthPx`].
 */
export function widthForChars(
  chars: number,
  measureText: (probe: string) => number,
  params: KnowledgeLayoutParams = DEFAULT_KNOWLEDGE_LAYOUT_PARAMS
): number {
  const iconAndPaddingAllowancePx = 42;
  const measured = measureText("M".repeat(Math.max(0, chars)));
  return Math.min(params.maxColumnWidthPx, Math.max(params.minColumnWidthPx, Math.ceil(measured) + iconAndPaddingAllowancePx));
}

/** Round-robin card→column assignment matching CSS grid auto-flow with `cols` explicit columns (card i → column i % cols, in source order). */
export function textsForColumn(cardTexts: string[][], col: number, cols: number): string[] {
  const texts: string[] = [];
  cardTexts.forEach((texts_, index) => {
    if (index % cols === col) texts.push(...texts_);
  });
  return texts;
}

export interface ColumnLayoutResult {
  cols: number;
  /** One width per column, same order as columns render left-to-right. */
  widths: number[];
}

/**
 * Picks the column count (3 → 2 → 1) and each column's own width.
 * `cardTexts[i]` is every text (card title + all its item labels) that
 * belongs to card `i`, in render order. Tries 3 columns first, then 2, then
 * 1 — the first whose summed widths (+ gaps) fit `availableWidth` wins, so
 * 3 columns appear as soon as they actually fit, not at an arbitrary
 * breakpoint. Falls back to a single column sized from all texts combined
 * and clamped to `availableWidth` if even 1 column's natural width would
 * overflow (can't go narrower than the container).
 */
export function chooseColumnsAndWidths(
  availableWidth: number,
  cardTexts: string[][],
  measureText: (probe: string) => number,
  params: KnowledgeLayoutParams = DEFAULT_KNOWLEDGE_LAYOUT_PARAMS
): ColumnLayoutResult {
  for (let cols = params.maxColumns; cols >= 1; cols--) {
    const widths: number[] = [];
    for (let col = 0; col < cols; col++) {
      const { targetChars } = charTargetForTexts(textsForColumn(cardTexts, col, cols), params);
      widths.push(widthForChars(targetChars, measureText, params));
    }
    const needed = widths.reduce((a, b) => a + b, 0) + params.gapPx * (cols - 1);
    if (needed <= availableWidth) {
      return { cols, widths };
    }
  }

  const allTexts = cardTexts.flat();
  const { targetChars } = charTargetForTexts(allTexts, params);
  return {
    cols: 1,
    widths: [Math.min(widthForChars(targetChars, measureText, params), Math.max(params.minColumnWidthPx, availableWidth))],
  };
}

/** Ceil-average item count across cards sharing one visual row, capped at `normalRowCap`/`allLargeRowCap`. */
export function targetForRow(
  counts: number[],
  params: KnowledgeLayoutParams = DEFAULT_KNOWLEDGE_LAYOUT_PARAMS
): number {
  if (counts.length === 0) return params.normalRowCap;
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  const ceilAvg = Math.ceil(avg);
  const allLarge = counts.every((n) => n > params.largeRowThreshold);
  const cap = allLarge ? params.allLargeRowCap : params.normalRowCap;
  return Math.max(1, Math.min(cap, ceilAvg));
}

/**
 * Per-card visible-row cap (`null` = no cap, card stays its natural
 * height). Cards are grouped into visual rows of `cols` in source order
 * (matching CSS grid auto-flow); within each row, only cards whose own
 * count exceeds that row's `targetForRow` get capped — short cards in the
 * same row are left alone.
 */
export function computeRowCaps(
  cardCounts: number[],
  cols: number,
  params: KnowledgeLayoutParams = DEFAULT_KNOWLEDGE_LAYOUT_PARAMS
): Array<number | null> {
  const caps: Array<number | null> = new Array(cardCounts.length).fill(null);
  for (let i = 0; i < cardCounts.length; i += cols) {
    const rowCounts = cardCounts.slice(i, i + cols);
    const target = targetForRow(rowCounts, params);
    rowCounts.forEach((count, offset) => {
      if (count > target) caps[i + offset] = target;
    });
  }
  return caps;
}

/** True when `text` contains a single word longer than the unbreakable-token threshold — the only case that gets local ‹ › shift controls instead of normal wrapping. */
export function hasUnbreakableToken(
  text: string,
  params: KnowledgeLayoutParams = DEFAULT_KNOWLEDGE_LAYOUT_PARAMS
): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const longest = Math.max(...words.map((w) => w.length));
  return longest > params.unbreakableWordCharThreshold;
}
