import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EditorPageShellProps {
  children: ReactNode;
  className?: string;
  gapClassName?: string;
}

/**
 * Shared full-height column for editor/full-screen dashboard screens.
 *
 * Height is driven entirely by the parent layout (`h-full`): the dashboard
 * <main> is a flex child with a definite height, so this shell simply fills it.
 * That keeps page scroll locked and pushes overflow into inner content panes,
 * and — unlike the old `-m-[22px] h-[calc(100dvh-4rem-20px)]` hack — it works
 * identically on desktop (topbar visible) and mobile (topbar hidden), with no
 * viewport math tied to a specific topbar/padding size.
 *
 * For standard list/content pages prefer {@link DashboardPageShell}, which adds
 * the shared rounded frame on top of this column.
 */
export function EditorPageShell({
  children,
  className,
  gapClassName = "gap-0.5",
}: EditorPageShellProps) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full flex-col overflow-hidden",
        gapClassName,
        className,
      )}
    >
      {children}
    </div>
  );
}
