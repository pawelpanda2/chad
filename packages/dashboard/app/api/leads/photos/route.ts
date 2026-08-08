/**
 * GET  /api/leads/photos?loca=… — list photos for one lead.
 * POST /api/leads/photos — multipart: `loca` + `photos` files.
 * Session required; leadUuid/name resolved server-side from owned leads.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  getAllLeadsWithContacts,
  LEAD_PHOTO_MAX_FILES_PER_REQUEST,
  LeadPhotoError,
  listLeadPhotos,
  runWithRepoContext,
  saveLeadPhoto,
} from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export const runtime = "nodejs";

function statusForError(error: LeadPhotoError): number {
  switch (error.code) {
    case "NOT_CONFIGURED":
      return 503;
    case "TOO_LARGE":
      return 413;
    case "NOT_FOUND":
      return 404;
    case "INVALID_MIME":
    case "INVALID_LEAD_LOCA":
    case "INVALID_LEAD":
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

  const loca = new URL(request.url).searchParams.get("loca") || "";
  if (!loca) {
    return NextResponse.json({ success: false, error: "loca is required" }, { status: 400 });
  }

  try {
    const photos = await runWithRepoContext(user, async () => {
      const leads = await getAllLeadsWithContacts();
      const lead = leads.find((l) => l.loca === loca);
      if (!lead) throw new LeadPhotoError("NOT_FOUND", "Lead not found");
      return listLeadPhotos(loca, { leadUuid: lead.leadUuid });
    });
    return NextResponse.json({
      success: true,
      photos: photos.map((p) => ({
        id: p.id,
        originalFileName: p.originalFileName,
        fileName: p.fileName,
        mimeType: p.mimeType,
        sizeBytes: p.sizeBytes,
        createdAt: p.createdAt,
      })),
    });
  } catch (error) {
    if (error instanceof LeadPhotoError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: statusForError(error) },
      );
    }
    console.error("[leads photos GET]", error instanceof Error ? error.message : error);
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

  const loca = form.get("loca")?.toString() ?? "";
  if (!loca) {
    return NextResponse.json({ success: false, error: "loca is required" }, { status: 400 });
  }

  const files = form.getAll("photos").filter((f): f is File => typeof f !== "string");
  if (files.length === 0) {
    return NextResponse.json({ success: false, error: "No photos provided" }, { status: 400 });
  }
  if (files.length > LEAD_PHOTO_MAX_FILES_PER_REQUEST) {
    return NextResponse.json(
      {
        success: false,
        error: `Too many files in one request (max ${LEAD_PHOTO_MAX_FILES_PER_REQUEST})`,
      },
      { status: 400 },
    );
  }

  const results = await runWithRepoContext(user, async () => {
    const leads = await getAllLeadsWithContacts();
    const lead = leads.find((l) => l.loca === loca);
    if (!lead) {
      return [
        {
          success: false as const,
          originalFileName: "",
          error: "Lead not found",
          code: "NOT_FOUND",
        },
      ];
    }

    const out: Array<
      | { success: true; id: string; originalFileName: string; sizeBytes: number; fileName?: string }
      | { success: false; originalFileName: string; error: string; code: string }
    > = [];
    for (const file of files) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const saved = await saveLeadPhoto({
          bytes,
          mimeType: file.type || "",
          originalFileName: file.name || "photo",
          leadLoca: loca,
          leadUuid: lead.leadUuid,
          leadName: lead.leadName,
        });
        out.push({
          success: true,
          id: saved.id,
          originalFileName: saved.originalFileName,
          sizeBytes: saved.sizeBytes,
          fileName: saved.fileName,
        });
      } catch (error) {
        if (error instanceof LeadPhotoError) {
          out.push({
            success: false,
            originalFileName: file.name || "photo",
            error: error.message,
            code: error.code,
          });
        } else {
          console.error("[leads photos POST]", error instanceof Error ? error.message : error);
          out.push({
            success: false,
            originalFileName: file.name || "photo",
            error: "Could not save photo",
            code: "WRITE_FAILED",
          });
        }
      }
    }
    return out;
  });

  const anySuccess = results.some((r) => r.success);
  return NextResponse.json({ success: anySuccess, results }, { status: anySuccess ? 200 : 400 });
}
