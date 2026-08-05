/**
 * POST /api/msg-automation/links-v2/google-unlink — remove a Google Contact
 * link from a lead (REMOVE drop target in the Google tab). Never deletes
 * the Google Contact itself. Thin adapter — business logic in
 * dba/links-v2/manual-links.ts.
 */

import { NextResponse } from "next/server";
import { unlinkGoogleContactFromLead, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function POST(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const leadLoca = typeof body?.leadLoca === "string" ? body.leadLoca : "";
  const resourceName = typeof body?.resourceName === "string" ? body.resourceName : "";
  if (!leadLoca || !resourceName) {
    return NextResponse.json(
      { success: false, error: "leadLoca and resourceName are required" },
      { status: 400 }
    );
  }

  try {
    await runWithRepoContext(user, () => unlinkGoogleContactFromLead({ leadLoca, resourceName }));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[links-v2/google-unlink POST]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
