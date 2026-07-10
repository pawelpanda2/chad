/**
 * Minimal HTTP client for the real .NET Content Provider's `/invoke`
 * endpoint. Deliberately self-contained (no tracing/dev-panel coupling) —
 * this is NOT a copy of packages/dba/src/client.ts, which has dashboard-
 * specific tracing built in that doesn't belong here. Same proven
 * mechanism (fetch POST, JSON args array, timeout), independently
 * implemented for cp-net-adapter's own use.
 *
 * Explicitly NOT modeled on legacy-content-provider/typescript_runner,
 * which spawns a `dotnet run` process against a separate, older
 * `SimpleRun.csproj` CLI project on every call — not the actual running
 * API. Confirmed by reading its source (2026-07-10).
 */

import dotenv from "dotenv";

dotenv.config();

const CONTENT_PROVIDER_API_URL = process.env.CONTENT_PROVIDER_API_URL;

export async function invoke(args: string[]): Promise<unknown> {
  if (!CONTENT_PROVIDER_API_URL) {
    throw new Error("CONTENT_PROVIDER_API_URL environment variable is not set");
  }

  const url = `${CONTENT_PROVIDER_API_URL}/invoke`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
      signal: controller.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `Content Provider /invoke failed: HTTP ${response.status} ${response.statusText}\nArgs: ${JSON.stringify(args)}\nResponse: ${text}`
      );
    }

    if (!text) {
      // Put returns an empty 2xx body on success — every other method must
      // return a body, so only accept empty for that case.
      const isPut = args[2] === "Put";
      if (isPut) return { success: true };
      throw new Error(`Empty response body from /invoke.\nArgs: ${JSON.stringify(args)}`);
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON response from /invoke: ${text}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
