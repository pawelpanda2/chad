/**
 * GET    /api/google-contacts/photos/[id] — stream one photo's bytes.
 *        Session required; owner resolved from session; id-based only (no
 *        path ever accepted from or returned to the client).
 * DELETE /api/google-contacts/photos/[id] — delete one photo (file +
 *        metadata). Never touches the Google contact / People API.
 */
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { ContactPhotoError, deleteContactPhoto, getContactPhotoReadInfo, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export const runtime = "nodejs";

function statusForError(error: ContactPhotoError): number {
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

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const info = await runWithRepoContext(user, () => getContactPhotoReadInfo(id));
    if (!info) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const stream = createReadStream(info.filePath);
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": info.mimeType,
        "Content-Length": String(info.sizeBytes),
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    if (error instanceof ContactPhotoError) {
      return NextResponse.json({ success: false, error: error.message }, { status: statusForError(error) });
    }
    console.error("[google-contacts photo GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Could not read photo" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  try {
    const { id } = await params;
    await runWithRepoContext(user, () => deleteContactPhoto(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ContactPhotoError) {
      return NextResponse.json({ success: false, error: error.message }, { status: statusForError(error) });
    }
    console.error("[google-contacts photo DELETE]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Could not delete photo" }, { status: 500 });
  }
}
