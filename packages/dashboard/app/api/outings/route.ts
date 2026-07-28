import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromCookies } from "@/lib/session";

// 2026-07-28 P0 fix: this legacy "DataLib" store (Prisma/SQLite, a separate
// personal-hobbyist tool predating CHAD's per-user PostgreSQL model — see
// ai-docs/deploy/shared-qnap-services.md) had NO authentication check at
// all and is not repo-isolated (one global table, not per-user). Disabled
// for real users rather than migrated — gated admin-only until a decision
// is made on whether to keep or remove it (tests/release-audit-report.md).
async function requireAdminForDataLib(): Promise<NextResponse | null> {
  const user = await getCurrentUserFromCookies();
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: "NOT_AUTHORIZED" }, { status: 403 });
  }
  return null;
}

// GET /api/outings - Get all outings
export async function GET() {
  const denied = await requireAdminForDataLib();
  if (denied) return denied;
  try {
    const outings = await prisma.outing.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { leads: true },
        },
      },
    });
    return NextResponse.json(outings);
  } catch (error) {
    console.error("Error fetching outings:", error);
    return NextResponse.json({ error: "Failed to fetch outings" }, { status: 500 });
  }
}

// POST /api/outings - Create a new outing
export async function POST(request: NextRequest) {
  const denied = await requireAdminForDataLib();
  if (denied) return denied;
  try {
    const body = await request.json();
    const { title, date, type, location, description, moodBefore, moodAfter, notes } = body;

    if (!title || !date || !type || !description) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const outing = await prisma.outing.create({
      data: {
        title,
        date,
        type,
        location: location || null,
        description,
        moodBefore: moodBefore || null,
        moodAfter: moodAfter || null,
        notes: notes || null,
      },
    });

    return NextResponse.json(outing, { status: 201 });
  } catch (error) {
    console.error("Error creating outing:", error);
    return NextResponse.json({ error: "Failed to create outing" }, { status: 500 });
  }
}