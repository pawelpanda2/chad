/**
 * POST /api/msg-automation/links-v2/beeper-link — manually assign a Beeper
 * conversation to a lead (GUI drag & drop). Thin adapter — business logic
 * in dba/links-v2/manual-links.ts.
 */

import { NextResponse } from "next/server";
import { linkBeeperConversationToLead, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function POST(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const leadLoca = typeof body?.leadLoca === "string" ? body.leadLoca : "";
  const chatId = typeof body?.chatId === "string" ? body.chatId : "";
  const network = typeof body?.network === "string" ? body.network : "unknown";
  if (!leadLoca || !chatId) {
    return NextResponse.json({ success: false, error: "leadLoca and chatId are required" }, { status: 400 });
  }

  try {
    await runWithRepoContext(user, () => linkBeeperConversationToLead({ leadLoca, chatId, network }));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[links-v2/beeper-link POST]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
