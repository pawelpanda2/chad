"use client";

import { Dumbbell, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MsgWorkoutEntry, MsgWorkoutProposalEntry } from "./msg-workout-types";

export interface MsgWorkoutMarkerProps {
  /** Confirmed links (config.links.beeper) for this message. */
  linked: MsgWorkoutEntry[];
  /** Pending proposals (never auto-linked) whose candidates include this message. */
  proposed: MsgWorkoutProposalEntry[];
  onOpen: (entry: MsgWorkoutEntry) => void;
}

/**
 * Compact per-message "msg workout" chip(s) — Story 99, spec 1.8. Rendered
 * via BeeperConversationView's existing `renderMessageAction` slot, only
 * for messages that have at least one linked workout or pending proposal.
 * Never shown otherwise. Clicking a chip expands that workout to full
 * panel height (handled by the parent, which owns the expanded/closed
 * state) — proposals open the same panel so the workout text can be
 * reviewed, but are visually distinct (dashed border + confidence %)
 * since they were never automatically linked.
 */
export function MsgWorkoutMarker({ linked, proposed, onOpen }: MsgWorkoutMarkerProps) {
  if (linked.length === 0 && proposed.length === 0) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      {linked.map((entry) => (
        <button
          key={`linked-${entry.loca}`}
          type="button"
          onClick={() => onOpen(entry)}
          className={cn(
            "flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground",
            "hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
          title={entry.name}
        >
          <Dumbbell className="h-3 w-3" />
          <span className="max-w-[110px] truncate">{entry.name}</span>
        </button>
      ))}
      {proposed.map((entry) => (
        <button
          key={`proposed-${entry.loca}`}
          type="button"
          onClick={() => onOpen(entry)}
          className={cn(
            "flex items-center gap-1 rounded-full border border-dashed border-amber-500/60 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-400",
            "hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
          title={`Proposed match — ${Math.round(entry.confidence * 100)}% confidence (${entry.reasonType}), best of ${entry.totalCandidates} candidate${entry.totalCandidates === 1 ? "" : "s"}: ${entry.reasons.join(", ")}`}
        >
          <HelpCircle className="h-3 w-3" />
          <span className="max-w-[90px] truncate">{entry.name}</span>
          <span className="shrink-0 tabular-nums">{Math.round(entry.confidence * 100)}%</span>
        </button>
      ))}
    </div>
  );
}
