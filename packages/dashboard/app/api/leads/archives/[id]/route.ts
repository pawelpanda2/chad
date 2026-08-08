/**
 * GET    /api/leads/archives/[id] — download one archive (stream bytes).
 * DELETE /api/leads/archives/[id] — delete one archive (file + Postgres metadata).
 * Session required; owner/repo from session; id-based only (no path from client).
 */
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import {
  deleteLeadArchive,
  getLeadArchiveReadInfo,
  LeadArchiveError,
  runWithRepoContext,
} from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export const runtime = "nodejs";

function statusForError(error: LeadArchiveError): number {
  switch (error.code) {
    case "NOT_FOUND":
      return 404;
    case "INVALID_ID":
      return 400;
    case "NOT_CONFIGURED":
      return 503;
    default:
      return 500;
  }
}

/** ASCII-safe filename for Content-Disposition (RFC 2183-ish). */
function dispositionFileName(name: string): string {
  const base = name.replace(/[\r\n"]/g, "_").trim() || "archive.zip";
  return base.length > 180 ? base.slice(0, 180) : base;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const info = await runWithRepoContext(user, () => getLeadArchiveReadInfo(id));
    if (!info) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const stream = createReadStream(info.filePath);
    const downloadName = dispositionFileName(info.fileName || info.originalFileName);
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": info.mimeType,
        "Content-Length": String(info.sizeBytes),
        "Content-Disposition": `attachment; filename="${downloadName}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    if (error instanceof LeadArchiveError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: statusForError(error) },
      );
    }
    console.error("[leads archives GET id]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Could not download archive" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  try {
    const { id } = await params;
    await runWithRepoContext(user, () => deleteLeadArchive(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof LeadArchiveError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: statusForError(error) },
      );
    }
    console.error("[leads archives DELETE id]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Could not delete archive" }, { status: 500 });
  }
}
