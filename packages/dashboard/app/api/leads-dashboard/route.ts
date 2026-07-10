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
import { getAllLeadsWithContacts } from "dba";

/**
 * GET /api/leads-dashboard
 * Returns all leads with their metadata.
 */
export async function GET() {
  try {
    const leads = await getAllLeadsWithContacts();
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