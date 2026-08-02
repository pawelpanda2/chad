/**
 * PATCH /api/beeper-crm/contacts/[id]/group { groupId: string | null } —
 * single-contact group assign/clear (Story 101).
 */
import { NextResponse } from "next/server";
import { setBeeperContactGroup, runWithRepoContext } from "dba";
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
  const body = await request.json().catch(() => null);
  const groupId = body?.groupId === null ? null : typeof body?.groupId === "string" ? body.groupId : undefined;
  if (groupId === undefined) {
    return NextResponse.json({ ok: false, error: "groupId (string or null) is required" }, { status: 400 });
  }

  return runWithRepoContext(user, async () => {
    try {
      await setBeeperContactGroup(id, groupId);
      return NextResponse.json({ ok: true, groupId });
    } catch (error) {
      console.error(`Error setting group for contact ${id}:`, error);
      return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
    }
  });
}
