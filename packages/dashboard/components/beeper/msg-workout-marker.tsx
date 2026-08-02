"use client";

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
 * Side chip(s) beside a bubble — matches
 * examples/CHAD_beeper_msg_workout_layout_mock_v7.html (`.workout-chip`).
 * Fixed ~96px side slot in BeeperConversationView; dashed amber = proposal,
 * solid muted = linked. No icons — name (+ confidence % for proposals).
 */
export function MsgWorkoutMarker({ linked, proposed, onOpen }: MsgWorkoutMarkerProps) {
  if (linked.length === 0 && proposed.length === 0) return null;

  return (
    <div className="flex max-w-24 flex-col gap-1">
      {linked.map((entry) => (
        <button
          key={`linked-${entry.loca}`}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(entry);
          }}
          className={cn(
            "inline-flex max-w-24 overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-solid border-border/80 bg-muted/40 px-[7px] py-1 text-[10px] leading-none text-muted-foreground",
            "hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
          title={entry.name}
        >
          {entry.name}
        </button>
      ))}
      {proposed.map((entry) => (
        <button
          key={`proposed-${entry.loca}`}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(entry);
          }}
          className={cn(
            "inline-flex max-w-24 overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-dashed border-amber-600/70 bg-amber-500/[0.08] px-[7px] py-1 text-[10px] leading-none text-amber-600 dark:text-amber-400",
            "hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
          title={`Proposed match — ${Math.round(entry.confidence * 100)}% confidence`}
        >
          {entry.name} · {Math.round(entry.confidence * 100)}%
        </button>
      ))}
    </div>
  );
}
