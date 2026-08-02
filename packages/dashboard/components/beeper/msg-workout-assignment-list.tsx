"use client";

import { Dumbbell, HelpCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { LIST_ROW_CLASS } from "@/components/shared/layout-tokens";
import type { MsgWorkoutEntry, MsgWorkoutListEntry, MsgWorkoutProposalEntry } from "./msg-workout-types";

export interface MessageNumberOption {
  number: number;
  dbId: string;
}

export interface MsgWorkoutAssignmentListProps {
  workouts: MsgWorkoutListEntry[];
  /** In display order — populates each row's number dropdown. */
  messageOptions: MessageNumberOption[];
  /** dbId -> number, to show a workout's current assignment in its dropdown. */
  numberByMessageId: Map<string, number>;
  onOpen: (entry: MsgWorkoutEntry | MsgWorkoutProposalEntry) => void;
  onAssign: (workout: MsgWorkoutListEntry, messageNumber: number | null) => void;
  assigningLoca: string | null;
}

/**
 * Persistent "all msg workouts, in order" list — Story 99 follow-up. Fills
 * the right-hand panel whenever no workout is expanded to full text (see
 * msg-workout-review-view.tsx: `expandedWorkout ? <MsgWorkoutPanel/> : <MsgWorkoutAssignmentList/>`
 * in the same slot). Replaces "nothing shown there" from the original
 * design — every workout for the lead is always visible, linked or not,
 * with a small numeric combobox to assign/reassign which message it
 * belongs to (message numbers shown next to each bubble's timestamp, see
 * `showMessageNumbers` on BeeperConversationView).
 */
export function MsgWorkoutAssignmentList({
  workouts,
  messageOptions,
  numberByMessageId,
  onOpen,
  onAssign,
  assigningLoca,
}: MsgWorkoutAssignmentListProps) {
  if (workouts.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
        No msg workouts for this lead yet.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="divide-y">
        {workouts.map((w) => {
          const linkedNumber = w.linkedMessageId ? numberByMessageId.get(w.linkedMessageId) ?? null : null;
          const proposedNumber = w.proposedMessageId ? numberByMessageId.get(w.proposedMessageId) ?? null : null;
          const isLinked = Boolean(w.linkedMessageId);
          const isProposed = !isLinked && Boolean(w.proposedMessageId);
          const isSaving = assigningLoca === w.loca;

          const openEntry: MsgWorkoutEntry | MsgWorkoutProposalEntry =
            isProposed && w.confidence !== null
              ? { loca: w.loca, name: w.name, body: w.body, confidence: w.confidence, reasons: [], reasonType: "", totalCandidates: 1 }
              : { loca: w.loca, name: w.name, body: w.body };

          return (
            <div key={w.loca} className={cn("flex items-center gap-2", LIST_ROW_CLASS)}>
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                  isLinked && "bg-primary/10 text-primary",
                  isProposed && "border border-dashed border-amber-500/60 text-amber-600 dark:text-amber-400",
                  !isLinked && !isProposed && "bg-muted text-muted-foreground"
                )}
                title={
                  isLinked
                    ? "Linked"
                    : isProposed
                      ? `Proposed #${proposedNumber ?? "?"} — ${Math.round((w.confidence ?? 0) * 100)}% — pick that number to confirm`
                      : "Not linked"
                }
              >
                {isProposed ? <HelpCircle className="h-3.5 w-3.5" /> : <Dumbbell className="h-3.5 w-3.5" />}
              </span>
              <button
                type="button"
                onClick={() => onOpen(openEntry)}
                className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline"
                title={w.name}
              >
                {w.name}
              </button>
              {isSaving ? (
                <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <select
                  className={cn(
                    "h-8 w-16 shrink-0 rounded-md border bg-background px-1 text-sm",
                    isProposed ? "border-amber-500/60" : "border-border"
                  )}
                  // Confirmed link only — proposed is a suggestion; picking the
                  // number writes the link (selecting — clears a confirmed link).
                  value={linkedNumber ?? ""}
                  onChange={(e) => onAssign(w, e.target.value === "" ? null : Number(e.target.value))}
                  aria-label={`Assign ${w.name} to message number`}
                  title={
                    isProposed && proposedNumber != null
                      ? `Suggested message #${proposedNumber}`
                      : "Assign to message number"
                  }
                >
                  <option value="">—</option>
                  {messageOptions.map((opt) => (
                    <option key={opt.dbId} value={opt.number}>
                      {opt.number}
                      {isProposed && opt.number === proposedNumber ? " *" : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
