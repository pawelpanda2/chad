/**
 * Minimal Markdown preview for the shared Preview's "md" format.
 *
 * The project has no Markdown library in its dependency tree yet (checked
 * package.json/pnpm-lock before writing this — see 1.7 "nie dodawaj nowej
 * ciężkiej zależności bez sprawdzenia istniejącego stacku"). Rather than
 * pulling in react-markdown/remark/rehype (a large transitive tree) for a
 * "basic Markdown" requirement (headers, lists, bold/italic, links, code
 * blocks), this renders directly to React elements — never through
 * dangerouslySetInnerHTML — so there is no raw-HTML/sanitization surface to
 * get wrong at all.
 */
"use client";

import { Fragment, useMemo } from "react";
import type { ReactNode } from "react";

const SAFE_LINK_PROTOCOLS = ["http://", "https://", "mailto:", "/"];

function isSafeHref(href: string): boolean {
  return SAFE_LINK_PROTOCOLS.some((prefix) => href.startsWith(prefix));
}

// Order matters: inline code first (so its contents are never re-scanned for
// bold/italic/link markers), then links, then bold, then italic.
const INLINE_TOKEN = /`([^`]+)`|\[([^\]\n]+)\]\(([^\s)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_/g;

function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  INLINE_TOKEN.lastIndex = 0;

  while ((match = INLINE_TOKEN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const [, code, linkText, linkHref, boldStar, boldUnder, italicStar, italicUnder] = match;
    if (code !== undefined) {
      nodes.push(
        <code key={key++} className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
          {code}
        </code>,
      );
    } else if (linkText !== undefined) {
      if (isSafeHref(linkHref)) {
        nodes.push(
          <a
            key={key++}
            href={linkHref}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-primary underline underline-offset-2"
          >
            {linkText}
          </a>,
        );
      } else {
        // Unsafe scheme (e.g. javascript:) — render as plain text, never as a clickable link.
        nodes.push(`${linkText} (${linkHref})`);
      }
    } else if (boldStar !== undefined || boldUnder !== undefined) {
      nodes.push(<strong key={key++}>{boldStar ?? boldUnder}</strong>);
    } else if (italicStar !== undefined || italicUnder !== undefined) {
      nodes.push(<em key={key++}>{italicStar ?? italicUnder}</em>);
    }
    lastIndex = INLINE_TOKEN.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "code"; lang: string; code: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "p"; text: string };

function parseBlocks(content: string): Block[] {
  const lines = content.split(/\r?\n/);
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    const fence = line.match(/^ {0,3}```(\S*)/);
    if (fence) {
      const lang = fence[1] ?? "";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^ {0,3}```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ kind: "code", lang, code: codeLines.join("\n") });
      continue;
    }

    const heading = line.match(/^ {0,3}(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2].trim() });
      i++;
      continue;
    }

    const ulItem = line.match(/^ {0,3}[-*+]\s+(.*)$/);
    if (ulItem) {
      const items: string[] = [ulItem[1]];
      i++;
      while (i < lines.length) {
        const next = lines[i].match(/^ {0,3}[-*+]\s+(.*)$/);
        if (!next) break;
        items.push(next[1]);
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    const olItem = line.match(/^ {0,3}\d+\.\s+(.*)$/);
    if (olItem) {
      const items: string[] = [olItem[1]];
      i++;
      while (i < lines.length) {
        const next = lines[i].match(/^ {0,3}\d+\.\s+(.*)$/);
        if (!next) break;
        items.push(next[1]);
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    // Paragraph: gather consecutive plain lines until a blank line or a new block starts.
    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^ {0,3}```/.test(lines[i]) &&
      !/^ {0,3}#{1,6}\s+/.test(lines[i]) &&
      !/^ {0,3}[-*+]\s+/.test(lines[i]) &&
      !/^ {0,3}\d+\.\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ kind: "p", text: paraLines.join(" ") });
  }

  return blocks;
}

const HEADING_CLASS: Record<number, string> = {
  1: "text-lg font-bold",
  2: "text-base font-bold",
  3: "text-sm font-bold",
  4: "text-sm font-semibold",
  5: "text-xs font-semibold",
  6: "text-xs font-semibold",
};

export function MarkdownPreview({ content }: { content: string }) {
  const blocks = useMemo(() => parseBlocks(content ?? ""), [content]);

  if (blocks.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
        <span>Empty content</span>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3 text-xs leading-relaxed text-foreground">
      {blocks.map((block, i) => {
        switch (block.kind) {
          case "heading":
            return (
              <div key={i} className={HEADING_CLASS[block.level] ?? HEADING_CLASS[6]}>
                {parseInline(block.text)}
              </div>
            );
          case "code":
            return (
              <pre
                key={i}
                className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-[11px] whitespace-pre"
              >
                <code>{block.code}</code>
              </pre>
            );
          case "ul":
            return (
              <ul key={i} className="list-disc space-y-0.5 pl-5">
                {block.items.map((item, j) => (
                  <li key={j}>{parseInline(item)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="list-decimal space-y-0.5 pl-5">
                {block.items.map((item, j) => (
                  <li key={j}>{parseInline(item)}</li>
                ))}
              </ol>
            );
          case "p":
          default:
            return (
              <p key={i} className="whitespace-pre-wrap break-words">
                {parseInline(block.text).map((node, j) => (
                  <Fragment key={j}>{node}</Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
