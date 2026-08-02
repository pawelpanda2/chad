/**
 * GET  /api/beeper-crm/groups — list all contact groups.
 * POST /api/beeper-crm/groups { name } — find-or-create a group (Story 101).
 */
import { NextResponse } from "next/server";
import { createBeeperGroup, listBeeperGroups, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  return runWithRepoContext(user, async () => {
    try {
      const groups = await listBeeperGroups();
      return NextResponse.json(groups);
    } catch (error) {
      console.error("Error listing beeper groups:", error);
      return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
    }
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name : "";
  if (!name.trim()) {
    return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
  }

  return runWithRepoContext(user, async () => {
    try {
      const group = await createBeeperGroup(name);
      return NextResponse.json(group);
    } catch (error) {
      console.error("Error creating beeper group:", error);
      return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
    }
  });
}
