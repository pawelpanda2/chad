/**
 * CP-link parser — shared Preview extension (hdr1/hdr2 only, not md).
 *
 * Syntax: a line that is *exactly* `[<uuid>]` (after indentation) acts as a
 * metadata marker for the note (`- ...`) or header (`// ...`) line
 * immediately following it — the UUID becomes that line's `cpLinkTargetId`,
 * and the marker line itself is dropped from the output (never rendered,
 * never a literal UUID in Preview). Every other shape (invalid UUID, no
 * following note/header, marker followed by todo/done/plain text) is left
 * completely untouched — existing rendering for `t;`/`d;` lines and plain
 * text is unaffected, per the fail-safe requirement.
 *
 * Pure and synchronous — never fetches. Resolving the id to an actual item
 * (existence, current address, permissions) is a separate concern, handled
 * on click by the caller (`components/shared/cp-link-text.tsx` → `dba`).
 */
import type { ParsedNode } from "../headers/types.js";

const CP_LINK_MARKER = /^\[([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\]$/;

export function annotateCpLinkTargets(nodes: ParsedNode[]): ParsedNode[] {
  const result: ParsedNode[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const match = node.type === "text" ? CP_LINK_MARKER.exec(node.content.trim()) : null;
    const next = match ? nodes[i + 1] : undefined;

    if (match && next && (next.type === "note" || next.type === "header")) {
      result.push({ ...next, cpLinkTargetId: match[1] });
      i++; // the linked line was just consumed above — skip it in the next iteration
      continue;
    }

    result.push(node);
  }

  return result;
}
