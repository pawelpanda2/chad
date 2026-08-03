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

export interface LeadAnalysisContext {
  leadName: string;
  leadLoca: string | null;
  reports: LeadAnalysisReportOption[];
  /** First found report's address — same "use the first match" default as console. */
  recommendedReportAddress: string | null;
  conversation: LeadAnalysisConversationOption;
  /** `<current_case>` built from the recommended report + resolved conversation, default question. */
  basePrompt: string;
}

export async function getLeadAnalysisContext(
  leadName: string,
  leadLoca?: string | null
): Promise<LeadAnalysisContext> {
  const [reportSummaries, conversationResult] = await Promise.all([
    listLeadReportsForCreator(leadName),
    getLeadConversationForCreator(leadName, leadLoca ?? undefined),
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
    basePrompt,
  };
}
