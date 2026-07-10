/**
 * API Endpoint: Msg Planner
 *
 * GET /api/msg-planner - Returns list of available date folders
 * GET /api/msg-planner?date=YY-MM-DD - Returns body.txt content for specific date
 * POST /api/msg-planner - Saves body.txt content for specific date
 *
 * All business logic is encapsulated in chad-dba public functions.
 * This endpoint is just a thin wrapper that calls the appropriate function.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getMsgPlannerDateFolders,
  getMsgPlannerBodyForDate,
  saveMsgPlannerBody,
  createMsgPlannerDateFolder,
} from "dba";

/**
 * GET /api/msg-planner
 * Returns list of date folders or body content for specific date.
 *
 * Query parameters:
 * - date: Optional. If provided, returns body content for that date.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  console.log("[MsgPlanner API] GET request received, date param:", date);

  try {
    if (date) {
      // Get body content for specific date
      // First, we need to find the loca for this date
      console.log("[MsgPlanner API] Fetching date folders to find:", date);
      const dateFolders = await getMsgPlannerDateFolders();
      console.log("[MsgPlanner API] Found date folders:", dateFolders);
      
      const dateFolder = dateFolders.find((f) => f.date === date);
      console.log("[MsgPlanner API] Found date folder:", dateFolder);

      if (!dateFolder) {
        console.log("[MsgPlanner API] Date folder not found:", date);
        return NextResponse.json(
          { error: `Date folder "${date}" not found`, availableDates: dateFolders.map(f => f.date) },
          { status: 404 }
        );
      }

      const bodyData = await getMsgPlannerBodyForDate(date, dateFolder.loca);
      console.log("[MsgPlanner API] Body data:", bodyData);
      return NextResponse.json(bodyData);
    } else {
      // Get list of all date folders
      console.log("[MsgPlanner API] Fetching all date folders...");
      const dateFolders = await getMsgPlannerDateFolders();
      console.log("[MsgPlanner API] Found", dateFolders.length, "date folders:", dateFolders);
      return NextResponse.json(dateFolders);
    }
  } catch (error) {
    console.error("[MsgPlanner API] Error fetching data:", error);
    return NextResponse.json(
      {
        ok: false,
        error: String(error),
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/msg-planner
 * Saves body.txt content for a specific date OR creates a new date folder.
 *
 * Request body for saving:
 * {
 *   "action": "save",  // optional, default
 *   "date": "YY-MM-DD",
 *   "loca": "numeric loca of date folder",
 *   "content": "body.txt content"
 * }
 *
 * Request body for creating:
 * {
 *   "action": "create",
 *   "date": "YY-MM-DD"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, date, loca, content } = body;

    // Create new date folder
    if (action === "create") {
      if (!date) {
        return NextResponse.json(
          { error: "Missing required parameter: date" },
          { status: 400 }
        );
      }

      console.log(`[MsgPlanner API] Creating new date folder: ${date}`);
      // Always generate body content when creating a new plan
      const result = await createMsgPlannerDateFolder(date, true);
      console.log(`[MsgPlanner API] Created date folder:`, result);
      return NextResponse.json(result);
    }

    // Save body content (default action)
    if (!date || !loca) {
      return NextResponse.json(
        { error: "Missing required parameters: date and loca" },
        { status: 400 }
      );
    }

    if (content === undefined || content === null) {
      return NextResponse.json(
        { error: "Missing required parameter: content" },
        { status: 400 }
      );
    }

    await saveMsgPlannerBody(loca, content);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in msg planner POST:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
