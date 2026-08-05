/**
 * POST /api/msg-automation/links-v2/beeper-unlink — remove a Beeper
 * conversation link from a lead (REMOVE drop target / Conv-tab unlink-X
 * confirm). Thin adapter — business logic in dba/links-v2/manual-links.ts.
 */

import { NextResponse } from "next/server";
import { unlinkBeeperConversationFromLead, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function POST(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const leadLoca = typeof body?.leadLoca === "string" ? body.leadLoca : "";
  const chatId = typeof body?.chatId === "string" ? body.chatId : "";
  if (!leadLoca || !chatId) {
    return NextResponse.json({ success: false, error: "leadLoca and chatId are required" }, { status: 400 });
  }

  try {
    await runWithRepoContext(user, () => unlinkBeeperConversationFromLead({ leadLoca, chatId }));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[links-v2/beeper-unlink POST]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
