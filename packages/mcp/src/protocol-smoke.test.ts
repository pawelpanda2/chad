/**
 * Protocol-level smoke tests over an in-memory transport pair — no network,
 * no real dba/Postgres call needed for any assertion here (validation
 * failures and the health check's "not configured" branch both short-
 * circuit before touching the network). Real-network read/write/cross-user
 * flows live in integration.test.ts; a real spawned-process stdio round
 * trip lives in stdio-smoke.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { loadMcpConfig } from "./config.js";
import { buildMcpServer } from "./server.js";
import { createLogger } from "./logging.js";

async function connectedClient(configOverrides: Record<string, string> = {}) {
  const config = loadMcpConfig(configOverrides, "/nonexistent/.env.mcp");
  const server = buildMcpServer(config, createLogger("error"));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, server, config };
}

describe("MCP protocol smoke (in-memory transport)", () => {
  let client: Client;

  afterEach(async () => {
    await client?.close();
  });

  it("initializes and lists tools (read-only server: mutations not registered)", async () => {
    ({ client } = await connectedClient());
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["chad_mcp_health", "cp_find_recursively", "cp_get_by_names", "cp_get_item", "cp_get_many_by_name"]);
  });

  it("registers cp_put_item and cp_create_item only when mutations are enabled", async () => {
    ({ client } = await connectedClient({ MCP_ALLOW_MUTATIONS: "true", MCP_TEST_USERNAME: "test3" }));
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("cp_put_item");
    expect(names).toContain("cp_create_item");
  });

  it("no tool's input schema exposes a repoGuid/repo parameter the model could set", async () => {
    ({ client } = await connectedClient({ MCP_ALLOW_MUTATIONS: "true", MCP_TEST_USERNAME: "test3" }));
    const { tools } = await client.listTools();
    for (const tool of tools) {
      const props = (tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
      expect(Object.keys(props).some((k) => /repo/i.test(k))).toBe(false);
    }
  });

  it("marks mutating tools with destructiveHint/readOnlyHint annotations distinguishing them from reads", async () => {
    ({ client } = await connectedClient({ MCP_ALLOW_MUTATIONS: "true", MCP_TEST_USERNAME: "test3" }));
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(byName.cp_get_item.annotations?.readOnlyHint).toBe(true);
    expect(byName.cp_put_item.annotations?.readOnlyHint).toBe(false);
    expect(byName.cp_create_item.annotations?.readOnlyHint).toBe(false);
    expect(byName.cp_put_item.description).toMatch(/MUTATES DATA/);
    expect(byName.cp_create_item.description).toMatch(/MUTATES DATA/);
  });

  it("calls chad_mcp_health without any network dependency, reporting not_configured when no identity is set", async () => {
    ({ client } = await connectedClient());
    const result = await client.callTool({ name: "chad_mcp_health", arguments: {} });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text?: string }>)[0].text!;
    const payload = JSON.parse(text);
    expect(payload.ok).toBe(true);
    expect(payload.identityConfigured).toBe(false);
    expect(payload.dba.status).toBe("not_configured");
  });

  it("returns a structured VALIDATION error for a malformed loca, without a raw stack trace", async () => {
    ({ client } = await connectedClient());
    const result = await client.callTool({ name: "cp_get_item", arguments: { loca: "not-a-loca" } });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text?: string }>)[0].text!;
    expect(text).toContain("[VALIDATION]");
    expect(text).not.toContain(" at "); // no stack-trace-shaped line
  });

  it("rejects an empty search phrase for cp_find_recursively", async () => {
    ({ client } = await connectedClient());
    const result = await client.callTool({ name: "cp_find_recursively", arguments: { phrase: "" } });
    expect(result.isError).toBe(true);
  });

  it("rejects a phrase exceeding the configured max length", async () => {
    ({ client } = await connectedClient({ MCP_MAX_PHRASE_LENGTH: "5" }));
    const result = await client.callTool({ name: "cp_find_recursively", arguments: { phrase: "way too long" } });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text?: string }>)[0].text!;
    expect(text).toContain("[VALIDATION]");
  });

  it("closes cleanly", async () => {
    ({ client } = await connectedClient());
    await client.close();
    // Re-assigning so afterEach's second close() is a safe no-op.
    client = { close: async () => {} } as unknown as Client;
  });
});
