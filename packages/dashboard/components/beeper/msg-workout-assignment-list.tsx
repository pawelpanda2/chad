"use client";

import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
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
 * Narrow side list — matches
 * examples/CHAD_beeper_msg_workout_layout_mock_v7.html (`.workout-row`):
 * state · name · AI number · tiny select. Compact so a ~198px panel fits.
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
      <div className="flex h-full items-center justify-center px-2 py-6 text-center text-[11px] text-muted-foreground">
        No msg workouts for this lead yet.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-[3px]">
      {workouts.map((w) => {
        const linkedNumber = w.linkedMessageId ? numberByMessageId.get(w.linkedMessageId) ?? null : null;
        const proposedNumber = w.proposedMessageId ? numberByMessageId.get(w.proposedMessageId) ?? null : null;
        const isLinked = Boolean(w.linkedMessageId);
        const isProposed = !isLinked && Boolean(w.proposedMessageId);
        const isSaving = assigningLoca === w.loca;
        const aiNumber = linkedNumber ?? proposedNumber;

        const openEntry: MsgWorkoutEntry | MsgWorkoutProposalEntry =
          isProposed && w.confidence !== null
            ? {
                loca: w.loca,
                name: w.name,
                body: w.body,
                confidence: w.confidence,
                reasons: [],
                reasonType: "",
                totalCandidates: 1,
              }
            : { loca: w.loca, name: w.name, body: w.body };

        return (
          <div
            key={w.loca}
            className="grid min-h-[30px] grid-cols-[13px_minmax(0,1fr)_15px_30px] items-center gap-[3px] border-b border-border/60 px-1 py-1 hover:bg-accent/50"
          >
            <span
              className={cn(
                "flex h-3 w-3 items-center justify-center rounded-full text-[7px] leading-none",
                isLinked && "border border-solid border-border text-muted-foreground",
                isProposed && "border border-dashed border-amber-600/70 text-amber-600 dark:text-amber-400",
                !isLinked && !isProposed && "border border-dashed border-muted-foreground/40 text-muted-foreground"
              )}
              title={
                isLinked
                  ? "Linked"
                  : isProposed
                    ? `Proposed #${proposedNumber ?? "?"} — ${Math.round((w.confidence ?? 0) * 100)}%`
                    : "Not linked"
              }
            >
              {isLinked ? "•" : "?"}
            </span>
            <button
              type="button"
              onClick={() => onOpen(openEntry)}
              className="min-w-0 truncate text-left text-[10.5px] hover:underline"
              title={w.name}
            >
              {w.name}
            </button>
            <span
              className={cn(
                "text-center text-[10px] font-bold tabular-nums",
                aiNumber != null ? "text-amber-600 dark:text-amber-400" : "text-transparent"
              )}
              title={
                isLinked
                  ? `Linked to #${linkedNumber}`
                  : isProposed
                    ? `AI suggestion #${proposedNumber}`
                    : undefined
              }
            >
              {aiNumber ?? "·"}
            </span>
            {isSaving ? (
              <RefreshCw className="h-3 w-3 animate-spin justify-self-center text-muted-foreground" />
            ) : (
              <select
                className="h-[22px] w-[30px] justify-self-end rounded-md border border-border bg-background p-0 text-center text-[10px]"
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
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      })}
    </div>
  );
}
