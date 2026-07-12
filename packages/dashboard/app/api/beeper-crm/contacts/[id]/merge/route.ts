/**
 * POST /api/beeper-crm/contacts/[id]/merge
 * Body: { mergeWithId: string }
 *
 * primary = params.id (kept, becomes canonical), secondary = mergeWithId
 * (absorbed, gets mergedInto). See dba's mergeBeeperContacts for the full
 * identities/channels/messages/timeline_events reassignment logic.
 */
import { NextResponse } from "next/server";
import { mergeBeeperContacts } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const { id } = await params;
  const { mergeWithId } = await request.json().catch(() => ({}));
  if (!mergeWithId) {
    return NextResponse.json({ ok: false, error: "mergeWithId is required" }, { status: 400 });
  }

  try {
    const result = await mergeBeeperContacts(id, mergeWithId);
    return NextResponse.json({ ok: true, primaryId: id, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
