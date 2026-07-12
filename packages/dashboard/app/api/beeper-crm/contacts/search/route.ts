/**
 * GET /api/beeper-crm/contacts/search?q=...&exclude=<contactId>
 * Used by the merge picker to find a contact to merge into another.
 */
import { NextResponse } from "next/server";
import { searchBeeperContacts } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function GET(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const exclude = url.searchParams.get("exclude") ?? undefined;

  try {
    const results = await searchBeeperContacts(q, exclude);
    return NextResponse.json(results);
  } catch (error) {
    console.error("Error searching beeper contacts:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
