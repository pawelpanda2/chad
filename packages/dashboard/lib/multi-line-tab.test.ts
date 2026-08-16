import { describe, expect, it } from "vitest";
import { applyMultiLineTab, applyMultiLineShiftTab } from "./multi-line-tab.js";

describe("applyMultiLineTab", () => {
  it("single caret: inserts a literal \\t at the cursor, unchanged from prior behavior", () => {
    const result = applyMultiLineTab("hello", 2, 2);
    expect(result.nextValue).toBe("he\tllo");
    expect(result.nextSelectionStart).toBe(3);
    expect(result.nextSelectionEnd).toBe(3);
  });

  it("worked example: 3 selected lines each get one leading \\t, selection stays over the same lines", () => {
    const text = ["//a", "- b", "- c"].join("\n");
    const result = applyMultiLineTab(text, 0, text.length);

    expect(result.nextValue).toBe(["\t//a", "\t- b", "\t- c"].join("\n"));
    // selectionStart sat exactly at the first line's own start (offset 0),
    // so that line's own inserted tab also shifts it right by 1.
    expect(result.nextSelectionStart).toBe(1);
    expect(result.nextSelectionEnd).toBe(text.length + 3); // 3 lines x 1 tab each
  });

  it("does not replace the selection's own text — only prepends tabs", () => {
    const text = ["one", "two"].join("\n");
    const result = applyMultiLineTab(text, 0, text.length);
    expect(result.nextValue).toContain("one");
    expect(result.nextValue).toContain("two");
  });

  it("selection from middle of first line to middle of last line indents both lines", () => {
    const text = ["hello", "world", "!!!"].join("\n");
    // start inside "hello" (index 2), end inside "world" (index 8)
    const result = applyMultiLineTab(text, 2, 8);

    expect(result.nextValue).toBe(["\thello", "\tworld", "!!!"].join("\n"));
    // both touched lines got one \t each before selectionStart/End's line-relative position
    expect(result.nextSelectionStart).toBe(3); // shifted by the 1 tab on its own line
    expect(result.nextSelectionEnd).toBe(10); // shifted by 2 tabs (both touched lines are before it)
  });

  it("selection ending exactly at the start of the next line does not indent that next line", () => {
    const text = ["aaa", "bbb", "ccc"].join("\n");
    const firstLineEnd = text.indexOf("\n") + 1; // exactly the start of "bbb"
    const result = applyMultiLineTab(text, 0, firstLineEnd);

    expect(result.nextValue).toBe(["\taaa", "bbb", "ccc"].join("\n"));
  });

  it("single line with a real (non-caret) selection indents that one line, not a literal replace", () => {
    const result = applyMultiLineTab("hello world", 2, 5);
    expect(result.nextValue).toBe("\thello world");
    expect(result.nextValue).not.toBe("he\tworld"); // old buggy replace-selection behavior
  });

  it("handles CRLF line endings — inserts before content, not before the trailing \\r", () => {
    const text = "one\r\ntwo\r\nthree";
    const result = applyMultiLineTab(text, 0, text.length);
    expect(result.nextValue).toBe("\tone\r\n\ttwo\r\n\tthree");
  });

  it("selectionStart/selectionEnd after the edit are valid offsets into nextValue", () => {
    const text = ["x", "y", "z"].join("\n");
    const result = applyMultiLineTab(text, 0, text.length);
    expect(result.nextSelectionStart).toBeGreaterThanOrEqual(0);
    expect(result.nextSelectionEnd).toBeLessThanOrEqual(result.nextValue.length);
  });
});

describe("applyMultiLineShiftTab", () => {
  it("removes a single leading \\t from every selected line", () => {
    const text = ["\t//a", "\t- b", "\t- c"].join("\n");
    const result = applyMultiLineShiftTab(text, 0, text.length);
    expect(result.nextValue).toBe(["//a", "- b", "- c"].join("\n"));
  });

  it("removes at most one leading \\t — a double-indented line loses only one level", () => {
    const text = "\t\tdeep";
    const result = applyMultiLineShiftTab(text, 0, text.length);
    expect(result.nextValue).toBe("\tdeep");
  });

  it("leaves lines without a leading \\t completely unchanged (mixed indentation)", () => {
    const text = ["\tindented", "not indented", "\talso indented"].join("\n");
    const result = applyMultiLineShiftTab(text, 0, text.length);
    expect(result.nextValue).toBe(["indented", "not indented", "also indented"].join("\n"));
  });

  it("never touches leading spaces, only real \\t characters", () => {
    const text = "    spaced";
    const result = applyMultiLineShiftTab(text, 0, text.length);
    expect(result.nextValue).toBe("    spaced");
  });

  it("single caret dedents just its own line", () => {
    const text = ["\tfirst", "\tsecond"].join("\n");
    const caretInSecondLine = text.indexOf("second") + 2;
    const result = applyMultiLineShiftTab(text, caretInSecondLine, caretInSecondLine);
    expect(result.nextValue).toBe(["\tfirst", "second"].join("\n"));
  });

  it("selection ending exactly at the start of the next line does not dedent that next line", () => {
    const text = ["\taaa", "\tbbb"].join("\n");
    const firstLineEnd = text.indexOf("\n") + 1;
    const result = applyMultiLineShiftTab(text, 0, firstLineEnd);
    expect(result.nextValue).toBe(["aaa", "\tbbb"].join("\n"));
  });

  it("selection positions after dedent remain valid offsets into nextValue", () => {
    const text = ["\tone", "\ttwo"].join("\n");
    const result = applyMultiLineShiftTab(text, 0, text.length);
    expect(result.nextSelectionStart).toBeGreaterThanOrEqual(0);
    expect(result.nextSelectionEnd).toBeLessThanOrEqual(result.nextValue.length);
    expect(result.nextValue).toBe(["one", "two"].join("\n"));
  });
});
