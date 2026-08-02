/**
 * Msg workout ↔ Beeper analysis orchestration (Story 99).
 *
 * The one place that ties together: lead resolution (leads.ts), the lead's
 * linked Beeper conversation (lead-beeper-links.ts), that conversation's
 * messages (beeper-crm.ts), the pure matching engine
 * (msg-workout-matching.ts), and the two write paths
 * (msg-workout-linking.ts / msg-workout-proposals.ts). Nothing here talks
 * to CP/Mongo directly — it only calls other `dba` functions.
 */

import { getItemByAddress } from "./item-ops.js";
import { repoAndLocaToAddress } from "./cp-model.js";
import { getCurrentRepoGuid } from "./repo-context.js";
import { getAllLeadsWithContacts, getLeadMsgWorkoutsByLoca, type LeadDashboardItem } from "./leads.js";
import { listLeadBeeperLinks, findLiveBeeperMatchForLead } from "./lead-beeper-links.js";
import { getBeeperContact } from "./beeper-crm.js";
import { matchMsgWorkout, type BeeperCandidateMessage } from "./msg-workout-matching.js";
import { getMsgWorkoutLinkEligibility, writeMsgWorkoutBeeperLink } from "./msg-workout-linking.js";
import { hasExistingProposal, writeProposal, type MsgWorkoutProposal } from "./msg-workout-proposals.js";

export interface AnalyzeSummary {
  leadName: string;
  conversationId: string | null;
  totalWorkouts: number;
  linked: number;
  proposals: number;
  undated: number;
  noCandidates: number;
  alreadyLinked: number;
  alreadyAnalyzed: number;
  errors: Array<{ workoutName: string; error: string }>;
}

/** Resolves the Beeper conversation linked to a lead — saved link first, then the live matcher, same precedence lead-beeper-links.ts documents. */
async function resolveConversationIdForLead(leadName: string, leadLoca: string): Promise<string | null> {
  const savedLinks = await listLeadBeeperLinks();
  const saved = savedLinks.find((l) => l.leadName === leadName);
  if (saved) return saved.conversationId;

  const live = await findLiveBeeperMatchForLead(leadName, leadLoca);
  return live?.conversationId ?? null;
}

async function loadCandidateMessages(conversationId: string): Promise<BeeperCandidateMessage[]> {
  const detail = await getBeeperContact(conversationId);
  if (!detail) return [];
  return detail.messages
    .filter((m): m is typeof m & { timestamp: string } => Boolean(m.timestamp))
    .map((m) => ({ messageId: m._id, timestamp: m.timestamp, isSelf: m.isSelf, text: m.text }));
}

/**
 * Analyzes every eligible `msg workout` item for one lead. Idempotent:
 * already-linked and already-analyzed (has a proposal) workouts are
 * skipped and counted, never re-processed or overwritten.
 */
export async function analyzeMsgWorkoutsForLead(leadName: string, leadLoca: string): Promise<AnalyzeSummary> {
  const summary: AnalyzeSummary = {
    leadName,
    conversationId: null,
    totalWorkouts: 0,
    linked: 0,
    proposals: 0,
    undated: 0,
    noCandidates: 0,
    alreadyLinked: 0,
    alreadyAnalyzed: 0,
    errors: [],
  };

  const workoutsResult = await getLeadMsgWorkoutsByLoca(leadLoca);
  summary.totalWorkouts = workoutsResult.workouts.length;
  if (workoutsResult.workouts.length === 0) {
    return summary;
  }

  const conversationId = await resolveConversationIdForLead(leadName, leadLoca);
  summary.conversationId = conversationId;

  const candidates = conversationId ? await loadCandidateMessages(conversationId) : [];
  const repoGuid = getCurrentRepoGuid();

  for (const workout of workoutsResult.workouts) {
    try {
      const address = repoAndLocaToAddress(repoGuid, workout.loca);
      const item = await getItemByAddress(address);
      if (!item) {
        summary.errors.push({ workoutName: workout.logicalName, error: `Item not found at loca "${workout.loca}"` });
        continue;
      }

      const hasProposal = await hasExistingProposal(leadName, workout.logicalName);
      const eligibility = getMsgWorkoutLinkEligibility(item, hasProposal);
      if (eligibility === "already-linked") {
        summary.alreadyLinked++;
        continue;
      }
      if (eligibility === "already-analyzed") {
        summary.alreadyAnalyzed++;
        continue;
      }

      if (!conversationId) {
        // No Beeper conversation resolved for this lead at all — nothing to
        // match against. Not persisted anywhere: re-checked next run in
        // case a lead↔conversation link gets added later.
        summary.undated++;
        continue;
      }

      const result = matchMsgWorkout({ workoutName: workout.logicalName, workoutBody: item.body, candidates });

      if (result.type === "undated") {
        summary.undated++;
        continue;
      }
      if (result.type === "no-candidates") {
        summary.noCandidates++;
        continue;
      }
      if (result.type === "linked") {
        await writeMsgWorkoutBeeperLink(item, { messageId: result.messageId, timestamp: result.timestamp });
        summary.linked++;
        continue;
      }

      // result.type === "proposal"
      const proposal: MsgWorkoutProposal = {
        lead: leadName,
        msgWorkoutItemId: item._id,
        msgWorkoutItemName: workout.logicalName,
        status: "proposed",
        analyzedAt: new Date().toISOString(),
        reason: result.reason,
        candidates: result.candidates,
      };
      await writeProposal(leadName, workout.logicalName, proposal);
      summary.proposals++;
    } catch (error) {
      summary.errors.push({ workoutName: workout.logicalName, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return summary;
}

export interface AnalyzeAllSummary {
  leads: number;
  totals: Omit<AnalyzeSummary, "leadName" | "conversationId" | "errors">;
  perLead: AnalyzeSummary[];
}

/** Safe, current-user-only batch (spec 3.4) — never all users. */
export async function analyzeNewMsgWorkoutsForCurrentUser(): Promise<AnalyzeAllSummary> {
  const leads: LeadDashboardItem[] = await getAllLeadsWithContacts();
  const perLead: AnalyzeSummary[] = [];

  for (const lead of leads) {
    perLead.push(await analyzeMsgWorkoutsForLead(lead.leadName, lead.loca));
  }

  const totals = perLead.reduce(
    (acc, s) => ({
      totalWorkouts: acc.totalWorkouts + s.totalWorkouts,
      linked: acc.linked + s.linked,
      proposals: acc.proposals + s.proposals,
      undated: acc.undated + s.undated,
      noCandidates: acc.noCandidates + s.noCandidates,
      alreadyLinked: acc.alreadyLinked + s.alreadyLinked,
      alreadyAnalyzed: acc.alreadyAnalyzed + s.alreadyAnalyzed,
    }),
    { totalWorkouts: 0, linked: 0, proposals: 0, undated: 0, noCandidates: 0, alreadyLinked: 0, alreadyAnalyzed: 0 }
  );

  return { leads: leads.length, totals, perLead };
}
