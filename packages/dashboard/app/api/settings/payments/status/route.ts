import { NextResponse } from "next/server";
import { getPaymentStatus, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

/**
 * GET /api/settings/payments/status?sessionId=cs_...
 * Reads the persisted (webhook-confirmed) status for the CURRENT user's own
 * Checkout Session only — cross-user isolation is enforced by scoping the
 * lookup to the session's repo_guid inside dba.
 */
export async function GET(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ success: false, error: "sessionId is required" }, { status: 400 });
  }

  try {
    const status = await runWithRepoContext(user, () => getPaymentStatus(sessionId));
    return NextResponse.json({ success: true, status });
  } catch (error) {
    console.error("[settings/payments/status]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Failed to load payment status" }, { status: 500 });
  }
}
