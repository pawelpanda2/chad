/**
 * POST /api/forms/audio-recording
 *
 * Multipart field `file` (audio blob). Session required. Destination and
 * filename are server-only (`CHAD_AUDIO_RECORDINGS_DIR`).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  saveAudioRecording,
  AudioRecordingError,
  AUDIO_RECORDING_MAX_BYTES,
} from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
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
    return NextResponse.json({ success: false, error: "Recording is empty" }, { status: 400 });
  }
  if (blob.size > AUDIO_RECORDING_MAX_BYTES) {
    return NextResponse.json({ success: false, error: "Recording exceeds size limit" }, { status: 413 });
  }

  // Client-supplied name/path are ignored — only mime + bytes.
  const mimeType = (blob.type || form.get("mimeType")?.toString() || "").trim();
  const buffer = new Uint8Array(await blob.arrayBuffer());

  try {
    const result = await saveAudioRecording({ bytes: buffer, mimeType });
    return NextResponse.json({
      success: true,
      fileName: result.fileName,
      sizeBytes: result.sizeBytes,
    });
  } catch (error) {
    if (error instanceof AudioRecordingError) {
      const status =
        error.code === "NOT_CONFIGURED"
          ? 503
          : error.code === "TOO_LARGE"
            ? 413
            : error.code === "WRITE_FAILED"
              ? 500
              : 400;
      console.error("[audio-recording POST]", error.code);
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status },
      );
    }
    console.error("[audio-recording POST]", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ success: false, error: "Could not save recording" }, { status: 500 });
  }
}
