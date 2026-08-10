import { NextResponse } from "next/server";
import { getPaymentsForUser, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

/**
 * GET /api/settings/payments/history
 * The current user's own previously successful payments only — never
 * another user's (scoped server-side via repo context, same as
 * /api/settings/payments/status).
 */
export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  try {
    const payments = await runWithRepoContext(user, () => getPaymentsForUser(20));
    return NextResponse.json({ success: true, payments });
  } catch (error) {
    console.error("[settings/payments/history]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Failed to load payment history", payments: [] }, { status: 500 });
  }
}
