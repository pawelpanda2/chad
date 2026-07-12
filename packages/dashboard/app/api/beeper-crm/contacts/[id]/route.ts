/**
 * GET /api/beeper-crm/contacts/[id]
 * Full contact detail: profile, channels, merged message timeline, timeline events.
 */
import { NextResponse } from "next/server";
import { getBeeperContact } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const detail = await getBeeperContact(id);
    if (!detail) {
      return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (error) {
    console.error(`Error fetching beeper contact ${id}:`, error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
