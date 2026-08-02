"use client";

import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ClickRevealTooltipProps {
  /** Full text shown in the bubble, e.g. "Platform" for an abbreviated "Plat." header. */
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * Wraps an abbreviated label (e.g. a "Plat." table header). Clicking it
 * shows `label` in a small bubble for ~2s, then it fades away — click only,
 * no native `title` hover tooltip (that would defeat the "only after
 * clicking" requirement).
 */
export function ClickRevealTooltip({ label, children, className }: ClickRevealTooltipProps) {
  const [revealed, setRevealed] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function reveal(e: React.MouseEvent) {
    e.stopPropagation();
    setRevealed(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setRevealed(false), 2000);
  }

  return (
    <span className={cn("relative inline-flex", className)}>
      <button type="button" onClick={reveal} className="inline-flex cursor-pointer items-center">
        {children}
      </button>
      {revealed && (
        <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-1.5 py-0.5 text-[11px] font-normal normal-case tracking-normal text-popover-foreground shadow-md">
          {label}
        </span>
      )}
    </span>
  );
}
