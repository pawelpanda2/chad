import { describe, expect, it } from "vitest";
import { applyHistoryUrlChange, initialHistoryStackState } from "./dashboard-history-reducer.js";

function push(state: ReturnType<typeof initialHistoryStackState>, url: string, maxBack?: number) {
  return applyHistoryUrlChange(state, { url, wasPopState: false, wasReplace: false, maxBack });
}
function pop(state: ReturnType<typeof initialHistoryStackState>, url: string) {
  return applyHistoryUrlChange(state, { url, wasPopState: true, wasReplace: false });
}
function replace(state: ReturnType<typeof initialHistoryStackState>, url: string) {
  return applyHistoryUrlChange(state, { url, wasPopState: false, wasReplace: true });
}

describe("basic push/pop", () => {
  it("pushes new entries and truncates on back", () => {
    let s = initialHistoryStackState("/a");
    s = push(s, "/b");
    s = push(s, "/c");
    expect(s).toEqual({ entries: ["/a", "/b", "/c"], index: 2 });

    s = pop(s, "/b"); // real back (popstate)
    expect(s).toEqual({ entries: ["/a", "/b", "/c"], index: 1 });

    s = applyHistoryUrlChange(s, { url: "/c", wasPopState: true, wasReplace: false }); // forward
    expect(s).toEqual({ entries: ["/a", "/b", "/c"], index: 2 });
  });

  it("is a no-op for a duplicate/unchanged URL", () => {
    const s = initialHistoryStackState("/a");
    const next = push(s, "/a");
    expect(next).toBe(s);
  });
});

describe("A -> B -> A: fresh navigation is never confused with Back", () => {
  it("records a third distinct entry, not a Back into the earlier A", () => {
    let s = initialHistoryStackState("/a");
    s = push(s, "/b");
    // Fresh click/Link to A again — NOT a popstate event.
    s = push(s, "/a");
    expect(s).toEqual({ entries: ["/a", "/b", "/a"], index: 2 });

    // Back from this fresh A goes to B, not straight past it.
    s = pop(s, "/b");
    expect(s).toEqual({ entries: ["/a", "/b", "/a"], index: 1 });
  });
});

describe("branching", () => {
  it("A -> B -> C, back to B, fresh D drops the old forward to C", () => {
    let s = initialHistoryStackState("/a");
    s = push(s, "/b");
    s = push(s, "/c");
    s = pop(s, "/b");
    expect(s.index).toBe(1);

    s = push(s, "/d");
    expect(s).toEqual({ entries: ["/a", "/b", "/d"], index: 2 });
    // Forward to the old /c is gone.
    expect(s.index).toBe(s.entries.length - 1);
  });
});

describe("popstate resync when the URL isn't an adjacent tracked entry", () => {
  it("falls back to a fresh single-entry stack instead of guessing", () => {
    let s = initialHistoryStackState("/a");
    s = push(s, "/b");
    s = push(s, "/c");
    // A real browser back/forward landed somewhere our capped window
    // doesn't know about (e.g. post-refresh).
    s = pop(s, "/far-away");
    expect(s).toEqual({ entries: ["/far-away"], index: 0 });
  });
});

describe("wasReplace", () => {
  it("canonicalizes the current (only) entry in place, not appended", () => {
    let s = initialHistoryStackState("/dashboard/folders");
    s = replace(s, "/dashboard/folders/abc-14");
    expect(s).toEqual({ entries: ["/dashboard/folders/abc-14"], index: 0 });
  });

  it("canonicalizes the current entry in place even mid-stack", () => {
    let s = initialHistoryStackState("/x");
    s = push(s, "/dashboard/folders");
    s = push(s, "/y"); // sanity: unrelated push still works
    s = pop(s, "/dashboard/folders"); // back to the folders entry
    s = replace(s, "/dashboard/folders/abc-14");
    expect(s).toEqual({ entries: ["/x", "/dashboard/folders/abc-14", "/y"], index: 1 });
  });
});

describe("MAX_BACK cap", () => {
  it("caps the back portion and keeps the stack bounded", () => {
    let s = initialHistoryStackState("/0");
    for (let i = 1; i <= 40; i++) {
      s = push(s, `/${i}`, 30);
    }
    expect(s.index).toBe(30);
    expect(s.entries.length).toBe(31);
    expect(s.entries[s.entries.length - 1]).toBe("/40");
    expect(s.entries[0]).toBe("/10");
  });
});
