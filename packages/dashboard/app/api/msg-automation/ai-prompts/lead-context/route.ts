/**
 * GET /api/msg-automation/ai-prompts/lead-context?leadName=…&leadLoca=…
 *
 * AI Prompts → conversation tab, left "context" panel: given a lead the
 * caller already owns (query params, never a repoGuid), returns the same
 * report/conversation lookups Message Creator uses — reports found for the
 * lead (`listLeadReportsForCreator`), the conversation resolved by the
 * shared saved-link → live-match → legacy-fallback algorithm
 * (`getLeadConversationForCreator`), the console's "use the first found
 * report" default, and a `<current_case>` base prompt built from those
 * defaults (`buildLeadAnalysisCurrentCase` — never assembled in React).
 * Read-only: never mutates anything, never calls OpenAI.
 */

import { NextRequest, NextResponse } from "next/server";
import { getLeadAnalysisContext, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const leadName = searchParams.get("leadName")?.trim();
  const leadLoca = searchParams.get("leadLoca")?.trim() || undefined;
  if (!leadName) {
    return NextResponse.json({ success: false, error: "leadName is required" }, { status: 400 });
  }

  try {
    const data = await runWithRepoContext(user, () => getLeadAnalysisContext(leadName, leadLoca));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[ai-prompts/lead-context GET]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
