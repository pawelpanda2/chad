/**
 * GET  /api/beeper-crm/contacts/[id]/events — list timeline events
 * POST /api/beeper-crm/contacts/[id]/events — add one
 * Body POST: { type, timestamp, title, description }
 */
import { NextResponse } from "next/server";
import { listBeeperContactEvents, addBeeperContactEvent } from "dba";
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
    const events = await listBeeperContactEvents(id);
    return NextResponse.json(events);
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  try {
    const event = await addBeeperContactEvent(id, body);
    return NextResponse.json({ ok: true, ...event }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
