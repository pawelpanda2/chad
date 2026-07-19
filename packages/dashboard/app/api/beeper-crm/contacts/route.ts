/**
 * GET /api/beeper-crm/contacts?tag=business|romantic|friends
 *
 * Lists Beeper CRM contacts. All data access goes through `dba` —
 * this route never touches MongoDB directly.
 */
import { NextResponse } from "next/server";
import { listBeeperContacts, runWithRepoContext, type BeeperTag } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

const ALLOWED_TAGS = new Set(["business", "romantic", "friends"]);

export async function GET(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const tagParam = new URL(request.url).searchParams.get("tag");
  if (tagParam && !ALLOWED_TAGS.has(tagParam)) {
    return NextResponse.json({ ok: false, error: `Invalid tag: ${tagParam}` }, { status: 400 });
  }

  return runWithRepoContext(user, async () => {
    try {
      const contacts = await listBeeperContacts(
        tagParam ? { tag: tagParam as BeeperTag } : undefined
      );
      return NextResponse.json(contacts);
    } catch (error) {
      console.error("Error listing beeper contacts:", error);
      return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
    }
  });
}
