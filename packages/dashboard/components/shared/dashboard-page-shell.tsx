import { ReactNode } from "react";
import { NavGroup, type NavGroupUpLevel } from "@/components/shared/nav-group";
import { cn } from "@/lib/utils";

interface DashboardPageShellProps {
  /** Main content rendered inside the standard rounded frame. */
  children: ReactNode;
  /**
   * Optional controls rendered ABOVE the frame (filters, refresh). The
   * shared NavGroup (`\`/Next/Back) is appended automatically after this —
   * do not add a BackButton/NavGroup of your own here, use `upLevel`.
   * Kept outside the frame so it never scrolls with the content.
   */
  toolbar?: ReactNode;
  /**
   * Optional second toolbar row, rendered directly below `toolbar` (still
   * above the frame, still non-scrolling). Use this instead of cramming
   * everything into one row when a page has its own filters/controls in
   * addition to a title — keeps the shared NavGroup sitting right after a
   * short title on row one instead of competing for space with filters.
   */
  toolbarSecondRow?: ReactNode;
  /**
   * This page's own "go up one level" control, forwarded to the shared
   * NavGroup's `\` button (see nav-group.tsx). Omit on pages with no
   * hierarchy above them — `\` simply renders disabled.
   */
  upLevel?: NavGroupUpLevel;
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
  toolbarSecondRow,
  upLevel,
  scroll = true,
  padded = true,
  className,
  frameClassName,
  contentClassName,
}: DashboardPageShellProps) {
  return (
    <div className={cn("flex h-full min-h-0 w-full flex-col gap-0.5", className)}>
      {/*
        Top row: controls sit ABOVE the frame, left-aligned. They wrap onto a
        second row automatically when they do not fit. If a title is shown it
        lives inline here with the buttons — no subtitles (DAILY ENTRY layout).

        The row is ALWAYS rendered (even without a toolbar) and reserves left
        space (`pl-14`) + a min height for the fixed menu handle that lives in
        the top-left of every view, so the handle never covers frame content.
        The shared NavGroup is always appended last, so its `ml-auto` isolates
        it on the right regardless of what `toolbar` contains.
      */}
      <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 pl-14">
        {toolbar}
        <NavGroup upLevel={upLevel} />
      </div>

      {toolbarSecondRow && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 pl-14">
          {toolbarSecondRow}
        </div>
      )}

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
