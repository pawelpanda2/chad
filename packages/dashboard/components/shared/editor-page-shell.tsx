import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EditorPageShellProps {
  children: ReactNode;
  className?: string;
  gapClassName?: string;
}

/**
 * Shared layout shell for full-height editor screens.
 * Keeps page scroll locked and pushes overflow into inner content panes.
 */
export function EditorPageShell({
  children,
  className,
  gapClassName = "gap-[10px]",
}: EditorPageShellProps) {
  return (
    <div
      className={cn(
        "-m-[22px] flex h-[calc(100dvh-4rem-20px)] min-h-0 flex-col overflow-hidden",
        gapClassName,
        className,
      )}
    >
      {children}
    </div>
  );
}