import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/outings - Get all outings
export async function GET() {
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