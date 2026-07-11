/**
 * API Endpoint: Msg Workout Editor
 *
 * This endpoint provides data for the msg workout editor.
 * All business logic is encapsulated in chad-dba public functions.
 * This endpoint is just a thin wrapper that calls the appropriate function.
 */

import { NextRequest, NextResponse } from "next/server";
import { getMsgWorkoutForEdit, saveMsgWorkout, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

/**
 * GET /api/todo-msg/edit?loca=...
 * Returns the msg workout data for editing.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const loca = searchParams.get("loca");

  if (!loca) {
    return NextResponse.json(
      { error: "Missing required parameter: loca" },
      { status: 400 }
    );
  }

  try {
    const data = await runWithRepoContext(user, () => getMsgWorkoutForEdit(loca));
    if (!data) {
      return NextResponse.json(
        { error: "Msg workout not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error(`Error fetching msg workout for loca=${loca}:`, error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/todo-msg/edit
 * Saves the msg workout content.
 *
 * Request body:
 * {
 *   "loca": "03/06/89/03",
 *   "content": "Updated msg workout content"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromCookies();
    if (!user) {
      return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
    }

    const body = await request.json();
    const { loca, content } = body;

    if (!loca) {
      return NextResponse.json(
        { error: "Missing required parameter: loca" },
        { status: 400 }
      );
    }

    if (content === undefined || content === null) {
      return NextResponse.json(
        { error: "Missing required parameter: content" },
        { status: 400 }
      );
    }

    await runWithRepoContext(user, () => saveMsgWorkout(loca, content));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving msg workout:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}