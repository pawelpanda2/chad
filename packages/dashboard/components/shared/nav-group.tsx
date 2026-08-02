"use client";

import { useRouter } from "next/navigation";
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
 * - `Back` — prefers the dashboard's own tracked history first, so repeated
 *   in-app clicks can step back through the last visited states. If there is
 *   no tracked previous state (e.g. a fresh deep link), it falls back to this
 *   page's declared structural parent (`upLevel`) so details -> list -> menu
 *   still works.
 * - `Forw` — real forward through the dashboard's own tracked navigation
 *   history (`useDashboardHistory`), the same on every page, no props
 *   needed.
 *
 * Must be the FIRST element among its flex toolbar siblings, placed right
 * after the toolbar's `pl-14` menu-handle gap — left-aligned, no `ml-auto`.
 */
export function NavGroup({ upLevel, className }: NavGroupProps) {
  const router = useRouter();
  const { canGoBack, canGoForward, goBack, goForward } = useDashboardHistory();

  const canUseUpLevel = !!upLevel && !upLevel.disabled;
  const canBack = canGoBack || canUseUpLevel;

  const handleBack = () => {
    if (canGoBack) {
      goBack();
      return;
    }
    if (!canUseUpLevel) return;
    if (upLevel.href) {
      router.push(upLevel.href);
      return;
    }
    upLevel.onClick?.();
  };

  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)}>
      <Button
        variant="outline"
        size="sm"
        className="h-7 shrink-0 gap-1 px-2"
        disabled={!canBack}
        onClick={handleBack}
        title={canGoBack ? "Back through dashboard history" : (upLevel?.label ?? "Up one level")}
      >
        <Undo2 className="h-4 w-4" />
        Back
      </Button>
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
