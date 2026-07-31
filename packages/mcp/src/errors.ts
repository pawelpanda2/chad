/**
 * Domain error taxonomy + mapping to MCP tool-call error responses
 * (Input §1.11 — "mapowanie błędów domenowych na odpowiedzi MCP",
 * "czytelne błędy domenowe"). Every tool handler in tools/*.ts throws one
 * of these (or lets a caught `dba`/identity error pass through
 * `toToolErrorResult`) instead of returning ad-hoc error shapes.
 */

import { RepoAccessDeniedError } from "dba";
import { IdentityNotConfiguredError, RepoScopeViolationError } from "./identity.js";

export type McpErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "LIMIT_EXCEEDED"
  | "REPO_SCOPE_VIOLATION"
  | "IDENTITY_NOT_CONFIGURED"
  | "MUTATIONS_DISABLED"
  | "INTERNAL";

export class McpToolError extends Error {
  readonly code: McpErrorCode;
  constructor(code: McpErrorCode, message: string) {
    super(message);
    this.name = "McpToolError";
    this.code = code;
  }
}

export class ValidationError extends McpToolError {
  constructor(message: string) {
    super("VALIDATION", message);
  }
}

export class NotFoundError extends McpToolError {
  constructor(message: string) {
    super("NOT_FOUND", message);
  }
}

export class LimitExceededError extends McpToolError {
  constructor(message: string) {
    super("LIMIT_EXCEEDED", message);
  }
}

export class MutationsDisabledError extends McpToolError {
  constructor() {
    super(
      "MUTATIONS_DISABLED",
      "This server was started with MCP_ALLOW_MUTATIONS not set to true — write tools are not available."
    );
  }
}

/**
 * The MCP tool-call content shape for an error result (isError: true, one
 * text block). Index signature matches the SDK's own `CallToolResult`
 * (`{ [x: string]: unknown; content: ...; isError?: boolean }`) — required
 * for `registerTool`'s callback return type to accept this shape.
 */
export interface ToolErrorResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError: true;
}

/**
 * Converts any thrown error (domain or otherwise) into a structured MCP
 * error result — never lets a raw stack trace or a bare provider/driver
 * error message escape uncategorized, and never throws past this point (a
 * thrown error from a tool handler is a protocol-level failure, not a
 * normal "the operation failed" outcome the calling model can reason
 * about).
 */
export function toToolErrorResult(error: unknown): ToolErrorResult {
  const { code, message } = classify(error);
  return {
    content: [{ type: "text", text: `[${code}] ${message}` }],
    isError: true,
  };
}

function classify(error: unknown): { code: McpErrorCode; message: string } {
  if (error instanceof McpToolError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof RepoScopeViolationError) {
    return { code: "REPO_SCOPE_VIOLATION", message: error.message };
  }
  if (error instanceof IdentityNotConfiguredError) {
    return { code: "IDENTITY_NOT_CONFIGURED", message: error.message };
  }
  if (error instanceof RepoAccessDeniedError) {
    return { code: "IDENTITY_NOT_CONFIGURED", message: `Repo access denied: ${error.message}` };
  }
  if (error instanceof Error) {
    return { code: "INTERNAL", message: error.message };
  }
  return { code: "INTERNAL", message: String(error) };
}
