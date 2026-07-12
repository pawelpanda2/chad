/**
 * GET /api/beeper-crm/stats
 * Aggregate counts for the Beeper CRM overview page.
 */
import { NextResponse } from "next/server";
import { getBeeperDashboardStats } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  try {
    const stats = await getBeeperDashboardStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error fetching beeper stats:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
