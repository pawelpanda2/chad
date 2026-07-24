/**
 * POST /api/msg-automation/links/auto-match
 *
 * Returns merged working-state links (does not persist — Save does).
 */

import { NextResponse } from "next/server";
import { autoMatchLeadBeeperLinks, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function POST() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  try {
    const data = await runWithRepoContext(user, () => autoMatchLeadBeeperLinks());
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[links auto-match]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
