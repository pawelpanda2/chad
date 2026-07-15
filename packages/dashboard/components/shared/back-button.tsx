"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BackButtonProps {
  /** Navigate via a click handler (e.g. router.push, local state reset). */
  onClick?: () => void;
  /** Navigate via a plain link instead of a click handler. */
  href?: string;
  /** Icon + text (default) or icon-only, for headers already tight
   * on horizontal space. Position (right-aligned) is the same either way. */
  showLabel?: boolean;
  /** Label text when showLabel is true. Defaults to "Back". */
  label?: string;
  className?: string;
}

/**
 * Shared "Back" control for dashboard toolbars.
 *
 * Standardized to sit on the RIGHT of its toolbar row: this component
 * always applies `ml-auto` itself, so it must be the LAST element among its
 * flex siblings in the toolbar for that to isolate just this button on the
 * right (an `ml-auto` on a non-last child would push every following
 * sibling right along with it).
 */
export function BackButton({ onClick, href, showLabel = true, label = "Back", className }: BackButtonProps) {
  const content = (
    <>
      <ArrowLeft className="h-3.5 w-3.5" />
      {showLabel && label}
    </>
  );

  const buttonClassName = cn(
    "ml-auto shrink-0 gap-1",
    showLabel ? "h-7 px-2" : undefined,
    className,
  );

  if (href) {
    return (
      <Button variant="outline" size={showLabel ? "sm" : "icon"} className={buttonClassName} asChild>
        <Link href={href}>{content}</Link>
      </Button>
    );
  }

  return (
    <Button variant="outline" size={showLabel ? "sm" : "icon"} onClick={onClick} className={buttonClassName}>
      {content}
    </Button>
  );
}
