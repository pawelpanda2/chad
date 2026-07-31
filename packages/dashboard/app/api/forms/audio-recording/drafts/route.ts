/**
 * POST /api/forms/audio-recording/drafts — create a draft recording.
 * Body: { recordedDate: "YYYY-MM-DD", displayName?: string }
 *
 * Thin adapter over dba's audio-recording-drafts.ts (Story 93 follow-up).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAudioRecordingDraft, AudioRecordingError, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";
import { audioRecordingErrorStatus } from "../draft-error-status";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  let body: { recordedDate?: unknown; displayName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.recordedDate !== "string") {
    return NextResponse.json({ success: false, error: "Missing recordedDate" }, { status: 400 });
  }

  try {
    const draft = await runWithRepoContext(user, () =>
      createAudioRecordingDraft({
        recordedDate: body.recordedDate as string,
        displayName: typeof body.displayName === "string" ? body.displayName : undefined,
      }),
    );
    return NextResponse.json({
      success: true,
      draft: { id: draft.id, recordedDate: draft.recordedDate, displayName: draft.displayName },
    });
  } catch (error) {
    if (error instanceof AudioRecordingError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: audioRecordingErrorStatus(error) },
      );
    }
    console.error("[audio drafts POST]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Could not create draft" }, { status: 500 });
  }
}
