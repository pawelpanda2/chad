/**
 * Pure unit tests for the Msg Planner date-folder comparator (Story 108).
 * No I/O — covers date-descending + same-date suffix ordering + crash-safety
 * on names that don't match the YY-MM-DD(+suffix) pattern.
 */
import { describe, expect, it } from "vitest";
import { compareDateFolderNamesDesc, isValidDateFolderName } from "./leads.js";

function sortDesc(names: string[]): string[] {
  return [...names].sort(compareDateFolderNamesDesc);
}

describe("compareDateFolderNamesDesc", () => {
  it("orders same-date suffix variants above the base, suffixes descending", () => {
    expect(sortDesc(["26-08-04", "26-08-04b"])).toEqual(["26-08-04b", "26-08-04"]);
    expect(sortDesc(["26-08-04", "26-08-04c", "26-08-04b"])).toEqual([
      "26-08-04c",
      "26-08-04b",
      "26-08-04",
    ]);
  });

  it("orders dates descending across different days", () => {
    expect(
      sortDesc(["26-08-04", "26-08-04b", "26-07-08", "26-06-19", "26-06-11"])
    ).toEqual(["26-08-04b", "26-08-04", "26-07-08", "26-06-19", "26-06-11"]);
  });

  it("orders a newer date before an older one regardless of suffix", () => {
    expect(sortDesc(["26-07-08", "26-08-01"])).toEqual(["26-08-01", "26-07-08"]);
  });

  it("handles plain dates with no suffix at all", () => {
    expect(sortDesc(["26-06-11", "26-08-04", "26-07-08"])).toEqual([
      "26-08-04",
      "26-07-08",
      "26-06-11",
    ]);
  });

  it("does not throw on names that don't match the pattern, and sorts them last", () => {
    expect(() => sortDesc(["26-08-04", "not-a-date", "msg-workout"])).not.toThrow();
    const result = sortDesc(["26-08-04", "not-a-date", "msg-workout"]);
    expect(result[0]).toBe("26-08-04");
    expect(new Set(result.slice(1))).toEqual(new Set(["not-a-date", "msg-workout"]));
  });

  it("is consistent with isValidDateFolderName for the fixtures used above", () => {
    for (const name of ["26-08-04", "26-08-04b", "26-08-04c", "26-07-08", "26-06-19", "26-06-11"]) {
      expect(isValidDateFolderName(name)).toBe(true);
    }
  });
});
