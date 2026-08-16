/**
 * Groups parsed headers-format nodes into a hierarchical structure:
 * - Level 0 headers become top-level groups
 * - Level 1 headers become sections within a group
 * - Everything else becomes content lines within the current section/group
 *
 * Shared by the legacy renderer (headers-renderer.tsx, "hdr2" fallback) and
 * the hdr1 renderer (hdr1-renderer.tsx) — pulled out to its own module so
 * neither renderer component has to import the other.
 */
import type { ParsedNode } from "./types";

export interface LineGroup {
  type: "header-main" | "section";
  content: string;
  headerNumber?: number;
  /** CpLinkText target id, carried over from the header node's own `cpLinkTargetId` (see `lib/preview/cp-link.ts`). */
  cpLinkTargetId?: string;
  children: LineGroup[];
  lines: ParsedNode[];
}

export function groupNodes(nodes: ParsedNode[]): LineGroup[] {
  const groups: LineGroup[] = [];
  let currentGroup: LineGroup | null = null;
  let currentSection: LineGroup | null = null;

  for (const node of nodes) {
    if (node.type === "header" && node.level === 0) {
      currentGroup = {
        type: "header-main",
        content: node.content,
        cpLinkTargetId: node.cpLinkTargetId,
        children: [],
        lines: [],
      };
      currentSection = null;
      groups.push(currentGroup);
    } else if (node.type === "header" && node.level === 1) {
      if (currentGroup) {
        currentSection = {
          type: "section",
          content: node.content,
          headerNumber: node.headerNumber,
          cpLinkTargetId: node.cpLinkTargetId,
          children: [],
          lines: [],
        };
        currentGroup.children.push(currentSection);
      }
    } else {
      if (currentSection) {
        currentSection.lines.push(node);
      } else if (currentGroup) {
        currentGroup.lines.push(node);
      }
    }
  }

  return groups;
}
