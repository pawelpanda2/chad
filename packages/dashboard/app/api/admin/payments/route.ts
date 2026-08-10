import { NextResponse } from "next/server";
import { getPaymentsForAdmin } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

/**
 * GET /api/admin/payments
 * Admin → Payments — read-only transaction list, all users. Same
 * admin-only gate as /api/admin/users. Never returns card data (never
 * stored); test/live comes from the stored `livemode`-derived stripeMode,
 * not from key naming.
 */
export async function GET() {
  const currentUser = await getCurrentUserFromCookies();
  if (!currentUser || !currentUser.isAdmin) {
    return NextResponse.json({ error: "NOT_AUTHORIZED" }, { status: 403 });
  }

  try {
    const payments = await getPaymentsForAdmin(200);
    return NextResponse.json({ success: true, payments });
  } catch (error) {
    console.error("[admin/payments]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Failed to load payments", payments: [] }, { status: 500 });
  }
}
