/**
 * cp_put_item — MUTATING. Overwrites an existing CpItem's body in place,
 * matching the current, real `Put` semantics used across `dba`: identity
 * (address/type/name) is never re-allocated (`packages/dba/src/item-ops.ts`'s
 * `putItemBody`), only the body changes. `type` and `name` are REQUIRED
 * inputs (Input §1.4's "walidacja type, name, loca i content") and are
 * verified to match the existing item's own config before writing — if a
 * caller's belief about what identity lives at `loca` is wrong, this fails
 * loudly instead of silently overwriting a different item's body.
 *
 * Only registered on the server when mutations are enabled
 * (`config.allowMutations`) — see server.ts.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getItemByAddress, putItemBody } from "dba";
import type { McpConfig } from "../config.js";
import { assertWithinConfiguredRepo, withMcpIdentity } from "../identity.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { addressFromLoca, isValidLoca, toCpItemOutput } from "../cp-output.js";
import { jsonResult, withToolErrorHandling } from "./tool-helpers.js";

export function registerPutItemTool(server: McpServer, config: McpConfig): void {
  server.registerTool(
    "cp_put_item",
    {
      title: "Edit CpItem (write)",
      description:
        "MUTATES DATA. Overwrites an existing CpItem's body in place at `loca` (within your own repo). " +
        "`type` and `name` must match the item's current identity exactly — this call refuses to write if " +
        "they don't, rather than silently overwriting a different item. Never changes identity (address/type/name), " +
        "only body. Returns the saved item.",
      inputSchema: {
        loca: z.string().min(1).describe('Numeric CP path of the item to edit, e.g. "03/21/05". Cannot be empty (cannot edit the repo root).'),
        type: z.string().min(1).describe("Expected current type of the item (e.g. \"Text\", \"Folder\") — must match exactly."),
        name: z.string().min(1).describe("Expected current logical name of the item — must match exactly."),
        content: z.string().describe("New body content to write."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    withToolErrorHandling(async ({ loca, type, name, content }: { loca: string; type: string; name: string; content: string }) => {
      if (!isValidLoca(loca) || loca === "") {
        throw new ValidationError(`loca must be a non-empty numeric path, e.g. "03/21/05" — got ${JSON.stringify(loca)}.`);
      }
      return withMcpIdentity(config, async (identity) => {
        const address = addressFromLoca(identity.repoGuid, loca);
        assertWithinConfiguredRepo(address, identity.repoGuid);

        const existing = await getItemByAddress(address);
        if (!existing) {
          throw new NotFoundError(`No CpItem found at loca ${JSON.stringify(loca)} in your repo — nothing to edit.`);
        }
        if (existing.config.type !== type || existing.config.name !== name) {
          throw new ValidationError(
            `Identity mismatch at loca ${JSON.stringify(loca)}: expected type=${JSON.stringify(type)} name=${JSON.stringify(name)}, ` +
              `found type=${JSON.stringify(existing.config.type)} name=${JSON.stringify(existing.config.name)}. Refusing to overwrite.`
          );
        }

        const updated = await putItemBody(address, content);
        return jsonResult(toCpItemOutput(updated));
      });
    })
  );
}
