/**
 * POST/DELETE /api/beeper-crm/contacts/[id]/tags
 * Body: { tag: "business" | "romantic" | "friends" | "spam" }
 */
import { NextResponse } from "next/server";
import { addBeeperContactTag, removeBeeperContactTag, type BeeperTag } from "dba";
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
  const { tag } = await request.json().catch(() => ({}));

  try {
    await addBeeperContactTag(id, tag as BeeperTag);
    return NextResponse.json({ ok: true, action: "added", tag });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const { id } = await params;
  const { tag } = await request.json().catch(() => ({}));

  try {
    await removeBeeperContactTag(id, tag as BeeperTag);
    return NextResponse.json({ ok: true, action: "removed", tag });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
