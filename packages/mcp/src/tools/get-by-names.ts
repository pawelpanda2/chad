/**
 * cp_get_by_names — reads an item by a sequence of logical names starting
 * at the repo root, e.g. ["leads", "msg planner"]. Delegates entirely to
 * `dba`'s `resolveByNames` (`packages/dba/src/item-ops.ts`), the direct
 * counterpart of the legacy `IItemWorker.GetByNames` wire operation
 * (`human-docs/dba/data-access.md` §4) — no custom tree-walking here.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveByNames } from "dba";
import type { McpConfig } from "../config.js";
import { withMcpIdentity } from "../identity.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { toCpItemOutput } from "../cp-output.js";
import { jsonResult, withToolErrorHandling } from "./tool-helpers.js";

export function registerGetByNamesTool(server: McpServer, config: McpConfig): void {
  server.registerTool(
    "cp_get_by_names",
    {
      title: "Get CpItem by name sequence",
      description:
        "Reads a CpItem by following a sequence of logical (config.name) names starting at your repo root, " +
        'e.g. ["leads", "msg planner"]. Matches the existing GetByNames operation exactly — no custom path ' +
        "guessing. Read-only.",
      inputSchema: {
        names: z
          .array(z.string().min(1))
          .min(1)
          .describe('Logical name sequence from the repo root, e.g. ["leads", "msg planner"].'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    withToolErrorHandling(async ({ names }: { names: string[] }) => {
      if (names.some((n) => n.trim().length === 0)) {
        throw new ValidationError("names must not contain empty strings.");
      }
      return withMcpIdentity(config, async () => {
        const item = await resolveByNames(names);
        if (!item) {
          throw new NotFoundError(`No CpItem found for name sequence ${JSON.stringify(names)} in your repo.`);
        }
        return jsonResult(toCpItemOutput(item));
      });
    })
  );
}
