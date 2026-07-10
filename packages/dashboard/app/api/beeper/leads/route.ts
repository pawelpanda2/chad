/**
 * API Endpoint: All Leads
 *
 * GET /api/beeper/leads - Get all leads from the leads/all-items folder
 *
 * This returns ALL leads regardless of whether they have saved conversations.
 * For leads without conversations, the Messages page will show "Conversation unavailable".
 */

import { NextResponse } from "next/server";
import { getAllLeadsFromRepository } from "dba";

/**
 * GET /api/beeper/leads
 * Returns a list of all leads from the shared repository.
 * This includes leads with and without saved WhatsApp conversations.
 */
export async function GET() {
  try {
    const leads = await getAllLeadsFromRepository();
    return NextResponse.json(leads);
  } catch (error) {
    console.error("Error fetching all leads:", error);
    return NextResponse.json(
      {
        ok: false,
        error: String(error),
      },
      {
        status: 500,
      }
    );
  }
}
