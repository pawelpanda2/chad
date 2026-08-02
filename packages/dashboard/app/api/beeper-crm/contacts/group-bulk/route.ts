/**
 * POST /api/beeper-crm/contacts/group-bulk { contactIds: string[], groupId: string } —
 * bulk-assign every listed contact to one group (Story 101, the Groups tab's "Do" button).
 */
import { NextResponse } from "next/server";
import { setBeeperContactsGroupBulk, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function POST(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const contactIds = Array.isArray(body?.contactIds) ? body.contactIds.filter((v: unknown) => typeof v === "string") : [];
  const groupId = typeof body?.groupId === "string" ? body.groupId : "";
  if (!groupId) {
    return NextResponse.json({ ok: false, error: "groupId is required" }, { status: 400 });
  }
  if (contactIds.length === 0) {
    return NextResponse.json({ ok: false, error: "contactIds must be a non-empty array" }, { status: 400 });
  }

  return runWithRepoContext(user, async () => {
    try {
      const result = await setBeeperContactsGroupBulk(contactIds, groupId);
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      console.error("Error bulk-assigning beeper contact group:", error);
      return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
    }
  });
}
