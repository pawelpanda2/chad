/**
 * GET  /api/leads/archives?leadUuid=… — list archives for one lead (metadata only).
 * POST /api/leads/archives — multipart: field `leadUuid` + one or more `archives` files.
 * Session required; owner/username from session only. Lead ownership checked
 * against getAllLeadsWithContacts() before write.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  getAllLeadsWithContacts,
  LEAD_ARCHIVE_MAX_FILES_PER_REQUEST,
  LeadArchiveError,
  listLeadArchives,
  runWithRepoContext,
  saveLeadArchive,
} from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export const runtime = "nodejs";

function statusForError(error: LeadArchiveError): number {
  switch (error.code) {
    case "NOT_CONFIGURED":
      return 503;
    case "TOO_LARGE":
      return 413;
    case "NOT_FOUND":
      return 404;
    case "INVALID_TYPE":
    case "INVALID_LEAD":
    case "INVALID_LEAD_LOCA":
    case "INVALID_ID":
    case "INVALID_USERNAME":
    case "EMPTY":
      return 400;
    default:
      return 500;
  }
}

function publicArchive(a: {
  id: string;
  fileName: string;
  originalFileName: string;
  fileType: string;
  sizeBytes: number;
  createdAt: string;
  leadNameAtExport?: string;
}) {
  return {
    id: a.id,
    fileName: a.fileName,
    originalFileName: a.originalFileName,
    fileType: a.fileType,
    sizeBytes: a.sizeBytes,
    createdAt: a.createdAt,
    leadNameAtExport: a.leadNameAtExport,
  };
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const leadUuid = new URL(request.url).searchParams.get("leadUuid") || "";
  if (!leadUuid) {
    return NextResponse.json({ success: false, error: "leadUuid is required" }, { status: 400 });
  }

  try {
    const archives = await runWithRepoContext(user, async () => {
      const leads = await getAllLeadsWithContacts();
      const lead = leads.find((l) => l.leadUuid === leadUuid);
      if (!lead) throw new LeadArchiveError("NOT_FOUND", "Lead not found");
      return listLeadArchives(lead.leadUuid, { leadLoca: lead.loca });
    });
    return NextResponse.json({ success: true, archives: archives.map(publicArchive) });
  } catch (error) {
    if (error instanceof LeadArchiveError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: statusForError(error) },
      );
    }
    console.error("[leads archives GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Could not list archives" }, { status: 500 });
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

  const leadUuid = form.get("leadUuid")?.toString() ?? "";
  if (!leadUuid) {
    return NextResponse.json({ success: false, error: "leadUuid is required" }, { status: 400 });
  }

  const files = form.getAll("archives").filter((f): f is File => typeof f !== "string");
  if (files.length === 0) {
    return NextResponse.json({ success: false, error: "No archives provided" }, { status: 400 });
  }
  if (files.length > LEAD_ARCHIVE_MAX_FILES_PER_REQUEST) {
    return NextResponse.json(
      {
        success: false,
        error: `Too many files in one request (max ${LEAD_ARCHIVE_MAX_FILES_PER_REQUEST})`,
      },
      { status: 400 },
    );
  }

  try {
    const results = await runWithRepoContext(user, async () => {
      const leads = await getAllLeadsWithContacts();
      const lead = leads.find((l) => l.leadUuid === leadUuid);
      if (!lead) {
        throw new LeadArchiveError("NOT_FOUND", "Lead not found");
      }

      const saved = [];
      for (const file of files) {
        const buf = new Uint8Array(await file.arrayBuffer());
        const name = file.name || "archive";
        const declaredExt = name.includes(".") ? name.split(".").pop() : undefined;
        saved.push(
          await saveLeadArchive({
            bytes: buf,
            originalFileName: name,
            leadUuid: lead.leadUuid,
            leadNameAtExport: lead.leadName,
            declaredExt,
          }),
        );
      }
      return saved;
    });

    return NextResponse.json({ success: true, archives: results.map(publicArchive) });
  } catch (error) {
    if (error instanceof LeadArchiveError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: statusForError(error) },
      );
    }
    console.error("[leads archives POST]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Could not save archive" }, { status: 500 });
  }
}
