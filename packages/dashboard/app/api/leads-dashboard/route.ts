/**
 * API Endpoint: Leads Dashboard Data
 *
 * GET /api/leads-dashboard
 *
 * Returns all leads with their metadata including whether they have contacts.
 *
 * All business logic is encapsulated in chad-dba public functions.
 * This endpoint is just a thin wrapper that calls the appropriate function.
 */

import { NextResponse } from "next/server";
import { getAllLeadsWithContacts, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

/**
 * GET /api/leads-dashboard
 * Returns all leads with their metadata.
 */
export async function GET() {
  try {
    const user = await getCurrentUserFromCookies();
    if (!user) {
      return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
    }

    const leads = await runWithRepoContext(user, () => getAllLeadsWithContacts());
    return NextResponse.json(leads);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[/api/leads-dashboard] ERROR: ${errorMsg}`);
    return NextResponse.json(
      {
        ok: false,
        error: errorMsg,
      },
      { status: 500 }
    );
  }
}