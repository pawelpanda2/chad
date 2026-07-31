/**
 * GET    /api/forms/audio-recording/drafts/[draftId] — draft detail (segments).
 * DELETE /api/forms/audio-recording/drafts/[draftId] — discard the draft.
 *
 * Thin adapters over dba's audio-recording-drafts.ts. Ownership (repoGuid)
 * comes exclusively from the session via runWithRepoContext.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getAudioRecordingDraft,
  discardAudioRecordingDraft,
  AudioRecordingError,
  runWithRepoContext,
} from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";
import { audioRecordingErrorStatus } from "../../draft-error-status";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }
  try {
    const { draftId } = await params;
    const draft = await runWithRepoContext(user, () => getAudioRecordingDraft(draftId));
    if (!draft) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      draft: {
        id: draft.id,
        displayName: draft.displayName,
        recordedDate: draft.recordedDate,
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt,
        status: draft.status,
        error: draft.error ?? null,
        segments: draft.segments.map((s) => ({
          sessionId: s.sessionId,
          mimeType: s.mimeType,
          sizeBytes: s.sizeBytes,
          durationMs: s.durationMs,
          uploadedAt: s.uploadedAt,
        })),
      },
    });
  } catch (error) {
    if (error instanceof AudioRecordingError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: audioRecordingErrorStatus(error) },
      );
    }
    console.error("[audio draft GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Could not read draft" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }
  try {
    const { draftId } = await params;
    const removed = await runWithRepoContext(user, () => discardAudioRecordingDraft(draftId));
    if (!removed) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AudioRecordingError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: audioRecordingErrorStatus(error) },
      );
    }
    console.error("[audio draft DELETE]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Could not discard draft" }, { status: 500 });
  }
}
