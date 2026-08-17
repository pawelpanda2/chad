/**
 * POST /api/leads/message-creator/entry — Msg Creator composer save
 * (Story 125). Body: { leadLoca, who: "you"|"advice", mode: "dash"|"ver", text }.
 *
 * Thin adapter only (endpoint-rules §2): all orchestration (find-or-create
 * the Msg Workout for the lead's last Beeper message, append the entry)
 * lives in dba's `saveMsgCreatorEntry`. The advice author is ALWAYS the
 * session username — never read from the request body, per spec (no
 * hardcoded default, no arbitrary-body author).
 */
import { NextResponse } from "next/server";
import { saveMsgCreatorEntry, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function POST(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const leadLoca = typeof body?.leadLoca === "string" ? body.leadLoca.trim() : "";
  const who = body?.who === "advice" ? "advice" : body?.who === "you" ? "you" : null;
  const mode = body?.mode === "ver" ? "ver" : body?.mode === "dash" ? "dash" : null;
  const text = typeof body?.text === "string" ? body.text : "";

  if (!leadLoca) {
    return NextResponse.json({ success: false, error: "Missing leadLoca" }, { status: 400 });
  }
  if (!who || !mode) {
    return NextResponse.json({ success: false, error: "Invalid who/mode" }, { status: 400 });
  }
  if (!text.trim()) {
    return NextResponse.json({ success: false, error: "Empty entry" }, { status: 400 });
  }

  try {
    const result = await runWithRepoContext(user, () =>
      saveMsgCreatorEntry(leadLoca, { who, mode, text, author: user.username })
    );
    if (result.status !== "ok") {
      return NextResponse.json({ success: false, error: result.status }, { status: 409 });
    }
    return NextResponse.json({ success: true, workout: result.workout });
  } catch (error) {
    console.error("[message-creator entry POST]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
