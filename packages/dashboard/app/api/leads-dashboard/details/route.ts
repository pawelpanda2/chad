/**
 * API Endpoint: Lead Details
 *
 * GET /api/leads-dashboard/details?leadName=...&leadLoca=...
 *
 * Returns detailed information about a specific lead including contacts and msg workouts.
 *
 * DELETE /api/leads-dashboard/details?leadLoca=...
 *
 * Permanently deletes the lead and its own children (contacts, msg
 * workout folder and everything under it) — see `dba`'s `deleteLead`.
 * Requires the Mongo or Postgres primary backend; throws (never a
 * pretend success) when only the Content Provider's no-op Delete stub
 * is active.
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

/**
 * DELETE /api/leads-dashboard/details?leadLoca=...
 * Permanently deletes a lead and its own children.
 */
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const leadLoca = searchParams.get("leadLoca");

  if (!leadLoca) {
    return NextResponse.json({ success: false, error: "Missing leadLoca parameter" }, { status: 400 });
  }

  try {
    const { deleteLead, runWithRepoContext } = await import("dba");
    await runWithRepoContext(user, () => deleteLead(leadLoca));
    return NextResponse.json({ success: true });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[/api/leads-dashboard/details DELETE] ERROR: ${errorMsg}`);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
