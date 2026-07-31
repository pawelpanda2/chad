#!/usr/bin/env node
/**
 * Streamable HTTP entrypoint (Input §1.7/§1.10) — current MCP spec
 * transport (`StreamableHTTPServerTransport`, single `/mcp` endpoint
 * handling POST/GET/DELETE, session-stateful). Legacy HTTP+SSE is
 * intentionally NOT implemented — Odyseusz's own client
 * (`src/mcp_manager.py`'s `_connect_http` → `streamablehttp_client`)
 * already supports Streamable HTTP, so there is no compatibility reason to
 * fall back to the deprecated transport.
 *
 * Auth model for THIS Story only: a single static bearer token
 * (`MCP_HTTP_AUTH_TOKEN`), checked on every request before any MCP message
 * is processed. This is explicitly a local/dev-scope mechanism, not a
 * production-ready auth gateway — see human-docs/mcp/README.md's "ChatGPT
 * preparation" section for what a real deployment still needs (per-request
 * identity → repoGuid mapping via OAuth, not this module's one shared
 * identity — see identity.ts's own doc comment). No anonymous request is
 * ever allowed through.
 */

import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadMcpConfig } from "./config.js";
import { createLogger } from "./logging.js";
import { buildMcpServer } from "./server.js";

const MCP_PATH = "/mcp";

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  return JSON.parse(raw);
}

function isAuthorized(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return false;
  const provided = header.slice("Bearer ".length).trim();
  // Constant-time-ish comparison isn't critical here (local/dev scope,
  // documented above) — length check first avoids the common
  // startsWith-prefix timing footgun for the common "wrong token" case.
  return provided.length === token.length && provided === token;
}

async function main(): Promise<void> {
  const config = loadMcpConfig();
  const logger = createLogger(config.logLevel);
  if (config.transport !== "http" || !config.httpAuthToken) {
    // Config already validates this combination, but fail loudly here too
    // rather than silently starting an unauthenticated server.
    throw new Error("http.ts requires MCP_TRANSPORT=http and MCP_HTTP_AUTH_TOKEN to be set.");
  }
  const authToken = config.httpAuthToken;

  const server = buildMcpServer(config, logger);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
  await server.connect(transport);

  const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      try {
        if (!req.url || !req.url.startsWith(MCP_PATH)) {
          res.writeHead(404).end();
          return;
        }
        if (!isAuthorized(req, authToken)) {
          logger.warn("Rejected unauthorized HTTP request", { path: req.url, method: req.method });
          res.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "UNAUTHORIZED" }));
          return;
        }
        const body = req.method === "POST" ? await readJsonBody(req) : undefined;
        await transport.handleRequest(req, res, body);
      } catch (error) {
        logger.error("HTTP request handling failed", { error: error instanceof Error ? error.message : String(error) });
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "INTERNAL" }));
        }
      }
    })();
  });

  httpServer.listen(config.httpPort, config.httpHost, () => {
    logger.info("CHAD MCP server listening (Streamable HTTP)", {
      host: config.httpHost,
      port: config.httpPort,
      path: MCP_PATH,
      mutationsAllowed: config.allowMutations,
    });
  });
}

main().catch((error) => {
  process.stderr.write(
    `[chad-mcp] fatal: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
  );
  process.exit(1);
});
