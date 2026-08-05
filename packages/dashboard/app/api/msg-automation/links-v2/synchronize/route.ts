/**
 * POST /api/msg-automation/links-v2/synchronize — runs one Links V2 sync
 * pass (Story 104) for the current user only and returns the report. The
 * daily scheduler (`dba`'s `links-v2/scheduler.ts`) runs the same
 * underlying `syncLinksV2ForCurrentRepo()` looped over every user.
 *
 * Thin adapter — business logic in dba/links-v2/sync.ts.
 */

import { NextResponse } from "next/server";
import { syncLinksV2ForCurrentRepo, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function POST() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  try {
    const report = await runWithRepoContext(user, () => syncLinksV2ForCurrentRepo());
    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error("[links-v2/synchronize POST]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
