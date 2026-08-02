/**
 * PATCH /api/msg-workout/set-link — manual assignment (Story 99 follow-up,
 * the numeric combobox next to each workout in the "all workouts" list
 * panel). Sets or clears which Beeper message a msg-workout item is linked
 * to, overriding the auto-matcher — a deliberate human override, always
 * `method: "manual"` (see dba's `setMsgWorkoutBeeperLinkManual`).
 *
 * Body: { leadName, workoutLoca, workoutName, conversationId, messageId } —
 * `messageId: null` clears the link back to unassigned. The message's own
 * timestamp is looked up server-side from `conversationId` (see dba's
 * `setMsgWorkoutMessageAssignment`), not supplied by the client.
 */
import { NextResponse } from "next/server";
import { setMsgWorkoutMessageAssignment, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function PATCH(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const leadName = typeof body?.leadName === "string" ? body.leadName : null;
  const workoutLoca = typeof body?.workoutLoca === "string" ? body.workoutLoca : null;
  const workoutName = typeof body?.workoutName === "string" ? body.workoutName : null;
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : null;
  const messageId = typeof body?.messageId === "string" ? body.messageId : null;

  if (!leadName || !workoutLoca || !workoutName || !conversationId) {
    return NextResponse.json(
      { ok: false, error: "leadName, workoutLoca, workoutName and conversationId are required" },
      { status: 400 }
    );
  }

  return runWithRepoContext(user, async () => {
    try {
      await setMsgWorkoutMessageAssignment(leadName, workoutLoca, workoutName, conversationId, messageId);
      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error("Error setting msg workout message assignment:", error);
      return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
    }
  });
}
