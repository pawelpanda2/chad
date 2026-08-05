import { describe, expect, it } from "vitest";
import { normalizePhoneDigits, phoneDigitsMatch } from "./phone-utils.js";

describe("normalizePhoneDigits", () => {
  it("strips non-digit characters", () => {
    expect(normalizePhoneDigits("+48 600-123-456")).toBe("48600123456");
  });

  it("returns null for short/garbled fragments", () => {
    expect(normalizePhoneDigits("12345")).toBeNull();
  });

  it("returns null for empty/undefined input", () => {
    expect(normalizePhoneDigits("")).toBeNull();
    expect(normalizePhoneDigits(undefined)).toBeNull();
  });
});

describe("phoneDigitsMatch", () => {
  it("matches identical digit strings", () => {
    expect(phoneDigitsMatch("600123456", "600123456")).toBe(true);
  });

  it("matches on last 9 digits despite a different country-code prefix", () => {
    expect(phoneDigitsMatch("48600123456", "600123456")).toBe(true);
  });

  it("does not match unrelated numbers", () => {
    expect(phoneDigitsMatch("600123456", "700999888")).toBe(false);
  });
});
