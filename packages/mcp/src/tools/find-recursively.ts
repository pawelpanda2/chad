/**
 * cp_find_recursively — searches every descendant of `rootLoca` (within the
 * caller's own repo) for items whose body contains `phrase`. Delegates
 * entirely to `dba`'s `findRecursively` (`packages/dba/src/item-ops.ts`),
 * the generic counterpart of `IMethodWorker.FindRecursively` — no custom
 * traversal. Guards: repo-scoped by construction (address is built from the
 * resolved identity's repoGuid, never a client-supplied one), phrase length
 * limit, result count limit, and a search timeout (Input §1.4).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findRecursively } from "dba";
import type { McpConfig } from "../config.js";
import { withMcpIdentity } from "../identity.js";
import { ValidationError } from "../errors.js";
import { addressFromLoca, isValidLoca, toCpItemOutput } from "../cp-output.js";
import { withTimeout } from "../with-timeout.js";
import { jsonResult, withToolErrorHandling } from "./tool-helpers.js";

export function registerFindRecursivelyTool(server: McpServer, config: McpConfig): void {
  server.registerTool(
    "cp_find_recursively",
    {
      title: "Find CpItems recursively",
      description:
        "Searches every descendant of rootLoca (within your own repo) for items whose body contains `phrase` " +
        "(substring match) — matches the existing FindRecursively operation. Read-only. Results are truncated " +
        `to ${config.maxResults} (MCP_MAX_RESULTS) with a "truncated" flag if more were found; phrase length is ` +
        `capped at ${config.maxPhraseLength} chars (MCP_MAX_PHRASE_LENGTH); the search is aborted with an error ` +
        `after ${config.searchTimeoutMs}ms (MCP_SEARCH_TIMEOUT_MS).`,
      inputSchema: {
        rootLoca: z
          .string()
          .default("")
          .describe('Numeric CP path to start the search from, e.g. "03/21". Empty string means the whole repo.'),
        phrase: z.string().min(1).describe("Substring to search for in item bodies."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    withToolErrorHandling(async ({ rootLoca, phrase }: { rootLoca: string; phrase: string }) => {
      if (!isValidLoca(rootLoca)) {
        throw new ValidationError(`rootLoca must be empty or numeric segments separated by "/" — got ${JSON.stringify(rootLoca)}.`);
      }
      if (phrase.trim().length === 0) {
        throw new ValidationError("phrase must not be empty.");
      }
      if (phrase.length > config.maxPhraseLength) {
        throw new ValidationError(`phrase is ${phrase.length} chars, exceeding the configured limit of ${config.maxPhraseLength} (MCP_MAX_PHRASE_LENGTH).`);
      }
      return withMcpIdentity(config, async (identity) => {
        const rootAddress = addressFromLoca(identity.repoGuid, rootLoca);
        const results = await withTimeout(findRecursively(rootAddress, phrase), config.searchTimeoutMs);
        const truncated = results.length > config.maxResults;
        const page = truncated ? results.slice(0, config.maxResults) : results;
        return jsonResult({
          items: page.map(toCpItemOutput),
          count: page.length,
          totalFound: results.length,
          truncated,
        });
      });
    })
  );
}
