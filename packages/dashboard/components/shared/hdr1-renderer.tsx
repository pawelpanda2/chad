/**
 * hdr1 Preview renderer — visual/interaction spec is
 * examples/chad_hdr_preview_mockup_v7.html (Story: shared Preview format
 * selector). Reuses the existing headers-format parser/grouping
 * (headers-renderer.tsx's parseHeadersFormat + groupNodes) — only the
 * rendering differs from the legacy renderer (now "hdr2" fallback).
 *
 * Layout mechanism mirrors the mockup exactly: each header+body pair sits in
 * a `grid-cols-[max-content]` wrapper so both children share the browser's
 * resolved max-content column width — that's what makes header/body always
 * match width, and that width come from the content itself (never stretched
 * full-width) without any JS measurement.
 */
"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { parseHeadersFormat } from "@/lib/headers/parse-headers-format";
import type { ParsedNode } from "@/lib/headers/types";
import { groupNodes, type LineGroup } from "@/lib/headers/group-nodes";
import { DEFAULT_HDR1_ACCENT, hexToRgba } from "@/lib/preview/hdr1-color";
import { cn } from "@/lib/utils";

function lineLabel(node: ParsedNode): string {
  switch (node.type) {
    case "todo":
      return node.content ? `TODO — ${node.content}` : "TODO";
    case "done":
      return node.content ? `DONE — ${node.content}` : "DONE";
    default:
      return node.content;
  }
}

function ChildLines({ lines }: { lines: ParsedNode[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="list-disc pl-4 marker:text-muted-foreground">
      {lines.map((node, i) => (
        <li key={i} className="py-0.5 text-[11px] leading-snug whitespace-pre-wrap break-words text-foreground">
          {lineLabel(node)}
        </li>
      ))}
    </ul>
  );
}

function Chevron({ collapsed, color }: { collapsed: boolean; color: string }) {
  return (
    <ChevronRight
      className={cn("h-3 w-3 shrink-0 transition-transform", !collapsed && "rotate-90")}
      style={{ color }}
      aria-hidden="true"
    />
  );
}

function Subsection({
  section,
  index,
  color,
  collapsed,
  onToggle,
}: {
  section: LineGroup;
  index: number;
  color: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const ordinal = String(index + 1).padStart(2, "0");
  const borderColor = hexToRgba(color, 0.55);
  const headBg = hexToRgba(color, 0.16);
  const bodyBg = hexToRgba(color, 0.08);

  return (
    <div className="ml-[21px] grid w-max max-w-[calc(100%-21px)] grid-cols-[max-content] max-[700px]:ml-3 max-[700px]:w-[calc(100%-12px)] max-[700px]:max-w-[calc(100%-12px)]">
      <button
        type="button"
        onClick={onToggle}
        className="flex h-7 w-auto min-w-full max-w-full items-center gap-2 rounded-t-md border px-2 text-left text-xs font-semibold text-foreground"
        style={{ borderColor, backgroundColor: headBg }}
      >
        <Chevron collapsed={collapsed} color={color} />
        <span className="font-mono font-bold tabular-nums text-foreground">{ordinal}</span>
        <span className="truncate">{section.content}</span>
      </button>
      {!collapsed && (
        <div
          className="w-auto min-w-full max-w-full rounded-b-md border border-t-0 px-3 py-1.5"
          style={{ borderColor, backgroundColor: bodyBg }}
        >
          <ChildLines lines={section.lines} />
        </div>
      )}
    </div>
  );
}

function TopSection({
  group,
  index,
  isLast,
  color,
  collapsedKeys,
  onToggle,
}: {
  group: LineGroup;
  index: number;
  isLast: boolean;
  color: string;
  collapsedKeys: Set<string>;
  onToggle: (key: string) => void;
}) {
  const key = `g${index}`;
  const collapsed = collapsedKeys.has(key);
  const hasSubsections = group.children.length > 0;
  const borderColor = hexToRgba(color, 0.6);
  const headBg = hexToRgba(color, 0.2);
  const bodyBg = hexToRgba(color, 0.1);

  return (
    <div
      className={cn(
        "grid w-max max-w-full grid-cols-[max-content] max-[700px]:w-full max-[700px]:max-w-full",
        !isLast && "mb-0",
      )}
    >
      <button
        type="button"
        onClick={() => onToggle(key)}
        className="flex h-8 w-auto min-w-full max-w-full items-center gap-2 rounded-t-lg border px-2.5 text-left text-xs font-bold text-foreground max-[700px]:w-full"
        style={{ borderColor, backgroundColor: headBg }}
      >
        <Chevron collapsed={collapsed} color={color} />
        <span className="truncate">{group.content}</span>
      </button>
      {!collapsed && (
        <div
          className={cn(
            "w-auto min-w-full max-w-full space-y-0 rounded-b-lg border border-t-0 max-[700px]:w-full",
            // No padding when the body is just a stack of child sections
            // (e.g. "details") — they should touch the parent header
            // directly, not float below a padding gap. Direct content
            // lines (e.g. "short") keep the padding, applied to their own
            // wrapper below so a group that happens to have BOTH still
            // looks right.
            hasSubsections ? "p-0" : "px-3 py-2",
          )}
          style={{ borderColor, backgroundColor: bodyBg }}
        >
          {group.lines.length > 0 && (
            <div className={hasSubsections ? "px-3 py-2" : undefined}>
              <ChildLines lines={group.lines} />
            </div>
          )}
          {group.children.map((section, si) => (
            <Subsection
              key={si}
              section={section}
              index={si}
              color={color}
              collapsed={collapsedKeys.has(`${key}-s${si}`)}
              onToggle={() => onToggle(`${key}-s${si}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Hdr1Renderer({
  content,
  accentColor = DEFAULT_HDR1_ACCENT,
}: {
  content: string;
  accentColor?: string;
}) {
  const groups = useMemo(() => {
    if (!content || !content.trim()) return null;
    const parsed = parseHeadersFormat(content);
    return groupNodes(parsed.nodes);
  }, [content]);

  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (!groups || groups.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
        <span>Empty content</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-0 p-2">
      {groups.map((group, index) => (
        <TopSection
          key={index}
          group={group}
          index={index}
          isLast={index === groups.length - 1}
          color={accentColor}
          collapsedKeys={collapsedKeys}
          onToggle={toggle}
        />
      ))}
    </div>
  );
}
