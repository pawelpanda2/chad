"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileText, Folder as FolderIcon, type LucideIcon } from "lucide-react";
import { hasUnbreakableToken } from "@/lib/knowledge-layout";
import { LIST_ROW_CLASS } from "@/components/shared/layout-tokens";

const SHIFT_STEP_PX = 40;

/**
 * One Knowledge grid row (Story 114 — Task 2 layout, plus later follow-up:
 * the row IS the navigation target via a real `<Link href>`, not a JS click
 * handler, so ctrl/cmd-click, middle-click, and the browser's own "open in
 * new tab" all work like any other link — same for a Folder row/title as
 * for a Text document row).
 *
 * Story 120 follow-up: a Text row opens in a NEW TAB by default
 * (`target="_blank"`) — clicking a document would otherwise navigate this
 * tab away from the folder card-grid it was just browsing (Item View is a
 * separate single-document surface now, not inline here). A Folder row/
 * title stays a normal same-tab link — that's the whole point of staying
 * "in Knowledge and its nice view".
 *
 * Normal names (including ones that wrap over spaces) render as a single
 * `<Link>`, just wrapping instead of `truncate`. A name containing a single
 * word with no spaces longer than the unbreakable-token threshold
 * (`hasUnbreakableToken`, e.g. a pasted ID/URL) would otherwise force
 * horizontal overflow, which is a hard "never" (see `lib/knowledge-layout.ts`);
 * instead it renders as a non-wrapping, clipped single line with local ‹ ›
 * shift buttons. Those buttons are real `<button>`s, which cannot nest
 * inside an `<a>` — so for that case the `<Link>` wraps only the icon+label,
 * and the shift buttons render as a sibling inside a plain (non-interactive)
 * row wrapper, keeping the row a genuine new-tab-capable link while staying
 * valid HTML.
 */
export function KnowledgeGridRow({
  type,
  name,
  href,
}: {
  type: "Folder" | "Text";
  name: string;
  href: string;
}) {
  const unbreakable = hasUnbreakableToken(name);
  const Icon = type === "Folder" ? FolderIcon : FileText;
  const rowClassName = `flex w-full items-center gap-3 text-left ${LIST_ROW_CLASS}`;
  const newTabProps = type === "Text" ? { target: "_blank" as const, rel: "noopener noreferrer" } : {};

  if (!unbreakable) {
    return (
      <Link href={href} className={rowClassName} {...newTabProps}>
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 whitespace-normal break-words text-sm leading-snug">{name}</span>
      </Link>
    );
  }

  return <UnbreakableRow href={href} name={name} Icon={Icon} rowClassName={rowClassName} newTabProps={newTabProps} />;
}

/** Shifts only this row's own text — never the card, column, or page. */
function UnbreakableRow({
  href,
  name,
  Icon,
  rowClassName,
  newTabProps,
}: {
  href: string;
  name: string;
  Icon: LucideIcon;
  rowClassName: string;
  newTabProps: { target?: "_blank"; rel?: string };
}) {
  const innerRef = useRef<HTMLSpanElement>(null);
  const [maxShift, setMaxShift] = useState(0);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    setMaxShift(Math.max(0, inner.scrollWidth - inner.clientWidth));
    setShift(0);
  }, [name]);

  const showControls = maxShift > 2;

  return (
    <div className={rowClassName}>
      <Link href={href} className="flex min-w-0 flex-1 items-center gap-3" {...newTabProps}>
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap" title={name}>
          <span
            ref={innerRef}
            className="inline-block text-sm leading-snug transition-transform duration-100"
            style={{ transform: `translateX(${-shift}px)` }}
          >
            {name}
          </span>
        </span>
      </Link>
      {showControls && (
        <span className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-label="Przesuń tekst w lewo"
            onClick={() => setShift((s) => Math.max(0, s - SHIFT_STEP_PX))}
            className="flex h-4 w-3.5 shrink-0 items-center justify-center rounded border text-[10px] leading-none text-muted-foreground hover:bg-accent"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Przesuń tekst w prawo"
            onClick={() => setShift((s) => Math.min(maxShift, s + SHIFT_STEP_PX))}
            className="flex h-4 w-3.5 shrink-0 items-center justify-center rounded border text-[10px] leading-none text-muted-foreground hover:bg-accent"
          >
            ›
          </button>
        </span>
      )}
    </div>
  );
}
