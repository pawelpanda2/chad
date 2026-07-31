/**
 * cp_get_item — reads a single CpItem by `loca` (the numeric path within
 * the caller's own repo, e.g. "03/21/05"; "" for the repo root). Calls
 * `dba`'s `getItemByLoca` (`packages/dba/src/item-ops.ts`), which resolves
 * `getCurrentRepoGuid() + loca` and reads through `DbaDataRouter` — never a
 * direct provider/DB call. `loca` is validated against CP's own address
 * segment format before use; no other path/identifier shape is guessed.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getItemByLoca } from "dba";
import type { McpConfig } from "../config.js";
import { withMcpIdentity } from "../identity.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { isValidLoca, toCpItemOutput } from "../cp-output.js";
import { jsonResult, withToolErrorHandling } from "./tool-helpers.js";

export function registerGetItemTool(server: McpServer, config: McpConfig): void {
  server.registerTool(
    "cp_get_item",
    {
      title: "Get CpItem",
      description:
        "Reads a single CpItem by its loca (the numeric path within your own repo, e.g. \"03/21/05\"; " +
        "omit or pass \"\" for the repo root). Returns the full item: id, address, type, name, config, body. " +
        "Read-only.",
      inputSchema: {
        loca: z
          .string()
          .default("")
          .describe('Numeric CP path within your repo, e.g. "03/21/05". Empty string means the repo root.'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    withToolErrorHandling(async ({ loca }: { loca: string }) => {
      if (!isValidLoca(loca)) {
        throw new ValidationError(
          `loca must be empty or numeric segments separated by "/", e.g. "03/21/05" — got ${JSON.stringify(loca)}.`
        );
      }
      return withMcpIdentity(config, async () => {
        const item = await getItemByLoca(loca);
        if (!item) {
          throw new NotFoundError(`No CpItem found at loca ${JSON.stringify(loca)} in your repo.`);
        }
        return jsonResult(toCpItemOutput(item));
      });
    })
  );
}
