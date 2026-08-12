import { describe, expect, it } from "vitest";
import { detectPreviewFormat } from "./preview-format.js";

describe("detectPreviewFormat", () => {
  it("returns no-format for empty/blank content", () => {
    expect(detectPreviewFormat("")).toBe("no-format");
    expect(detectPreviewFormat("   \n  \n")).toBe("no-format");
  });

  it("detects hdr1 for headers-format content (// header lines)", () => {
    const content = ["//short", "- braki wiedzy", "- historie", "", "//details", "\t//braki wiedzy", "\t- kakao ceremonialne"].join(
      "\n",
    );
    expect(detectPreviewFormat(content)).toBe("hdr1");
  });

  it("detects hdr1 even when the // header is indented", () => {
    expect(detectPreviewFormat("\t\t// nested header\ncontent")).toBe("hdr1");
  });

  it("detects md for a fenced code block", () => {
    expect(detectPreviewFormat("some text\n```js\nconst x = 1;\n```\n")).toBe("md");
  });

  it("detects md for an ATX heading", () => {
    expect(detectPreviewFormat("# Title\nSome paragraph text.")).toBe("md");
  });

  it("detects md for a markdown link", () => {
    expect(detectPreviewFormat("Check [this site](https://example.com) out.")).toBe("md");
  });

  it("does not guess md from a bare dash list alone (ambiguous with plain notes)", () => {
    expect(detectPreviewFormat("- item one\n- item two\n- item three")).toBe("no-format");
  });

  it("falls back to no-format for plain prose", () => {
    expect(detectPreviewFormat("Just a normal paragraph of text with no markers at all.")).toBe(
      "no-format",
    );
  });

  it("never throws on odd input", () => {
    // @ts-expect-error — deliberately passing an unexpected value to check the guard.
    expect(() => detectPreviewFormat(null)).not.toThrow();
  });
});
