import { describe, it, expect } from "vitest";
import { loadMcpConfig, McpConfigError } from "./config.js";

function env(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { ...overrides };
}

describe("loadMcpConfig", () => {
  it("defaults to stdio, read-only, local, no auth token", () => {
    const config = loadMcpConfig(env(), "/nonexistent/.env.mcp");
    expect(config.transport).toBe("stdio");
    expect(config.environment).toBe("local");
    expect(config.allowMutations).toBe(false);
    expect(config.httpAuthToken).toBeNull();
  });

  it("rejects MCP_ALLOW_MUTATIONS=true outside environment=local", () => {
    expect(() =>
      loadMcpConfig(env({ MCP_ALLOW_MUTATIONS: "true", MCP_ENVIRONMENT: "test", MCP_TEST_USERNAME: "test3" }), "/nonexistent/.env.mcp")
    ).toThrow(McpConfigError);
  });

  it("rejects MCP_ALLOW_MUTATIONS=true for any username other than test3", () => {
    expect(() =>
      loadMcpConfig(env({ MCP_ALLOW_MUTATIONS: "true", MCP_TEST_USERNAME: "pawel_f" }), "/nonexistent/.env.mcp")
    ).toThrow(McpConfigError);
    expect(() =>
      loadMcpConfig(env({ MCP_ALLOW_MUTATIONS: "true", MCP_TEST_USERNAME: "kamil_s" }), "/nonexistent/.env.mcp")
    ).toThrow(McpConfigError);
  });

  it("accepts MCP_ALLOW_MUTATIONS=true for test3 in local environment", () => {
    const config = loadMcpConfig(env({ MCP_ALLOW_MUTATIONS: "true", MCP_TEST_USERNAME: "test3" }), "/nonexistent/.env.mcp");
    expect(config.allowMutations).toBe(true);
  });

  it("requires MCP_HTTP_AUTH_TOKEN when MCP_TRANSPORT=http", () => {
    expect(() => loadMcpConfig(env({ MCP_TRANSPORT: "http" }), "/nonexistent/.env.mcp")).toThrow(McpConfigError);
  });

  it("accepts MCP_TRANSPORT=http with a token set", () => {
    const config = loadMcpConfig(env({ MCP_TRANSPORT: "http", MCP_HTTP_AUTH_TOKEN: "sometoken" }), "/nonexistent/.env.mcp");
    expect(config.transport).toBe("http");
    expect(config.httpAuthToken).toBe("sometoken");
  });

  it("rejects an unrecognized MCP_ENVIRONMENT value", () => {
    expect(() => loadMcpConfig(env({ MCP_ENVIRONMENT: "production" }), "/nonexistent/.env.mcp")).toThrow(McpConfigError);
  });

  it("rejects a non-numeric MCP_MAX_RESULTS", () => {
    expect(() => loadMcpConfig(env({ MCP_MAX_RESULTS: "not-a-number" }), "/nonexistent/.env.mcp")).toThrow(McpConfigError);
  });
});
