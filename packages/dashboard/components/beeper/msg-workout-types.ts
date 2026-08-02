/** Shared client-side shape for a msg workout entry (Story 99) — mirrors dba's MsgWorkoutGuiEntry. */
export interface MsgWorkoutEntry {
  loca: string;
  name: string;
  body: string;
}

/** A pending (never auto-linked) proposal candidate — mirrors dba's MsgWorkoutProposalGuiEntry. */
export interface MsgWorkoutProposalEntry extends MsgWorkoutEntry {
  confidence: number;
  reasons: string[];
  reasonType: string;
  totalCandidates: number;
}

export interface MsgWorkoutConversationLinksResponse {
  leadName: string | null;
  linksByMessageId: Record<string, MsgWorkoutEntry[]>;
  proposalsByMessageId: Record<string, MsgWorkoutProposalEntry[]>;
  undated: MsgWorkoutEntry[];
}
