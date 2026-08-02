/**
 * GET /api/beeper-crm/groups/default — the current default group, or null.
 * PUT /api/beeper-crm/groups/default { groupId: string | null } — sets it
 * (null clears it). Story 101 follow-up.
 */
import { NextResponse } from "next/server";
import { getDefaultBeeperGroup, setDefaultBeeperGroup, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  return runWithRepoContext(user, async () => {
    try {
      const group = await getDefaultBeeperGroup();
      return NextResponse.json(group);
    } catch (error) {
      console.error("Error reading default beeper group:", error);
      return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
    }
  });
}

export async function PUT(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const groupId = body?.groupId === null ? null : typeof body?.groupId === "string" ? body.groupId : undefined;
  if (groupId === undefined) {
    return NextResponse.json({ ok: false, error: "groupId (string or null) is required" }, { status: 400 });
  }

  return runWithRepoContext(user, async () => {
    try {
      await setDefaultBeeperGroup(groupId);
      return NextResponse.json({ ok: true, groupId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes("not found") ? 404 : 500;
      console.error("Error setting default beeper group:", error);
      return NextResponse.json({ ok: false, error: message }, { status });
    }
  });
}
