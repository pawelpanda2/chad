/**
 * PUT /api/forms/audio-recording/drafts/[draftId]/segments/[sessionId]
 *
 * Uploads (or re-uploads) one recording segment. Multipart fields:
 *   file        — the audio blob
 *   durationMs  — active recording time of this segment
 *   final       — "true" = the session's final upload; anything else = a
 *                 mid-session checkpoint that a later upload with the same
 *                 sessionId will REPLACE (never duplicate).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  saveAudioRecordingDraftSegment,
  AudioRecordingError,
  AUDIO_RECORDING_MAX_BYTES,
  runWithRepoContext,
} from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";
import { audioRecordingErrorStatus } from "../../../../draft-error-status";

export const runtime = "nodejs";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ draftId: string; sessionId: string }> },
) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid form data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ success: false, error: "Missing audio file" }, { status: 400 });
  }
  const blob = file as File;
  if (blob.size <= 0) {
    return NextResponse.json({ success: false, error: "Segment is empty" }, { status: 400 });
  }
  if (blob.size > AUDIO_RECORDING_MAX_BYTES) {
    return NextResponse.json({ success: false, error: "Segment exceeds size limit" }, { status: 413 });
  }
  const durationMsRaw = form.get("durationMs")?.toString() ?? "";
  const durationMs = /^\d+$/.test(durationMsRaw) ? Number(durationMsRaw) : 0;
  const final = form.get("final")?.toString() === "true";
  const mimeType = (blob.type || form.get("mimeType")?.toString() || "").trim();

  try {
    const { draftId, sessionId } = await params;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const draft = await runWithRepoContext(user, () =>
      saveAudioRecordingDraftSegment({ draftId, sessionId, bytes, mimeType, durationMs, final }),
    );
    return NextResponse.json({
      success: true,
      segmentsCount: draft.segments.length,
      totalDurationMs: draft.segments.reduce((sum, s) => sum + (s.durationMs || 0), 0),
    });
  } catch (error) {
    if (error instanceof AudioRecordingError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: audioRecordingErrorStatus(error) },
      );
    }
    console.error("[audio draft segment PUT]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Could not save segment" }, { status: 500 });
  }
}
