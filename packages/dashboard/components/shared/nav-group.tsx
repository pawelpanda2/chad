"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Undo2 } from "lucide-react";
import { useDashboardHistory } from "@/components/shared/dashboard-history-provider";
import { cn } from "@/lib/utils";

export interface NavGroupUpLevel {
  /** Go up one level in this page's own view hierarchy (e.g. a selected
   * report -> the reports list -> the Views menu). Reuses whatever "go up"
   * handler the page already has — this is NOT browser/session history. */
  onClick?: () => void;
  /** Alternative to onClick for a plain link (e.g. pages that navigate via
   * a fixed href rather than local state). */
  href?: string;
  /** True when already at the top of this page's hierarchy. */
  disabled?: boolean;
  /** Optional label appended to the title attribute for clarity. */
  label?: string;
}

export interface NavGroupProps {
  /** The page's own "go up a level" control (the middle "Back" button).
   * Omit entirely on pages with no defined hierarchy above them — it
   * renders disabled in that case. */
  upLevel?: NavGroupUpLevel;
  className?: string;
}

/**
 * Shared navigation control for dashboard toolbars: `[Back] [Forw]`,
 * left-aligned. Replaces the old standalone `BackButton` as the single way
 * to render "go back" affordances on a dashboard view (Story 56).
 *
 * - `Forw` — real forward through the dashboard's own tracked navigation
 *   history (`useDashboardHistory`), the same on every page, no props
 *   needed. (`Prev` removed for now — 2026-07-14 — kept out of the group
 *   rather than just hidden, since `goBack`/`canGoBack` may still be used
 *   elsewhere; re-add here if it comes back.)
 * - `Back` (bigger circular-undo icon) — up one level in the CURRENT page's
 *   own hierarchy (per-page, supplied via `upLevel`). NOT browser/session
 *   history — deliberately a different action from `Forw` even though the
 *   label says "Back" too.
 *
 * Must be the FIRST element among its flex toolbar siblings, placed right
 * after the toolbar's `pl-14` menu-handle gap — left-aligned, no `ml-auto`.
 */
export function NavGroup({ upLevel, className }: NavGroupProps) {
  const { canGoForward, goForward } = useDashboardHistory();

  const upLevelDisabled = !upLevel || upLevel.disabled;

  const upLevelButton = upLevel?.href ? (
    <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1 px-2" disabled={upLevelDisabled} asChild>
      <Link href={upLevel.href} title={upLevel.label ?? "Up one level"}>
        <Undo2 className="h-4 w-4" />
        Back
      </Link>
    </Button>
  ) : (
    <Button
      variant="outline"
      size="sm"
      className="h-7 shrink-0 gap-1 px-2"
      disabled={upLevelDisabled}
      onClick={upLevel?.onClick}
      title={upLevel?.label ?? "Up one level"}
    >
      <Undo2 className="h-4 w-4" />
      Back
    </Button>
  );

  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)}>
      {upLevelButton}
      <Button
        variant="outline"
        size="sm"
        className="h-7 shrink-0 gap-1 px-2"
        disabled={!canGoForward}
        onClick={goForward}
        title="Forward through dashboard history"
      >
        Forw
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
