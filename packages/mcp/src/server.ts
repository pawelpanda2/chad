/**
 * Transport-agnostic server assembly (Input §1.3/§1.7 — tool logic must
 * never depend on which transport is active). stdio.ts and http.ts each
 * just build this server and connect a transport to it.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpConfig } from "./config.js";
import { createLogger, type Logger } from "./logging.js";
import { registerHealthTool } from "./tools/health.js";
import { registerGetItemTool } from "./tools/get-item.js";
import { registerGetByNamesTool } from "./tools/get-by-names.js";
import { registerGetManyByNameTool } from "./tools/get-many-by-name.js";
import { registerFindRecursivelyTool } from "./tools/find-recursively.js";
import { registerPutItemTool } from "./tools/put-item.js";
import { registerCreateItemTool } from "./tools/create-item.js";
import { MCP_PACKAGE_VERSION } from "./version.js";

export function buildMcpServer(config: McpConfig, logger: Logger = createLogger(config.logLevel)): McpServer {
  const server = new McpServer({ name: "chad-mcp", version: MCP_PACKAGE_VERSION });

  registerHealthTool(server, config, logger);
  registerGetItemTool(server, config);
  registerGetByNamesTool(server, config);
  registerGetManyByNameTool(server, config);
  registerFindRecursivelyTool(server, config);

  // Input §1.5 — mutating tools structurally absent from the tool list
  // itself when mutations are disabled, not merely hidden/no-op.
  if (config.allowMutations) {
    registerPutItemTool(server, config);
    registerCreateItemTool(server, config);
    logger.info("Mutation tools registered", { tools: ["cp_put_item", "cp_create_item"], testUsername: config.testUsername });
  } else {
    logger.info("Mutation tools NOT registered (MCP_ALLOW_MUTATIONS is not true) — read-only mode");
  }

  return server;
}
