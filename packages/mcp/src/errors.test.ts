import { describe, it, expect } from "vitest";
import { toToolErrorResult, ValidationError, NotFoundError, LimitExceededError, MutationsDisabledError } from "./errors.js";
import { IdentityNotConfiguredError, RepoScopeViolationError } from "./identity.js";

describe("toToolErrorResult", () => {
  it("maps ValidationError to [VALIDATION]", () => {
    const result = toToolErrorResult(new ValidationError("bad input"));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("[VALIDATION] bad input");
  });

  it("maps NotFoundError to [NOT_FOUND]", () => {
    const result = toToolErrorResult(new NotFoundError("no such item"));
    expect(result.content[0].text).toBe("[NOT_FOUND] no such item");
  });

  it("maps LimitExceededError to [LIMIT_EXCEEDED]", () => {
    const result = toToolErrorResult(new LimitExceededError("too many"));
    expect(result.content[0].text).toBe("[LIMIT_EXCEEDED] too many");
  });

  it("maps MutationsDisabledError to [MUTATIONS_DISABLED]", () => {
    const result = toToolErrorResult(new MutationsDisabledError());
    expect(result.content[0].text).toContain("[MUTATIONS_DISABLED]");
  });

  it("maps RepoScopeViolationError (from identity.ts) to [REPO_SCOPE_VIOLATION]", () => {
    const result = toToolErrorResult(new RepoScopeViolationError("other-repo/03", "my-repo"));
    expect(result.content[0].text).toContain("[REPO_SCOPE_VIOLATION]");
  });

  it("maps IdentityNotConfiguredError to [IDENTITY_NOT_CONFIGURED]", () => {
    const result = toToolErrorResult(new IdentityNotConfiguredError("no identity"));
    expect(result.content[0].text).toContain("[IDENTITY_NOT_CONFIGURED]");
  });

  it("maps an unrecognized plain Error to [INTERNAL] without leaking a raw stack trace as the primary message", () => {
    const result = toToolErrorResult(new Error("boom"));
    expect(result.content[0].text).toBe("[INTERNAL] boom");
  });

  it("never throws, even for a non-Error thrown value", () => {
    expect(() => toToolErrorResult("just a string")).not.toThrow();
    const result = toToolErrorResult("just a string");
    expect(result.content[0].text).toContain("[INTERNAL]");
  });
});
