/**
 * API Endpoint: Lead Details
 *
 * GET /api/leads-dashboard/details?leadName=...&leadLoca=...
 *
 * Returns detailed information about a specific lead including contacts and msg workouts.
 *
 * All business logic is encapsulated in chad-dba public functions.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/session";

/**
 * GET /api/leads-dashboard/details?leadName=...&leadLoca=...
 * Returns detailed information about a specific lead.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const leadName = searchParams.get("leadName");
  const leadLoca = searchParams.get("leadLoca");

  if (!leadName || !leadLoca) {
    return NextResponse.json(
      { error: "Missing leadName or leadLoca parameter" },
      { status: 400 }
    );
  }

  try {
    const { getLeadDetailsWithWorkouts, runWithRepoContext } = await import("dba");
    const details = await runWithRepoContext(user, () =>
      getLeadDetailsWithWorkouts(leadName, leadLoca)
    );
    return NextResponse.json(details);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[/api/leads-dashboard/details] ERROR: ${errorMsg}`);
    return NextResponse.json(
      {
        ok: false,
        error: errorMsg,
      },
      { status: 500 }
    );
  }
}
