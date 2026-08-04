/**
 * POST /api/msg-workout/append-entry — structured entry composer for the
 * shared Msg Workout editor (v11, Beeper → Msg workout / Msg Auto → Msg
 * Workout — same `MsgWorkoutPanel` component in both places).
 *
 * Thin adapter only (endpoint-rules §2): all body-formatting logic lives in
 * dba's `appendMsgWorkoutEntryAndSave`.
 *
 * Body: { workoutLoca: string, entry: MsgWorkoutEntryInput } where entry is
 * `{ type: "dash", text }` | `{ type: "ver", text }` | `{ type: "advice", author, text }`.
 */
import { NextResponse } from "next/server";
import { appendMsgWorkoutEntryAndSave, runWithRepoContext, type MsgWorkoutEntryInput } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

function parseEntry(raw: unknown): MsgWorkoutEntryInput | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.text !== "string" || !value.text.trim()) return null;

  if (value.type === "dash") return { type: "dash", text: value.text };
  if (value.type === "ver") return { type: "ver", text: value.text };
  if (value.type === "advice") {
    if (typeof value.author !== "string") return null;
    return { type: "advice", author: value.author, text: value.text };
  }
  return null;
}

export async function POST(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const workoutLoca = typeof body?.workoutLoca === "string" ? body.workoutLoca.trim() : "";
  const entry = parseEntry(body?.entry);

  if (!workoutLoca) {
    return NextResponse.json({ ok: false, error: "Missing workoutLoca" }, { status: 400 });
  }
  if (!entry) {
    return NextResponse.json({ ok: false, error: "Invalid entry" }, { status: 400 });
  }

  try {
    const newBody = await runWithRepoContext(user, () => appendMsgWorkoutEntryAndSave(workoutLoca, entry));
    return NextResponse.json({ ok: true, body: newBody });
  } catch (error) {
    console.error("Error appending msg workout entry:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
