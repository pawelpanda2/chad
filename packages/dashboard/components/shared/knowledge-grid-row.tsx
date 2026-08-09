"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { FileText, Folder as FolderIcon } from "lucide-react";
import { hasUnbreakableToken } from "@/lib/knowledge-layout";
import { LIST_ROW_CLASS } from "@/components/shared/layout-tokens";

const SHIFT_STEP_PX = 40;

/**
 * One clickable Knowledge grid row (Story 114 — Task 2 layout only; click
 * behavior/navigation is owned entirely by the caller via `onClick`).
 *
 * Normal names (including ones that wrap over spaces) render as a real
 * `<button>`, same as production before this Story — just wrapping instead
 * of `truncate`. A name containing a single word with no spaces longer than
 * the unbreakable-token threshold (`hasUnbreakableToken`, e.g. a
 * pasted ID/URL) would otherwise force horizontal overflow, which is a hard
 * "never" (see `lib/knowledge-layout.ts`); instead it renders as a
 * non-wrapping, clipped single line with local ‹ › buttons that shift only
 * that row's own text left/right. Those buttons are real `<button>`s, which
 * cannot nest inside another `<button>` — so an unbreakable row renders its
 * outer clickable surface as a `div[role=button]` instead, keeping the HTML
 * valid while staying keyboard-accessible (Enter/Space).
 */
export function KnowledgeGridRow({
  type,
  name,
  onClick,
}: {
  type: "Folder" | "Text";
  name: string;
  onClick: () => void;
}) {
  const unbreakable = hasUnbreakableToken(name);
  const Icon = type === "Folder" ? FolderIcon : FileText;
  const className = `flex w-full items-center gap-3 text-left ${LIST_ROW_CLASS}`;

  const content = (
    <>
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      {unbreakable ? (
        <ShiftableRowLabel text={name} />
      ) : (
        <span className="min-w-0 flex-1 whitespace-normal break-words text-sm leading-snug">{name}</span>
      )}
    </>
  );

  if (!unbreakable) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }

  return (
    <ClickableDiv onClick={onClick} className={className}>
      {content}
    </ClickableDiv>
  );
}

function ClickableDiv({
  onClick,
  className,
  children,
}: {
  onClick: () => void;
  className: string;
  children: ReactNode;
}) {
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  }

  return (
    <div role="button" tabIndex={0} onClick={onClick} onKeyDown={handleKeyDown} className={`cursor-pointer ${className}`}>
      {children}
    </div>
  );
}

/** Non-wrapping label + local ‹ › shift for a single unbreakable-token row. Shifts only this row's own text — never the card, column, or page. */
function ShiftableRowLabel({ text }: { text: string }) {
  const innerRef = useRef<HTMLSpanElement>(null);
  const [maxShift, setMaxShift] = useState(0);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    setMaxShift(Math.max(0, inner.scrollWidth - inner.clientWidth));
    setShift(0);
  }, [text]);

  const showControls = maxShift > 2;

  return (
    <span className="flex min-w-0 flex-1 items-center gap-1">
      <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap" title={text}>
        <span
          ref={innerRef}
          className="inline-block text-sm leading-snug transition-transform duration-100"
          style={{ transform: `translateX(${-shift}px)` }}
        >
          {text}
        </span>
      </span>
      {showControls && (
        <span className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-label="Przesuń tekst w lewo"
            onClick={(e) => {
              e.stopPropagation();
              setShift((s) => Math.max(0, s - SHIFT_STEP_PX));
            }}
            className="flex h-4 w-3.5 shrink-0 items-center justify-center rounded border text-[10px] leading-none text-muted-foreground hover:bg-accent"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Przesuń tekst w prawo"
            onClick={(e) => {
              e.stopPropagation();
              setShift((s) => Math.min(maxShift, s + SHIFT_STEP_PX));
            }}
            className="flex h-4 w-3.5 shrink-0 items-center justify-center rounded border text-[10px] leading-none text-muted-foreground hover:bg-accent"
          >
            ›
          </button>
        </span>
      )}
    </span>
  );
}
