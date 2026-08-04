import { describe, expect, it } from "vitest";
import { parseFolderChildNameMap, resolveFolderSorting } from "./folder-sorting.js";

describe("resolveFolderSorting", () => {
  it("resolves explicit asc/desc", () => {
    expect(resolveFolderSorting("asc")).toBe("asc");
    expect(resolveFolderSorting("desc")).toBe("desc");
  });

  it("falls back to asc for missing/invalid values", () => {
    for (const value of ["DESC", "", null, undefined, true, 1, {}, []]) {
      expect(resolveFolderSorting(value)).toBe("asc");
    }
  });
});

describe("parseFolderChildNameMap", () => {
  const body = JSON.stringify({ "1": "a", "2": "b", "3": "c" });

  it("defaults to ascending when sorting is omitted", () => {
    expect(parseFolderChildNameMap(body).map((e) => e.index)).toEqual(["1", "2", "3"]);
  });

  it("sorts ascending for sorting: asc", () => {
    expect(parseFolderChildNameMap(body, "asc").map((e) => e.index)).toEqual(["1", "2", "3"]);
  });

  it("sorts descending for sorting: desc", () => {
    expect(parseFolderChildNameMap(body, "desc").map((e) => e.index)).toEqual(["3", "2", "1"]);
  });

  it("sorts numerically, not lexicographically", () => {
    const unordered = JSON.stringify({ "10": "j", "02": "b", "01": "a" });
    expect(parseFolderChildNameMap(unordered, "asc").map((e) => e.index)).toEqual(["01", "02", "10"]);
    expect(parseFolderChildNameMap(unordered, "desc").map((e) => e.index)).toEqual(["10", "02", "01"]);
  });

  it("falls back to asc for any invalid sorting value", () => {
    for (const value of ["DESC", "", null, true, 1, {}]) {
      expect(parseFolderChildNameMap(body, value).map((e) => e.index)).toEqual(["1", "2", "3"]);
    }
  });

  it("returns [] for an unparseable body, regardless of sorting", () => {
    expect(parseFolderChildNameMap("not json", "desc")).toEqual([]);
  });

  it("does not mutate the parsed entries between calls", () => {
    const first = parseFolderChildNameMap(body, "asc");
    const second = parseFolderChildNameMap(body, "desc");
    expect(first.map((e) => e.index)).toEqual(["1", "2", "3"]);
    expect(second.map((e) => e.index)).toEqual(["3", "2", "1"]);
  });
});
