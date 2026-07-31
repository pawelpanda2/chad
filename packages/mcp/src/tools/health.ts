/**
 * chad_mcp_health — diagnostic tool (Input §1.4 "Narzędzie diagnostyczne").
 * Confirms the server is up, its version/protocol, dependency
 * availability, environment mode, and whether the CP/DBA layer is ready —
 * never secrets, connection strings, or full config (Input's own
 * constraint on this tool).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getItemByAddress } from "dba";
import type { McpConfig } from "../config.js";
import { resolveMcpIdentity } from "../identity.js";
import { MCP_PACKAGE_VERSION, MCP_PROTOCOL_VERSION } from "../version.js";
import type { Logger } from "../logging.js";

export function registerHealthTool(server: McpServer, config: McpConfig, logger: Logger): void {
  server.registerTool(
    "chad_mcp_health",
    {
      title: "CHAD MCP health check",
      description:
        "Reports whether the CHAD MCP server is running, its version/protocol, environment mode, " +
        "and whether the CP/DBA data layer is reachable. Read-only, no data access. Never returns " +
        "secrets, connection strings, or full configuration.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const identityConfigured = Boolean(config.testUsername);
      let dbaStatus: "ready" | "degraded" | "not_configured" | "error" = "not_configured";
      let dbaDetail = "MCP_TEST_USERNAME not set — no identity, dba layer not exercised.";

      if (identityConfigured) {
        try {
          const identity = await resolveMcpIdentity(config);
          // Lightweight real connectivity probe — reads the identity's own
          // repo root item (never writes, never another user's data).
          await getItemByAddress(identity.repoGuid);
          dbaStatus = "ready";
          dbaDetail = `Resolved identity "${identity.username}" and read its repo root via the configured primary backend.`;
        } catch (error) {
          dbaStatus = "error";
          dbaDetail = error instanceof Error ? error.message : String(error);
          logger.warn("chad_mcp_health: dba connectivity probe failed", { error: dbaDetail });
        }
      }

      const payload = {
        ok: true,
        server: "chad-mcp",
        version: MCP_PACKAGE_VERSION,
        mcpProtocolVersion: MCP_PROTOCOL_VERSION,
        environment: config.environment,
        transport: config.transport,
        mutationsAllowed: config.allowMutations,
        identityConfigured,
        dba: { status: dbaStatus, detail: dbaDetail },
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
    }
  );
}
