import { describe, it, expect } from "vitest";
import { diffConfig, diffBody } from "./diff.js";

describe("diffConfig", () => {
  it("reports an add for a new key (insert: before = null)", () => {
    const ops = diffConfig(null, { name: "x" });
    expect(ops).toEqual([{ op: "add", path: "/name", newValue: "x" }]);
  });

  it("reports a remove for a dropped key (delete: after = null)", () => {
    const ops = diffConfig({ name: "x" }, null);
    expect(ops).toEqual([{ op: "remove", path: "/name", oldValue: "x" }]);
  });

  it("reports a replace for a changed scalar value", () => {
    const ops = diffConfig({ name: "x" }, { name: "y" });
    expect(ops).toEqual([{ op: "replace", path: "/name", oldValue: "x", newValue: "y" }]);
  });

  it("recurses into nested objects instead of replacing the whole subtree", () => {
    const ops = diffConfig({ nested: { a: 1, b: 2 } }, { nested: { a: 1, b: 3 } });
    expect(ops).toEqual([{ op: "replace", path: "/nested/b", oldValue: 2, newValue: 3 }]);
  });

  it("reports nothing for identical config", () => {
    const config = { name: "x", nested: { a: 1 } };
    expect(diffConfig(config, { ...config, nested: { ...config.nested } })).toEqual([]);
  });

  it("treats arrays as scalar replace, not element-wise diff", () => {
    const ops = diffConfig({ tags: ["a", "b"] }, { tags: ["a", "b", "c"] });
    expect(ops).toEqual([{ op: "replace", path: "/tags", oldValue: ["a", "b"], newValue: ["a", "b", "c"] }]);
  });
});

describe("diffBody", () => {
  it("returns null when body is unchanged", () => {
    expect(diffBody("same", "same")).toBeNull();
  });

  it("returns null when both are empty/undefined", () => {
    expect(diffBody(undefined, null)).toBeNull();
  });

  it("returns line hunks when body changes", () => {
    const hunks = diffBody("line1\nline2\n", "line1\nline2 changed\n");
    expect(hunks).not.toBeNull();
    expect(hunks!.some((h) => h.removed)).toBe(true);
    expect(hunks!.some((h) => h.added)).toBe(true);
  });

  it("marks a full insert (before empty) as entirely added", () => {
    const hunks = diffBody("", "new content");
    expect(hunks).toEqual([{ added: true, removed: false, value: "new content" }]);
  });

  it("marks a full delete (after empty) as entirely removed", () => {
    const hunks = diffBody("old content", "");
    expect(hunks).toEqual([{ added: false, removed: true, value: "old content" }]);
  });
});
