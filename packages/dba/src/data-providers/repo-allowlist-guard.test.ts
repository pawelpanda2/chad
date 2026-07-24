/**
 * Unit tests for the Story 81 TEST-restricted-to-test3 guard — pure
 * function, no DB needed.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assertRepoAllowlisted, RepoNotAllowlistedError } from "./repo-allowlist-guard.js";

const ORIGINAL = process.env.DBA_POSTGRES_REPO_ALLOWLIST;

beforeEach(() => {
  delete process.env.DBA_POSTGRES_REPO_ALLOWLIST;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.DBA_POSTGRES_REPO_ALLOWLIST;
  else process.env.DBA_POSTGRES_REPO_ALLOWLIST = ORIGINAL;
});

describe("assertRepoAllowlisted", () => {
  it("is a no-op when DBA_POSTGRES_REPO_ALLOWLIST is unset", () => {
    expect(() => assertRepoAllowlisted("any-repo-guid")).not.toThrow();
  });

  it("is a no-op when DBA_POSTGRES_REPO_ALLOWLIST is empty string", () => {
    process.env.DBA_POSTGRES_REPO_ALLOWLIST = "";
    expect(() => assertRepoAllowlisted("any-repo-guid")).not.toThrow();
  });

  it("allows a repoGuid present in the allowlist", () => {
    process.env.DBA_POSTGRES_REPO_ALLOWLIST = "test3-guid";
    expect(() => assertRepoAllowlisted("test3-guid")).not.toThrow();
  });

  it("allows any of several comma-separated repoGuids, trimming whitespace", () => {
    process.env.DBA_POSTGRES_REPO_ALLOWLIST = "guid-a, guid-b , guid-c";
    expect(() => assertRepoAllowlisted("guid-b")).not.toThrow();
  });

  it("rejects a repoGuid not in the allowlist with a typed, descriptive error", () => {
    process.env.DBA_POSTGRES_REPO_ALLOWLIST = "test3-guid";
    let thrown: unknown;
    try {
      assertRepoAllowlisted("pawel_f-guid");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(RepoNotAllowlistedError);
    expect((thrown as RepoNotAllowlistedError).repoGuid).toBe("pawel_f-guid");
    expect((thrown as RepoNotAllowlistedError).allowlist).toEqual(["test3-guid"]);
  });
});
