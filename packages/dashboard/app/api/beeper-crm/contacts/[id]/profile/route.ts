/**
 * PATCH /api/beeper-crm/contacts/[id]/profile
 * Updates editable profile fields (displayName, bio, notes, ratings, ...).
 */
import { NextResponse } from "next/server";
import { updateBeeperContactProfile } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  try {
    const result = await updateBeeperContactProfile(id, body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error(`Error updating beeper contact profile ${id}:`, error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
