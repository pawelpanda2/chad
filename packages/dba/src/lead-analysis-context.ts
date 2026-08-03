/**
 * AI Prompts → conversation tab: lead analysis context (Story 102 follow-up
 * to `askOpenAiAboutGirl.ts`'s console flow). Wraps the *same* report/
 * conversation lookups Message Creator already uses — `listLeadReportsForCreator`
 * / `getLeadConversationForCreator` — never a separate/weaker matching
 * algorithm. Report and conversation *bodies* are per-user data (the
 * caller's own repo, via `runWithRepoContext`); only the saved prompt
 * definition itself lives in `chad_shared`.
 */

import { listLeadReportsForCreator, getLeadConversationForCreator } from "./message-creator.js";
import { buildLeadAnalysisCurrentCase } from "./lead-analysis-prompt.js";
import { loadConversationCandidates } from "./lead-beeper-links.js";
import { getBeeperContact } from "./beeper-crm.js";
import { formatBeeperMessagesForExport } from "./whatsapp-messages.js";

function previewLines(text: string | null, maxLines = 8): string | null {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  return lines.slice(0, maxLines).join("\n");
}

export interface LeadAnalysisReportOption {
  address: string;
  name: string | null;
  category: string | null;
  preview: string | null;
  body: string;
}

export interface LeadAnalysisConversationOption {
  found: boolean;
  body: string | null;
  channel: string | null;
  /** Which tier resolved this conversation — reported by getLeadConversationForCreator itself. */
  basis: "saved-link" | "live-match" | "legacy-fallback" | "not-found";
  preview: string | null;
  error?: string;
}

export interface LeadAnalysisConversationCandidate {
  conversationId: string;
  conversationName: string;
  displayName: string;
  channel?: string;
}

export interface LeadAnalysisContext {
  leadName: string;
  leadLoca: string | null;
  reports: LeadAnalysisReportOption[];
  /** First found report's address — same "use the first match" default as console. */
  recommendedReportAddress: string | null;
  conversation: LeadAnalysisConversationOption;
  /**
   * Every Beeper contact the user could manually attach instead — the same
   * list the Msg Auto → Links page uses, never a separate/weaker lookup.
   * `getLeadConversationForCreator` doesn't expose a conversation id for
   * the recommended match, so this list is not de-duplicated against it —
   * the GUI labels it "browse other conversations" and search makes the
   * occasional duplicate harmless.
   */
  conversationCandidates: LeadAnalysisConversationCandidate[];
  /** `<current_case>` built from the recommended report + resolved conversation, default question. */
  basePrompt: string;
}

export async function getLeadAnalysisContext(
  leadName: string,
  leadLoca?: string | null
): Promise<LeadAnalysisContext> {
  const [reportSummaries, conversationResult, conversationCandidatesRaw] = await Promise.all([
    listLeadReportsForCreator(leadName),
    getLeadConversationForCreator(leadName, leadLoca ?? undefined),
    loadConversationCandidates().catch(() => []),
  ]);

  const reports: LeadAnalysisReportOption[] = reportSummaries
    .filter((r) => Boolean(r.address && r.body))
    .map((r) => ({
      address: r.address as string,
      name: r.name,
      category: r.category,
      preview: previewLines(r.body),
      body: r.body as string,
    }));

  const recommendedReportAddress = reports[0]?.address ?? null;

  const conversation: LeadAnalysisConversationOption = {
    found: conversationResult.found,
    body: conversationResult.body,
    channel: conversationResult.channel,
    basis: conversationResult.basis,
    preview: previewLines(conversationResult.body),
    error: conversationResult.error,
  };

  const conversationCandidates: LeadAnalysisConversationCandidate[] = conversationCandidatesRaw.map((c) => ({
    conversationId: c.conversationId,
    conversationName: c.conversationName,
    displayName: c.displayName,
    channel: c.channel,
  }));

  const basePrompt = buildLeadAnalysisCurrentCase({
    leadName,
    reportBody: reports[0]?.body ?? null,
    conversationBody: conversation.found ? conversation.body : null,
  });

  return {
    leadName,
    leadLoca: leadLoca ?? null,
    reports,
    recommendedReportAddress,
    conversation,
    conversationCandidates,
    basePrompt,
  };
}

export interface BeeperConversationBody {
  conversationId: string;
  conversationName: string;
  channel: string | null;
  body: string | null;
}

/**
 * Fetches the message body for a Beeper conversation the user picked
 * manually (auto tab's "browse other conversations"), by id — same
 * export/formatting helpers `getLeadConversationForCreator` already uses,
 * not a new read path.
 */
export async function getBeeperConversationBodyById(conversationId: string): Promise<BeeperConversationBody | null> {
  const contact = await getBeeperContact(conversationId);
  if (!contact) return null;
  const body = formatBeeperMessagesForExport(contact.messages) || null;
  return {
    conversationId,
    conversationName: contact.contact.displayName || conversationId,
    channel: contact.channels[0]?.title ?? null,
    body,
  };
}
