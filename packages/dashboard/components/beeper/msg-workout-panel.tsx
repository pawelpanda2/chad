"use client";

import { X } from "lucide-react";
import type { MsgWorkoutEntry, MsgWorkoutProposalEntry } from "./msg-workout-types";

export interface MsgWorkoutPanelProps {
  entry: MsgWorkoutEntry | MsgWorkoutProposalEntry;
  onClose: () => void;
}

function isProposal(entry: MsgWorkoutEntry | MsgWorkoutProposalEntry): entry is MsgWorkoutProposalEntry {
  return "confidence" in entry;
}

/**
 * Full-height replacement for the conversation view, inside the same
 * right-hand `<section>` (Story 99, spec 1.8 — "rozwija workout na pełną
 * wysokość prawego paska"). No new route/page: purely a local state swap
 * in BeeperConversationsView. Closing restores the normal conversation.
 */
export function MsgWorkoutPanel({ entry, onClose }: MsgWorkoutPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium">msg workout · {entry.name}</span>
          {isProposal(entry) && (
            <span className="block text-[11px] text-amber-700 dark:text-amber-400">
              Proposed match — {Math.round(entry.confidence * 100)}% confidence, not linked
              {entry.totalCandidates > 1 ? ` (best of ${entry.totalCandidates} candidate messages)` : ""}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close msg workout"
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <pre className="whitespace-pre-wrap break-words font-sans text-sm">{entry.body}</pre>
      </div>
    </div>
  );
}
