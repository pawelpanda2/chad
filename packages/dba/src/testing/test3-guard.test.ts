import { describe, it, expect } from "vitest";
import { assertTest3Scoped, assertIsTest3Session, TEST3_REPO_GUID, Test3ScopeViolationError } from "./test3-guard.js";

describe("assertTest3Scoped", () => {
  it("allows the repo root address itself", () => {
    expect(() => assertTest3Scoped(TEST3_REPO_GUID)).not.toThrow();
  });

  it("allows a descendant address", () => {
    expect(() => assertTest3Scoped(`${TEST3_REPO_GUID}/01/02`)).not.toThrow();
  });

  it("rejects a completely unrelated address", () => {
    expect(() => assertTest3Scoped("21d11bdc-f1f4-44d1-b61a-3fa6b039c641/01")).toThrow(Test3ScopeViolationError);
  });

  it("rejects a GUID that is merely a string-prefix of TEST3_REPO_GUID (anchoring regression)", () => {
    const prefix = TEST3_REPO_GUID.slice(0, 10);
    expect(() => assertTest3Scoped(prefix)).toThrow(Test3ScopeViolationError);
  });

  it("rejects a GUID for which TEST3_REPO_GUID is merely a string-prefix (the reverse case)", () => {
    expect(() => assertTest3Scoped(`${TEST3_REPO_GUID}extra-suffix-repo/01`)).toThrow(Test3ScopeViolationError);
  });

  it("rejects empty/non-string input defensively", () => {
    expect(() => assertTest3Scoped("")).toThrow(Test3ScopeViolationError);
    // @ts-expect-error deliberate bad input
    expect(() => assertTest3Scoped(undefined)).toThrow(Test3ScopeViolationError);
  });
});

describe("assertIsTest3Session", () => {
  it("allows the real test3 session", () => {
    expect(() => assertIsTest3Session({ username: "test3", repoGuid: TEST3_REPO_GUID })).not.toThrow();
  });

  it("rejects a null/undefined session", () => {
    expect(() => assertIsTest3Session(null)).toThrow();
    expect(() => assertIsTest3Session(undefined)).toThrow();
  });

  it("rejects a session with the right username but wrong repoGuid", () => {
    expect(() => assertIsTest3Session({ username: "test3", repoGuid: "wrong-guid" })).toThrow();
  });

  it("rejects a session with the right repoGuid but wrong username (defense in depth)", () => {
    expect(() => assertIsTest3Session({ username: "pawel_f", repoGuid: TEST3_REPO_GUID })).toThrow();
  });
});
