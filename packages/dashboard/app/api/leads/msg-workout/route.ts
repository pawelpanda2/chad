/**
 * API Endpoint: Msg Workout Details
 *
 * GET /api/leads/msg-workout?workoutLoca=...&leadName=...&leadLoca=...&workoutName=...
 * Returns the msg workout data for viewing/editing.
 *
 * POST /api/leads/msg-workout
 * Saves the msg workout content.
 *
 * All business logic is encapsulated in chad-dba public functions.
 */

import { NextRequest, NextResponse } from "next/server";
import { getMsgWorkoutForEdit, saveMsgWorkout } from "dba";

/**
 * GET /api/leads/msg-workout?workoutLoca=...&leadName=...&leadLoca=...&workoutName=...
 * Returns the msg workout data for viewing/editing.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const workoutLoca = searchParams.get("workoutLoca");
  const leadName = searchParams.get("leadName");
  const leadLoca = searchParams.get("leadLoca");
  const workoutName = searchParams.get("workoutName");

  // workoutLoca is required for GetItem
  if (!workoutLoca) {
    return NextResponse.json(
      { error: "Missing required parameter: workoutLoca" },
      { status: 400 }
    );
  }

  try {
    // Use existing getMsgWorkoutForEdit which uses GetItem with loca
    const workoutData = await getMsgWorkoutForEdit(workoutLoca);

    if (!workoutData) {
      return NextResponse.json(
        { error: "Msg workout not found" },
        { status: 404 }
      );
    }

    // Return data with all the info needed by the UI
    return NextResponse.json({
      workoutName: workoutName || workoutLoca.split("/").pop() || "",
      leadName: leadName || workoutData.leadName,
      leadLoca: leadLoca || "",
      workoutLoca: workoutLoca,
      body: workoutData.body,
    });
  } catch (error) {
    console.error(`Error fetching msg workout for loca=${workoutLoca}:`, error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/leads/msg-workout
 * Saves the msg workout content.
 *
 * Request body:
 * {
 *   "workoutLoca": "03/06/89/03",
 *   "content": "Updated msg workout content"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workoutLoca, content } = body;

    if (!workoutLoca) {
      return NextResponse.json(
        { error: "Missing required parameter: workoutLoca" },
        { status: 400 }
      );
    }

    if (content === undefined || content === null) {
      return NextResponse.json(
        { error: "Missing required parameter: content" },
        { status: 400 }
      );
    }

    await saveMsgWorkout(workoutLoca, content);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving msg workout:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}