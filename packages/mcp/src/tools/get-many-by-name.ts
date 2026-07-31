/**
 * cp_get_many_by_name — the legacy `IManyItemsWorker.GetManyByName(repoGuid,
 * parentLoca, name)` operation has no direct counterpart on the current
 * `CpCompatibleDataProvider`/`DbaDataRouter` — it was consolidated into the
 * generic `getChildren(parentAddress)` during the Story 72 provider
 * migration (confirmed: no `getManyByName` exists anywhere in
 * `packages/dba/src`). This tool therefore calls `dba`'s `getChildrenOf`
 * (the one shared "enumerate a folder's children" primitive) and filters
 * by `config.name === name` here — filtering an already-fetched result
 * set, not re-implementing the traversal/storage read itself.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getChildrenOf } from "dba";
import type { McpConfig } from "../config.js";
import { withMcpIdentity } from "../identity.js";
import { LimitExceededError, ValidationError } from "../errors.js";
import { addressFromLoca, isValidLoca, toCpItemOutput } from "../cp-output.js";
import { jsonResult, withToolErrorHandling } from "./tool-helpers.js";

export function registerGetManyByNameTool(server: McpServer, config: McpConfig): void {
  server.registerTool(
    "cp_get_many_by_name",
    {
      title: "Get many CpItems by name",
      description:
        "Finds all direct children of parentLoca (within your own repo) whose logical name matches `name` " +
        "exactly — matches the existing GetManyByName operation's contract. Read-only. Fails with LIMIT_EXCEEDED " +
        `if more than ${config.maxResults} matches are found (raise MCP_MAX_RESULTS if a legitimately larger result is expected).`,
      inputSchema: {
        parentLoca: z
          .string()
          .default("")
          .describe('Numeric CP path of the parent folder, e.g. "03/21". Empty string means the repo root.'),
        name: z.string().min(1).describe("Exact logical name (config.name) to match among the parent's children."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    withToolErrorHandling(async ({ parentLoca, name }: { parentLoca: string; name: string }) => {
      if (!isValidLoca(parentLoca)) {
        throw new ValidationError(`parentLoca must be empty or numeric segments separated by "/" — got ${JSON.stringify(parentLoca)}.`);
      }
      if (name.trim().length === 0) {
        throw new ValidationError("name must not be empty.");
      }
      return withMcpIdentity(config, async (identity) => {
        const parentAddress = addressFromLoca(identity.repoGuid, parentLoca);
        const children = await getChildrenOf(parentAddress);
        const matches = children.filter((c) => c.config.name === name);
        if (matches.length > config.maxResults) {
          throw new LimitExceededError(
            `Found ${matches.length} items named ${JSON.stringify(name)} under ${JSON.stringify(parentLoca)}, ` +
              `which exceeds the configured limit of ${config.maxResults} (MCP_MAX_RESULTS).`
          );
        }
        return jsonResult({ items: matches.map(toCpItemOutput), count: matches.length });
      });
    })
  );
}
