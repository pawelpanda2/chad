import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import {
  AudioRecordingError,
  getAudioRecordingReadInfo,
  runWithRepoContext,
} from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export const runtime = "nodejs";

function contentDispositionFileName(displayName: string, mimeType: string): string {
  const ext = mimeType.includes("ogg")
    ? "ogg"
    : mimeType.includes("mp4")
      ? "m4a"
      : mimeType.includes("wav")
        ? "wav"
        : "webm";
  return `${displayName.replace(/[^a-zA-Z0-9._-]+/g, "_")}.${ext}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const info = await runWithRepoContext(user, () => getAudioRecordingReadInfo(id));
    if (!info) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const fileStat = await stat(info.filePath);
    const total = fileStat.size;
    const range = request.headers.get("range");

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (!match) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${total}` },
        });
      }

      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : total - 1;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end >= total) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${total}` },
        });
      }

      const stream = createReadStream(info.filePath, { start, end });
      return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Content-Type": info.mimeType,
          "Content-Disposition": `inline; filename="${contentDispositionFileName(info.displayName, info.mimeType)}"`,
          "Cache-Control": "private, max-age=0, must-revalidate",
        },
      });
    }

    const stream = createReadStream(info.filePath);
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Length": String(total),
        "Content-Type": info.mimeType,
        "Content-Disposition": `inline; filename="${contentDispositionFileName(info.displayName, info.mimeType)}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    if (error instanceof AudioRecordingError && error.code === "INVALID_ID") {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("[recordings audio GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Could not read recording" }, { status: 500 });
  }
}
