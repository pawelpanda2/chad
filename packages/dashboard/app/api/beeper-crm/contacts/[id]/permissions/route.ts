/**
 * PATCH /api/beeper-crm/contacts/[id]/permissions
 * Story 86 — update Include / Exclude sync flags.
 */
import { NextResponse } from "next/server";
import { updateBeeperContactSyncPermissions, runWithRepoContext } from "dba";
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
  const body = (await request.json().catch(() => ({}))) as {
    include?: unknown;
    exclude?: unknown;
  };

  if (typeof body.include !== "boolean" || typeof body.exclude !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "include and exclude must be booleans" },
      { status: 400 }
    );
  }

  return runWithRepoContext(user, async () => {
    try {
      const result = await updateBeeperContactSyncPermissions(id, {
        include: body.include as boolean,
        exclude: body.exclude as boolean,
      });
      return NextResponse.json(result);
    } catch (error) {
      console.error(`Error updating beeper permissions ${id}:`, error);
      return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
    }
  });
}
