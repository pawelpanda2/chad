import { describe, it, expect, beforeEach } from "vitest";
import { loadMcpConfig } from "./config.js";
import {
  __resetIdentityCacheForTests,
  assertWithinConfiguredRepo,
  resolveMcpIdentity,
  IdentityNotConfiguredError,
  RepoScopeViolationError,
} from "./identity.js";

beforeEach(() => {
  __resetIdentityCacheForTests();
});

describe("resolveMcpIdentity — guard rails (no network required, fails before any dba call)", () => {
  it("refuses when MCP_TEST_USERNAME is unset", async () => {
    const config = loadMcpConfig({}, "/nonexistent/.env.mcp");
    await expect(resolveMcpIdentity(config)).rejects.toBeInstanceOf(IdentityNotConfiguredError);
  });

  it("refuses for any username other than test3 — no model-controlled repoGuid, no real-user fallback", async () => {
    const config = loadMcpConfig({ MCP_TEST_USERNAME: "pawel_f" }, "/nonexistent/.env.mcp");
    await expect(resolveMcpIdentity(config)).rejects.toBeInstanceOf(IdentityNotConfiguredError);
  });
});

describe("assertWithinConfiguredRepo — cross-user isolation anchoring (unit)", () => {
  const repoGuid = "5a9c8b7d-6e5f-4a3b-2c1d-0e9f8a7b6c5d";

  it("allows the repo root itself", () => {
    expect(() => assertWithinConfiguredRepo(repoGuid, repoGuid)).not.toThrow();
  });

  it("allows a proper descendant address", () => {
    expect(() => assertWithinConfiguredRepo(`${repoGuid}/03/21`, repoGuid)).not.toThrow();
  });

  it("blocks a completely different repo's address", () => {
    expect(() => assertWithinConfiguredRepo("21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03", repoGuid)).toThrow(
      RepoScopeViolationError
    );
  });

  it("blocks a GUID that merely shares a string prefix with the configured repo (anchoring, not substring match)", () => {
    // repoGuid + extra characters glued directly on, no "/" separator —
    // must NOT pass a naive `.startsWith(repoGuid)` check.
    expect(() => assertWithinConfiguredRepo(`${repoGuid}00/03`, repoGuid)).toThrow(RepoScopeViolationError);
  });

  it("blocks an empty address", () => {
    expect(() => assertWithinConfiguredRepo("", repoGuid)).toThrow(RepoScopeViolationError);
  });
});
