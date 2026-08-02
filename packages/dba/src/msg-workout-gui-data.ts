/**
 * Read-only aggregation for the Beeper Conversations GUI (Story 99).
 *
 * Never runs the matching engine — only reads what `msg-workout-analyze.ts`
 * already wrote (`config.links.beeper` / proposal items) plus which
 * workouts are undated. This is the one function the
 * `/api/msg-workout/conversation-links` route calls.
 */

import { repoAndLocaToAddress } from "./cp-model.js";
import { getCurrentRepoGuid } from "./repo-context.js";
import { getItemByAddress } from "./item-ops.js";
import { getAllLeadsWithContacts, getLeadMsgWorkoutsByLoca } from "./leads.js";
import { listLeadBeeperLinks, findLiveBeeperMatchForLead } from "./lead-beeper-links.js";
import { getMsgWorkoutBeeperLink } from "./msg-workout-linking.js";
import { parseWorkoutName } from "./msg-workout-matching.js";
import { listProposalsForLead } from "./msg-workout-proposals.js";

/**
 * Resolves which lead (if any) is linked to a given Beeper conversation.
 * Saved lead↔conversation links first (fast, O(1) after one fetch); falls
 * back to the same live fuzzy matcher `findLiveBeeperMatchForLead` already
 * uses elsewhere, iterated across the current user's leads. This is an
 * O(leads) scan on the fallback path — acceptable at this tool's personal-
 * CRM scale (tens to low hundreds of leads), not something to reuse as-is
 * for a multi-tenant/bulk use case.
 */
export async function findLeadForConversation(conversationId: string): Promise<{ leadName: string; leadLoca: string } | null> {
  const savedLinks = await listLeadBeeperLinks();
  const saved = savedLinks.find((l) => l.conversationId === conversationId);
  if (saved && saved.leadLoca) {
    return { leadName: saved.leadName, leadLoca: saved.leadLoca };
  }

  const savedLeadNames = new Set(savedLinks.map((l) => l.leadName));
  const leads = await getAllLeadsWithContacts();
  for (const lead of leads) {
    if (savedLeadNames.has(lead.leadName)) continue; // already checked via saved links above
    const live = await findLiveBeeperMatchForLead(lead.leadName, lead.loca);
    if (live?.conversationId === conversationId) {
      return { leadName: lead.leadName, leadLoca: lead.loca };
    }
  }
  return null;
}

export interface MsgWorkoutGuiEntry {
  loca: string;
  name: string;
  body: string;
}

export interface MsgWorkoutProposalGuiEntry extends MsgWorkoutGuiEntry {
  confidence: number;
  reasons: string[];
  reasonType: string;
  /** How many candidate messages this proposal has in total (spec 1.2: one workout matches exactly one message once resolved — while still "proposed" it may have several candidates, but only the single best one is ever surfaced as a marker, never one chip per candidate). */
  totalCandidates: number;
}

export interface MsgWorkoutConversationLinks {
  leadName: string | null;
  linksByMessageId: Record<string, MsgWorkoutGuiEntry[]>;
  /** Pending (status "proposed") proposals, keyed by each candidate's messageId — never auto-linked, shown for human review next to the candidate message. */
  proposalsByMessageId: Record<string, MsgWorkoutProposalGuiEntry[]>;
  undated: MsgWorkoutGuiEntry[];
}

export async function getMsgWorkoutConversationLinks(conversationId: string): Promise<MsgWorkoutConversationLinks> {
  const lead = await findLeadForConversation(conversationId);
  if (!lead) {
    return { leadName: null, linksByMessageId: {}, proposalsByMessageId: {}, undated: [] };
  }

  const repoGuid = getCurrentRepoGuid();
  const workoutsResult = await getLeadMsgWorkoutsByLoca(lead.leadLoca);

  const linksByMessageId: Record<string, MsgWorkoutGuiEntry[]> = {};
  const undated: MsgWorkoutGuiEntry[] = [];
  const entryByWorkoutName = new Map<string, MsgWorkoutGuiEntry>();
  const linkedWorkoutNames = new Set<string>();

  for (const workout of workoutsResult.workouts) {
    const address = repoAndLocaToAddress(repoGuid, workout.loca);
    const item = await getItemByAddress(address);
    if (!item) continue;

    const entry: MsgWorkoutGuiEntry = { loca: workout.loca, name: workout.logicalName, body: item.body };
    entryByWorkoutName.set(workout.logicalName, entry);

    const link = getMsgWorkoutBeeperLink(item);
    if (link) {
      (linksByMessageId[link.messageId] ??= []).push(entry);
      linkedWorkoutNames.add(workout.logicalName);
    }
  }

  const proposals = await listProposalsForLead(lead.leadName);
  const proposedWorkoutNames = new Set(proposals.map((p) => p.proposal?.msgWorkoutItemName).filter((n): n is string => Boolean(n)));

  const proposalsByMessageId: Record<string, MsgWorkoutProposalGuiEntry[]> = {};
  for (const p of proposals) {
    if (!p.proposal || p.proposal.status !== "proposed") continue;
    const entry = entryByWorkoutName.get(p.proposal.msgWorkoutItemName);
    if (!entry || p.proposal.candidates.length === 0) continue;

    // Spec 1.2: one workout matches one message. A "proposed" workout is
    // still undecided and may carry several candidates internally, but the
    // GUI must never render the same workout as a chip on every candidate
    // message (that reads as "linked to N messages" — confirmed a real
    // point of confusion). Surface only the single best-confidence
    // candidate; the rest stay visible inside the panel body if needed.
    const best = [...p.proposal.candidates].sort((a, b) => b.confidence - a.confidence)[0];
    (proposalsByMessageId[best.messageId] ??= []).push({
      ...entry,
      confidence: best.confidence,
      reasons: best.reasons,
      reasonType: p.proposal.reason.type,
      totalCandidates: p.proposal.candidates.length,
    });
  }

  for (const workout of workoutsResult.workouts) {
    if (linkedWorkoutNames.has(workout.logicalName)) continue;
    const entry = entryByWorkoutName.get(workout.logicalName);
    if (!entry) continue;
    const parsedName = parseWorkoutName(workout.logicalName);
    if (parsedName.kind === "none" && !proposedWorkoutNames.has(workout.logicalName)) {
      undated.push(entry);
    }
  }

  return { leadName: lead.leadName, linksByMessageId, proposalsByMessageId, undated };
}
