import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/leads - Get all leads
export async function GET() {
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