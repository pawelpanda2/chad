import { NextResponse } from "next/server";
import { getPaymentsForUser, getTestPaymentsForUser, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

/**
 * GET /api/settings/payments/history
 * Real completed payments for the current session user only.
 * Test records are a separate array and must never mix into `payments`.
 */
export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  try {
    const { payments, testPayments } = await runWithRepoContext(user, async () => ({
      payments: await getPaymentsForUser(20),
      testPayments: await getTestPaymentsForUser(20),
    }));
    return NextResponse.json({ success: true, payments, testPayments });
  } catch (error) {
    console.error("[settings/payments/history]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: "Failed to load payment history", payments: [], testPayments: [] },
      { status: 500 },
    );
  }
}
