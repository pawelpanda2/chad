/**
 * GET  /api/google-contacts/photos?resourceName=people/c123 — list this
 *      user's CHAD-local photos for one Google contact (metadata only).
 * POST /api/google-contacts/photos — multipart upload, field `resourceName`
 *      + one or more `photos` file fields. Session required; owner and
 *      username always come from the session, never the request. Each file
 *      is validated and saved independently — the response reports
 *      per-file success/failure so a partial batch failure is visible, not
 *      silently swallowed.
 *
 * Not a Google Contacts / People API write — see google-contact-photos.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  CONTACT_PHOTO_MAX_FILES_PER_REQUEST,
  ContactPhotoError,
  listContactPhotosForContact,
  runWithRepoContext,
  saveContactPhoto,
} from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export const runtime = "nodejs";

function statusForError(error: ContactPhotoError): number {
  switch (error.code) {
    case "NOT_CONFIGURED":
      return 503;
    case "TOO_LARGE":
      return 413;
    case "NOT_FOUND":
      return 404;
    case "INVALID_MIME":
    case "INVALID_CONTACT_ID":
    case "INVALID_ID":
    case "INVALID_USERNAME":
    case "EMPTY":
      return 400;
    default:
      return 500;
  }
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const resourceName = new URL(request.url).searchParams.get("resourceName") || "";
  if (!resourceName) {
    return NextResponse.json({ success: false, error: "resourceName is required" }, { status: 400 });
  }

  try {
    const photos = await runWithRepoContext(user, () => listContactPhotosForContact(resourceName));
    return NextResponse.json({
      success: true,
      photos: photos.map((p) => ({
        id: p.id,
        originalFileName: p.originalFileName,
        mimeType: p.mimeType,
        sizeBytes: p.sizeBytes,
        createdAt: p.createdAt,
      })),
    });
  } catch (error) {
    if (error instanceof ContactPhotoError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: statusForError(error) });
    }
    console.error("[google-contacts photos GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Could not list photos" }, { status: 500 });
  }
}

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

  const resourceName = form.get("resourceName")?.toString() ?? "";
  if (!resourceName) {
    return NextResponse.json({ success: false, error: "resourceName is required" }, { status: 400 });
  }

  const files = form.getAll("photos").filter((f): f is File => typeof f !== "string");
  if (files.length === 0) {
    return NextResponse.json({ success: false, error: "No photos provided" }, { status: 400 });
  }
  if (files.length > CONTACT_PHOTO_MAX_FILES_PER_REQUEST) {
    return NextResponse.json(
      { success: false, error: `Too many files in one request (max ${CONTACT_PHOTO_MAX_FILES_PER_REQUEST})` },
      { status: 400 },
    );
  }

  const results = await runWithRepoContext(user, async () => {
    const out: Array<
      | { success: true; id: string; originalFileName: string; sizeBytes: number }
      | { success: false; originalFileName: string; error: string; code: string }
    > = [];
    for (const file of files) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const saved = await saveContactPhoto({
          bytes,
          mimeType: file.type || "",
          originalFileName: file.name || "photo",
          contactResourceName: resourceName,
        });
        out.push({ success: true, id: saved.id, originalFileName: saved.originalFileName, sizeBytes: saved.sizeBytes });
      } catch (error) {
        if (error instanceof ContactPhotoError) {
          out.push({ success: false, originalFileName: file.name || "photo", error: error.message, code: error.code });
        } else {
          console.error("[google-contacts photos POST]", error instanceof Error ? error.message : error);
          out.push({ success: false, originalFileName: file.name || "photo", error: "Could not save photo", code: "WRITE_FAILED" });
        }
      }
    }
    return out;
  });

  const anySuccess = results.some((r) => r.success);
  return NextResponse.json({ success: anySuccess, results }, { status: anySuccess ? 200 : 400 });
}
