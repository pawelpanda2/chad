/**
 * GET /api/msg-workout/conversation-links?conversationId=... — Story 99.
 *
 * Read-only: returns whatever links/proposals/undated workouts already
 * exist for the lead linked to this conversation. Never runs the matching
 * engine (spec 1.8 — GUI must not match at render time); run
 * POST /api/msg-workout/analyze-lead first to produce links/proposals.
 */
import { NextResponse } from "next/server";
import { getMsgWorkoutConversationLinks, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function GET(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId")?.trim();
  if (!conversationId) {
    return NextResponse.json({ ok: false, error: "conversationId is required" }, { status: 400 });
  }

  return runWithRepoContext(user, async () => {
    try {
      const data = await getMsgWorkoutConversationLinks(conversationId);
      return NextResponse.json(data);
    } catch (error) {
      console.error(`Error loading msg workout links for conversation ${conversationId}:`, error);
      return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
    }
  });
}
