/**
 * GET /api/beeper-crm/inbox
 * Latest message per direct (non-group) channel, sorted by recency.
 */
import { NextResponse } from "next/server";
import { getBeeperInbox } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  try {
    const inbox = await getBeeperInbox();
    return NextResponse.json(inbox);
  } catch (error) {
    console.error("Error fetching beeper inbox:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
