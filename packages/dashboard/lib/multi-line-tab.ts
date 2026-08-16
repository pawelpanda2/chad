/**
 * Multi-line Tab / Shift+Tab for the shared body editor (Story 121).
 *
 * Pure string/offset functions — no CodeMirror dependency — so the actual
 * line-shifting logic is independently unit-testable and reusable regardless
 * of which editor widget calls it. `body-text-editor.tsx`'s Tab/Shift-Tab
 * keymap entries call these with the document's full text and the main
 * selection's `{from, to}` offsets, then dispatch a single full-document
 * replace + selection update built from the result.
 */

export interface MultiLineEditResult {
  nextValue: string;
  nextSelectionStart: number;
  nextSelectionEnd: number;
}

/** Offsets (into `text`) where each line begins; `offsets[0]` is always 0. */
function lineStartOffsets(text: string): number[] {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") offsets.push(i + 1);
  }
  return offsets;
}

/** Index of the line containing `pos` (the last line whose start offset is <= `pos`). */
function lineIndexAtOffset(offsets: number[], pos: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid] <= pos) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/**
 * Lines actually "touched" by [selectionStart, selectionEnd): every line
 * containing at least one selected character, plus the caret's own line
 * when the selection is empty. A selection that ends exactly at the start
 * of a line (0 characters selected on it) does NOT count that line —
 * otherwise a selection ending right at a line boundary would accidentally
 * indent/dedent one line too many.
 */
function touchedLineRange(offsets: number[], selectionStart: number, selectionEnd: number): [number, number] {
  const startLine = lineIndexAtOffset(offsets, selectionStart);
  let endLine = lineIndexAtOffset(offsets, selectionEnd);
  if (endLine > startLine && offsets[endLine] === selectionEnd) {
    endLine -= 1;
  }
  return [startLine, endLine];
}

/**
 * Tab: caret (empty selection) inserts a literal `\t` at the cursor,
 * unchanged from single-caret behavior. Any real selection instead inserts
 * one `\t` at the START of every touched line (never replacing the
 * selection's own content), keeping the selection anchored to the same
 * lines — each endpoint shifts right by the number of tabs inserted at or
 * before it.
 */
export function applyMultiLineTab(text: string, selectionStart: number, selectionEnd: number): MultiLineEditResult {
  if (selectionStart === selectionEnd) {
    const nextValue = text.slice(0, selectionStart) + "\t" + text.slice(selectionStart);
    const pos = selectionStart + 1;
    return { nextValue, nextSelectionStart: pos, nextSelectionEnd: pos };
  }

  const offsets = lineStartOffsets(text);
  const [startLine, endLine] = touchedLineRange(offsets, selectionStart, selectionEnd);

  const insertPositions: number[] = [];
  for (let line = startLine; line <= endLine; line++) insertPositions.push(offsets[line]);

  let nextValue = text;
  for (let i = insertPositions.length - 1; i >= 0; i--) {
    const pos = insertPositions[i];
    nextValue = nextValue.slice(0, pos) + "\t" + nextValue.slice(pos);
  }

  const shiftFor = (pos: number) => insertPositions.filter((p) => p <= pos).length;
  return {
    nextValue,
    nextSelectionStart: selectionStart + shiftFor(selectionStart),
    nextSelectionEnd: selectionEnd + shiftFor(selectionEnd),
  };
}

/**
 * Shift+Tab: removes at most one leading `\t` from every touched line
 * (caret included — dedents just its own line). Lines without a leading
 * `\t` (no indent, or space-indented) are left completely unchanged —
 * never touches spaces. Selection endpoints shift left by the number of
 * removed tabs strictly before them (a position sitting exactly where a
 * tab was removed stays put — it was "before" the removed char either way).
 */
export function applyMultiLineShiftTab(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): MultiLineEditResult {
  const offsets = lineStartOffsets(text);
  const [startLine, endLine] = touchedLineRange(offsets, selectionStart, selectionEnd);

  const removalPositions: number[] = [];
  for (let line = startLine; line <= endLine; line++) {
    const lineStart = offsets[line];
    if (text[lineStart] === "\t") removalPositions.push(lineStart);
  }

  let nextValue = text;
  for (let i = removalPositions.length - 1; i >= 0; i--) {
    const pos = removalPositions[i];
    nextValue = nextValue.slice(0, pos) + nextValue.slice(pos + 1);
  }

  const shiftFor = (pos: number) => removalPositions.filter((p) => p < pos).length;
  return {
    nextValue,
    nextSelectionStart: selectionStart - shiftFor(selectionStart),
    nextSelectionEnd: selectionEnd - shiftFor(selectionEnd),
  };
}
