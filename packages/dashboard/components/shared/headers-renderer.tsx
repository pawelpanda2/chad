/**
 * Headers Format Renderer
 * 
 * React component that renders parsed headers format content.
 * Uses the local headers-parser for parsing (pure frontend utility).
 * 
 * Design based on reference HTML - each line type has distinct styling
 * with colored backgrounds and borders.
 * 
 * @see architecture/headers/headers-format.md for format specification
 */

"use client";

import { useMemo } from "react";
import { parseHeadersFormat } from "@/lib/headers/parse-headers-format";
import type { ParsedNode, LineType } from "@/lib/headers/types";

// ============================================================================
// Types
// ============================================================================

interface LineGroup {
  type: "header-main" | "section";
  content: string;
  headerNumber?: number;
  children: LineGroup[];
  lines: ParsedNode[];
}

// ============================================================================
// Grouping Logic
// ============================================================================

/**
 * Groups parsed nodes into a hierarchical structure:
 * - Level 0 headers become group headers
 * - Level 1 headers become sections within groups
 * - Everything else becomes lines within sections or groups
 */
function groupNodes(nodes: ParsedNode[]): LineGroup[] {
  const groups: LineGroup[] = [];
  let currentGroup: LineGroup | null = null;
  let currentSection: LineGroup | null = null;

  for (const node of nodes) {
    if (node.type === "header" && node.level === 0) {
      // Main header - start new group
      currentGroup = {
        type: "header-main",
        content: node.content,
        children: [],
        lines: [],
      };
      currentSection = null;
      groups.push(currentGroup);
    } else if (node.type === "header" && node.level === 1) {
      // Sub-header - start new section within current group
      if (currentGroup) {
        currentSection = {
          type: "section",
          content: node.content,
          headerNumber: node.headerNumber,
          children: [],
          lines: [],
        };
        currentGroup.children.push(currentSection);
      }
    } else {
      // Content line - add to current section or group
      if (currentSection) {
        currentSection.lines.push(node);
      } else if (currentGroup) {
        currentGroup.lines.push(node);
      }
    }
  }

  return groups;
}

// ============================================================================
// Color Mapping
// ============================================================================

/**
 * Gets section color based on order (cycling through green, red, blue).
 */
function getSectionColor(sectionIndex: number): "green" | "red" | "blue" {
  const colors: ("green" | "red" | "blue")[] = ["green", "red", "blue"];
  return colors[sectionIndex % colors.length];
}

/**
 * Gets line styling based on type.
 */
function getLineStyles(type: LineType): {
  bg: string;
  border: string;
  text: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
} {
  switch (type) {
    case "note":
      return {
        bg: "bg-blue-50 dark:bg-blue-950/30",
        border: "border-blue-200 dark:border-blue-800",
        text: "text-blue-700 dark:text-blue-400",
        badgeBg: "bg-blue-100 dark:bg-blue-900/50",
        badgeBorder: "border-blue-300 dark:border-blue-700",
        badgeText: "text-blue-600 dark:text-blue-400",
      };
    case "todo":
      return {
        bg: "bg-red-50 dark:bg-red-950/30",
        border: "border-red-200 dark:border-red-800",
        text: "text-red-700 dark:text-red-400",
        badgeBg: "bg-red-100 dark:bg-red-900/50",
        badgeBorder: "border-red-300 dark:border-red-700",
        badgeText: "text-red-600 dark:text-red-400",
      };
    case "done":
      return {
        bg: "bg-green-50 dark:bg-green-950/30",
        border: "border-green-200 dark:border-green-800",
        text: "text-green-700 dark:text-green-400",
        badgeBg: "bg-green-100 dark:bg-green-900/50",
        badgeBorder: "border-green-300 dark:border-green-700",
        badgeText: "text-green-600 dark:text-green-400",
      };
    case "text":
    default:
      return {
        bg: "bg-gray-50 dark:bg-gray-900/30",
        border: "border-gray-200 dark:border-gray-700",
        text: "text-gray-600 dark:text-gray-400",
        badgeBg: "bg-gray-100 dark:bg-gray-800",
        badgeBorder: "border-gray-300 dark:border-gray-600",
        badgeText: "text-gray-600 dark:text-gray-400",
      };
  }
}


// ============================================================================
// Components
// ============================================================================

/**
 * Renders a single content line with appropriate styling.
 */
function ContentLine({ node }: { node: ParsedNode }) {
  const styles = getLineStyles(node.type);
  const showBadge = node.type === "todo" || node.type === "done" || node.type === "note";
  const badgeLabel = node.type === "todo" ? "t" : node.type === "done" ? "d" : "-";

  return (
    <div
      className={`
        flex items-center gap-1.5 min-h-[28px] px-2 py-1 rounded
        ${styles.bg} ${styles.border} border
      `}
    >
      {showBadge && (
        <span
          className={`
            flex-shrink-0 inline-flex items-center justify-center
            min-w-[20px] h-5 px-1.5 rounded text-[10px] font-bold
            ${styles.badgeBg} ${styles.badgeBorder} border
          `}
        >
          {badgeLabel}
        </span>
      )}
      <span className={`text-xs whitespace-pre-wrap break-words ${styles.text}`}>
        {node.content}
      </span>
    </div>
  );
}

/**
 * Renders a section (level 1 header + its content lines).
 */
function Section({ section, index }: { section: LineGroup; index: number }) {
  const color = getSectionColor(index);
  const borderColor =
    color === "green"
      ? "border-l-green-600 dark:border-l-green-500"
      : color === "red"
        ? "border-l-red-600 dark:border-l-red-500"
        : "border-l-blue-600 dark:border-l-blue-500";
  const numBg =
    color === "green"
      ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400"
      : color === "red"
        ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400"
        : "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400";

  return (
    <article
      className={`
        mt-2 border border-gray-200 dark:border-gray-700
        border-l-4 ${borderColor}
        rounded-lg overflow-hidden shadow-sm
      `}
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50/50 dark:bg-gray-900/30 border-b border-gray-200 dark:border-gray-700">
        <span
          className={`
            flex-shrink-0 w-6 h-6 rounded flex items-center justify-center
            font-bold text-xs ${numBg}
          `}
        >
          {section.headerNumber ?? index + 1}
        </span>
        <span className="font-bold text-sm text-gray-800 dark:text-gray-200">
          {section.content}
        </span>
      </div>
      <div className="p-2 space-y-1">
        {section.lines.map((node, i) => (
          <ContentLine key={i} node={node} />
        ))}
      </div>
    </article>
  );
}

/**
 * Renders a group (level 0 header + its sections).
 */
function Group({ group }: { group: LineGroup }) {
  return (
    <section className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden mb-2 last:mb-0">
      <div className="px-3 py-2 font-bold text-sm bg-gradient-to-r from-purple-50 to-white dark:from-purple-950/30 dark:to-transparent border-b border-purple-100 dark:border-purple-900/30 text-purple-900 dark:text-purple-300">
        {group.content}
      </div>
      <div className="p-2">
        {/* Direct lines in group (no section) */}
        {group.lines.length > 0 && (
          <div className="space-y-1 mb-2">
            {group.lines.map((node, i) => (
              <ContentLine key={i} node={node} />
            ))}
          </div>
        )}
        {/* Sections */}
        {group.children.map((section, i) => (
          <Section key={i} section={section} index={i} />
        ))}
      </div>
    </section>
  );
}

/**
 * Renders a complete headers format document.
 */
export function HeadersRenderer({ content }: { content: string }) {
  const groups = useMemo(() => {
    if (!content || !content.trim()) {
      return null;
    }
    const parsed = parseHeadersFormat(content);
    return groupNodes(parsed.nodes);
  }, [content]);

  if (!groups || groups.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <span>Empty content</span>
      </div>
    );
  }

  return (
    <div className="px-[1px] py-[1px]">
      {groups.map((group, index) => (
        <Group key={index} group={group} />
      ))}
    </div>
  );
}

// ============================================================================
// Legacy Preview Component (for backward compatibility)
// ============================================================================

/**
 * Legacy preview component that wraps HeadersRenderer.
 * Kept for backward compatibility with existing code.
 */
export function PreviewContent({ body }: { body: string }) {
  return <HeadersRenderer content={body} />;
}
