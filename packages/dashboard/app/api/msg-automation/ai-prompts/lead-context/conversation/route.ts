/**
 * GET /api/msg-automation/ai-prompts/lead-context/conversation?conversationId=…
 *
 * AI Prompts → conversation tab, auto tab's "browse other conversations":
 * fetches the message body for a Beeper conversation the user picked
 * manually (not the auto-recommended one) — scoped to the caller's own
 * repo via `runWithRepoContext`. Read-only, never calls OpenAI.
 */

import { NextRequest, NextResponse } from "next/server";
import { getBeeperConversationBodyById, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId")?.trim();
  if (!conversationId) {
    return NextResponse.json({ success: false, error: "conversationId is required" }, { status: 400 });
  }

  try {
    const data = await runWithRepoContext(user, () => getBeeperConversationBodyById(conversationId));
    if (!data) {
      return NextResponse.json({ success: false, error: "Conversation not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[ai-prompts/lead-context/conversation GET]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
