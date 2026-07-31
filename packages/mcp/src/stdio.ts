#!/usr/bin/env node
/**
 * stdio entrypoint — the transport Odyseusz's `mcp_manager.py` uses
 * (`StdioServerParameters` + `stdio_client`, spawning this exact command).
 * All logging goes to stderr (logging.ts); stdout is reserved for the MCP
 * JSON-RPC wire protocol.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadMcpConfig } from "./config.js";
import { createLogger } from "./logging.js";
import { buildMcpServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadMcpConfig();
  const logger = createLogger(config.logLevel);
  logger.info("Starting CHAD MCP server (stdio)", {
    environment: config.environment,
    mutationsAllowed: config.allowMutations,
    testUsername: config.testUsername || null,
  });

  const server = buildMcpServer(config, logger);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("CHAD MCP server connected over stdio, awaiting requests");
}

main().catch((error) => {
  process.stderr.write(
    `[chad-mcp] fatal: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
  );
  process.exit(1);
});
