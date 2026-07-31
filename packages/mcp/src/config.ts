/**
 * Config loader for the CHAD MCP server. Same pattern as
 * `plugins/beeper-synch/src/config.ts`: this is a plain host process (spawned
 * by Odyseusz/ChatGPT via stdio or run standalone for HTTP), not a container,
 * so it reads its own env file (`<repoRoot>/.env.mcp`) rather than the
 * Docker-oriented `.env.local` (whose Postgres/Mongo hostnames — `postgres`,
 * `mongodb` — only resolve inside the docker-compose network, not on the
 * host). `.env.mcp.example` documents every variable.
 *
 * No new ad-hoc env system — plain `process.env`, same convention `dba`
 * itself uses (see `data-providers/config.ts`).
 */

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** repo root: src -> mcp -> packages -> repo root */
export const REPO_ROOT = resolve(__dirname, "../../..");

export class McpConfigError extends Error {}

export type McpTransport = "stdio" | "http";
export type McpEnvironment = "local" | "test";

export interface McpConfig {
  transport: McpTransport;
  environment: McpEnvironment;
  /** The one test identity mutations are ever allowed to run as. Must be "test3" — see identity.ts. */
  testUsername: string;
  /** Explicit opt-in required in addition to environment=local before any write tool is registered. */
  allowMutations: boolean;
  httpHost: string;
  httpPort: number;
  /** Bearer token required on every HTTP request. Never has a default — must be set explicitly. */
  httpAuthToken: string | null;
  maxResults: number;
  maxPhraseLength: number;
  searchTimeoutMs: number;
  logLevel: "debug" | "info" | "warn" | "error";
}

function readEnum<T extends string>(env: NodeJS.ProcessEnv, name: string, allowed: readonly T[], fallback: T): T {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new McpConfigError(`${name} must be one of ${allowed.join("/")}, got ${JSON.stringify(raw)}`);
  }
  return raw as T;
}

function readBool(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw === "true" || raw === "1";
}

function readNumber(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new McpConfigError(`${name} must be a positive number, got ${JSON.stringify(raw)}`);
  }
  return n;
}

/**
 * `env` is injectable for tests; defaults to `process.env` merged with the
 * repo's `.env.mcp` file (dotenv does not override already-set process env
 * vars, so real shell/launcher env always wins over the file).
 */
export function loadMcpConfig(
  env: NodeJS.ProcessEnv = process.env,
  envFilePath: string = resolve(REPO_ROOT, ".env.mcp")
): McpConfig {
  if (existsSync(envFilePath)) {
    // quiet: true — dotenv 17+ otherwise writes an "injected env" banner to
    // STDOUT, which corrupts the MCP stdio JSON-RPC channel (stdout is the
    // wire protocol, see stdio.ts's own doc comment). Found via the real
    // Odyseusz acceptance test (Story 97): its Python MCP client logged a
    // JSONRPCMessage parse failure for exactly this banner line.
    dotenv.config({ path: envFilePath, processEnv: env, quiet: true });
  }

  const environment = readEnum(env, "MCP_ENVIRONMENT", ["local", "test"] as const, "local");
  const allowMutations = readBool(env, "MCP_ALLOW_MUTATIONS", false);
  const testUsername = env.MCP_TEST_USERNAME ?? "";

  // Guard rail (Input §1.6): mutations require BOTH the explicit opt-in AND
  // environment=local — never inferred, never on by default.
  if (allowMutations && environment !== "local") {
    throw new McpConfigError(
      `MCP_ALLOW_MUTATIONS=true requires MCP_ENVIRONMENT=local, got MCP_ENVIRONMENT=${JSON.stringify(environment)}. Refusing to start with mutations enabled outside "local".`
    );
  }
  if (allowMutations && testUsername !== "test3") {
    throw new McpConfigError(
      `MCP_ALLOW_MUTATIONS=true requires MCP_TEST_USERNAME="test3" (the one identity this repo has an established, guarded test repoGuid for — see packages/dba/src/testing/test3-guard.ts). Got ${JSON.stringify(testUsername)}.`
    );
  }

  const transport = readEnum(env, "MCP_TRANSPORT", ["stdio", "http"] as const, "stdio");
  const httpAuthToken = env.MCP_HTTP_AUTH_TOKEN?.trim() || null;
  if (transport === "http" && !httpAuthToken) {
    throw new McpConfigError(
      "MCP_TRANSPORT=http requires MCP_HTTP_AUTH_TOKEN to be set — refusing to start an unauthenticated HTTP endpoint."
    );
  }

  return {
    transport,
    environment,
    testUsername,
    allowMutations,
    httpHost: env.MCP_HTTP_HOST || "127.0.0.1",
    httpPort: readNumber(env, "MCP_HTTP_PORT", 8420),
    httpAuthToken,
    maxResults: readNumber(env, "MCP_MAX_RESULTS", 50),
    maxPhraseLength: readNumber(env, "MCP_MAX_PHRASE_LENGTH", 200),
    searchTimeoutMs: readNumber(env, "MCP_SEARCH_TIMEOUT_MS", 10_000),
    logLevel: readEnum(env, "MCP_LOG_LEVEL", ["debug", "info", "warn", "error"] as const, "info"),
  };
}
