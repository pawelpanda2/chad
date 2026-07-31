/**
 * Real integration tests against the ACTUAL shared QNAP Postgres, using
 * test3, isolated by repoGuid — no local/isolated stack, no mocking of
 * `dba`. Matches this repo's existing convention for QNAP-targeted
 * integration tests (see
 * tests/1_4_tables-release/daily/integration/qnap-test3-daily-dates.test.mjs).
 * Skips itself (not fails) if `.env.mcp` isn't present locally — this is an
 * infrastructure precondition, not a code regression signal.
 *
 * Every write in this file is scoped to test3's own repo — see
 * cross-user-isolation tests below for the structural (not just runtime)
 * guarantee that no tool call here could ever touch another user's data.
 */

import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { loadMcpConfig } from "./config.js";
import { buildMcpServer } from "./server.js";
import { createLogger } from "./logging.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_MCP = resolve(__dirname, "../../../.env.mcp");
const canRun = existsSync(ENV_MCP);

function toolText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  return (result.content as Array<{ type: string; text?: string }>)[0].text ?? "";
}

function toolJson(result: Awaited<ReturnType<Client["callTool"]>>): any {
  return JSON.parse(toolText(result));
}

describe.skipIf(!canRun)("Real integration — cp_* tools against test3 on QNAP Postgres", () => {
  let client: Client;

  beforeAll(async () => {
    const config = loadMcpConfig(); // real process env + real .env.mcp
    expect(config.testUsername).toBe("test3");
    expect(config.allowMutations).toBe(true);
    const server = buildMcpServer(config, createLogger("error"));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "integration-test-client", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  });

  it("cp_get_item reads test3's real repo root (loca \"\")", async () => {
    const result = await client.callTool({ name: "cp_get_item", arguments: { loca: "" } });
    expect(result.isError).toBeFalsy();
    const item = toolJson(result);
    expect(item.name).toBe("test3");
    expect(item.type).toBe("Folder");
  });

  it("cp_get_by_names resolves test3's real 'views' child", async () => {
    const result = await client.callTool({ name: "cp_get_by_names", arguments: { names: ["views"] } });
    expect(result.isError).toBeFalsy();
    const item = toolJson(result);
    expect(item.name).toBe("views");
  });

  it("cp_get_many_by_name finds the 'views' child under the repo root", async () => {
    const result = await client.callTool({ name: "cp_get_many_by_name", arguments: { parentLoca: "", name: "views" } });
    expect(result.isError).toBeFalsy();
    const payload = toolJson(result);
    expect(payload.count).toBeGreaterThanOrEqual(1);
    expect(payload.items[0].name).toBe("views");
  });

  it("cp_get_many_by_name returns zero matches (not an error) for a name that doesn't exist", async () => {
    const result = await client.callTool({
      name: "cp_get_many_by_name",
      arguments: { parentLoca: "", name: "definitely-does-not-exist-12345" },
    });
    expect(result.isError).toBeFalsy();
    expect(toolJson(result).count).toBe(0);
  });

  it("cp_find_recursively finds the known Story 78 seed marker under the repo root", async () => {
    const result = await client.callTool({ name: "cp_find_recursively", arguments: { rootLoca: "", phrase: "story78-seed" } });
    expect(result.isError).toBeFalsy();
    const payload = toolJson(result);
    expect(payload.totalFound).toBeGreaterThanOrEqual(1);
  });

  it("cp_create_item creates a new child atomically with its content, then cp_get_item reads it back", async () => {
    const name = `mcp-story97-${randomUUID().slice(0, 8)}`;
    const content = `hello from MCP integration test — ${new Date().toISOString()}`;

    const created = await client.callTool({
      name: "cp_create_item",
      arguments: { parentLoca: "", type: "Text", name, content },
    });
    expect(created.isError).toBeFalsy();
    const createdItem = toolJson(created);
    expect(createdItem.name).toBe(name);
    expect(createdItem.body).toBe(content);
    expect(createdItem.contentApplied).toBe(true);

    const loca = createdItem.address.split("/").slice(1).join("/"); // strip repoGuid prefix

    const reread = await client.callTool({ name: "cp_get_item", arguments: { loca } });
    expect(reread.isError).toBeFalsy();
    expect(toolJson(reread).body).toBe(content);
  });

  it("cp_create_item on an already-existing name returns it unchanged (find, never overwrite) — contentApplied reflects that", async () => {
    const name = `mcp-story97-existing-${randomUUID().slice(0, 8)}`;
    const first = await client.callTool({ name: "cp_create_item", arguments: { parentLoca: "", type: "Text", name, content: "original" } });
    expect(toolJson(first).contentApplied).toBe(true);

    const second = await client.callTool({ name: "cp_create_item", arguments: { parentLoca: "", type: "Text", name, content: "attempted overwrite" } });
    expect(second.isError).toBeFalsy();
    const secondItem = toolJson(second);
    expect(secondItem.body).toBe("original"); // untouched
    expect(secondItem.contentApplied).toBe(false); // content did NOT get applied — found, not created
  });

  it("cp_put_item edits an existing item's body — write then read-after-write", async () => {
    const name = `mcp-story97-editable-${randomUUID().slice(0, 8)}`;
    const created = await client.callTool({ name: "cp_create_item", arguments: { parentLoca: "", type: "Text", name, content: "v1" } });
    const createdItem = toolJson(created);
    const loca = createdItem.address.split("/").slice(1).join("/");

    const edited = await client.callTool({
      name: "cp_put_item",
      arguments: { loca, type: "Text", name, content: "v2 — edited by integration test" },
    });
    expect(edited.isError).toBeFalsy();
    expect(toolJson(edited).body).toBe("v2 — edited by integration test");

    const reread = await client.callTool({ name: "cp_get_item", arguments: { loca } });
    expect(toolJson(reread).body).toBe("v2 — edited by integration test");
  });

  it("cp_put_item refuses when type/name don't match the existing item's real identity", async () => {
    const name = `mcp-story97-guarded-${randomUUID().slice(0, 8)}`;
    const created = await client.callTool({ name: "cp_create_item", arguments: { parentLoca: "", type: "Text", name, content: "v1" } });
    const loca = toolJson(created).address.split("/").slice(1).join("/");

    const result = await client.callTool({
      name: "cp_put_item",
      arguments: { loca, type: "Folder", name: "wrong-name", content: "should not be written" },
    });
    expect(result.isError).toBe(true);
    expect(toolText(result)).toContain("[VALIDATION]");

    const reread = await client.callTool({ name: "cp_get_item", arguments: { loca } });
    expect(toolJson(reread).body).toBe("v1"); // unchanged
  });

  it("cp_get_item on a non-existent loca returns NOT_FOUND, not another user's data", async () => {
    const result = await client.callTool({ name: "cp_get_item", arguments: { loca: "99/99/99" } });
    expect(result.isError).toBe(true);
    expect(toolText(result)).toContain("[NOT_FOUND]");
  });

  describe("cross-user isolation", () => {
    it("structurally cannot address another user's repo: pawel_f's real repoGuid is not a valid loca", async () => {
      const pawelFRepoGuid = "21d11bdc-f1f4-44d1-b61a-3fa6b039c641";
      const result = await client.callTool({ name: "cp_get_item", arguments: { loca: `${pawelFRepoGuid}/03` } });
      expect(result.isError).toBe(true);
      expect(toolText(result)).toContain("[VALIDATION]");
    });

    it("cp_get_by_names cannot be steered outside test3's own repo — names are logical, not addresses", async () => {
      // Even a maximally adversarial "name" is just a literal string to
      // match against config.name within the caller's own repo — it can
      // never be interpreted as another repoGuid/address.
      const result = await client.callTool({
        name: "cp_get_by_names",
        arguments: { names: ["21d11bdc-f1f4-44d1-b61a-3fa6b039c641"] },
      });
      expect(result.isError).toBe(true);
      expect(toolText(result)).toContain("[NOT_FOUND]");
    });
  });
});

if (!canRun) {
  describe.skip("Real integration — cp_* tools against test3 on QNAP Postgres — SKIPPED", () => {
    it("requires a real .env.mcp (copy .env.mcp.example, fill in credentials)", () => {});
  });
}
