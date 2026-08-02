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
import { getBeeperContact } from "./beeper-crm.js";
import { listLeadBeeperLinks, findLiveBeeperMatchForLead } from "./lead-beeper-links.js";
import { getMsgWorkoutBeeperLink, setMsgWorkoutBeeperLinkManual } from "./msg-workout-linking.js";
import { parseWorkoutName } from "./msg-workout-matching.js";
import { listProposalsForLead, setProposalStatusIfExists } from "./msg-workout-proposals.js";

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

/** One row of the full "all workouts, in order" list (GUI manual-assignment panel). */
export interface MsgWorkoutListEntry {
  loca: string;
  name: string;
  body: string;
  /** Confirmed link's messageId, if linked. */
  linkedMessageId: string | null;
  /** Best proposal's messageId, if proposed and not (yet) linked. */
  proposedMessageId: string | null;
  /** Proposal confidence (0..1), only set alongside `proposedMessageId`. */
  confidence: number | null;
}

export interface MsgWorkoutConversationLinks {
  leadName: string | null;
  linksByMessageId: Record<string, MsgWorkoutGuiEntry[]>;
  /** Pending (status "proposed") proposals, keyed by each candidate's messageId — never auto-linked, shown for human review next to the candidate message. */
  proposalsByMessageId: Record<string, MsgWorkoutProposalGuiEntry[]>;
  undated: MsgWorkoutGuiEntry[];
  /** Every workout for this lead, in their natural order, each with its current assignment (if any) — drives the manual numeric-assignment list panel. */
  allWorkouts: MsgWorkoutListEntry[];
}

export async function getMsgWorkoutConversationLinks(conversationId: string): Promise<MsgWorkoutConversationLinks> {
  const lead = await findLeadForConversation(conversationId);
  if (!lead) {
    return { leadName: null, linksByMessageId: {}, proposalsByMessageId: {}, undated: [], allWorkouts: [] };
  }

  const repoGuid = getCurrentRepoGuid();
  const workoutsResult = await getLeadMsgWorkoutsByLoca(lead.leadLoca);

  const linksByMessageId: Record<string, MsgWorkoutGuiEntry[]> = {};
  const undated: MsgWorkoutGuiEntry[] = [];
  const entryByWorkoutName = new Map<string, MsgWorkoutGuiEntry>();
  const linkedWorkoutNames = new Set<string>();
  const linkedMessageIdByWorkoutName = new Map<string, string>();

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
      linkedMessageIdByWorkoutName.set(workout.logicalName, link.messageId);
    }
  }

  const proposals = await listProposalsForLead(lead.leadName);
  const proposedWorkoutNames = new Set(proposals.map((p) => p.proposal?.msgWorkoutItemName).filter((n): n is string => Boolean(n)));
  const bestProposalByWorkoutName = new Map<string, { messageId: string; confidence: number }>();

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
    bestProposalByWorkoutName.set(p.proposal.msgWorkoutItemName, { messageId: best.messageId, confidence: best.confidence });
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

  const allWorkouts: MsgWorkoutListEntry[] = workoutsResult.workouts
    .filter((w) => entryByWorkoutName.has(w.logicalName))
    .map((w) => {
      const bestProposal = bestProposalByWorkoutName.get(w.logicalName) ?? null;
      return {
        loca: w.loca,
        name: w.logicalName,
        body: entryByWorkoutName.get(w.logicalName)?.body ?? "",
        linkedMessageId: linkedMessageIdByWorkoutName.get(w.logicalName) ?? null,
        proposedMessageId: bestProposal?.messageId ?? null,
        confidence: bestProposal?.confidence ?? null,
      };
    });

  return { leadName: lead.leadName, linksByMessageId, proposalsByMessageId, undated, allWorkouts };
}

/**
 * Manual assignment (GUI numeric combobox next to each workout in the list
 * panel) — sets or clears which message a workout is linked to, overriding
 * whatever the auto-matcher decided (or providing a link for a workout that
 * was never proposed at all, e.g. one of the "undated" ones).
 *
 * `messageId: null` clears the link. Otherwise the message's own ISO
 * timestamp is looked up server-side from `conversationId` — the frontend
 * only ever has the display-formatted (`DD/MM/YYYY, HH:MM:SS`) timestamp
 * after the WhatsApp-export round-trip (see `beeperMessagesToParsedMessagesWithDbId`
 * in whatsapp-messages.ts), so re-parsing that on the client would be lossy;
 * reading the real value from Mongo here is both simpler and correct.
 *
 * When a proposal exists for this workout, its status is kept in sync
 * (`"accepted"` once linked, back to `"proposed"` once cleared) so it
 * doesn't keep showing as a separate, stale proposal chip alongside the
 * real link.
 */
export async function setMsgWorkoutMessageAssignment(
  leadName: string,
  workoutLoca: string,
  workoutName: string,
  conversationId: string,
  messageId: string | null
): Promise<void> {
  const repoGuid = getCurrentRepoGuid();
  const address = repoAndLocaToAddress(repoGuid, workoutLoca);
  const item = await getItemByAddress(address);
  if (!item) throw new Error(`msg workout item not found: ${workoutLoca}`);

  let assignment: { messageId: string; timestamp: string } | null = null;
  if (messageId) {
    const contact = await getBeeperContact(conversationId);
    const message = contact?.messages.find((m) => m._id === messageId);
    if (!message?.timestamp) throw new Error(`message not found in conversation: ${messageId}`);
    assignment = { messageId, timestamp: message.timestamp };
  }

  await setMsgWorkoutBeeperLinkManual(item, assignment);
  await setProposalStatusIfExists(leadName, workoutName, assignment ? "accepted" : "proposed");
}
