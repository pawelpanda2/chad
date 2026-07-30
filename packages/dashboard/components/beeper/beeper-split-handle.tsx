"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { splitHandleProps } from "./beeper-conversations-logic";

interface BeeperSplitHandleProps {
  isListCollapsed: boolean;
  onClick: () => void;
  className?: string;
}

/** Small centered collapse/expand handle between the contact list and the conversation panel. */
export function BeeperSplitHandle({ isListCollapsed, onClick, className }: BeeperSplitHandleProps) {
  const { ariaLabel, icon } = splitHandleProps(isListCollapsed);
  const Icon = icon === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "flex h-7 w-4 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <Icon className="h-3 w-3" />
    </button>
  );
}
