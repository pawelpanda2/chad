/**
 * POST /api/forms/audio-recording/drafts/[draftId]/finalize
 * Body: { displayName?: string }
 *
 * Merges all draft segments into ONE final recording (see dba's
 * finalizeAudioRecordingDraft — idempotent, double-click safe). A failed
 * finalization keeps the draft available for retry.
 */

import { NextRequest, NextResponse } from "next/server";
import { finalizeAudioRecordingDraft, AudioRecordingError, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";
import { audioRecordingErrorStatus } from "../../../draft-error-status";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  let displayName: string | undefined;
  try {
    const body = (await request.json()) as { displayName?: unknown };
    if (typeof body.displayName === "string") displayName = body.displayName;
  } catch {
    // Empty body is fine — displayName is optional.
  }

  try {
    const { draftId } = await params;
    const result = await runWithRepoContext(user, () =>
      finalizeAudioRecordingDraft({ draftId, displayName }),
    );
    return NextResponse.json({
      success: true,
      id: result.id,
      displayName: result.displayName,
      durationMs: result.durationMs ?? null,
      sizeBytes: result.sizeBytes,
      mimeType: result.mimeType,
    });
  } catch (error) {
    if (error instanceof AudioRecordingError) {
      console.error("[audio draft finalize]", error.code, error.message);
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: audioRecordingErrorStatus(error) },
      );
    }
    console.error("[audio draft finalize]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Finalization failed" }, { status: 500 });
  }
}
