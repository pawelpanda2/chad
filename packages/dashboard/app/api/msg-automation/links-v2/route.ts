/**
 * GET /api/msg-automation/links-v2 — Links V2 (Story 104) page data: every
 * lead + its already-stored `links` item. Never triggers matching itself —
 * only `POST .../synchronize` does that.
 *
 * Thin adapter — business logic in dba/links-v2/page-data.ts.
 */

import { NextResponse } from "next/server";
import { getLinksV2PageLeads, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  try {
    const leads = await runWithRepoContext(user, () => getLinksV2PageLeads());
    return NextResponse.json({ success: true, leads });
  } catch (error) {
    console.error("[links-v2 GET]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
