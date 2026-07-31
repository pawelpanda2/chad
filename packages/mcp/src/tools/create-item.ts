/**
 * cp_create_item — MUTATING. Find-or-create a single child under an
 * existing parent, matching `PostParentItem`'s real semantics exactly via
 * `dba`'s `createOrGetChild` (`packages/dba/src/item-ops.ts`): if the named
 * child doesn't exist it's created (with `content` as its initial body,
 * atomically — a single write, never a create-then-separate-write); if it
 * already exists, the existing item is returned as-is and its body is
 * NEVER touched (matches PostParentItem's own documented find-or-create
 * behavior — `human-docs/dba/post-parent-item.md`: "If child already
 * exists: Returns the existing item without creating a duplicate").
 * `contentApplied` in the result tells the caller which branch happened,
 * without ever performing a second, non-atomic write to force it.
 *
 * Only registered on the server when mutations are enabled
 * (`config.allowMutations`) — see server.ts.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createOrGetChild, getItemByAddress } from "dba";
import type { McpConfig } from "../config.js";
import { assertWithinConfiguredRepo, withMcpIdentity } from "../identity.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { addressFromLoca, isValidLoca, toCpItemOutput } from "../cp-output.js";
import { jsonResult, withToolErrorHandling } from "./tool-helpers.js";

export function registerCreateItemTool(server: McpServer, config: McpConfig): void {
  server.registerTool(
    "cp_create_item",
    {
      title: "Create CpItem (write)",
      description:
        "MUTATES DATA (may create). Find-or-create a child named `name` under the existing parent at " +
        "`parentLoca` (within your own repo) — matches PostParentItem exactly: if a child with that name " +
        "already exists, it is returned UNCHANGED (its body is never overwritten by this call, even if " +
        "`content` is given); only a newly created child gets `content` as its initial body. Returns the item " +
        "and `contentApplied` (whether the given content ended up as the item's body).",
      inputSchema: {
        parentLoca: z
          .string()
          .default("")
          .describe('Numeric CP path of an EXISTING parent folder, e.g. "03/21". Empty string means the repo root.'),
        type: z.string().min(1).describe('Item type to create, e.g. "Text" or "Folder".'),
        name: z.string().min(1).describe("Logical name of the child to find or create."),
        content: z.string().optional().describe("Initial body — only applied if the child is newly created."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    withToolErrorHandling(
      async ({
        parentLoca,
        type,
        name,
        content,
      }: {
        parentLoca: string;
        type: string;
        name: string;
        content?: string;
      }) => {
        if (!isValidLoca(parentLoca)) {
          throw new ValidationError(`parentLoca must be empty or numeric segments separated by "/" — got ${JSON.stringify(parentLoca)}.`);
        }

        return withMcpIdentity(config, async (identity) => {
          const parentAddress = addressFromLoca(identity.repoGuid, parentLoca);
          assertWithinConfiguredRepo(parentAddress, identity.repoGuid);

          const parent = await getItemByAddress(parentAddress);
          if (!parent) {
            throw new NotFoundError(
              `No parent CpItem found at parentLoca ${JSON.stringify(parentLoca)} in your repo — create the parent first.`
            );
          }

          const child = await createOrGetChild(parent, name, type, content ?? "");
          assertWithinConfiguredRepo(child.config.address, identity.repoGuid);

          return jsonResult({
            ...toCpItemOutput(child),
            contentApplied: child.body === (content ?? ""),
          });
        });
      }
    )
  );
}
