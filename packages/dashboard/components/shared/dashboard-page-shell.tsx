import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DashboardPageShellProps {
  /** Main content rendered inside the standard rounded frame. */
  children: ReactNode;
  /**
   * Optional controls rendered ABOVE the frame (filters, refresh, back button).
   * Kept outside the frame so it never scrolls with the content.
   */
  toolbar?: ReactNode;
  /**
   * When true (default) the frame owns the vertical scroll of its content.
   * Set to false when the child manages its own internal scroll (e.g. a
   * CodeMirror editor) so the frame only clips overflow.
   */
  scroll?: boolean;
  /** Adds the standard inner padding to the frame content. Default true. */
  padded?: boolean;
  /** Extra classes for the outer full-height column. */
  className?: string;
  /** Extra classes for the rounded frame element. */
  frameClassName?: string;
  /** Extra classes for the inner content wrapper. */
  contentClassName?: string;
}

/**
 * DashboardPageShell — the single, shared layout standard for every main
 * dashboard page.
 *
 * It renders an optional non-scrolling toolbar and then an aesthetic rounded
 * frame that nearly fills the available area. The frame:
 *   - fits height and width to the content region provided by the layout,
 *   - keeps its own internal scroll (never scrolls the whole page),
 *   - aligns its content to the top-left corner.
 *
 * The shell is height-driven by its parent (`h-full`), so it works identically
 * on desktop (with topbar) and mobile (topbar hidden), with no magic viewport
 * math. Do NOT re-create the `Card + flex-1 + overflow` pattern per page — use
 * this component instead.
 *
 * ```
 * ┌ toolbar (optional, does not scroll) ┐
 * ├─────────────────────────────────────┤
 * │ ╭─────────── rounded frame ───────╮ │
 * │ │ content (top-left, scrolls)     │ │
 * │ ╰─────────────────────────────────╯ │
 * └─────────────────────────────────────┘
 * ```
 */
export function DashboardPageShell({
  children,
  toolbar,
  scroll = true,
  padded = true,
  className,
  frameClassName,
  contentClassName,
}: DashboardPageShellProps) {
  return (
    <div className={cn("flex h-full min-h-0 w-full flex-col gap-0.5", className)}>
      {/*
        Controls sit ABOVE the frame, left-aligned to the same edge. They wrap
        onto a second row automatically when they do not fit on one line. If a
        title is shown it lives inline on this row with the buttons — no extra
        descriptions/subtitles (matches the DAILY ENTRY layout).
      */}
      {toolbar ? (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
          {toolbar}
        </div>
      ) : null}

      <div
        className={cn(
          "min-h-0 w-full flex-1 overflow-hidden rounded-xl border bg-card shadow-sm",
          frameClassName,
        )}
      >
        {/*
          Default flex-col with cross-axis stretch keeps children full-width and
          stacked from the top => content is anchored top-left, never centered.
        */}
        <div
          className={cn(
            "flex h-full min-h-0 w-full flex-col",
            scroll ? "overflow-y-auto overflow-x-hidden" : "overflow-hidden",
            padded && "p-[10px]",
            contentClassName,
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
