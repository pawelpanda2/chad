/**
 * POST /api/msg-automation/ai-prompts/lead-context/preview
 *
 * AI Prompts → conversation tab: recomputes the `<current_case>` base
 * prompt and the final prompt (base + additional user input) for the
 * caller's *current* selection (lead name, chosen report body, chosen
 * conversation body — "none" is `null`/omitted) and the current
 * "additional input" textarea content. Pure formatting only — the request
 * body already carries the report/conversation text the client fetched
 * from `lead-context`; this route never re-reads Content Provider data, so
 * it's cheap enough to call on every report/conversation dropdown change
 * or (debounced) keystroke. Never assembled in React — same
 * `buildLeadAnalysisCurrentCase` / `appendAdditionalUserInput` the actual
 * `[id]/run` send path uses, so the preview always matches the real request.
 */

import { NextRequest, NextResponse } from "next/server";
import { buildLeadAnalysisCurrentCase, appendAdditionalUserInput } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const input = (body ?? {}) as Record<string, unknown>;
  const leadName = typeof input.leadName === "string" ? input.leadName.trim() : "";
  if (!leadName) {
    return NextResponse.json({ success: false, error: "leadName is required" }, { status: 400 });
  }
  const reportBody = typeof input.reportBody === "string" ? input.reportBody : null;
  const conversationBody = typeof input.conversationBody === "string" ? input.conversationBody : null;
  const additionalUserInput = typeof input.additionalUserInput === "string" ? input.additionalUserInput : "";

  const basePrompt = buildLeadAnalysisCurrentCase({ leadName, reportBody, conversationBody });
  const finalPrompt = appendAdditionalUserInput(basePrompt, additionalUserInput);

  return NextResponse.json({ success: true, data: { basePrompt, finalPrompt } });
}
