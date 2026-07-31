/**
 * GET /api/forms/audio-recording/drafts/[draftId]/segments/[sessionId]/audio
 *
 * Streams one draft segment for the "listen to what is saved so far" part
 * of the Continue flow. Same controlled-streaming approach as
 * /api/views/recordings/[id]/audio — the client never sees a host path.
 */

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import {
  getAudioRecordingDraftSegmentReadInfo,
  AudioRecordingError,
  runWithRepoContext,
} from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ draftId: string; sessionId: string }> },
) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }
  try {
    const { draftId, sessionId } = await params;
    const info = await runWithRepoContext(user, () =>
      getAudioRecordingDraftSegmentReadInfo(draftId, sessionId),
    );
    if (!info) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const fileStat = await stat(info.filePath);
    const stream = createReadStream(info.filePath);
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        "Content-Length": String(fileStat.size),
        "Content-Type": info.mimeType,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    if (error instanceof AudioRecordingError && error.code === "INVALID_ID") {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("[audio draft segment GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Could not read segment" }, { status: 500 });
  }
}
