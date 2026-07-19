/**
 * DELETE /api/beeper-crm/contacts/[id]/events/[eventId]
 */
import { NextResponse } from "next/server";
import { deleteBeeperContactEvent, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

interface RouteParams {
  params: Promise<{ id: string; eventId: string }>;
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const { id, eventId } = await params;
  return runWithRepoContext(user, async () => {
    try {
      await deleteBeeperContactEvent(id, eventId);
      return NextResponse.json({ ok: true });
    } catch (error) {
      return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
    }
  });
}
