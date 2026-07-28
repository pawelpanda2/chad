import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromCookies } from "@/lib/session";

// 2026-07-28 P0 fix — see app/api/outings/route.ts's identical comment:
// this legacy "DataLib" Prisma/SQLite store had no auth check and is not
// repo-isolated. Gated admin-only rather than migrated/removed outright.
// NOTE: unrelated to the real, per-user, dba-backed Leads feature (Google
// Sheets-synced) despite the same "/api/leads" URL prefix — that one lives
// under app/api/forms/ and app/api/leads/message-creator/ (dba's leads.ts).
async function requireAdminForDataLib(): Promise<NextResponse | null> {
  const user = await getCurrentUserFromCookies();
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: "NOT_AUTHORIZED" }, { status: 403 });
  }
  return null;
}

// GET /api/leads - Get all leads
export async function GET() {
  const denied = await requireAdminForDataLib();
  if (denied) return denied;
  try {
    const leads = await prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        outing: {
          select: {
            id: true,
            title: true,
            date: true,
            type: true,
          },
        },
      },
    });
    return NextResponse.json(leads);
  } catch (error) {
    console.error("Error fetching leads:", error);
    return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 });
  }
}

// POST /api/leads - Create a new lead
export async function POST(request: NextRequest) {
  const denied = await requireAdminForDataLib();
  if (denied) return denied;
  try {
    const body = await request.json();
    const {
      name,
      age,
      source,
      phone,
      instagram,
      facebook,
      whatsappName,
      shortDescription,
      status,
      notes,
      outingId,
    } = body;

    if (!name || !source || !status) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const lead = await prisma.lead.create({
      data: {
        name,
        age: age ? parseInt(age) : null,
        source,
        phone: phone || null,
        instagram: instagram || null,
        facebook: facebook || null,
        whatsappName: whatsappName || null,
        shortDescription: shortDescription || null,
        status,
        notes: notes || null,
        outingId: outingId ? parseInt(outingId) : null,
      },
      include: {
        outing: true,
      },
    });

    return NextResponse.json(lead, { status: 201 });
  } catch (error) {
    console.error("Error creating lead:", error);
    return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
  }
}