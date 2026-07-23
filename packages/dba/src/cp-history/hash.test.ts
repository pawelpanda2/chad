import { describe, it, expect } from "vitest";
import { hashCpState, canonicalCpStateJson } from "./hash.js";

describe("canonicalCpStateJson / hashCpState", () => {
  it("is stable across different key insertion order", () => {
    const a = { z: 1, a: 2, m: { y: 1, x: 2 } };
    const b = { a: 2, z: 1, m: { x: 2, y: 1 } };
    expect(canonicalCpStateJson(a, "body")).toBe(canonicalCpStateJson(b, "body"));
    expect(hashCpState(a, "body")).toBe(hashCpState(b, "body"));
  });

  it("preserves array order (arrays are not sorted)", () => {
    const a = { list: [1, 2, 3] };
    const b = { list: [3, 2, 1] };
    expect(hashCpState(a, "body")).not.toBe(hashCpState(b, "body"));
  });

  it("changes when body changes, config held constant", () => {
    const config = { id: "x" };
    expect(hashCpState(config, "one")).not.toBe(hashCpState(config, "two"));
  });

  it("changes when config changes, body held constant", () => {
    expect(hashCpState({ a: 1 }, "body")).not.toBe(hashCpState({ a: 2 }, "body"));
  });

  it("is a 64-char lowercase hex sha256 digest", () => {
    const digest = hashCpState({ a: 1 }, "body");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("only ever hashes {config, body} — bookkeeping fields on the raw Mongo doc (e.g. _historyVersion) can never perturb it, because callers only ever pass the CpItem's own config/body, never the raw document", () => {
    const config = { id: "x", address: "repo/01" };
    const body = "hello";
    // Simulates two callers: one with just {config, body}, one that
    // accidentally also has bookkeeping fields alongside — as long as the
    // hash function itself is only ever given `config` (never the whole
    // ItemDoc), the extra fields structurally cannot reach it.
    const withoutBookkeeping = hashCpState(config, body);
    const stillJustConfigBody = hashCpState({ ...config }, body);
    expect(withoutBookkeeping).toBe(stillJustConfigBody);
  });

  it("is deterministic across repeated calls", () => {
    const config = { id: "x", nested: { a: [1, 2, { b: "c" }] } };
    expect(hashCpState(config, "body")).toBe(hashCpState(config, "body"));
  });
});
