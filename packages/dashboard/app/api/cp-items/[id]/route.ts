/**
 * GET /api/cp-items/[id] — resolves a stable CpItem.id (as used by the
 * shared Preview's CP-link syntax, `lib/preview/cp-link.ts`) to its current
 * `repoGuid`/`loca`, for `components/shared/cp-link-text.tsx`'s click-time
 * navigation into Folders.
 *
 * Thin adapter: parses/validates `id`, delegates to `dba`'s
 * `resolveCpItemByIdForUser` (which already scopes the lookup to exactly
 * the repos this session may browse), maps the result to a response. No
 * business logic here, no direct Content Provider/DB access.
 */
import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/session";
import { resolveCpItemByIdForUser } from "dba";

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }

  const target = await resolveCpItemByIdForUser(user, id);
  if (!target) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({
    repoGuid: target.repoGuid,
    loca: target.loca,
    name: target.name,
    type: target.type,
  });
}
