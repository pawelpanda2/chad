/**
 * API Endpoint: Create Msg Workout
 *
 * POST /api/leads-dashboard/msg-workout
 *
 * Creates a new msg workout for a specific lead.
 *
 * All business logic is encapsulated in chad-dba public functions.
 */

import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/leads-dashboard/msg-workout
 * Creates a new msg workout for a lead.
 *
 * Request body:
 * - leadName: string - The name of the lead
 * - leadLoca: string - The numeric loca of the lead
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leadName, leadLoca } = body;

    if (!leadName || !leadLoca) {
      return NextResponse.json(
        { error: "Missing leadName or leadLoca in request body" },
        { status: 400 }
      );
    }

    const { createMsgWorkoutForLead } = await import("dba");
    const result = await createMsgWorkoutForLead(leadName, leadLoca);

    return NextResponse.json(result);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[/api/leads-dashboard/msg-workout] ERROR: ${errorMsg}`);
    return NextResponse.json(
      {
        ok: false,
        error: errorMsg,
      },
      { status: 500 }
    );
  }
}