"use client";

import { Dumbbell } from "lucide-react";
import type { MsgWorkoutEntry } from "./msg-workout-types";

export interface UndatedMsgWorkoutsProps {
  entries: MsgWorkoutEntry[];
  onOpen: (entry: MsgWorkoutEntry) => void;
}

/**
 * "Undated msg workouts" — Story 99, spec 1.5. Only rendered when
 * non-empty, compact, no descriptive copy, doesn't cover the conversation:
 * a single-line strip at the top of the right panel.
 */
export function UndatedMsgWorkouts({ entries, onOpen }: UndatedMsgWorkoutsProps) {
  if (entries.length === 0) return null;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b bg-muted/40 px-3 py-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">Undated msg workouts:</span>
      {entries.map((entry) => (
        <button
          key={entry.loca}
          type="button"
          onClick={() => onOpen(entry)}
          className="flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          title={entry.name}
        >
          <Dumbbell className="h-3 w-3" />
          <span className="max-w-[110px] truncate">{entry.name}</span>
        </button>
      ))}
    </div>
  );
}
