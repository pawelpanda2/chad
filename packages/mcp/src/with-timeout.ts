import { McpToolError } from "./errors.js";

export class SearchTimeoutError extends McpToolError {
  constructor(timeoutMs: number) {
    super("LIMIT_EXCEEDED", `Search timed out after ${timeoutMs}ms (MCP_SEARCH_TIMEOUT_MS).`);
  }
}

/** Races `promise` against a timeout — used by cp_find_recursively (Input §1.4's "timeout lub anulowanie"). */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SearchTimeoutError(timeoutMs)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
