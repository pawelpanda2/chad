/**
 * Real stdio transport smoke test — spawns the actual built server
 * (`dist/stdio.js`) as a child process and talks to it over stdin/stdout
 * using the official MCP TypeScript client, exactly like Odyseusz's
 * `mcp_manager.py` does (command spawn + stdio). Loads its own config from
 * the same `.env.mcp` the process reads on disk (never passed via env —
 * see stdio.ts/config.ts). Skips itself (doesn't fail) if `.env.mcp` or the
 * build output isn't present, matching this repo's convention for
 * infrastructure-dependent integration tests (see
 * tests/1_4_tables-release/daily/integration/qnap-test3-daily-dates.test.mjs).
 */

import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const DIST_STDIO = resolve(__dirname, "../dist/stdio.js");
const ENV_MCP = resolve(REPO_ROOT, ".env.mcp");

const canRun = existsSync(DIST_STDIO) && existsSync(ENV_MCP);

describe.skipIf(!canRun)("Real stdio transport (spawned process, official MCP client)", () => {
  let client: Client;

  beforeAll(async () => {
    const transport = new StdioClientTransport({ command: process.execPath, args: [DIST_STDIO] });
    client = new Client({ name: "stdio-smoke-test-client", version: "0.0.0" });
    await client.connect(transport);
    return async () => {
      await client.close();
    };
  });

  it("initializes and lists tools over real stdio", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("chad_mcp_health");
  });

  it("calls chad_mcp_health over real stdio and gets a real dba connectivity result", async () => {
    const result = await client.callTool({ name: "chad_mcp_health", arguments: {} });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse((result.content as Array<{ text?: string }>)[0].text!);
    expect(payload.ok).toBe(true);
  });
});

if (!canRun) {
  describe.skip("Real stdio transport (spawned process, official MCP client) — SKIPPED", () => {
    it("requires `pnpm --filter mcp build` and a real .env.mcp (copy .env.mcp.example)", () => {});
  });
}
