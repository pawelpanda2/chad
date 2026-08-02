/**
 * PATCH  /api/beeper-crm/groups/[id] { name } — rename a contact group.
 * DELETE /api/beeper-crm/groups/[id] — delete a contact group (Story 101
 * follow-up). Contacts assigned to it fall back to "no group", never left
 * pointing at a dangling groupId.
 */
import { NextResponse } from "next/server";
import { deleteBeeperGroup, renameBeeperGroup, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name : "";
  if (!name.trim()) {
    return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
  }

  return runWithRepoContext(user, async () => {
    try {
      const group = await renameBeeperGroup(id, name);
      return NextResponse.json(group);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status =
        message.includes("not found") ? 404 : message.includes("already exists") ? 409 : 500;
      console.error("Error renaming beeper group:", error);
      return NextResponse.json({ ok: false, error: message }, { status });
    }
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  }

  return runWithRepoContext(user, async () => {
    try {
      await deleteBeeperGroup(id);
      return NextResponse.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes("not found") ? 404 : 500;
      console.error("Error deleting beeper group:", error);
      return NextResponse.json({ ok: false, error: message }, { status });
    }
  });
}
