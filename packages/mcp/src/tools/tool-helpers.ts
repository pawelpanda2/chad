import { toToolErrorResult, type ToolErrorResult } from "../errors.js";

/** Index signature matches the SDK's own `CallToolResult` — see errors.ts's `ToolErrorResult` doc comment. */
export interface ToolSuccessResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
}

export function jsonResult(payload: unknown): ToolSuccessResult {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

/**
 * Every tool handler in this directory is wrapped with this — converts any
 * thrown domain/dba/identity error into a structured MCP error result
 * instead of letting it become a raw protocol-level failure or leaking an
 * unclassified stack trace to the model (Input §1.11).
 */
export function withToolErrorHandling<Args extends unknown[]>(
  fn: (...args: Args) => Promise<ToolSuccessResult>
): (...args: Args) => Promise<ToolSuccessResult | ToolErrorResult> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (error) {
      return toToolErrorResult(error);
    }
  };
}
