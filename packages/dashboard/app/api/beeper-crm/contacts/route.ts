/**
 * GET /api/beeper-crm/contacts?tag=business|romantic|friends
 *     &view=permissions&permissionFilter=all|include|exclude|permission
 *     &groupId=<contact group id>|__none__ (Story 101 — filters to one
 *     contact group; `__none__` filters to contacts with no group at all,
 *     since query strings can't carry a literal `null`)
 *
 * Lists Beeper CRM contacts. All data access goes through `dba`.
 */
import { NextResponse } from "next/server";
import {
  listBeeperContacts,
  runWithRepoContext,
  type BeeperPermissionFilter,
  type BeeperTag,
} from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

const ALLOWED_TAGS = new Set(["business", "romantic", "friends"]);
const ALLOWED_PERM_FILTERS = new Set(["all", "include", "exclude", "permission"]);

export async function GET(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const tagParam = params.get("tag");
  const viewParam = params.get("view");
  const permFilter = params.get("permissionFilter");
  const groupIdParam = params.get("groupId") || undefined;

  if (tagParam && !ALLOWED_TAGS.has(tagParam)) {
    return NextResponse.json({ ok: false, error: `Invalid tag: ${tagParam}` }, { status: 400 });
  }
  if (viewParam && viewParam !== "permissions") {
    return NextResponse.json({ ok: false, error: `Invalid view: ${viewParam}` }, { status: 400 });
  }
  if (permFilter && !ALLOWED_PERM_FILTERS.has(permFilter)) {
    return NextResponse.json(
      { ok: false, error: `Invalid permissionFilter: ${permFilter}` },
      { status: 400 }
    );
  }

  return runWithRepoContext(user, async () => {
    try {
      const contacts = await listBeeperContacts({
        ...(tagParam ? { tag: tagParam as BeeperTag } : {}),
        ...(viewParam === "permissions"
          ? {
              view: "permissions" as const,
              permissionFilter: (permFilter as BeeperPermissionFilter) || "all",
            }
          : {}),
        ...(groupIdParam === "__none__" ? { groupId: null } : groupIdParam ? { groupId: groupIdParam } : {}),
      });
      return NextResponse.json(contacts);
    } catch (error) {
      console.error("Error listing beeper contacts:", error);
      return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
    }
  });
}
