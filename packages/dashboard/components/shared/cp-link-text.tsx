/**
 * Renders a Preview line annotated with a `cpLinkTargetId` (see
 * `lib/preview/cp-link.ts`) as a real link — the UUID itself is never
 * shown, only the note's own text. Story 120: a genuine `<Link href>` to
 * `/dashboard/item-view/by-id/<id>` (that route resolves the id and
 * `redirect()`s to the chrome-free Item View — see its own doc comment)
 * instead of a styled button with an `onClick` → fetch → navigate handler,
 * so standard browser link behavior works natively: right-click still
 * offers "Open Link in New Tab", Cmd/Ctrl-click or middle-click still open
 * a new tab, and (per later clarification in Story 120) plain left-click
 * ALSO opens a new tab by default (`target="_blank"`) rather than
 * navigating the current one away from whatever it was showing — a CP-link
 * is meant to be a quick side-reference, not a replacement of the current
 * view. `rel="noopener noreferrer"` is the standard safe pairing for a
 * same-origin `target="_blank"` link. A missing/foreign id is resolved
 * (and reported) server-side by the `by-id` route itself, never here.
 * Opens Item View, not the full Folders browsing GUI (also per a later
 * Story 120 clarification) — Folders keeps its own separate, already
 * well-established canonical URL for actual browsing.
 */
"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export function CpLinkText({
  text,
  targetItemId,
  className,
}: {
  text: string;
  targetItemId: string;
  className?: string;
}) {
  return (
    <Link
      href={`/dashboard/item-view/by-id/${encodeURIComponent(targetItemId)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "cursor-pointer whitespace-pre-wrap break-words text-left underline decoration-dotted underline-offset-2 hover:decoration-solid",
        className,
      )}
    >
      {text}
    </Link>
  );
}
