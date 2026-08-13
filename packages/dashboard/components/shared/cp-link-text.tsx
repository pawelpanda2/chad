/**
 * Renders a Preview line annotated with a `cpLinkTargetId` (see
 * `lib/preview/cp-link.ts`) as a clickable link — the UUID itself is never
 * shown, only the note's own text. Resolution (id → current address) and
 * navigation happen on click, through `GET /api/cp-items/[id]` → `dba`'s
 * `resolveCpItemByIdForUser` → the Postgres provider — never a direct DB
 * query from this component. A missing/foreign id degrades to an inline
 * "not found" state, never a crash and never another user's data.
 */
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface ResolveCpItemResponse {
  repoGuid?: string;
  loca?: string;
  error?: string;
}

export function CpLinkText({ text, targetItemId }: { text: string; targetItemId: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (status === "loading") return;
    setStatus("loading");
    try {
      const res = await fetch(`/api/cp-items/${encodeURIComponent(targetItemId)}`);
      const data: ResolveCpItemResponse = await res.json();
      if (!res.ok || !data.repoGuid) {
        setStatus("error");
        return;
      }
      const query = new URLSearchParams({ repoGuid: data.repoGuid, loca: data.loca ?? "" });
      // A hard navigation, not `router.push`: Folders' own mount effect is
      // intentionally read-once (it owns its own Back/Forw nav state
      // afterward) — a client-side push from a CP-link clicked *inside*
      // Folders itself would only change the URL, never re-trigger that
      // effect, so the target item would never actually load. A full
      // navigation always mounts fresh, correct from Folders, Knowledge, or
      // anywhere else this component is used.
      window.location.href = `/dashboard/folders?${query.toString()}`;
    } catch {
      setStatus("error");
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === "loading"}
      title={status === "error" ? "This item could not be found or is not accessible" : undefined}
      className={cn(
        "cursor-pointer whitespace-pre-wrap break-words text-left underline decoration-dotted underline-offset-2 hover:decoration-solid",
        status === "loading" && "cursor-wait opacity-70",
        status === "error" && "text-destructive decoration-solid",
      )}
    >
      {text}
      {status === "error" && " (not found)"}
    </button>
  );
}
