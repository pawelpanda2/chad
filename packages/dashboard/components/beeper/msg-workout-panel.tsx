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
      <div className="flex shrink-0 items-start justify-between gap-1 border-b px-2 py-1.5">
        <div className="min-w-0">
          <span className="block truncate text-[11px] font-medium">{entry.name}</span>
          {isProposal(entry) && (
            <span className="block text-[10px] text-amber-600 dark:text-amber-400">
              {Math.round(entry.confidence * 100)}% proposed
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close msg workout"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {entry.body ? (
          <pre className="whitespace-pre-wrap break-words font-sans text-[11px] leading-snug">{entry.body}</pre>
        ) : (
          <p className="text-[11px] italic text-muted-foreground">No body text yet.</p>
        )}
      </div>
    </div>
  );
}
